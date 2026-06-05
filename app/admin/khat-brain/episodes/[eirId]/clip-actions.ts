"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq } from "drizzle-orm"
import { getAdminAuthUser, requireAdmin } from "@/lib/api-utils"
import { db } from "@/lib/db"
import { studioAnalysisRecords } from "@/lib/db/schema/studio-analysis"
import { studioSessions } from "@/lib/db/schema/studio"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import {
  CLIP_PLATFORMS,
  CLIP_RATIOS,
  clipReducer,
  coerceClipDocument,
  emptyClipDocument,
  newClip,
  type ClipDocument,
} from "@/lib/editorial/clip-types"
import {
  coerceChapterDocument,
} from "@/lib/editorial/chapter-types"
import { coerceTranscriptDocument } from "@/lib/editorial/transcript-types"
import { upsertStudioAnalysisRecord } from "@/lib/studio/analysis-records"
import { runAiTask } from "@/lib/ai-router/router"

// ─── Save action ────────────────────────────────────────────────────

export type SaveClipsResult =
  | { ok: true; newVersion: number; savedAt: string }
  | {
      ok: false
      code: "version_conflict"
      currentVersion: number
      currentDoc: ClipDocument
    }
  | { ok: false; code: "not_found"; message: string }
  | { ok: false; code: "server_error"; message: string }

export interface SaveClipsInput {
  eirId: string
  expectedVersion: number
  doc: ClipDocument
  editorSessionId?: string
  txnId?: number
}

export async function saveClipsAction(
  input: SaveClipsInput,
): Promise<SaveClipsResult> {
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

    const current = await db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, input.eirId),
          eq(studioAnalysisRecords.kind, "clips"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1)

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
        currentDoc: coerceClipDocument(
          current[0]?.data as Record<string, unknown> | null,
        ),
      }
    }

    const newVersion = currentVersion + 1
    const savedAt = new Date().toISOString()
    const next: ClipDocument = {
      ...input.doc,
      schema_version: 1,
      version: newVersion,
      last_edited_by: admin?.id ?? null,
      last_edited_at: savedAt,
    }

    await upsertStudioAnalysisRecord({
      eir_id: input.eirId,
      studio_session_id: studioSessionId ?? null,
      kind: "clips",
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

// ─── Create clip from transcript segment ────────────────────────────

export type CreateClipFromSegmentResult =
  | { ok: true; clipId: string; newVersion: number }
  | { ok: false; code: "no_transcript"; message: string }
  | { ok: false; code: "segment_not_found"; message: string }
  | { ok: false; code: "version_conflict"; currentVersion: number }
  | { ok: false; code: "server_error"; message: string }

export async function createClipFromSegmentAction(input: {
  eirId: string
  segmentId: string
  expectedVersion: number
  /** Optional default clip length in seconds. Default 30. */
  defaultLength?: number
  editorSessionId?: string
}): Promise<CreateClipFromSegmentResult> {
  try {
    await requireAdmin()
    const admin = await getAdminAuthUser()
    if (!db)
      return { ok: false, code: "server_error", message: "DB unavailable" }

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

    const clipsRow = await db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, input.eirId),
          eq(studioAnalysisRecords.kind, "clips"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1)
    const currentDoc: ClipDocument = clipsRow[0]
      ? coerceClipDocument(clipsRow[0].data as Record<string, unknown> | null)
      : emptyClipDocument()
    const currentVersion = currentDoc.version

    if (currentVersion !== input.expectedVersion) {
      return {
        ok: false,
        code: "version_conflict",
        currentVersion,
      }
    }

    const start = seg.start_seconds ?? 0
    const end =
      seg.end_seconds ??
      Math.max(start + (input.defaultLength ?? 30), start + 30)
    const clip = newClip({
      title: (seg.text || "مقطع جديد").slice(0, 60).trim(),
      hook: (seg.text || "").slice(0, 90).trim(),
      summary: null,
      start_seconds: start,
      end_seconds: end,
      transcript_segment_ids: [seg.id],
      source: "transcript_anchor",
      status: "draft",
      mark: "normal",
    })
    const nextDoc = clipReducer(currentDoc, { type: "create", clip })
    const newVersion = currentVersion + 1
    const savedAt = new Date().toISOString()
    const persisted: ClipDocument = {
      ...nextDoc,
      schema_version: 1,
      version: newVersion,
      last_edited_by: admin?.id ?? null,
      last_edited_at: savedAt,
    }
    await upsertStudioAnalysisRecord({
      eir_id: input.eirId,
      studio_session_id: studioSessionId ?? null,
      kind: "clips",
      status: "ready",
      data: persisted as unknown as Record<string, unknown>,
      edited_fields: {
        last_save: {
          editor_session_id: input.editorSessionId ?? null,
          source: "transcript_anchor",
          clip_id: clip.id,
          admin_id: admin?.id ?? null,
          version: newVersion,
          at: savedAt,
        },
      },
    })

    revalidatePath(`/admin/khat-brain/episodes/${input.eirId}`)
    return { ok: true, clipId: clip.id, newVersion }
  } catch (e) {
    return {
      ok: false,
      code: "server_error",
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}

// ─── Generate clip(s) from a chapter ────────────────────────────────

export type GenerateClipsFromChapterResult =
  | { ok: true; clipIds: string[]; newVersion: number }
  | { ok: false; code: "no_chapters"; message: string }
  | { ok: false; code: "chapter_not_found"; message: string }
  | { ok: false; code: "version_conflict"; currentVersion: number }
  | { ok: false; code: "server_error"; message: string }

/**
 * UX-9 Phase D — generate one draft clip from a chapter range.
 *
 * The clip starts at the chapter's start, ends at min(end, start+90s)
 * to keep it short-form-friendly, links the chapter id, and inherits
 * the chapter's title as a starting point.
 */
export async function generateClipsFromChapterAction(input: {
  eirId: string
  chapterId: string
  expectedVersion: number
  editorSessionId?: string
}): Promise<GenerateClipsFromChapterResult> {
  try {
    await requireAdmin()
    const admin = await getAdminAuthUser()
    if (!db)
      return { ok: false, code: "server_error", message: "DB unavailable" }

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
    if (!chRow[0]) {
      return {
        ok: false,
        code: "no_chapters",
        message: "لا توجد فصول لاستخراج المقاطع منها",
      }
    }
    const chapters = coerceChapterDocument(
      chRow[0].data as Record<string, unknown> | null,
    )
    const chapter = chapters.chapters.find((c) => c.id === input.chapterId)
    if (!chapter) {
      return {
        ok: false,
        code: "chapter_not_found",
        message: "الفصل غير موجود",
      }
    }

    const sessionRow = await db
      .select({ id: studioSessions.id })
      .from(studioSessions)
      .where(eq(studioSessions.eir_id, input.eirId))
      .orderBy(desc(studioSessions.updated_at))
      .limit(1)
    const studioSessionId = sessionRow[0]?.id ?? null

    const clipsRow = await db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, input.eirId),
          eq(studioAnalysisRecords.kind, "clips"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1)
    const currentDoc: ClipDocument = clipsRow[0]
      ? coerceClipDocument(clipsRow[0].data as Record<string, unknown> | null)
      : emptyClipDocument()
    const currentVersion = currentDoc.version
    if (currentVersion !== input.expectedVersion) {
      return {
        ok: false,
        code: "version_conflict",
        currentVersion,
      }
    }

    const start = chapter.start_seconds
    const chapterEnd = chapter.end_seconds ?? start + 90
    const end = Math.min(chapterEnd, start + 90)
    const clip = newClip({
      title: chapter.title || "مقطع من فصل",
      hook: chapter.summary?.slice(0, 90) ?? "",
      summary: chapter.summary ?? null,
      start_seconds: start,
      end_seconds: end,
      chapter_ids: [chapter.id],
      source: "chapter_based",
      status: "draft",
    })
    const nextDoc = clipReducer(currentDoc, { type: "create", clip })
    const newVersion = currentVersion + 1
    const savedAt = new Date().toISOString()
    const persisted: ClipDocument = {
      ...nextDoc,
      schema_version: 1,
      version: newVersion,
      last_edited_by: admin?.id ?? null,
      last_edited_at: savedAt,
    }
    await upsertStudioAnalysisRecord({
      eir_id: input.eirId,
      studio_session_id: studioSessionId ?? null,
      kind: "clips",
      status: "ready",
      data: persisted as unknown as Record<string, unknown>,
      edited_fields: {
        last_save: {
          editor_session_id: input.editorSessionId ?? null,
          source: "chapter_based",
          clip_id: clip.id,
          chapter_id: chapter.id,
          admin_id: admin?.id ?? null,
          version: newVersion,
          at: savedAt,
        },
      },
    })

    revalidatePath(`/admin/khat-brain/episodes/${input.eirId}`)
    return { ok: true, clipIds: [clip.id], newVersion }
  } catch (e) {
    return {
      ok: false,
      code: "server_error",
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}

// ─── AI suggestion action ───────────────────────────────────────────

export type ClipAiSuggestionKind =
  | "viral_moment"
  | "emotional_peak"
  | "controversial_moment"
  | "philosophical_insight"
  | "retention_hook"
  | "strong_opener"
  | "short_form_opportunity"
  | "quote_worthy"
  | "better_hook"
  | "shorter_hook"
  | "thumbnail_text"
  | "tiktok_first_rewrite"
  | "youtube_shorts_rewrite"
  | "stronger_emotional_framing"

export interface ClipAiSuggestion {
  id: string
  kind: ClipAiSuggestionKind
  /** Existing clip the suggestion modifies. Null ⇒ suggest a NEW clip. */
  clip_id: string | null
  reason: string
  patch:
    | { hook: string }
    | { thumbnail_text: string }
    | { caption_suggestion: string }
    | {
        title: string
        hook: string
        summary: string | null
        start_seconds: number
        end_seconds: number
      }
    | Record<string, never>
}

export type SuggestClipsResult =
  | { ok: true; suggestions: ClipAiSuggestion[]; aiRunId: string | null }
  | { ok: false; code: "no_transcript"; message: string }
  | { ok: false; code: "ai_error"; message: string }
  | { ok: false; code: "server_error"; message: string }

interface AiSuggestionPayload {
  suggestions: Array<{
    kind: string
    clip_id?: string | null
    reason?: string
    title?: string
    hook?: string
    summary?: string | null
    thumbnail_text?: string
    caption_suggestion?: string
    start_seconds?: number
    end_seconds?: number
  }>
}

const SUGGESTION_KINDS: ReadonlySet<string> = new Set([
  "viral_moment",
  "emotional_peak",
  "controversial_moment",
  "philosophical_insight",
  "retention_hook",
  "strong_opener",
  "short_form_opportunity",
  "quote_worthy",
  "better_hook",
  "shorter_hook",
  "thumbnail_text",
  "tiktok_first_rewrite",
  "youtube_shorts_rewrite",
  "stronger_emotional_framing",
])

export async function suggestClipImprovementsAction(
  eirId: string,
): Promise<SuggestClipsResult> {
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

    const clipsRow = await db
      .select()
      .from(studioAnalysisRecords)
      .where(
        and(
          eq(studioAnalysisRecords.eir_id, eirId),
          eq(studioAnalysisRecords.kind, "clips"),
        ),
      )
      .orderBy(desc(studioAnalysisRecords.created_at))
      .limit(1)
    const clips = coerceClipDocument(
      clipsRow[0]?.data as Record<string, unknown> | null,
    )

    const trxSample = transcript.segments
      .slice(0, 80)
      .map((s) => {
        const t = formatTime(s.start_seconds ?? 0)
        return `[${t}] ${s.speaker ? s.speaker + ": " : ""}${s.text}`
      })
      .join("\n")
      .slice(0, 7000)
    const clipSample = clips.clips
      .slice(0, 12)
      .map(
        (c) =>
          `${c.id} | "${c.title}" | hook: "${c.hook}" | range: ${formatTime(c.start_seconds)}–${formatTime(c.end_seconds)} | hook_score: ${c.hook_score}`,
      )
      .join("\n")
      .slice(0, 2200)

    const system = [
      "You are an editorial strategist for an Arabic podcast. Produce reviewable CLIP suggestions.",
      "Khat clips are not bait — they prioritize emotional honesty, philosophical tension, identity conflict, hidden pain, unexpected truths, and intelligent controversy.",
      "Output STRICT JSON: { suggestions: [{ kind, clip_id?, reason, ... }] }.",
      "Allowed kinds: viral_moment, emotional_peak, controversial_moment, philosophical_insight, retention_hook, strong_opener, short_form_opportunity, quote_worthy, better_hook, shorter_hook, thumbnail_text, tiktok_first_rewrite, youtube_shorts_rewrite, stronger_emotional_framing.",
      "Rules:",
      "1. Maximum 14 suggestions. Quality over quantity.",
      "2. For 'viral_moment'/'emotional_peak'/'controversial_moment'/'philosophical_insight'/'retention_hook'/'strong_opener'/'short_form_opportunity'/'quote_worthy': suggest a NEW clip — set start_seconds + end_seconds + title + hook + summary; clip_id = null. Range: 25–75 seconds.",
      "3. For 'better_hook'/'shorter_hook'/'tiktok_first_rewrite'/'youtube_shorts_rewrite'/'stronger_emotional_framing': set clip_id and provide a new 'hook' string.",
      "4. For 'thumbnail_text': set clip_id and provide a 'thumbnail_text' (max 6 Arabic words).",
      "5. NEVER overwrite anything automatically — every suggestion is reviewed by a human.",
      "6. Reason: one Arabic sentence explaining why this is editorially valuable.",
      "7. Hooks must be punchy Arabic, 6–14 words.",
    ].join("\n")
    const user = [
      "Transcript (head):",
      trxSample || "(empty)",
      "",
      "Existing clips:",
      clipSample || "(none)",
      "",
      "Return JSON only.",
    ].join("\n")

    const r = await runAiTask<AiSuggestionPayload>({
      taskKind: "editorial",
      eirId,
      subjectTable: "studio_analysis_records",
      subjectId: clipsRow[0]?.id ?? trxRow[0].id,
      input: {
        pass: "clip_suggestions",
        clip_count: clips.clips.length,
        transcript_segment_count: transcript.segments.length,
      },
      prompt: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.55 },
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
    const suggestions: ClipAiSuggestion[] = []
    for (const item of raw.slice(0, 14)) {
      if (!item || typeof item !== "object") continue
      const kind = String(item.kind ?? "").trim()
      if (!SUGGESTION_KINDS.has(kind)) continue
      const reason = String(item.reason ?? "").trim()
      if (!reason) continue
      const id = `${kind}-${suggestions.length}-${Date.now().toString(36)}`
      const isModifyExisting =
        kind === "better_hook" ||
        kind === "shorter_hook" ||
        kind === "tiktok_first_rewrite" ||
        kind === "youtube_shorts_rewrite" ||
        kind === "stronger_emotional_framing"
      const isThumbnail = kind === "thumbnail_text"
      const isNewClip = !isModifyExisting && !isThumbnail
      if (isNewClip) {
        if (
          typeof item.start_seconds !== "number" ||
          typeof item.end_seconds !== "number" ||
          typeof item.title !== "string" ||
          typeof item.hook !== "string"
        )
          continue
        suggestions.push({
          id,
          kind: kind as ClipAiSuggestionKind,
          clip_id: null,
          reason,
          patch: {
            title: item.title.trim().slice(0, 80),
            hook: item.hook.trim().slice(0, 200),
            summary:
              typeof item.summary === "string" ? item.summary.trim() : null,
            start_seconds: Math.max(0, Math.floor(item.start_seconds)),
            end_seconds: Math.max(
              Math.floor(item.start_seconds) + 5,
              Math.floor(item.end_seconds),
            ),
          },
        })
      } else if (isModifyExisting) {
        if (!item.clip_id || typeof item.hook !== "string") continue
        suggestions.push({
          id,
          kind: kind as ClipAiSuggestionKind,
          clip_id: String(item.clip_id),
          reason,
          patch: { hook: item.hook.trim().slice(0, 200) },
        })
      } else if (isThumbnail) {
        if (!item.clip_id || typeof item.thumbnail_text !== "string") continue
        suggestions.push({
          id,
          kind: "thumbnail_text",
          clip_id: String(item.clip_id),
          reason,
          patch: { thumbnail_text: item.thumbnail_text.trim().slice(0, 60) },
        })
      }
    }
    // Dedup by patch fingerprint to mitigate AI repeating itself.
    const seen = new Set<string>()
    const deduped: ClipAiSuggestion[] = []
    for (const s of suggestions) {
      const fp = `${s.kind}|${s.clip_id ?? ""}|${JSON.stringify(s.patch)}`
      if (seen.has(fp)) continue
      seen.add(fp)
      deduped.push(s)
    }
    return { ok: true, suggestions: deduped, aiRunId: r.runId }
  } catch (e) {
    return {
      ok: false,
      code: "server_error",
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}

// ─── Helpers ────────────────────────────────────────────────────────

void CLIP_PLATFORMS // re-exported via clip-types; reserved for future filter
void CLIP_RATIOS

function formatTime(s: number): string {
  const total = Math.max(0, Math.floor(s))
  const m = Math.floor(total / 60)
  const sec = total % 60
  const h = Math.floor(m / 60)
  const mm = (m % 60).toString().padStart(2, "0")
  const ss = sec.toString().padStart(2, "0")
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// NOTE: do NOT re-export types from this "use server" module. Every export
// of a "use server" file is treated as a server action; a `export type { … }`
// here makes the compiler emit a runtime reference to an erased type binding
// (e.g. `Clip`), throwing `ReferenceError: Clip is not defined` at module
// evaluation and crashing every page that loads this tree. Consumers should
// import clip types directly from "@/lib/editorial/clip-types".
