/**
 * Admin read models for the Podcast Universe screens (B14, B15, B16).
 *
 * Guest search reads `podcast_people` + `podcast_person_aliases` by their
 * normalized keys (indexed) and aggregates appearances per person; it never
 * scans episode text (B17).
 */
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import type {
  PodcastEvidenceBasis,
  PodcastEvidenceStatus,
  PodcastGenderMarker,
  PodcastIdentityStatus,
  PodcastRegistryType,
} from "@/lib/db/schema/podcast-universe"
import { normalizeNameKey } from "./normalize"
import { KW_CONTEXT_LATERAL } from "./kuwait-context"
import { isHostOf, programOf, type ProgramHosts } from "./hosts"

function rows<T>(r: { rows: unknown[] }): T[] {
  return r.rows as T[]
}

// ─── Channels (B14) ──────────────────────────────────────────────────────

export interface ChannelListRow {
  id: string
  name: string
  handle: string | null
  youtube_channel_id: string | null
  country_code: string | null
  registry_type: PodcastRegistryType
  host_names: string[]
  program_hosts: ProgramHosts[]
  verification_status: string
  crawl_status: string
  paused: boolean
  reported_video_count: number | null
  last_crawled_at: Date | null
  last_successful_crawl_at: Date | null
  indexed: number
  longform: number
  ex_pending: number
  ex_running: number
  ex_succeeded: number
  ex_no_guest: number
  ex_failed: number
  last_run_type: string | null
  last_run_status: string | null
  last_run_error: string | null
  verify_error: string | null
}

export async function listChannelsForAdmin(): Promise<ChannelListRow[]> {
  const r = await db!.execute(sql`
    SELECT c.id, c.name, c.handle, c.youtube_channel_id, c.country_code, c.registry_type, c.host_names, c.program_hosts,
           c.verification_status, c.crawl_status, c.paused, c.reported_video_count,
           c.last_crawled_at, c.last_successful_crawl_at,
           c.metadata->>'verify_error' AS verify_error,
           COALESCE(e.indexed, 0)::int AS indexed,
           COALESCE(e.longform, 0)::int AS longform,
           COALESCE(e.ex_pending, 0)::int AS ex_pending,
           COALESCE(e.ex_running, 0)::int AS ex_running,
           COALESCE(e.ex_succeeded, 0)::int AS ex_succeeded,
           COALESCE(e.ex_no_guest, 0)::int AS ex_no_guest,
           COALESCE(e.ex_failed, 0)::int AS ex_failed,
           lr.run_type AS last_run_type, lr.status AS last_run_status, lr.error_summary AS last_run_error
    FROM podcast_channels c
    LEFT JOIN LATERAL (
      SELECT count(*) AS indexed,
             count(*) FILTER (WHERE duration_class = 'core_longform') AS longform,
             count(*) FILTER (WHERE duration_class = 'core_longform' AND guest_extraction_status = 'pending') AS ex_pending,
             count(*) FILTER (WHERE duration_class = 'core_longform' AND guest_extraction_status = 'running') AS ex_running,
             count(*) FILTER (WHERE duration_class = 'core_longform' AND guest_extraction_status = 'succeeded') AS ex_succeeded,
             count(*) FILTER (WHERE duration_class = 'core_longform' AND guest_extraction_status = 'no_guest') AS ex_no_guest,
             count(*) FILTER (WHERE duration_class = 'core_longform' AND guest_extraction_status = 'failed') AS ex_failed
      FROM podcast_episodes WHERE channel_id = c.id
    ) e ON true
    LEFT JOIN LATERAL (
      SELECT run_type, status, error_summary FROM podcast_crawl_runs
      WHERE channel_id = c.id ORDER BY created_at DESC LIMIT 1
    ) lr ON true
    ORDER BY CASE c.registry_type WHEN 'core_interview' THEN 0 WHEN 'context_coverage' THEN 1 ELSE 2 END, c.name
  `)
  return rows<ChannelListRow>(r)
}

export interface ExtractionRunRow {
  id: string
  status: string
  ai_cost_usd: string
  budget_limit_usd: string | null
  error_summary: string | null
  created_at: Date
  completed_at: Date | null
  batches_done: number | null
  validation_issues: number | null
}

export async function listExtractionRuns(limit = 5): Promise<ExtractionRunRow[]> {
  const r = await db!.execute(sql`
    SELECT id, status, ai_cost_usd, budget_limit_usd, error_summary, created_at, completed_at,
           (cursor_state->>'batches_done')::int AS batches_done,
           (cursor_state->>'validation_issues')::int AS validation_issues
    FROM podcast_crawl_runs WHERE run_type = 'guest_extract'
    ORDER BY created_at DESC LIMIT ${limit}
  `)
  return rows<ExtractionRunRow>(r)
}

// ─── Guest registry (B15) ────────────────────────────────────────────────

export interface GuestFilters {
  q?: string
  nationality?: "verified_kw" | "probable_kw" | "unknown" | "other" | ""
  gender?: "verified_male" | "probable_male" | "unknown" | ""
  identity?: "verified" | "probable" | "unverified" | "review" | ""
  /**
   * The three SEPARATE Kuwait filters (addendum) — never merged into one:
   *   verified_men   nationality KW VERIFIED and gender male VERIFIED (Decision 3 strict)
   *   context_men    men with Kuwait context whose nationality is NOT verified
   *   kw_podcast_men every man who appeared on a Kuwaiti CORE podcast
   */
  kw?: "verified_men" | "context_men" | "kw_podcast_men" | ""
  channelId?: string
  minAppearances?: number
  lastFrom?: string
  lastTo?: string
  page?: number
}

export interface GuestRow {
  id: string
  canonical_name: string
  nationality_code: string | null
  nationality_status: PodcastEvidenceStatus
  nationality_basis: PodcastEvidenceBasis
  gender_marker: PodcastGenderMarker
  gender_status: PodcastEvidenceStatus
  identity_status: PodcastIdentityStatus
  needs_identity_review: boolean
  khat_guest_id: string | null
  khat_guest_candidate_id: string | null
  appearances: number
  channels: number
  first_appearance: Date | null
  last_appearance: Date | null
  latest_channel: string | null
  latest_episode_title: string | null
  latest_video_id: string | null
  exposure: number | null
  /** Derived Kuwait context (kuwait-context.ts) — display only. */
  kw_apps: number
  kw_channels: number
}

export const GUEST_PAGE_SIZE = 50

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v)
}

/** A positive integer from a query param, or undefined (bad input falls back, never 500s). */
export function positiveIntParam(v: string | undefined): number | undefined {
  if (!v || !/^\d{1,6}$/.test(v)) return undefined
  const n = Number(v)
  return n >= 1 ? n : undefined
}

/** A real calendar date `YYYY-MM-DD`, or undefined («2026-13-45» is not one). */
export function isoDateParam(v: string | undefined): string | undefined {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined
  const d = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : undefined
}

function pick<T extends string>(v: string | undefined, allowed: readonly T[]): T | "" {
  return v && (allowed as readonly string[]).includes(v) ? (v as T) : ""
}

/**
 * Which empty state the guest registry shows (noura #3). Decision 12's «لم نجد
 * ظهوراً مفهرساً» is a claim about the NAME — so it is shown only when the name
 * matches nobody at all with every other filter removed. A person a filter
 * excluded is "no results for these filters", never "not found".
 */
export function guestEmptyState(input: {
  q: string | undefined
  total: number
  /** Matches for `q` with NO other filter applied (null when not computed). */
  nameOnlyTotal: number | null
}): "none" | "no_indexed_appearance" | "no_results_for_filters" {
  if (input.total > 0) return "none"
  if (input.q && input.nameOnlyTotal === 0) return "no_indexed_appearance"
  return "no_results_for_filters"
}

/** URL search params → validated filters. Every bad value falls back to "no filter". */
export function parseGuestFilters(sp: Record<string, string | undefined>): GuestFilters {
  return {
    q: sp.q?.slice(0, 120),
    nationality: pick(sp.nat, ["verified_kw", "probable_kw", "unknown", "other"] as const),
    gender: pick(sp.gender, ["verified_male", "probable_male", "unknown"] as const),
    identity: pick(sp.identity, ["verified", "probable", "unverified", "review"] as const),
    kw: pick(sp.kw, ["verified_men", "context_men", "kw_podcast_men"] as const),
    channelId: isUuid(sp.channel) ? sp.channel : undefined,
    minAppearances: positiveIntParam(sp.min),
    lastFrom: isoDateParam(sp.from),
    lastTo: isoDateParam(sp.to),
    page: positiveIntParam(sp.page) ?? 1,
  }
}

export async function searchGuests(f: GuestFilters): Promise<{ rows: GuestRow[]; total: number }> {
  // A person with no ACTIVE appearance (all rejected/superseded) is an orphan
  // of a corrected extraction: kept, never deleted, but out of the registry.
  const where: ReturnType<typeof sql>[] = [
    sql`p.merged_into_person_id IS NULL`,
    sql`EXISTS (SELECT 1 FROM podcast_guest_appearances oa WHERE oa.person_id = p.id AND oa.verification_status NOT IN ('rejected', 'superseded'))`,
  ]
  const key = normalizeNameKey(f.q ?? "")
  if (key) {
    const like = `%${key.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
    where.push(sql`(p.normalized_name_key LIKE ${like} OR EXISTS (
      SELECT 1 FROM podcast_person_aliases a WHERE a.person_id = p.id AND a.normalized_alias LIKE ${like}))`)
  }
  switch (f.nationality) {
    case "verified_kw":
      where.push(sql`p.nationality_code = 'KW' AND p.nationality_status = 'verified'`)
      break
    case "probable_kw":
      where.push(sql`p.nationality_code = 'KW' AND p.nationality_status = 'probable'`)
      break
    case "unknown":
      where.push(sql`p.nationality_status IN ('unknown', 'conflicted')`)
      break
    case "other":
      where.push(sql`p.nationality_code IS NOT NULL AND p.nationality_code <> 'KW'`)
      break
  }
  switch (f.gender) {
    case "verified_male":
      where.push(sql`p.gender_marker = 'male' AND p.gender_status = 'verified'`)
      break
    case "probable_male":
      where.push(sql`p.gender_marker = 'male' AND p.gender_status = 'probable'`)
      break
    case "unknown":
      where.push(sql`p.gender_status IN ('unknown', 'conflicted')`)
      break
  }
  switch (f.kw) {
    case "verified_men":
      where.push(sql`p.nationality_code = 'KW' AND p.nationality_status = 'verified' AND p.gender_marker = 'male' AND p.gender_status = 'verified'`)
      break
    case "context_men":
      where.push(sql`COALESCE(kw.kw_apps, 0) >= 1 AND p.nationality_status <> 'verified' AND p.gender_marker = 'male'`)
      break
    case "kw_podcast_men":
      where.push(sql`COALESCE(kw.kw_apps, 0) >= 1 AND p.gender_marker = 'male'`)
      break
  }
  switch (f.identity) {
    case "verified":
    case "probable":
    case "unverified":
      where.push(sql`p.identity_status = ${f.identity}`)
      break
    case "review":
      where.push(sql`p.needs_identity_review = true`)
      break
  }
  const having: ReturnType<typeof sql>[] = []
  if (isUuid(f.channelId)) {
    having.push(sql`bool_or(e.channel_id = ${f.channelId}::uuid)`)
  }
  const minApps = Number(f.minAppearances)
  if (Number.isFinite(minApps) && minApps > 1) having.push(sql`count(ap.id) >= ${Math.floor(minApps)}`)
  if (isoDateParam(f.lastFrom)) having.push(sql`max(e.published_at) >= ${f.lastFrom}::date`)
  if (isoDateParam(f.lastTo)) having.push(sql`max(e.published_at) < (${f.lastTo}::date + 1)`)

  const rawPage = Number(f.page)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const whereSql = sql.join(where, sql` AND `)
  const havingSql = having.length ? sql`HAVING ${sql.join(having, sql` AND `)}` : sql``

  const base = sql`
    SELECT p.id, p.canonical_name, p.nationality_code, p.nationality_status, p.nationality_basis,
           p.gender_marker, p.gender_status, p.identity_status, p.needs_identity_review,
           p.khat_guest_id, p.khat_guest_candidate_id,
           count(ap.id)::int AS appearances,
           count(DISTINCT e.channel_id)::int AS channels,
           min(e.published_at) AS first_appearance,
           max(e.published_at) AS last_appearance,
           sum(e.view_count)::bigint AS exposure,
           COALESCE(kw.kw_apps, 0) AS kw_apps,
           COALESCE(kw.kw_channels, 0) AS kw_channels
    FROM podcast_people p
    ${KW_CONTEXT_LATERAL}
    LEFT JOIN podcast_guest_appearances ap ON ap.person_id = p.id AND ap.verification_status NOT IN ('rejected', 'superseded')
    LEFT JOIN podcast_episodes e ON e.id = ap.episode_id
    WHERE ${whereSql}
    GROUP BY p.id, kw.kw_apps, kw.kw_channels
    ${havingSql}
  `
  const [list, count] = await Promise.all([
    db!.execute(sql`
      WITH g AS (${base})
      SELECT g.*, le.channel_name AS latest_channel, le.title AS latest_episode_title, le.youtube_video_id AS latest_video_id
      FROM g
      LEFT JOIN LATERAL (
        SELECT c.name AS channel_name, e.title, e.youtube_video_id
        FROM podcast_guest_appearances ap
        JOIN podcast_episodes e ON e.id = ap.episode_id
        JOIN podcast_channels c ON c.id = e.channel_id
        WHERE ap.person_id = g.id AND ap.verification_status NOT IN ('rejected', 'superseded')
        ORDER BY e.published_at DESC LIMIT 1
      ) le ON true
      ORDER BY g.last_appearance DESC NULLS LAST, g.canonical_name
      LIMIT ${GUEST_PAGE_SIZE} OFFSET ${(page - 1) * GUEST_PAGE_SIZE}
    `),
    db!.execute(sql`SELECT count(*)::int AS n FROM (${base}) x`),
  ])
  return {
    rows: rows<GuestRow>(list).map((r) => ({ ...r, exposure: r.exposure == null ? null : Number(r.exposure) })),
    total: Number((count.rows[0] as { n: number }).n),
  }
}

// ─── Person detail (B16) ─────────────────────────────────────────────────

export async function getPersonDetail(personId: string) {
  if (!isUuid(personId)) return null
  const p = await db!.execute(sql`
    SELECT p.*, g.name AS khat_guest_name, gc.full_name AS khat_candidate_name, gc.country AS khat_candidate_country,
           m.canonical_name AS merged_into_name
    FROM podcast_people p
    LEFT JOIN guests g ON g.id = p.khat_guest_id
    LEFT JOIN guest_candidates gc ON gc.id = p.khat_guest_candidate_id
    LEFT JOIN podcast_people m ON m.id = p.merged_into_person_id
    WHERE p.id = ${personId}
  `)
  const person = p.rows[0] as Record<string, unknown> | undefined
  if (!person) return null
  const [aliases, appearances, events] = await Promise.all([
    db!.execute(sql`SELECT id, alias, source, created_at FROM podcast_person_aliases WHERE person_id = ${personId} ORDER BY created_at`),
    db!.execute(sql`
      SELECT ap.*, e.title, e.youtube_video_id, e.published_at, e.duration_seconds, e.view_count, e.view_count_checked_at,
             c.name AS channel_name
      FROM podcast_guest_appearances ap
      JOIN podcast_episodes e ON e.id = ap.episode_id
      JOIN podcast_channels c ON c.id = e.channel_id
      WHERE ap.person_id = ${personId}
      ORDER BY e.published_at DESC
    `),
    db!.execute(sql`SELECT * FROM podcast_person_events WHERE person_id = ${personId} ORDER BY created_at DESC LIMIT 50`),
  ])
  return {
    person,
    aliases: aliases.rows as Array<{ id: string; alias: string; source: string; created_at: Date }>,
    appearances: appearances.rows as Array<Record<string, unknown>>,
    events: events.rows as Array<Record<string, unknown>>,
  }
}

export async function listChannelOptions(): Promise<Array<{ id: string; name: string }>> {
  const r = await db!.execute(sql`SELECT id, name FROM podcast_channels ORDER BY name`)
  return rows<{ id: string; name: string }>(r)
}

// ─── Nationality review queue (M1 closeout addendum) ─────────────────────

export interface NationalityReviewRow {
  id: string
  canonical_name: string
  aliases: string | null
  nationality_code: string | null
  nationality_status: PodcastEvidenceStatus
  gender_marker: PodcastGenderMarker
  khat_guest_id: string | null
  khat_guest_candidate_id: string | null
  kw_apps: number
  kw_channels: number
  kw_channel_names: string | null
  kw_titles: string[] | null
  latest_appearance: Date | null
  unsure_count: number
}

export const REVIEW_PAGE_SIZE = 50

/**
 * Default queue: nationality UNKNOWN, not yet decided by a human (basis ≠
 * manual — a «غير كويتي» leaves the queue), Kuwait context ≠ none. Ordered by
 * KW CORE channel count, then KW CORE appearance count, then latest appearance.
 * «غير متأكد» changes nothing, so such a person stays — with its count shown.
 */
export async function nationalityReviewQueue(opts: { level?: "strong" | ""; page?: number } = {}): Promise<{
  rows: NationalityReviewRow[]
  total: number
}> {
  const rawPage = Number(opts.page)
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1
  const levelSql = opts.level === "strong" ? sql`AND kw.kw_apps >= 2` : sql``
  const base = sql`
    FROM podcast_people p
    ${KW_CONTEXT_LATERAL}
    WHERE p.merged_into_person_id IS NULL
      AND p.nationality_status = 'unknown'
      AND p.nationality_basis <> 'manual'
      AND COALESCE(kw.kw_apps, 0) >= 1
      ${levelSql}`
  const [list, count] = await Promise.all([
    db!.execute(sql`
      SELECT p.id, p.canonical_name, p.nationality_code, p.nationality_status, p.gender_marker,
             p.khat_guest_id, p.khat_guest_candidate_id,
             kw.kw_apps, kw.kw_channels, kw.kw_latest,
             (SELECT string_agg(DISTINCT a.alias, ' · ') FROM podcast_person_aliases a
               WHERE a.person_id = p.id AND a.alias <> p.canonical_name) AS aliases,
             (SELECT string_agg(DISTINCT c.name, '، ')
                FROM podcast_guest_appearances ka JOIN podcast_episodes e ON e.id = ka.episode_id
                JOIN podcast_channels c ON c.id = e.channel_id
               WHERE ka.person_id = p.id AND ka.verification_status NOT IN ('rejected', 'superseded')
                 AND c.country_code = 'KW' AND c.registry_type = 'core_interview') AS kw_channel_names,
             (SELECT array_agg(t.title ORDER BY t.published_at DESC) FROM (
                SELECT e.title, e.published_at
                FROM podcast_guest_appearances ka JOIN podcast_episodes e ON e.id = ka.episode_id
                JOIN podcast_channels c ON c.id = e.channel_id
               WHERE ka.person_id = p.id AND ka.verification_status NOT IN ('rejected', 'superseded')
                 AND c.country_code = 'KW' AND c.registry_type = 'core_interview'
               ORDER BY e.published_at DESC LIMIT 3) t) AS kw_titles,
             (SELECT max(e.published_at) FROM podcast_guest_appearances ka JOIN podcast_episodes e ON e.id = ka.episode_id
               WHERE ka.person_id = p.id AND ka.verification_status NOT IN ('rejected', 'superseded')) AS latest_appearance,
             (SELECT count(*)::int FROM podcast_person_events ev
               WHERE ev.person_id = p.id AND ev.action = 'nationality_review_unsure') AS unsure_count
      ${base}
      ORDER BY kw.kw_channels DESC, kw.kw_apps DESC, kw.kw_latest DESC NULLS LAST, p.canonical_name
      LIMIT ${REVIEW_PAGE_SIZE} OFFSET ${(page - 1) * REVIEW_PAGE_SIZE}
    `),
    db!.execute(sql`SELECT count(*)::int AS n ${base}`),
  ])
  return { rows: rows<NationalityReviewRow>(list), total: Number((count.rows[0] as { n: number }).n) }
}

// ─── EXTRACTION_VALIDATION_FAILED (addendum) ─────────────────────────────

export interface ValidationFailureRow {
  id: string
  title: string
  youtube_video_id: string
  published_at: Date
  channel_name: string
  guest_extraction_note: string | null
  guest_extraction_run_id: string | null
}

/**
 * Episodes whose ONLY extracted guests were rejected by deterministic
 * validation (evidence not an exact substring / name not in evidence). Read
 * only — they stay rejected; the validator is never loosened (addendum).
 */
export async function extractionValidationFailures(): Promise<ValidationFailureRow[]> {
  const r = await db!.execute(sql`
    SELECT e.id, e.title, e.youtube_video_id, e.published_at, c.name AS channel_name,
           e.guest_extraction_note, e.guest_extraction_run_id
    FROM podcast_episodes e JOIN podcast_channels c ON c.id = e.channel_id
    WHERE e.guest_extraction_status = 'failed' AND e.guest_extraction_note LIKE 'guest_rejected:%'
    ORDER BY e.published_at DESC
    LIMIT 500
  `)
  return rows<ValidationFailureRow>(r)
}

// ─── HOST_CANDIDATE_REVIEW (Addendum 2 c) ────────────────────────────────

/** A name that is the "guest" of more than this share of a channel's extracted episodes looks like a host. */
export const HOST_CANDIDATE_SHARE = 0.3
/** Below this many extracted episodes the share is noise. */
export const HOST_CANDIDATE_MIN_EPISODES = 5

/** Pure: does this (appearances on channel, extracted episodes on channel) pair flag a host candidate? */
export function isHostCandidate(appearancesOnChannel: number, extractedEpisodes: number): boolean {
  return extractedEpisodes >= HOST_CANDIDATE_MIN_EPISODES && appearancesOnChannel / extractedEpisodes > HOST_CANDIDATE_SHARE
}

export interface HostCandidateRow {
  /** The program most of these appearances belong to («… | بودكاست آدم»), or null. */
  program: string | null
  channel_id: string
  channel_name: string
  person_id: string
  canonical_name: string
  appearances: number
  extracted: number
  share: number
}

/**
 * Suggestions ONLY — nothing is excluded until a human adds the name to the
 * channel's host_names. Names already listed are not suggested again.
 */
export async function hostCandidates(): Promise<HostCandidateRow[]> {
  const r = await db!.execute(sql`
    WITH ch AS (
      SELECT channel_id, count(*)::int AS n FROM podcast_episodes
      WHERE guest_extraction_status = 'succeeded' GROUP BY 1
    ), pc AS (
      SELECT e.channel_id, ap.person_id, count(DISTINCT e.id)::int AS k, array_agg(e.title) AS titles
      FROM podcast_guest_appearances ap JOIN podcast_episodes e ON e.id = ap.episode_id
      WHERE ap.verification_status NOT IN ('rejected', 'superseded') GROUP BY 1, 2
    )
    SELECT c.id AS channel_id, c.name AS channel_name, c.host_names, c.program_hosts, pc.titles, p.id AS person_id, p.canonical_name,
           pc.k AS appearances, ch.n AS extracted
    FROM pc JOIN ch ON ch.channel_id = pc.channel_id
    JOIN podcast_channels c ON c.id = pc.channel_id
    JOIN podcast_people p ON p.id = pc.person_id AND p.merged_into_person_id IS NULL
    WHERE ch.n >= ${HOST_CANDIDATE_MIN_EPISODES} AND pc.k::numeric / ch.n > ${HOST_CANDIDATE_SHARE}
    ORDER BY pc.k::numeric / ch.n DESC
  `)
  type Raw = Omit<HostCandidateRow, "program" | "share"> & {
    host_names: string[] | null
    program_hosts: ProgramHosts[] | null
    titles: string[] | null
  }
  return rows<Raw>(r)
    .filter((row) => {
      const listed = [...(row.host_names ?? []), ...(row.program_hosts ?? []).flatMap((p) => p.hosts)]
      return !isHostOf(row.canonical_name, listed)
    })
    .map(({ host_names: _h, program_hosts: _p, titles, ...row }) => {
      const counts = new Map<string, number>()
      for (const t of titles ?? []) {
        const p = programOf(t)
        if (p) counts.set(p, (counts.get(p) ?? 0) + 1)
      }
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
      return { ...row, program: top && top[1] * 2 > (titles?.length ?? 0) ? top[0] : null, share: row.appearances / row.extracted }
    })
}
