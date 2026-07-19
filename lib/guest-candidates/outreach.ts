/**
 * Guest Candidates — Outreach message generation.
 *
 * Generates personalized outreach messages (WhatsApp, Email, DM) for a
 * candidate, in different tones. The admin can preview, edit, and save
 * versions. Each saved message is a row in `guest_candidate_outreach_messages`
 * with an incrementing version_number per candidate.
 */

import { db } from "@/lib/db"
import {
  guestCandidates,
  guestCandidateSocialLinks,
  guestCandidateOutreachMessages,
  guestCandidateAiRuns,
} from "@/lib/db/schema/guest-candidates"
import { eq, desc, and } from "drizzle-orm"
// Phase 2.0 Batch 2 — direct OpenAI call routed through runAiTask.
// The parallel `guestCandidateAiRuns` audit row has its own `model_name`
// column: seeded with the registry default, then corrected to the model
// the router actually used once the call returns.
import { safeParseJSON } from "@/lib/ai/client"
import { runAiTask, DEFAULT_MODELS } from "@/lib/ai-router"
import {
  buildCandidateOutreachSystem,
  buildCandidateOutreachUser,
  CANDIDATE_OUTREACH_PROMPT_VERSION,
} from "@/lib/ai/prompts/candidate-outreach"

const LEGACY_ACTOR = "system:legacy-callsite"
import type { OutreachChannel, OutreachTone } from "@/types/database"

export interface OutreachGenerationInput {
  candidateId: string
  channel: OutreachChannel
  tone: OutreachTone
  /** Optional admin context (e.g., "we want to do an episode about education"). */
  customNote?: string
  /** Optional length override. */
  length?: "short" | "medium" | "long"
}

export interface OutreachDraft {
  subject_line: string | null
  message_body: string
}

// Phase 2.0 Batch 2 — buildSystemPrompt + buildUserPrompt and the
// TONE_LABELS / CHANNEL_LABELS / LENGTH_GUIDE constants moved to
// lib/ai/prompts/candidate-outreach.ts. No external importer
// referenced them, so they were removed here.

export async function generateOutreachDraft(input: OutreachGenerationInput): Promise<
  { ok: true; draft: OutreachDraft; runId: string } | { ok: false; error: string }
> {
  if (!db) return { ok: false, error: "قاعدة البيانات غير متاحة" }

  const [candidate] = await db
    .select()
    .from(guestCandidates)
    .where(eq(guestCandidates.id, input.candidateId))
    .limit(1)
  if (!candidate) return { ok: false, error: "المرشح غير موجود" }

  const socials = await db
    .select({ platform: guestCandidateSocialLinks.platform, url: guestCandidateSocialLinks.url })
    .from(guestCandidateSocialLinks)
    .where(eq(guestCandidateSocialLinks.candidate_id, input.candidateId))

  const length = input.length || "medium"

  const [run] = await db
    .insert(guestCandidateAiRuns)
    .values({
      candidate_id: input.candidateId,
      run_type: "outreach_generation",
      // Provisional — the registry default. Overwritten below with the
      // ACTUAL model the router used once the call completes.
      model_name: DEFAULT_MODELS.editorial.modelName,
      input_snapshot_json: { channel: input.channel, tone: input.tone, length, customNote: input.customNote ?? null },
      status: "running",
    })
    .returning()

  try {
    const completion = await runAiTask<{
      subject_line?: string | null
      message_body?: string
    }>({
      taskKind: "editorial",
      eirId: null,
      subjectTable: "guest_candidates",
      subjectId: input.candidateId,
      actorId: LEGACY_ACTOR,
      promptVersion: CANDIDATE_OUTREACH_PROMPT_VERSION,
      input: {
        candidateId: input.candidateId,
        channel: input.channel,
        tone: input.tone,
        length,
      },
      prompt: [
        {
          role: "system",
          content: buildCandidateOutreachSystem(input.channel, input.tone, length),
        },
        {
          role: "user",
          content: buildCandidateOutreachUser(candidate, socials, input.customNote),
        },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.7 },
    })

    if (completion.status !== "succeeded") {
      const errMsg = completion.errorMessage || "فشل توليد الرسالة"
      await db
        .update(guestCandidateAiRuns)
        .set({ status: "error", error_message: errMsg, completed_at: new Date() })
        .where(eq(guestCandidateAiRuns.id, run.id))
      return { ok: false, error: errMsg }
    }

    const raw = completion.rawText
    const parsed = safeParseJSON<{ subject_line?: string | null; message_body?: string }>(raw, "outreach")
    if (!parsed.success) {
      await db
        .update(guestCandidateAiRuns)
        .set({ status: "error", error_message: parsed.error, completed_at: new Date() })
        .where(eq(guestCandidateAiRuns.id, run.id))
      return { ok: false, error: parsed.error }
    }

    const body = (parsed.data.message_body || "").trim()
    if (!body) {
      await db
        .update(guestCandidateAiRuns)
        .set({ status: "error", error_message: "رسالة فارغة من النموذج", completed_at: new Date() })
        .where(eq(guestCandidateAiRuns.id, run.id))
      return { ok: false, error: "لم يتم توليد محتوى للرسالة" }
    }

    const draft: OutreachDraft = {
      subject_line: input.channel === "email" ? (parsed.data.subject_line || "").trim() || null : null,
      message_body: body,
    }

    await db
      .update(guestCandidateAiRuns)
      .set({
        status: "ready",
        completed_at: new Date(),
        // Correct the provisional model_name to the model the router
        // actually used (may differ via Settings override / fallback).
        model_name: completion.modelName,
        output_snapshot_json: draft as unknown as Record<string, unknown>,
      })
      .where(eq(guestCandidateAiRuns.id, run.id))

    return { ok: true, draft, runId: run.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل توليد الرسالة"
    console.error("[guest-candidates/outreach] generation failed:", err)
    if (run) {
      await db
        .update(guestCandidateAiRuns)
        .set({ status: "error", error_message: message, completed_at: new Date() })
        .where(eq(guestCandidateAiRuns.id, run.id))
    }
    return { ok: false, error: message }
  }
}

// ---------------------------------------------------------------------------
// Saved messages
// ---------------------------------------------------------------------------

export async function listOutreachMessages(candidateId: string) {
  if (!db) return []
  return db
    .select()
    .from(guestCandidateOutreachMessages)
    .where(eq(guestCandidateOutreachMessages.candidate_id, candidateId))
    .orderBy(desc(guestCandidateOutreachMessages.created_at))
}

export interface SaveOutreachInput {
  candidateId: string
  channel: OutreachChannel
  tone: OutreachTone
  subject_line?: string | null
  message_body: string
  generated_by_ai: boolean
  edited_by_admin: boolean
}

export async function saveOutreachMessage(input: SaveOutreachInput) {
  if (!db) throw new Error("Database not configured")

  // Compute next version number for this candidate
  const existing = await db
    .select({ version: guestCandidateOutreachMessages.version_number })
    .from(guestCandidateOutreachMessages)
    .where(eq(guestCandidateOutreachMessages.candidate_id, input.candidateId))
  const nextVersion = existing.length === 0 ? 1 : Math.max(...existing.map((r) => r.version)) + 1

  const [created] = await db
    .insert(guestCandidateOutreachMessages)
    .values({
      candidate_id: input.candidateId,
      channel_type: input.channel,
      tone: input.tone,
      subject_line: input.subject_line ?? null,
      message_body: input.message_body,
      generated_by_ai: input.generated_by_ai,
      edited_by_admin: input.edited_by_admin,
      version_number: nextVersion,
    })
    .returning()

  return created
}

export async function deleteOutreachMessage(candidateId: string, messageId: string) {
  if (!db) throw new Error("Database not configured")
  await db
    .delete(guestCandidateOutreachMessages)
    .where(
      and(
        eq(guestCandidateOutreachMessages.id, messageId),
        eq(guestCandidateOutreachMessages.candidate_id, candidateId),
      ),
    )
}
