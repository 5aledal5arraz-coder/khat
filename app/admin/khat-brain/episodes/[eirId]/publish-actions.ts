"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq } from "drizzle-orm"
import { getAdminAuthUser, requireAdmin } from "@/lib/api-utils"
import { db } from "@/lib/db"
import { studioAnalysisRecords } from "@/lib/db/schema/studio-analysis"
import { studioSessions } from "@/lib/db/schema/studio"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import {
  coerceWebsitePackageDocument,
  emptyWebsitePackageDocument,
  slugifyTitle,
  type WebsitePackageDocument,
} from "@/lib/editorial/publish-types"
import { coerceClipDocument } from "@/lib/editorial/clip-types"
import { coerceChapterDocument } from "@/lib/editorial/chapter-types"
import { coerceTranscriptDocument } from "@/lib/editorial/transcript-types"
import { upsertStudioAnalysisRecord } from "@/lib/studio/analysis-records"
import { runAiTask } from "@/lib/ai-router/router"

// ─── Save action ────────────────────────────────────────────────────

export type SavePublishPackageResult =
  | { ok: true; newVersion: number; savedAt: string }
  | {
      ok: false
      code: "version_conflict"
      currentVersion: number
      currentDoc: WebsitePackageDocument
    }
  | { ok: false; code: "not_found"; message: string }
  | { ok: false; code: "server_error"; message: string }

export interface SavePublishPackageInput {
  eirId: string
  expectedVersion: number
  doc: WebsitePackageDocument
  editorSessionId?: string
  txnId?: number
}

export async function savePublishPackageAction(
  input: SavePublishPackageInput,
): Promise<SavePublishPackageResult> {
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
          eq(studioAnalysisRecords.kind, "website_package"),
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
        currentDoc: coerceWebsitePackageDocument(
          current[0]?.data as Record<string, unknown> | null,
        ),
      }
    }

    const newVersion = currentVersion + 1
    const savedAt = new Date().toISOString()
    const next: WebsitePackageDocument = {
      ...input.doc,
      schema_version: 1,
      version: newVersion,
      last_edited_by: admin?.id ?? null,
      last_edited_at: savedAt,
    }

    await upsertStudioAnalysisRecord({
      eir_id: input.eirId,
      studio_session_id: studioSessionId ?? null,
      kind: "website_package",
      status:
        input.doc.publish_status === "published"
          ? "ready"
          : "ready",
      data: next as unknown as Record<string, unknown>,
      edited_fields: {
        last_save: {
          editor_session_id: input.editorSessionId ?? null,
          txn_id: input.txnId ?? null,
          admin_id: admin?.id ?? null,
          version: newVersion,
          publish_status: next.publish_status,
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

// ─── Seed-from-context action ───────────────────────────────────────

export type SeedPublishPackageResult =
  | { ok: true; newVersion: number; seededFields: string[] }
  | { ok: false; code: "version_conflict"; currentVersion: number }
  | { ok: false; code: "no_context"; message: string }
  | { ok: false; code: "server_error"; message: string }

/**
 * UX-10 — seed initial publish-package values from existing transcript /
 * chapters / clips. Never overwrites operator-filled fields; only
 * populates empty ones. Idempotent.
 */
export async function seedPublishPackageFromContextAction(input: {
  eirId: string
  expectedVersion: number
  editorSessionId?: string
}): Promise<SeedPublishPackageResult> {
  try {
    await requireAdmin()
    const admin = await getAdminAuthUser()
    if (!db)
      return { ok: false, code: "server_error", message: "DB unavailable" }

    const eirRow = await db
      .select({ id: episodeIntelligenceRecords.id, working_title: episodeIntelligenceRecords.working_title, final_title: episodeIntelligenceRecords.final_title })
      .from(episodeIntelligenceRecords)
      .where(eq(episodeIntelligenceRecords.id, input.eirId))
      .limit(1)
    if (!eirRow[0])
      return { ok: false, code: "no_context", message: "EIR not found" }
    const eir = eirRow[0]

    const sessionRow = await db
      .select({ id: studioSessions.id })
      .from(studioSessions)
      .where(eq(studioSessions.eir_id, input.eirId))
      .orderBy(desc(studioSessions.updated_at))
      .limit(1)
    const studioSessionId = sessionRow[0]?.id ?? null

    const [pkgRow, trxRow, chRow, clRow] = await Promise.all([
      db
        .select()
        .from(studioAnalysisRecords)
        .where(
          and(
            eq(studioAnalysisRecords.eir_id, input.eirId),
            eq(studioAnalysisRecords.kind, "website_package"),
          ),
        )
        .orderBy(desc(studioAnalysisRecords.created_at))
        .limit(1),
      db
        .select()
        .from(studioAnalysisRecords)
        .where(
          and(
            eq(studioAnalysisRecords.eir_id, input.eirId),
            eq(studioAnalysisRecords.kind, "transcript"),
          ),
        )
        .orderBy(desc(studioAnalysisRecords.created_at))
        .limit(1),
      db
        .select()
        .from(studioAnalysisRecords)
        .where(
          and(
            eq(studioAnalysisRecords.eir_id, input.eirId),
            eq(studioAnalysisRecords.kind, "chapters"),
          ),
        )
        .orderBy(desc(studioAnalysisRecords.created_at))
        .limit(1),
      db
        .select()
        .from(studioAnalysisRecords)
        .where(
          and(
            eq(studioAnalysisRecords.eir_id, input.eirId),
            eq(studioAnalysisRecords.kind, "clips"),
          ),
        )
        .orderBy(desc(studioAnalysisRecords.created_at))
        .limit(1),
    ])

    const doc: WebsitePackageDocument = pkgRow[0]
      ? coerceWebsitePackageDocument(
          pkgRow[0].data as Record<string, unknown> | null,
        )
      : emptyWebsitePackageDocument()
    if (doc.version !== input.expectedVersion) {
      return {
        ok: false,
        code: "version_conflict",
        currentVersion: doc.version,
      }
    }

    const transcript = trxRow[0]
      ? coerceTranscriptDocument(
          trxRow[0].data as Record<string, unknown> | null,
        )
      : null
    const chapters = chRow[0]
      ? coerceChapterDocument(chRow[0].data as Record<string, unknown> | null)
      : null
    const clips = clRow[0]
      ? coerceClipDocument(clRow[0].data as Record<string, unknown> | null)
      : null
    if (!transcript && !chapters && !clips) {
      return {
        ok: false,
        code: "no_context",
        message: "لا توجد سياقات لاستخدامها (نصّ / فصول / مقاطع)",
      }
    }

    const seededFields: string[] = []
    const w = { ...doc.website_package }
    const y = { ...doc.youtube_package }
    const seo = { ...doc.seo_package }

    const seedTitle = eir.final_title?.trim() || eir.working_title?.trim() || ""
    if (!w.final_title.trim() && seedTitle) {
      w.final_title = seedTitle
      seededFields.push("website.final_title")
    }
    if (!w.slug.trim() && seedTitle) {
      w.slug = slugifyTitle(seedTitle)
      seededFields.push("website.slug")
    }
    if (!y.youtube_title.trim() && seedTitle) {
      y.youtube_title = seedTitle
      seededFields.push("youtube.youtube_title")
    }
    if (!seo.meta_title.trim() && seedTitle) {
      seo.meta_title = seedTitle.slice(0, 80)
      seededFields.push("seo.meta_title")
    }
    if (chapters && y.chapter_export.length === 0) {
      y.chapter_export = chapters.chapters.map((c) => ({
        start_seconds: Math.max(0, Math.floor(c.start_seconds)),
        label: c.title || "—",
      }))
      if (y.chapter_export.length > 0) seededFields.push("youtube.chapter_export")
    }
    if (chapters && w.timeline_sections.length === 0) {
      w.timeline_sections = chapters.chapters.map((c) => ({
        start_seconds: Math.max(0, Math.floor(c.start_seconds)),
        label: c.title || "—",
      }))
      if (w.timeline_sections.length > 0)
        seededFields.push("website.timeline_sections")
    }
    if (clips && w.quote_highlights.length === 0) {
      const quotes = clips.clips
        .filter((c) => c.hook.trim() && c.hook_score >= 60)
        .slice(0, 6)
        .map((c) => c.hook.trim())
      if (quotes.length > 0) {
        w.quote_highlights = quotes
        seededFields.push("website.quote_highlights")
      }
    }
    if (chapters && w.key_takeaways.length === 0) {
      const takeaways = chapters.chapters
        .map((c) => c.summary?.trim())
        .filter((s): s is string => Boolean(s && s.length > 0))
        .slice(0, 6)
      if (takeaways.length > 0) {
        w.key_takeaways = takeaways
        seededFields.push("website.key_takeaways")
      }
    }
    if (transcript && w.reading_time_estimate_minutes === null) {
      // Rough estimate: 140 wpm Arabic reading.
      const minutes = Math.max(1, Math.round(transcript.word_count / 140))
      w.reading_time_estimate_minutes = minutes
      seededFields.push("website.reading_time_estimate_minutes")
    }

    if (seededFields.length === 0) {
      return { ok: true, newVersion: doc.version, seededFields: [] }
    }

    const newVersion = doc.version + 1
    const savedAt = new Date().toISOString()
    const persisted: WebsitePackageDocument = {
      ...doc,
      website_package: w,
      youtube_package: y,
      seo_package: seo,
      source_transcript_record_id:
        trxRow[0]?.id ?? doc.source_transcript_record_id,
      source_transcript_version:
        transcript?.version ?? doc.source_transcript_version,
      source_chapter_record_id: chRow[0]?.id ?? doc.source_chapter_record_id,
      source_clip_record_id: clRow[0]?.id ?? doc.source_clip_record_id,
      schema_version: 1,
      version: newVersion,
      last_edited_by: admin?.id ?? null,
      last_edited_at: savedAt,
    }

    await upsertStudioAnalysisRecord({
      eir_id: input.eirId,
      studio_session_id: studioSessionId ?? null,
      kind: "website_package",
      status: "ready",
      data: persisted as unknown as Record<string, unknown>,
      edited_fields: {
        last_save: {
          editor_session_id: input.editorSessionId ?? null,
          source: "seed_from_context",
          seeded_fields: seededFields,
          admin_id: admin?.id ?? null,
          version: newVersion,
          at: savedAt,
        },
      },
    })

    revalidatePath(`/admin/khat-brain/episodes/${input.eirId}`)
    return { ok: true, newVersion, seededFields }
  } catch (e) {
    return {
      ok: false,
      code: "server_error",
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}

// ─── AI suggestion action ───────────────────────────────────────────

export type PublishAiSuggestionKind =
  | "stronger_title"
  | "more_philosophical_framing"
  | "emotional_reframing"
  | "controversy_softening"
  | "controversy_amplification"
  | "seo_improvement"
  | "stronger_newsletter_angle"
  | "stronger_opening_hook"
  | "better_thumbnail_direction"
  | "deeper_takeaway_extraction"
  | "stronger_quote_extraction"
  | "audience_specific_rewrite"
  | "kuwait_specific_framing"
  | "arab_world_framing"

export interface PublishAiSuggestion {
  id: string
  kind: PublishAiSuggestionKind
  reason: string
  /** Where in the doc the suggestion would land. */
  field:
    | "website.final_title"
    | "website.canonical_description"
    | "website.episode_summary"
    | "website.key_takeaways"
    | "website.quote_highlights"
    | "website.subtitle"
    | "youtube.youtube_title"
    | "youtube.thumbnail_direction"
    | "youtube.hook_opening_line"
    | "newsletter.newsletter_subject"
    | "newsletter.featured_quote"
    | "seo.ranking_angle"
  /** New value the operator may accept. For list fields, an array. */
  patch:
    | { value: string }
    | { values: string[] }
}

export type SuggestPublishResult =
  | { ok: true; suggestions: PublishAiSuggestion[]; aiRunId: string | null }
  | { ok: false; code: "no_context"; message: string }
  | { ok: false; code: "ai_error"; message: string }
  | { ok: false; code: "server_error"; message: string }

interface AiPayload {
  suggestions: Array<{
    kind: string
    reason?: string
    field?: string
    value?: string
    values?: string[]
  }>
}

const ALLOWED_KINDS: ReadonlySet<string> = new Set<PublishAiSuggestionKind>([
  "stronger_title",
  "more_philosophical_framing",
  "emotional_reframing",
  "controversy_softening",
  "controversy_amplification",
  "seo_improvement",
  "stronger_newsletter_angle",
  "stronger_opening_hook",
  "better_thumbnail_direction",
  "deeper_takeaway_extraction",
  "stronger_quote_extraction",
  "audience_specific_rewrite",
  "kuwait_specific_framing",
  "arab_world_framing",
])

const ALLOWED_FIELDS: ReadonlySet<string> = new Set<PublishAiSuggestion["field"]>([
  "website.final_title",
  "website.canonical_description",
  "website.episode_summary",
  "website.key_takeaways",
  "website.quote_highlights",
  "website.subtitle",
  "youtube.youtube_title",
  "youtube.thumbnail_direction",
  "youtube.hook_opening_line",
  "newsletter.newsletter_subject",
  "newsletter.featured_quote",
  "seo.ranking_angle",
])

export async function suggestPublishImprovementsAction(
  eirId: string,
): Promise<SuggestPublishResult> {
  try {
    await requireAdmin()
    if (!db)
      return { ok: false, code: "server_error", message: "DB unavailable" }

    const [pkgRow, trxRow, chRow, clRow] = await Promise.all([
      db
        .select()
        .from(studioAnalysisRecords)
        .where(
          and(
            eq(studioAnalysisRecords.eir_id, eirId),
            eq(studioAnalysisRecords.kind, "website_package"),
          ),
        )
        .orderBy(desc(studioAnalysisRecords.created_at))
        .limit(1),
      db
        .select()
        .from(studioAnalysisRecords)
        .where(
          and(
            eq(studioAnalysisRecords.eir_id, eirId),
            eq(studioAnalysisRecords.kind, "transcript"),
          ),
        )
        .orderBy(desc(studioAnalysisRecords.created_at))
        .limit(1),
      db
        .select()
        .from(studioAnalysisRecords)
        .where(
          and(
            eq(studioAnalysisRecords.eir_id, eirId),
            eq(studioAnalysisRecords.kind, "chapters"),
          ),
        )
        .orderBy(desc(studioAnalysisRecords.created_at))
        .limit(1),
      db
        .select()
        .from(studioAnalysisRecords)
        .where(
          and(
            eq(studioAnalysisRecords.eir_id, eirId),
            eq(studioAnalysisRecords.kind, "clips"),
          ),
        )
        .orderBy(desc(studioAnalysisRecords.created_at))
        .limit(1),
    ])

    const transcript = trxRow[0]
      ? coerceTranscriptDocument(
          trxRow[0].data as Record<string, unknown> | null,
        )
      : null
    const chapters = chRow[0]
      ? coerceChapterDocument(chRow[0].data as Record<string, unknown> | null)
      : null
    const clips = clRow[0]
      ? coerceClipDocument(clRow[0].data as Record<string, unknown> | null)
      : null
    const pkg = pkgRow[0]
      ? coerceWebsitePackageDocument(
          pkgRow[0].data as Record<string, unknown> | null,
        )
      : emptyWebsitePackageDocument()
    if (!transcript && !chapters && !clips) {
      return {
        ok: false,
        code: "no_context",
        message: "لا يوجد سياق كافٍ لتوليد الاقتراحات",
      }
    }

    const transcriptSample = transcript
      ? transcript.segments
          .slice(0, 60)
          .map((s) => s.text)
          .join("\n")
          .slice(0, 5000)
      : ""
    const chapterSample = chapters
      ? chapters.chapters
          .map((c) => `- ${c.title} (${Math.floor(c.start_seconds)}s)`)
          .join("\n")
          .slice(0, 1500)
      : ""
    const clipSample = clips
      ? clips.clips
          .slice(0, 12)
          .map((c) => `- "${c.title}" | hook: "${c.hook}" | hook_score=${c.hook_score}`)
          .join("\n")
          .slice(0, 1500)
      : ""
    const currentPkg = [
      `final_title: "${pkg.website_package.final_title}"`,
      `subtitle: "${pkg.website_package.subtitle}"`,
      `canonical_description: "${pkg.website_package.canonical_description.slice(0, 280)}"`,
      `episode_summary: "${pkg.website_package.episode_summary.slice(0, 280)}"`,
      `key_takeaways: ${JSON.stringify(pkg.website_package.key_takeaways).slice(0, 600)}`,
      `quote_highlights: ${JSON.stringify(pkg.website_package.quote_highlights).slice(0, 600)}`,
      `newsletter_subject: "${pkg.newsletter_package.newsletter_subject}"`,
      `seo_ranking_angle: "${pkg.seo_package.ranking_angle}"`,
      `youtube_title: "${pkg.youtube_package.youtube_title}"`,
    ].join("\n")

    const system = [
      "You are an editorial strategist for an Arabic podcast called Khat. Produce reviewable PUBLISH-PACKAGE suggestions.",
      "Khat's identity: emotional honesty, philosophical tension, identity conflict, hidden pain, unexpected truths, intelligent controversy. NEVER engagement bait, NEVER generic adjectives, NEVER all-caps shouting.",
      "Output STRICT JSON: { suggestions: [{ kind, field, reason, value?, values? }] }.",
      "Allowed kinds: stronger_title, more_philosophical_framing, emotional_reframing, controversy_softening, controversy_amplification, seo_improvement, stronger_newsletter_angle, stronger_opening_hook, better_thumbnail_direction, deeper_takeaway_extraction, stronger_quote_extraction, audience_specific_rewrite, kuwait_specific_framing, arab_world_framing.",
      "Allowed fields: website.final_title, website.canonical_description, website.episode_summary, website.key_takeaways, website.quote_highlights, website.subtitle, youtube.youtube_title, youtube.thumbnail_direction, youtube.hook_opening_line, newsletter.newsletter_subject, newsletter.featured_quote, seo.ranking_angle.",
      "Rules:",
      "1. Max 12 suggestions. Quality over quantity.",
      "2. For string fields: provide 'value'. For list fields (key_takeaways, quote_highlights): provide 'values' array (3–6 items).",
      "3. NEVER overwrite anything automatically — every suggestion is reviewed.",
      "4. Reasons must be concise Arabic, one sentence.",
      "5. Titles must be Arabic, 5–14 words, no exclamation marks, no rhetorical shouting.",
    ].join("\n")
    const user = [
      "Existing publish package:",
      currentPkg,
      "",
      "Transcript head:",
      transcriptSample || "(none)",
      "",
      "Chapters:",
      chapterSample || "(none)",
      "",
      "Top clips:",
      clipSample || "(none)",
      "",
      "Return JSON only.",
    ].join("\n")

    const r = await runAiTask<AiPayload>({
      taskKind: "editorial",
      eirId,
      subjectTable: "studio_analysis_records",
      subjectId: pkgRow[0]?.id ?? trxRow[0]?.id ?? null,
      input: {
        pass: "publish_package_suggestions",
        has_transcript: !!transcript,
        has_chapters: !!chapters,
        has_clips: !!clips,
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
    const out: PublishAiSuggestion[] = []
    const seen = new Set<string>()
    for (const item of raw.slice(0, 14)) {
      if (!item || typeof item !== "object") continue
      const kind = String(item.kind ?? "").trim()
      const field = String(item.field ?? "").trim()
      const reason = String(item.reason ?? "").trim()
      if (!ALLOWED_KINDS.has(kind) || !ALLOWED_FIELDS.has(field) || !reason)
        continue
      let patch: PublishAiSuggestion["patch"] | null = null
      if (Array.isArray(item.values) && item.values.length > 0) {
        const values = (item.values as unknown[])
          .filter(
            (v): v is string =>
              typeof v === "string" && v.trim().length > 0,
          )
          .slice(0, 8)
        if (values.length > 0) patch = { values }
      } else if (typeof item.value === "string" && item.value.trim()) {
        patch = { value: item.value.trim().slice(0, 600) }
      }
      if (!patch) continue
      const fp = `${kind}|${field}|${JSON.stringify(patch)}`
      if (seen.has(fp)) continue
      seen.add(fp)
      out.push({
        id: `${kind}-${out.length}-${Date.now().toString(36)}`,
        kind: kind as PublishAiSuggestionKind,
        reason,
        field: field as PublishAiSuggestion["field"],
        patch,
      })
    }
    return { ok: true, suggestions: out, aiRunId: r.runId }
  } catch (e) {
    return {
      ok: false,
      code: "server_error",
      message: e instanceof Error ? e.message : "Unknown error",
    }
  }
}
