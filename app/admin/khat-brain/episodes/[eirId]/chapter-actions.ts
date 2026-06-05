"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq } from "drizzle-orm"
import { getAdminAuthUser, requireAdmin } from "@/lib/api-utils"
import { db } from "@/lib/db"
import { studioAnalysisRecords } from "@/lib/db/schema/studio-analysis"
import { studioSessions } from "@/lib/db/schema/studio"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import {
  chapterReducer,
  coerceChapterDocument,
  emptyChapterDocument,
  newChapter,
  type ChapterDocument,
} from "@/lib/editorial/chapter-types"
import { coerceTranscriptDocument } from "@/lib/editorial/transcript-types"
import { upsertStudioAnalysisRecord } from "@/lib/studio/analysis-records"
import { runAiTask } from "@/lib/ai-router/router"

// ─── Save action ────────────────────────────────────────────────────

export type SaveChaptersResult =
  | { ok: true; newVersion: number; savedAt: string }
  | {
      ok: false
      code: "version_conflict"
      currentVersion: number
      currentDoc: ChapterDocument
    }
  | { ok: false; code: "validation"; message: string }
  | { ok: false; code: "not_found"; message: string }
  | { ok: false; code: "server_error"; message: string }

export interface SaveChaptersInput {
  eirId: string
  expectedVersion: number
  doc: ChapterDocument
  editorSessionId?: string
  txnId?: number
}

export async function saveChaptersAction(
  input: SaveChaptersInput,
): Promise<SaveChaptersResult> {
  try {
    await requireAdmin()
    const admin = await getAdminAuthUser()
    if (!db)
      return { ok: false, code: "server_error", message: "DB unavailable" }

    const eirRow = await db
      .select({ id: episodeIntelligenceRecords.id })
      .from(episodeIntelligenceRecords)
      .where(eq(episodeIntelligenceRecords.id, input.eirId))
      .limit(1)
    if (!eirRow[0]) {
      return { ok: false, code: "not_found", message: "EIR not found" }
    }

    const sessionRow = await db
      .select({ id: studioSessions.id })
      .from(studioSessions)
      .where(eq(studioSessions.eir_id, input.eirId))
      .orderBy(desc(studioSessions.updated_at))
      .limit(1)
    const studioSessionId = sessionRow[0]?.id ?? null

    let current = await db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, input.eirId),
          eq(studioAnalysisRecords.kind, "chapters"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1)
    if (!current[0] && studioSessionId) {
      current = await db
        .select()
        .from(studioAnalysisRecords)
        .where(
          and(
            eq(studioAnalysisRecords.studio_session_id, studioSessionId),
            eq(studioAnalysisRecords.kind, "chapters"),
          ),
        )
        .orderBy(desc(studioAnalysisRecords.created_at))
        .limit(1)
    }

    const currentVersion =
      typeof (current[0]?.data as Record<string, unknown> | undefined)
        ?.version === "number"
        ? ((current[0]?.data as Record<string, unknown>).version as number)
        : 0

    if (currentVersion !== input.expectedVersion) {
      return {
        ok: false,
        code: "version_conflict",
        currentVersion,
        currentDoc: coerceChapterDocument(
          current[0]?.data as Record<string, unknown> | null,
        ),
      }
    }

    const newVersion = currentVersion + 1
    const savedAt = new Date().toISOString()
    const next: ChapterDocument = {
      ...input.doc,
      schema_version: 2,
      version: newVersion,
      last_edited_by: admin?.id ?? null,
      last_edited_at: savedAt,
    }

    await upsertStudioAnalysisRecord({
      eir_id: input.eirId,
      studio_session_id: studioSessionId ?? null,
      kind: "chapters",
      status: "ready",
      data: next as unknown as Record<string, unknown>,
      edited_fields: {
        last_save: {
          editor_session_id: input.editorSessionId ?? null,
          txn_id: input.txnId ?? null,
          admin_id: admin?.id ?? null,
          version: newVersion,
          at: savedAt,
        },
      },
      generated_at: null,
      published_at: null,
    })

    revalidatePath(`/admin/khat-brain/episodes/${input.eirId}`)
    return { ok: true, newVersion, savedAt }
  } catch (e) {
    return {
      ok: false,
      code: "server_error",
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}

// ─── Create chapter from transcript segment ─────────────────────────

export type CreateChapterFromSegmentResult =
  | { ok: true; chapterId: string; newVersion: number }
  | { ok: false; code: "no_transcript"; message: string }
  | { ok: false; code: "segment_not_found"; message: string }
  | { ok: false; code: "version_conflict"; currentVersion: number }
  | { ok: false; code: "server_error"; message: string }

/**
 * UX-8 Phase C — chapter created from a transcript segment id.
 *
 * Reads the latest chapter doc, computes a new chapter anchored at
 * the segment's start time (with the segment text as the initial
 * title) and saves the result. Caller must pass the version they
 * believe is current to keep the conflict-detection contract; pass
 * the latest server version after a load.
 */
export async function createChapterFromSegmentAction(input: {
  eirId: string
  segmentId: string
  expectedVersion: number
  editorSessionId?: string
}): Promise<CreateChapterFromSegmentResult> {
  try {
    await requireAdmin()
    const admin = await getAdminAuthUser()
    if (!db)
      return { ok: false, code: "server_error", message: "DB unavailable" }

    // Pull latest transcript doc.
    const trxRow = await db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, input.eirId),
          eq(studioAnalysisRecords.kind, "transcript"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1)
    if (!trxRow[0]) {
      return {
        ok: false,
        code: "no_transcript",
        message: "لا يوجد نصّ مرتبط بالحلقة",
      }
    }
    const transcript = coerceTranscriptDocument(
      trxRow[0].data as Record<string, unknown> | null,
    )
    const seg = transcript.segments.find((s) => s.id === input.segmentId)
    if (!seg) {
      return {
        ok: false,
        code: "segment_not_found",
        message: "المقطع غير موجود في النصّ",
      }
    }

    const sessionRow = await db
      .select({ id: studioSessions.id })
      .from(studioSessions)
      .where(eq(studioSessions.eir_id, input.eirId))
      .orderBy(desc(studioSessions.updated_at))
      .limit(1)
    const studioSessionId = sessionRow[0]?.id ?? null

    const chRow = await db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, input.eirId),
          eq(studioAnalysisRecords.kind, "chapters"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1)
    const currentDoc: ChapterDocument = chRow[0]
      ? coerceChapterDocument(chRow[0].data as Record<string, unknown> | null)
      : emptyChapterDocument()
    const currentVersion = currentDoc.version

    if (currentVersion !== input.expectedVersion) {
      return {
        ok: false,
        code: "version_conflict",
        currentVersion,
      }
    }

    const chapter = newChapter({
      title: (seg.text || "فصل جديد").slice(0, 80).trim(),
      summary: null,
      start_seconds: seg.start_seconds ?? 0,
      transcript_segment_id: seg.id,
      source: "transcript_anchor",
      status: "draft",
    })
    const nextDoc = chapterReducer(currentDoc, {
      type: "create",
      chapter,
    })
    const newVersion = currentVersion + 1
    const savedAt = new Date().toISOString()
    const persisted: ChapterDocument = {
      ...nextDoc,
      schema_version: 2,
      version: newVersion,
      last_edited_by: admin?.id ?? null,
      last_edited_at: savedAt,
    }
    await upsertStudioAnalysisRecord({
      eir_id: input.eirId,
      studio_session_id: studioSessionId ?? null,
      kind: "chapters",
      status: "ready",
      data: persisted as unknown as Record<string, unknown>,
      edited_fields: {
        last_save: {
          editor_session_id: input.editorSessionId ?? null,
          source: "transcript_anchor",
          chapter_id: chapter.id,
          admin_id: admin?.id ?? null,
          version: newVersion,
          at: savedAt,
        },
      },
    })

    revalidatePath(`/admin/khat-brain/episodes/${input.eirId}`)
    return { ok: true, chapterId: chapter.id, newVersion }
  } catch (e) {
    return {
      ok: false,
      code: "server_error",
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}

// ─── AI suggestion action ───────────────────────────────────────────

export interface ChapterAiSuggestion {
  /** Stable id for client-side dedup. */
  id: string
  kind:
    | "title_rewrite"
    | "summary_rewrite"
    | "missing_chapter"
    | "weak_title_flag"
  /** Chapter id this suggestion applies to. Null for missing-chapter. */
  chapter_id: string | null
  /** Operator-friendly Arabic explanation. */
  reason: string
  /** Proposed change. Shape depends on `kind`. */
  patch:
    | { title: string }
    | { summary: string }
    | { start_seconds: number; title: string; summary: string }
    | Record<string, never>
}

export type SuggestChaptersResult =
  | { ok: true; suggestions: ChapterAiSuggestion[]; aiRunId: string | null }
  | { ok: false; code: "no_transcript"; message: string }
  | { ok: false; code: "no_chapters"; message: string }
  | { ok: false; code: "ai_error"; message: string }
  | { ok: false; code: "server_error"; message: string }

interface SuggestionPayload {
  suggestions: Array<{
    kind: string
    chapter_id?: string | null
    reason?: string
    title?: string
    summary?: string
    start_seconds?: number
  }>
}

/**
 * UX-8 Phase E — generate reviewable chapter suggestions.
 *
 * Calls editorial AI once per request and returns up to ~12 typed
 * suggestions. Suggestions are NEVER auto-applied; the client renders
 * them as Apply/Dismiss cards. Every call writes an `ai_runs` row
 * (telemetry), so we can audit cost + quality after every wave.
 */
export async function suggestChapterImprovementsAction(
  eirId: string,
): Promise<SuggestChaptersResult> {
  try {
    await requireAdmin()
    if (!db)
      return { ok: false, code: "server_error", message: "DB unavailable" }

    const trxRow = await db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, eirId),
          eq(studioAnalysisRecords.kind, "transcript"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1)
    if (!trxRow[0]) {
      return {
        ok: false,
        code: "no_transcript",
        message: "لا يوجد نصّ — لا يمكن توليد اقتراحات",
      }
    }
    const transcript = coerceTranscriptDocument(
      trxRow[0].data as Record<string, unknown> | null,
    )

    const chRow = await db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, eirId),
          eq(studioAnalysisRecords.kind, "chapters"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1)
    const chapters = coerceChapterDocument(
      chRow[0]?.data as Record<string, unknown> | null,
    )

    // Build a compact prompt — segment a sample of transcript text
    // alongside the existing chapter list. The model returns JSON.
    const trxSample = transcript.segments
      .slice(0, 80)
      .map((s) => {
        const t = formatTime(s.start_seconds ?? 0)
        return `[${t}] ${s.speaker ? s.speaker + ": " : ""}${s.text}`
      })
      .join("\n")
      .slice(0, 6000)
    const chapterSample = chapters.chapters
      .map(
        (c, i) =>
          `${i + 1}. [${formatTime(c.start_seconds)}] "${c.title}" — ${c.summary ?? ""}`.trim(),
      )
      .join("\n")
      .slice(0, 2000)

    const system = [
      "You are an Arabic-podcast editor. Produce reviewable chapter suggestions.",
      "Output STRICT JSON: { suggestions: [{ kind, chapter_id?, reason, title?, summary?, start_seconds? }] }.",
      "kind ∈ { 'title_rewrite', 'summary_rewrite', 'missing_chapter', 'weak_title_flag' }.",
      "Rules:",
      "1. Suggest at most 12 items. Quality > quantity.",
      "2. For 'title_rewrite' / 'summary_rewrite' / 'weak_title_flag': set chapter_id to the existing chapter.",
      "3. For 'missing_chapter': set start_seconds (in seconds, integer) + title + summary; chapter_id = null.",
      "4. NEVER overwrite anything automatically — your suggestions are reviewed by a human editor.",
      "5. Reasons must be concise Arabic — one sentence.",
      "6. Titles must be Arabic, 3–8 words.",
    ].join("\n")
    const user = [
      "Transcript (first segments):",
      trxSample || "(empty)",
      "",
      "Existing chapters:",
      chapterSample || "(none)",
      "",
      "Return JSON only.",
    ].join("\n")

    const r = await runAiTask<SuggestionPayload>({
      taskKind: "editorial",
      eirId,
      subjectTable: "studio_analysis_records",
      subjectId: chRow[0]?.id ?? trxRow[0].id,
      input: {
        pass: "chapter_suggestions",
        chapter_count: chapters.chapters.length,
        transcript_segment_count: transcript.segments.length,
      },
      prompt: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.5 },
    })

    if (r.status !== "succeeded") {
      return {
        ok: false,
        code: "ai_error",
        message: r.errorMessage ?? "AI provider failed",
      }
    }
    const raw = r.parsed?.suggestions
    if (!Array.isArray(raw)) {
      return { ok: false, code: "ai_error", message: "AI returned no JSON" }
    }
    const suggestions: ChapterAiSuggestion[] = []
    for (const item of raw.slice(0, 12)) {
      if (!item || typeof item !== "object") continue
      const kind = String(item.kind ?? "").trim()
      const reason = String(item.reason ?? "").trim()
      if (!reason) continue
      const id = `${kind}-${suggestions.length}-${Date.now().toString(36)}`
      if (kind === "title_rewrite" && item.chapter_id && item.title) {
        suggestions.push({
          id,
          kind: "title_rewrite",
          chapter_id: String(item.chapter_id),
          reason,
          patch: { title: String(item.title).trim() },
        })
      } else if (kind === "summary_rewrite" && item.chapter_id && item.summary) {
        suggestions.push({
          id,
          kind: "summary_rewrite",
          chapter_id: String(item.chapter_id),
          reason,
          patch: { summary: String(item.summary).trim() },
        })
      } else if (kind === "weak_title_flag" && item.chapter_id) {
        suggestions.push({
          id,
          kind: "weak_title_flag",
          chapter_id: String(item.chapter_id),
          reason,
          patch: {},
        })
      } else if (
        kind === "missing_chapter" &&
        typeof item.start_seconds === "number" &&
        item.title
      ) {
        suggestions.push({
          id,
          kind: "missing_chapter",
          chapter_id: null,
          reason,
          patch: {
            start_seconds: Math.max(0, Math.floor(item.start_seconds)),
            title: String(item.title).trim(),
            summary: String(item.summary ?? "").trim(),
          },
        })
      }
    }
    return { ok: true, suggestions, aiRunId: r.runId }
  } catch (e) {
    return {
      ok: false,
      code: "server_error",
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

function formatTime(s: number): string {
  const total = Math.max(0, Math.floor(s))
  const m = Math.floor(total / 60)
  const sec = total % 60
  const h = Math.floor(m / 60)
  const mm = (m % 60).toString().padStart(2, "0")
  const ss = sec.toString().padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}
