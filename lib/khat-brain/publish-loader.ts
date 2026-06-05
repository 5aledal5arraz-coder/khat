/**
 * UX-10 Phase B — Server-side publish-package loader.
 *
 * Loads `studio_analysis_records kind=website_package`, plus the
 * latest transcript / chapter / clip records so the editor can render
 * cross-context (clip count, chapter list, transcript pointer) and
 * the validation layer can compute readiness against real linkage
 * state. Also surfaces sibling slugs in the same season for duplicate
 * detection.
 */

import { and, desc, eq, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  studioAnalysisRecords,
  type StudioAnalysisStatus,
} from "@/lib/db/schema/studio-analysis"
import { studioSessions } from "@/lib/db/schema/studio"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import {
  coerceWebsitePackageDocument,
  emptyWebsitePackageDocument,
  type WebsitePackageDocument,
} from "@/lib/editorial/publish-types"
import {
  coerceClipDocument,
  type ClipDocument,
} from "@/lib/editorial/clip-types"
import {
  coerceChapterDocument,
  type ChapterDocument,
} from "@/lib/editorial/chapter-types"
import {
  coerceTranscriptDocument,
  type TranscriptDocument,
} from "@/lib/editorial/transcript-types"

export interface PublishLoadResult {
  doc: WebsitePackageDocument
  source: "studio_analysis_records" | "empty"
  recordId: string | null
  studioSessionId: string | null
  status: StudioAnalysisStatus | "missing"
  updatedAt: string | null
  /** Cross-context snapshots for the editor (no second fetch). */
  transcript: TranscriptDocument | null
  chapters: ChapterDocument | null
  clips: ClipDocument | null
  /** Slugs taken by other episodes in the same season — used for
   *  duplicate-slug detection. */
  siblingSlugs: string[]
  /** Latest record ids for cross-doc references stamped into the
   *  saved website package. */
  latestTranscriptRecordId: string | null
  latestChapterRecordId: string | null
  latestClipRecordId: string | null
  latestTranscriptVersion: number | null
}

export async function loadPublishPackageForEir(
  eirId: string,
): Promise<PublishLoadResult> {
  const empty: PublishLoadResult = {
    doc: emptyWebsitePackageDocument(),
    source: "empty",
    recordId: null,
    studioSessionId: null,
    status: "missing",
    updatedAt: null,
    transcript: null,
    chapters: null,
    clips: null,
    siblingSlugs: [],
    latestTranscriptRecordId: null,
    latestChapterRecordId: null,
    latestClipRecordId: null,
    latestTranscriptVersion: null,
  }
  if (!db) return empty

  const sessionRow = await db
    .select({ id: studioSessions.id })
    .from(studioSessions)
    .where(eq(studioSessions.eir_id, eirId))
    .orderBy(desc(studioSessions.updated_at))
    .limit(1)
  const studioSessionId = sessionRow[0]?.id ?? null

  const [pkgRow, trxRow, chRow, clRow, eirRow] = await Promise.all([
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
    db
      .select({
        id: episodeIntelligenceRecords.id,
        season_id: episodeIntelligenceRecords.season_id,
      })
      .from(episodeIntelligenceRecords)
      .where(eq(episodeIntelligenceRecords.id, eirId))
      .limit(1),
  ])

  // Cross-context shape coercion.
  const transcript =
    trxRow[0] != null
      ? coerceTranscriptDocument(
          trxRow[0].data as Record<string, unknown> | null,
        )
      : null
  const chapters =
    chRow[0] != null
      ? coerceChapterDocument(chRow[0].data as Record<string, unknown> | null)
      : null
  const clips =
    clRow[0] != null
      ? coerceClipDocument(clRow[0].data as Record<string, unknown> | null)
      : null

  // Sibling slug fetch — look at every other website_package row in
  // the same season's EIRs.
  let siblingSlugs: string[] = []
  const seasonId = eirRow[0]?.season_id ?? null
  if (seasonId) {
    try {
      const siblings = await db
        .select({ data: studioAnalysisRecords.data })
        .from(studioAnalysisRecords)
        .innerJoin(
          episodeIntelligenceRecords,
          eq(studioAnalysisRecords.eir_id, episodeIntelligenceRecords.id),
        )
        .where(
          and(
            eq(studioAnalysisRecords.kind, "website_package"),
            eq(episodeIntelligenceRecords.season_id, seasonId),
            ne(studioAnalysisRecords.eir_id, eirId),
          ),
        )
        .limit(200)
      siblingSlugs = siblings
        .map((row) => {
          const d = (row.data ?? {}) as Record<string, unknown>
          const w = d.website_package as
            | Record<string, unknown>
            | undefined
          const s =
            w && typeof w.slug === "string" ? w.slug.trim() : null
          return s
        })
        .filter((s): s is string => Boolean(s))
    } catch {
      // Best-effort — sibling fetch must never break the editor.
      siblingSlugs = []
    }
  }

  if (!pkgRow[0]) {
    return {
      ...empty,
      studioSessionId,
      transcript,
      chapters,
      clips,
      siblingSlugs,
      latestTranscriptRecordId: trxRow[0]?.id ?? null,
      latestChapterRecordId: chRow[0]?.id ?? null,
      latestClipRecordId: clRow[0]?.id ?? null,
      latestTranscriptVersion: transcript?.version ?? null,
      doc: {
        ...empty.doc,
        source_transcript_record_id: trxRow[0]?.id ?? null,
        source_transcript_version: transcript?.version ?? null,
        source_chapter_record_id: chRow[0]?.id ?? null,
        source_clip_record_id: clRow[0]?.id ?? null,
      },
    }
  }

  const doc = coerceWebsitePackageDocument(
    pkgRow[0].data as Record<string, unknown> | null,
  )
  // Refresh cross-doc pointers to latest known records every load.
  const merged: WebsitePackageDocument = {
    ...doc,
    source_transcript_record_id:
      trxRow[0]?.id ?? doc.source_transcript_record_id,
    source_transcript_version:
      transcript?.version ?? doc.source_transcript_version,
    source_chapter_record_id: chRow[0]?.id ?? doc.source_chapter_record_id,
    source_clip_record_id: clRow[0]?.id ?? doc.source_clip_record_id,
  }
  return {
    doc: merged,
    source: "studio_analysis_records",
    recordId: pkgRow[0].id,
    studioSessionId,
    status: pkgRow[0].status as StudioAnalysisStatus,
    updatedAt: pkgRow[0].updated_at.toISOString(),
    transcript,
    chapters,
    clips,
    siblingSlugs,
    latestTranscriptRecordId: trxRow[0]?.id ?? null,
    latestChapterRecordId: chRow[0]?.id ?? null,
    latestClipRecordId: clRow[0]?.id ?? null,
    latestTranscriptVersion: transcript?.version ?? null,
  }
}
