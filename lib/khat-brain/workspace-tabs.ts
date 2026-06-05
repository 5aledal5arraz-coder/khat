/**
 * UX-3b — Per-tab data loaders for the Episode Workspace.
 *
 * Pattern: each loader takes one or two ids and returns ONLY the data
 * its tab needs. The workspace page calls these in parallel from the
 * server component, then dispatches into the tab JSX.
 *
 * No new schema. No new write paths. Pure read service over existing
 * tables. The studio + publish + performance tabs explicitly avoid
 * re-mounting the heavy legacy clients — they show summary + links.
 */

import { and, desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { collaborationRooms, roomSessionMarkers } from "@/lib/db/schema/collaboration"
import { studioSessions } from "@/lib/db/schema/studio"
import { studioAnalysisRecords } from "@/lib/db/schema/studio-analysis"
import { episodePerformanceSignals } from "@/lib/db/schema/performance-signals"
import { performanceSnapshots } from "@/lib/db/schema/studio-analysis"
import { episodes } from "@/lib/db/schema/episodes"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import type { PrepV2Payload } from "@/lib/preparation/v2/types"

// ─── Recording tab ────────────────────────────────────────────────────

export interface WorkspaceRoomSummary {
  id: string
  name: string
  status: "waiting" | "live" | "paused" | "ended"
  recording_started_at: string | null
  recording_ended_at: string | null
  recording_elapsed_ms: number
  director_notes: string
  current_section_key: string | null
  current_section_index: number | null
  preparation_id: string
  created_at: string
  updated_at: string
  /** UX-5.5b — actor + timestamp for the "آخر إجراء" trust strip. */
  created_by: string | null
  created_by_email: string | null
}

/**
 * Most-recently-updated room linked to this EIR. Only one is expected
 * in practice (one episode → one room), but the schema allows more so
 * we always return the latest.
 */
export async function getRoomSummaryForEir(
  eirId: string,
): Promise<WorkspaceRoomSummary | null> {
  const [row] = await db!
    .select()
    .from(collaborationRooms)
    .where(eq(collaborationRooms.eir_id, eirId))
    .orderBy(desc(collaborationRooms.updated_at))
    .limit(1)
  if (!row) return null

  // UX-5.5b — resolve created_by → admin email (best-effort).
  let createdByEmail: string | null = null
  if (row.created_by) {
    const [actor] = await db!
      .select({ email: adminUsers.email })
      .from(adminUsers)
      .where(eq(adminUsers.id, row.created_by))
      .limit(1)
    createdByEmail = actor?.email ?? null
  }

  return {
    id: row.id,
    name: row.name,
    status: row.status as WorkspaceRoomSummary["status"],
    recording_started_at: row.recording_started_at?.toISOString() ?? null,
    recording_ended_at: row.recording_ended_at?.toISOString() ?? null,
    recording_elapsed_ms: row.recording_elapsed_ms,
    director_notes: row.director_notes ?? "",
    current_section_key: row.current_section_key ?? null,
    current_section_index: row.current_section_index ?? null,
    preparation_id: row.preparation_id,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
    created_by: row.created_by ?? null,
    created_by_email: createdByEmail,
  }
}

// ─── Preparation tab ──────────────────────────────────────────────────

export interface WorkspacePrepSummary {
  id: string
  title: string
  guest_name: string | null
  /** UX-7 Phase B — workspace-native inputs editor reads these fields. */
  short_description: string | null
  episode_goal: string | null
  key_questions: string[]
  status: string
  prep_v2: PrepV2Payload | null
  updated_at: string
}

export async function getPreparationForEir(
  eirId: string,
): Promise<WorkspacePrepSummary | null> {
  const [row] = await db!
    .select({
      id: episodePreparations.id,
      title: episodePreparations.title,
      guest_name: episodePreparations.guest_name,
      short_description: episodePreparations.short_description,
      episode_goal: episodePreparations.episode_goal,
      key_questions: episodePreparations.key_questions,
      status: episodePreparations.status,
      prep_v2: episodePreparations.prep_v2,
      updated_at: episodePreparations.updated_at,
    })
    .from(episodePreparations)
    .where(eq(episodePreparations.eir_id, eirId))
    .orderBy(desc(episodePreparations.updated_at))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    guest_name: row.guest_name,
    short_description: row.short_description ?? null,
    episode_goal: row.episode_goal ?? null,
    key_questions: Array.isArray(row.key_questions) ? row.key_questions : [],
    status: row.status,
    prep_v2: (row.prep_v2 as PrepV2Payload | null) ?? null,
    updated_at: row.updated_at.toISOString(),
  }
}

// ─── Studio tab ───────────────────────────────────────────────────────

export const STUDIO_OUTPUT_KINDS = [
  "transcript",
  "chapters",
  "clips",
  "website_package",
  "deep_analysis",
  "guest_intelligence",
] as const
export type StudioOutputKind = (typeof STUDIO_OUTPUT_KINDS)[number]

export type StudioOutputStatus =
  | "ready"
  | "generating"
  | "pending"
  | "error"
  | "archived"
  | "missing"

export interface WorkspaceStudioOutput {
  kind: StudioOutputKind
  status: StudioOutputStatus
  generated_at: string | null
  error: string | null
}

export interface WorkspaceStudioSummary {
  session: {
    id: string
    status: string
    source: string
    video_title: string | null
    youtube_url: string | null
    duration_seconds: number | null
    updated_at: string
  } | null
  outputs: WorkspaceStudioOutput[]
  push_log: Array<{
    id: string
    pushed_at: string | null
    pushed_fields: string[]
    episode_title: string
  }>
  /**
   * UX-5.2 — the website-package summary feeding the workspace
   * inline editor. Null when the session has no package row yet.
   */
  package: {
    id: string
    custom_title: string | null
    hero_summary: string | null
    takeaways: string[]
    quotes: Array<{ text: string; theme: string | null; speaker: string | null }>
    timestamps: Array<{ time_seconds: number; title: string; description: string | null }>
  } | null
}

export async function getStudioSummaryForEir(
  eirId: string,
): Promise<WorkspaceStudioSummary> {
  const [session] = await db!
    .select()
    .from(studioSessions)
    .where(eq(studioSessions.eir_id, eirId))
    .orderBy(desc(studioSessions.updated_at))
    .limit(1)
  if (!session) {
    return {
      session: null,
      outputs: STUDIO_OUTPUT_KINDS.map((kind) => ({
        kind,
        status: "missing",
        generated_at: null,
        error: null,
      })),
      push_log: [],
      package: null,
    }
  }
  const records = await db!
    .select({
      kind: studioAnalysisRecords.kind,
      status: studioAnalysisRecords.status,
      generated_at: studioAnalysisRecords.generated_at,
      error: studioAnalysisRecords.error,
      data: studioAnalysisRecords.data,
      published_at: studioAnalysisRecords.published_at,
    })
    .from(studioAnalysisRecords)
    .where(eq(studioAnalysisRecords.studio_session_id, session.id))

  const outputByKind = new Map<string, (typeof records)[number]>()
  const pushLogRows: Array<{
    id: string
    pushed_at: string | null
    pushed_fields: string[]
    episode_title: string
  }> = []

  // We separately collect push_log rows (kind='push_log' is append-only).
  const pushLogRecords = await db!
    .select({
      id: studioAnalysisRecords.id,
      data: studioAnalysisRecords.data,
      published_at: studioAnalysisRecords.published_at,
      created_at: studioAnalysisRecords.created_at,
    })
    .from(studioAnalysisRecords)
    .where(
      and(
        eq(studioAnalysisRecords.studio_session_id, session.id),
        eq(studioAnalysisRecords.kind, "push_log"),
      ),
    )
    .orderBy(desc(studioAnalysisRecords.created_at))
    .limit(8)

  for (const r of records) {
    if (r.kind === "push_log") continue
    // For non-push-log kinds, the latest row wins.
    const prev = outputByKind.get(r.kind)
    if (
      !prev ||
      (r.generated_at &&
        prev.generated_at &&
        r.generated_at.getTime() > prev.generated_at.getTime())
    ) {
      outputByKind.set(r.kind, r)
    }
  }

  for (const r of pushLogRecords) {
    const data = (r.data ?? {}) as Record<string, unknown>
    pushLogRows.push({
      id: r.id,
      pushed_at:
        typeof data.pushed_at === "string"
          ? data.pushed_at
          : (r.published_at?.toISOString() ?? r.created_at.toISOString()),
      pushed_fields: Array.isArray(data.pushed_fields)
        ? (data.pushed_fields as string[])
        : [],
      episode_title:
        typeof data.episode_title === "string" ? data.episode_title : "—",
    })
  }

  const outputs: WorkspaceStudioOutput[] = STUDIO_OUTPUT_KINDS.map((kind) => {
    const r = outputByKind.get(kind)
    if (!r) {
      return { kind, status: "missing", generated_at: null, error: null }
    }
    return {
      kind,
      status: (r.status as StudioOutputStatus) ?? "pending",
      generated_at: r.generated_at?.toISOString() ?? null,
      error: r.error ?? null,
    }
  })

  // UX-5.2 — load the website-package summary so the Studio tab can
  // inline-edit the high-traffic fields (title / hero / takeaways /
  // quotes / timestamps) without bouncing to /admin/studio.
  let pkg: WorkspaceStudioSummary["package"] = null
  try {
    const { getWebsitePackageForSession } = await import("@/lib/studio/website-packages")
    const wp = await getWebsitePackageForSession(session.id)
    if (wp) {
      pkg = {
        id: wp.id,
        custom_title: wp.custom_title,
        hero_summary: wp.hero_summary,
        takeaways: wp.takeaways ?? [],
        quotes: (wp.quotes ?? []).map((q) => ({
          text: q.text,
          theme: q.theme,
          speaker: q.speaker,
        })),
        timestamps: (wp.timestamps ?? []).map((t) => ({
          time_seconds: t.time_seconds,
          title: t.title,
          description: t.description,
        })),
      }
    }
  } catch (err) {
    console.error("[workspace] website-package read failed:", err)
  }

  return {
    session: {
      id: session.id,
      // DB columns are nullable text/timestamp — coerce to defaults so
      // the workspace summary type stays non-null. Defaults match the
      // schema column defaults (status defaults to "draft" already).
      status: session.status ?? "draft",
      source: session.source ?? "unknown",
      video_title: session.video_title,
      youtube_url: session.youtube_url,
      duration_seconds: session.duration_seconds,
      updated_at:
        session.updated_at instanceof Date
          ? session.updated_at.toISOString()
          : new Date().toISOString(),
    },
    outputs,
    push_log: pushLogRows,
    package: pkg,
  }
}

// ─── Markers strip ────────────────────────────────────────────────────

export interface WorkspaceMarker {
  id: string
  marker_type: string
  label: string
  recording_ms: number
  section_key: string | null
  created_at: string
}

export async function getMarkersForRoom(
  roomId: string,
  limit = 30,
): Promise<WorkspaceMarker[]> {
  const rows = await db!
    .select({
      id: roomSessionMarkers.id,
      marker_type: roomSessionMarkers.marker_type,
      label: roomSessionMarkers.label,
      recording_ms: roomSessionMarkers.recording_ms,
      section_key: roomSessionMarkers.section_key,
      created_at: roomSessionMarkers.created_at,
    })
    .from(roomSessionMarkers)
    .where(eq(roomSessionMarkers.room_id, roomId))
    .orderBy(desc(roomSessionMarkers.recording_ms))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    marker_type: r.marker_type,
    label: r.label,
    recording_ms: r.recording_ms,
    section_key: r.section_key ?? null,
    created_at: r.created_at.toISOString(),
  }))
}

// ─── Publish tab ──────────────────────────────────────────────────────

export interface WorkspaceEpisodeSummary {
  id: string
  title: string
  slug: string
  status: string | null
  youtube_url: string | null
  release_date: string | null
  duration_minutes: number | null
  updated_at: string
}

export async function getEpisodeForEir(
  eirId: string,
): Promise<WorkspaceEpisodeSummary | null> {
  const [row] = await db!
    .select({
      id: episodes.id,
      title: episodes.title,
      slug: episodes.slug,
      status: episodes.status,
      youtube_url: episodes.youtube_url,
      release_date: episodes.release_date,
      duration_minutes: episodes.duration_minutes,
      updated_at: episodes.updated_at,
    })
    .from(episodes)
    .where(eq(episodes.eir_id, eirId))
    .limit(1)
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status ?? null,
    youtube_url: row.youtube_url ?? null,
    // `episodes.release_date` is a Postgres `date` column — drizzle
    // infers it as `string` (YYYY-MM-DD). The previous `instanceof
    // Date` branch was statically dead and tripped TS strict mode.
    release_date: row.release_date ?? null,
    duration_minutes: row.duration_minutes ?? null,
    // `episodes.updated_at` is `timestamp with timezone, default now()`
    // — drizzle infers `Date | null`. Coerce to ISO; null falls back
    // to "now" so the workspace summary stays string, not string|null.
    updated_at:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date().toISOString(),
  }
}

// ─── Performance tab ──────────────────────────────────────────────────

export interface WorkspacePerformance {
  signal: typeof episodePerformanceSignals.$inferSelect | null
  latest_snapshot: {
    id: string
    view_count: string | null
    like_count: string | null
    comment_count: string | null
    snapshot_at: string
    source: string
  } | null
  snapshot_count: number
}

export async function getPerformanceForEir(
  eirId: string,
): Promise<WorkspacePerformance> {
  const [signal, latest, all] = await Promise.all([
    db!
      .select()
      .from(episodePerformanceSignals)
      .where(eq(episodePerformanceSignals.eir_id, eirId))
      .limit(1),
    db!
      .select({
        id: performanceSnapshots.id,
        view_count: performanceSnapshots.view_count,
        like_count: performanceSnapshots.like_count,
        comment_count: performanceSnapshots.comment_count,
        snapshot_at: performanceSnapshots.snapshot_at,
        source: performanceSnapshots.source,
      })
      .from(performanceSnapshots)
      .where(eq(performanceSnapshots.eir_id, eirId))
      .orderBy(desc(performanceSnapshots.snapshot_at))
      .limit(1),
    db!
      .select({ id: performanceSnapshots.id })
      .from(performanceSnapshots)
      .where(eq(performanceSnapshots.eir_id, eirId)),
  ])
  return {
    signal: signal[0] ?? null,
    latest_snapshot: latest[0]
      ? {
          ...latest[0],
          snapshot_at: latest[0].snapshot_at.toISOString(),
        }
      : null,
    snapshot_count: all.length,
  }
}
