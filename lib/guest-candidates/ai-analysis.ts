/**
 * Guest Candidates — AI profile analysis.
 *
 * Generates an editorial analysis of a candidate based on:
 * - Their profile (name, bio, category, location)
 * - Their social media URLs (we don't fetch the URLs — we let the model
 *   reason about what's likely there based on platform conventions and
 *   the context the admin has provided)
 *
 * Output is structured JSON with scores, strengths, risks, conversation
 * angles, and suggested questions. The model is `EDITORIAL_MODEL` because
 * this is a deep editorial assessment, not a structural extraction.
 *
 * IMPORTANT: This module is independent from episode/studio AI logic.
 */

import { db } from "@/lib/db"
import {
  guestCandidates,
  guestCandidateSocialLinks,
  guestCandidateAiRuns,
} from "@/lib/db/schema/guest-candidates"
import { eq } from "drizzle-orm"
// Phase 2.0 Batch 2 — direct OpenAI call routed through runAiTask.
// The parallel `guestCandidateAiRuns` audit row has its own `model_name`
// column: seeded with the registry default, then corrected to the model
// the router actually used once the call returns.
import { safeParseJSON } from "@/lib/ai/client"
import { runAiTask, DEFAULT_MODELS } from "@/lib/ai-router"
import {
  CANDIDATE_ANALYSIS_SYSTEM,
  CANDIDATE_ANALYSIS_PROMPT_VERSION,
  buildCandidateAnalysisUser,
} from "@/lib/ai/prompts/candidate-analysis"

const LEGACY_ACTOR = "system:legacy-callsite"

export interface CandidateAnalysisResult {
  score_overall: number
  fit_score: number
  depth_score: number
  reach_score: number
  risk_score: number
  summary: string
  strengths: string[]
  weaknesses: string[]
  risk_notes: string
  topics: string[]
  reason_to_invite: string
  conversation_angles: string[]
  suggested_questions: {
    opening: string[]
    deep: string[]
    hard: string[]
    emotional: string[]
  }
}

// Phase 2.0 Batch 2 — SYSTEM_PROMPT + buildUserPrompt moved to
// lib/ai/prompts/candidate-analysis.ts. This file now imports
// CANDIDATE_ANALYSIS_SYSTEM + buildCandidateAnalysisUser.

function clampScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.max(0, Math.min(10, value))
}

function asStringArray(value: unknown, max = 10): string[] {
  if (!Array.isArray(value)) return []
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .slice(0, max)
    .map((v) => v.trim())
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeAnalysis(raw: unknown): CandidateAnalysisResult {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const sq = (obj.suggested_questions && typeof obj.suggested_questions === "object")
    ? (obj.suggested_questions as Record<string, unknown>)
    : {}
  return {
    score_overall: clampScore(obj.score_overall),
    fit_score: clampScore(obj.fit_score),
    depth_score: clampScore(obj.depth_score),
    reach_score: clampScore(obj.reach_score),
    risk_score: clampScore(obj.risk_score),
    summary: asString(obj.summary),
    strengths: asStringArray(obj.strengths, 8),
    weaknesses: asStringArray(obj.weaknesses, 8),
    risk_notes: asString(obj.risk_notes),
    topics: asStringArray(obj.topics, 12),
    reason_to_invite: asString(obj.reason_to_invite),
    conversation_angles: asStringArray(obj.conversation_angles, 8),
    suggested_questions: {
      opening: asStringArray(sq.opening, 6),
      deep: asStringArray(sq.deep, 6),
      hard: asStringArray(sq.hard, 6),
      emotional: asStringArray(sq.emotional, 6),
    },
  }
}

export interface AnalyzeCandidateOptions {
  /** When true, returns the result without persisting it. */
  dryRun?: boolean
  /** Phase 2.0 Batch 2 — optional actor for AI Router attribution. */
  actorId?: string | null
}

export interface AnalyzeCandidateOutcome {
  ok: true
  result: CandidateAnalysisResult
  runId: string
}

export interface AnalyzeCandidateError {
  ok: false
  error: string
  runId?: string
}

export async function analyzeCandidate(
  candidateId: string,
  options: AnalyzeCandidateOptions = {},
): Promise<AnalyzeCandidateOutcome | AnalyzeCandidateError> {
  if (!db) return { ok: false, error: "قاعدة البيانات غير متاحة" }

  // Fetch candidate + social links
  const [candidate] = await db
    .select()
    .from(guestCandidates)
    .where(eq(guestCandidates.id, candidateId))
    .limit(1)
  if (!candidate) return { ok: false, error: "المرشح غير موجود" }

  const socials = await db
    .select({ platform: guestCandidateSocialLinks.platform, url: guestCandidateSocialLinks.url })
    .from(guestCandidateSocialLinks)
    .where(eq(guestCandidateSocialLinks.candidate_id, candidateId))

  // Start an AI run record
  const [run] = await db
    .insert(guestCandidateAiRuns)
    .values({
      candidate_id: candidateId,
      run_type: "profile_analysis",
      // Provisional — the registry default. Overwritten below with the
      // ACTUAL model the router used once the call completes.
      model_name: DEFAULT_MODELS.editorial.modelName,
      input_snapshot_json: {
        full_name: candidate.full_name,
        category: candidate.category,
        bio: candidate.bio,
        notes_internal: candidate.notes_internal,
        social_links: socials,
      },
      status: "running",
    })
    .returning()

  try {
    const userPrompt = buildCandidateAnalysisUser(candidate, socials)

    const completion = await runAiTask<Record<string, unknown>>({
      taskKind: "editorial",
      eirId: null,
      subjectTable: "guest_candidates",
      subjectId: candidateId,
      actorId: options.actorId ?? LEGACY_ACTOR,
      promptVersion: CANDIDATE_ANALYSIS_PROMPT_VERSION,
      input: { candidateId, fullName: candidate.full_name },
      prompt: [
        { role: "system", content: CANDIDATE_ANALYSIS_SYSTEM },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.4 },
    })

    if (completion.status !== "succeeded") {
      const errMsg = completion.errorMessage || "فشل تحليل المرشح"
      await db
        .update(guestCandidateAiRuns)
        .set({ status: "error", error_message: errMsg, completed_at: new Date() })
        .where(eq(guestCandidateAiRuns.id, run.id))
      return { ok: false, error: errMsg, runId: run.id }
    }

    const raw = completion.rawText
    const parsed = safeParseJSON(raw, "candidate analysis")
    if (!parsed.success) {
      await db
        .update(guestCandidateAiRuns)
        .set({ status: "error", error_message: parsed.error, completed_at: new Date() })
        .where(eq(guestCandidateAiRuns.id, run.id))
      return { ok: false, error: parsed.error, runId: run.id }
    }

    const result = normalizeAnalysis(parsed.data)

    // Persist run snapshot
    await db
      .update(guestCandidateAiRuns)
      .set({
        status: "ready",
        completed_at: new Date(),
        // Correct the provisional model_name to the model the router
        // actually used (may differ via Settings override / fallback).
        model_name: completion.modelName,
        output_snapshot_json: result as unknown as Record<string, unknown>,
      })
      .where(eq(guestCandidateAiRuns.id, run.id))

    if (!options.dryRun) {
      // Update the candidate's flat AI fields
      await db
        .update(guestCandidates)
        .set({
          ai_score_overall: result.score_overall,
          ai_fit_score: result.fit_score,
          ai_depth_score: result.depth_score,
          ai_reach_score: result.reach_score,
          ai_risk_score: result.risk_score,
          ai_summary: result.summary,
          ai_strengths: result.strengths,
          ai_weaknesses: result.weaknesses,
          ai_risk_notes: result.risk_notes,
          ai_topics_json: result.topics,
          ai_reason_to_invite: result.reason_to_invite,
          ai_conversation_angles_json: result.conversation_angles,
          ai_suggested_questions_json: result.suggested_questions,
          ai_model_used: completion.modelName,
          ai_generated_at: new Date(),
          // Auto-advance status if it was 'new' or 'researching'
          status:
            candidate.status === "new" || candidate.status === "researching"
              ? "analyzed"
              : candidate.status,
          updated_at: new Date(),
        })
        .where(eq(guestCandidates.id, candidateId))
    }

    return { ok: true, result, runId: run.id }
  } catch (err) {
    const message = err instanceof Error ? err.message : "فشل تحليل المرشح"
    console.error("[guest-candidates/ai] analyze failed:", err)
    if (run) {
      await db
        .update(guestCandidateAiRuns)
        .set({ status: "error", error_message: message, completed_at: new Date() })
        .where(eq(guestCandidateAiRuns.id, run.id))
    }
    return { ok: false, error: message, runId: run?.id }
  }
}

export async function getLastAnalysisRun(candidateId: string) {
  if (!db) return null
  const [row] = await db
    .select()
    .from(guestCandidateAiRuns)
    .where(eq(guestCandidateAiRuns.candidate_id, candidateId))
    .orderBy(guestCandidateAiRuns.started_at)
    .limit(1)
  return row ?? null
}
