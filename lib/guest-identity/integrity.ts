/**
 * Phase 2.4.e.1 — guest-identity integrity query layer.
 *
 * Pure async data layer. Powers:
 *   • The /admin/ops dashboard's new guest-identity section (P2.4.e.2)
 *   • The /admin/guest-identity/duplicates + /unresolved pages (P2.4.e.2)
 *   • The scripts/scan-guest-identity-integrity.ts CLI
 *   • The scripts/smoke-p2-4-e-integrity.ts local DB smoke
 *
 * Design rules — locked in by P2.4.e planning:
 *   1. NO mutations. Every function only SELECTs.
 *   2. Every query is BOUNDED — explicit LIMITs everywhere, no
 *      unbounded scans. The few app-level scans (social / website
 *      duplicate detection) cap the input row count via the function
 *      signature so the caller chooses the budget.
 *   3. Deterministic ordering on every list return — so CLI JSON
 *      output is byte-stable and snapshot-diffable.
 *   4. NO matcher invocation. The dashboard surface is "unlinked
 *      accepted" only; running `previewEnsureGuest` per row is the
 *      CLI's job, not this lib's.
 *   5. NO auto-repair / merge / suggestion logic. This lib only
 *      reports state; the resolution path is the existing P2.4.d
 *      dialog (for unlinked rows) or manual SQL (for duplicates).
 *
 * Numeric thresholds (warn / error) live in `THRESHOLDS` below and are
 * the only place the dashboard's badge severity is decided. Adjusting
 * one threshold is a one-line change reviewable in isolation.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { normalizeHandle, hostOf } from "@/lib/guests/canonical"

// ─── Thresholds + severity ────────────────────────────────────────────

/** Severity ladder the dashboard renders as a colored badge. */
export type Severity = "info" | "warn" | "error"

/**
 * Per-metric severity thresholds, frozen by P2.4.e operator §6.
 * `warn` is the lower bound that flips info → warn; `error` is the
 * lower bound that flips warn → error. Both are inclusive.
 */
export const THRESHOLDS = {
  duplicateGroups: { warn: 1, error: 5 },
  unlinkedAcceptedApplications: { warn: 1, error: 10 },
  unlinkedAcceptedCandidates: { warn: 5, error: 20 },
  staleProfiles: { warn: 10, error: 50 },
} as const

export type IntegrityMetric = keyof typeof THRESHOLDS

/**
 * Pure threshold mapping. Decoupled from DB calls so the dashboard
 * section component (P2.4.e.2) can render badge colors deterministically
 * and the tests can prove the mapping without a DB.
 */
export function severityFor(metric: IntegrityMetric, count: number): Severity {
  const t = THRESHOLDS[metric]
  if (count >= t.error) return "error"
  if (count >= t.warn) return "warn"
  return "info"
}

// ─── Bounds — keep every query bounded ────────────────────────────────

/** Default page size for any list-returning helper. Page-level UI caps. */
export const DEFAULT_LIST_LIMIT = 200
export const MAX_LIST_LIMIT = 500

/** Default cap on duplicate group rows returned to the UI. */
export const DEFAULT_DUPLICATE_GROUP_LIMIT = 50

/**
 * Default ceiling on the row-set the CLI's social/website duplicate
 * scans pull into memory. Bounded so a runaway guests table never
 * causes the script to OOM. When the actual count exceeds this cap,
 * callers should surface a warning to the operator (handled by the
 * CLI's report writer, not by this lib).
 */
export const DEFAULT_CLI_MAX_GUESTS = 5000

/** Profile staleness threshold (days). */
export const DEFAULT_STALE_DAYS = 90

// ─── Domain types ─────────────────────────────────────────────────────

export interface DuplicateGroupMember {
  id: string
  name: string
  slug: string
  created_at: Date
  /** Per-member relationship counts driving the "most connected" tie-break. */
  episodes: number
  candidate_links: number
  application_links: number
  has_profile: boolean
}

export interface DuplicateGroup {
  /** The normalized-name key the group buckets on. Stable across runs. */
  norm: string
  /** count(*) over `guests` rows sharing the normalized name. */
  group_size: number
  /**
   * Members in deterministic order: oldest `created_at` first, with
   * `id` as the tie-break. The duplicate page renders them in this
   * order; the "most connected" highlight is driven separately via
   * `most_connected_id` so the visual emphasis is independent of the
   * member list ordering.
   */
  members: DuplicateGroupMember[]
  /**
   * Id of the member with the highest combined relationship count
   * (`episodes + candidate_links + application_links + (has_profile?1:0)`).
   * Ties broken by oldest `created_at`. Surfaced WITHOUT recommendation
   * wording (operator constraint) — the page just visually highlights
   * this member; no copy claims it should be kept.
   */
  most_connected_id: string
}

export interface SocialHandleDuplicate {
  /** Frozen vocabulary subset from GuestSocialAccounts. */
  platform: string
  /** Already-normalized handle (NFKC-lowercased, stripped of @/url prefix). */
  handle: string
  members: Array<{ id: string; name: string; slug: string }>
}

export interface WebsiteHostDuplicate {
  /** Already-normalized host (lowercased, no `www.`). */
  host: string
  members: Array<{
    id: string
    name: string
    slug: string
    website: string
  }>
}

export interface UnlinkedCandidate {
  id: string
  full_name: string
  display_name: string | null
  status: string
  country: string | null
  created_at: Date
  updated_at: Date
}

export interface UnlinkedApplication {
  id: string
  name: string
  country: string | null
  created_at: Date
}

export interface StaleProfile {
  guest_id: string
  guest_name: string
  guest_slug: string
  last_analyzed_at: Date | null
}

export interface GuestIdentityLinkedEventCounts {
  /** Total `guest-identity.linked` events in the window. */
  total: number
  /** Subset where the link materialised a fresh canonical row. */
  created_guest_true: number
  /** Subset where the link bound to an existing canonical. */
  created_guest_false: number
}

// ─── DB guard ─────────────────────────────────────────────────────────

function requireDb() {
  if (!db) throw new Error("DB not configured")
  return db
}

// Statuses considered "the operator has engaged with this row" — these
// are the only candidate statuses we surface as unlinked-and-needing-
// attention. `new` and `researching` are NOT surfaced (too early).
const UNLINKED_CANDIDATE_STATUSES = [
  "analyzed",
  "shortlisted",
  "contacted",
  "accepted",
  "prep_completed",
] as const

// ─── Duplicate scan — name-only (cheap, indexed) ──────────────────────

/**
 * Returns one row per (normalized_name) where `count(*) > 1`, ordered
 * by `group_size DESC` then `norm ASC`. Used by the dashboard count
 * summary; the full per-member breakdown is computed by
 * `listDuplicateGuestNameGroups` below.
 */
export async function countDuplicateGuestNameGroups(): Promise<{
  groups: number
  guests: number
}> {
  const d = requireDb()
  const r = (await d.execute(sql`
    WITH dup AS (
      SELECT btrim(normalized_name) AS norm, count(*)::int AS n
        FROM guests
       WHERE normalized_name IS NOT NULL
         AND btrim(normalized_name) <> ''
       GROUP BY btrim(normalized_name)
      HAVING count(*) > 1
    )
    SELECT count(*)::int AS groups, COALESCE(sum(n), 0)::int AS guests
      FROM dup
  `)) as unknown as { rows: Array<{ groups: number; guests: number }> }
  const row = r.rows[0] ?? { groups: 0, guests: 0 }
  return { groups: Number(row.groups), guests: Number(row.guests) }
}

/**
 * Returns the top-N duplicate groups with full per-member relationship
 * counts. Bounded by `limit` (default 50, ceiling 500). Members within
 * each group are deterministically ordered: `created_at ASC, id ASC`.
 * Groups themselves are ordered `group_size DESC, norm ASC` per
 * operator §planning constraint.
 *
 * IMPLEMENTATION NOTE (Gate-5 patch):
 * The previous implementation used `array_agg(id ORDER BY …) AS ids`
 * to inline the member list with the group row. That fails on the
 * client side: when Drizzle's raw `db.execute(sql\`…\`)` returns a
 * `text[]` column, the pg driver may not register the array parser
 * for the synthetic column oid, so `g.ids` arrives as the literal
 * bracketed Postgres string `"{uuid1,uuid2}"`. Iterating that with
 * `for (… of g.ids)` yields characters instead of UUIDs, the
 * follow-up `WHERE id IN …` query returns nothing, and every group
 * surfaces with an empty members array. We confirmed by inspection
 * that no other lib path in this codebase deserializes `text[]`
 * through `db.execute()`.
 *
 * The fix is structural, not a cast: a single JOIN materialises one
 * row per `(group, member)` pair, eliminating `array_agg` from the
 * deserialization path entirely. Deterministic ordering is preserved
 * at the SQL level (`ORDER BY group_size DESC, norm ASC, created_at
 * ASC, id ASC`); JS-side grouping iterates the result in that order
 * and Maps preserve insertion order, so the returned `DuplicateGroup`
 * array has the same ordering contract as before.
 *
 * The four relationship counts still come from four small bounded
 * aggregates keyed on the union of member ids; each plan stays
 * trivial and indexed.
 */
export async function listDuplicateGuestNameGroups(opts: {
  limit?: number
} = {}): Promise<DuplicateGroup[]> {
  const d = requireDb()
  const limit = Math.min(
    Math.max(1, opts.limit ?? DEFAULT_DUPLICATE_GROUP_LIMIT),
    MAX_LIST_LIMIT,
  )

  // 1. Top-N duplicate groups JOINed to their members — one row per
  //    (group, member). The CTE caps the group set at `limit`; the
  //    JOIN expands them into flat rows. Total row count is bounded by
  //    `limit * (worst-case group_size)` which is small in practice.
  const rowsRes = (await d.execute(sql`
    WITH dup AS (
      SELECT btrim(normalized_name) AS norm,
             count(*)::int AS group_size
        FROM guests
       WHERE normalized_name IS NOT NULL
         AND btrim(normalized_name) <> ''
       GROUP BY btrim(normalized_name)
      HAVING count(*) > 1
       ORDER BY count(*) DESC, btrim(normalized_name) ASC
       LIMIT ${limit}
    )
    SELECT g.id, g.name, g.slug, g.created_at,
           dup.norm, dup.group_size
      FROM dup
      JOIN guests g ON btrim(g.normalized_name) = dup.norm
     ORDER BY dup.group_size DESC, dup.norm ASC,
              g.created_at ASC, g.id ASC
  `)) as unknown as {
    rows: Array<{
      id: string
      name: string
      slug: string
      created_at: Date
      norm: string
      group_size: number
    }>
  }
  if (rowsRes.rows.length === 0) return []

  // Group client-side by `norm`. JS Maps preserve insertion order, so
  // the first time a `norm` is seen pins its position in the output
  // sequence. Because the SQL `ORDER BY` puts the largest groups
  // (then alphabetically lowest `norm`) first, the resulting map
  // iteration order matches the operator-spec ordering exactly.
  const groupMap = new Map<
    string,
    {
      norm: string
      group_size: number
      memberBases: Array<{
        id: string
        name: string
        slug: string
        created_at: Date
      }>
    }
  >()
  const allIds: string[] = []
  for (const r of rowsRes.rows) {
    let g = groupMap.get(r.norm)
    if (!g) {
      g = {
        norm: r.norm,
        group_size: Number(r.group_size),
        memberBases: [],
      }
      groupMap.set(r.norm, g)
    }
    g.memberBases.push({
      id: r.id,
      name: r.name,
      slug: r.slug,
      created_at: new Date(r.created_at),
    })
    allIds.push(r.id)
  }

  // 2. Relationship counts — four bounded aggregates keyed on the
  //    union of member ids. Each plan stays indexed (each table has a
  //    guest_id index from earlier phases). Skip entirely when there
  //    are no ids — defensive; can't actually happen because the
  //    early-return above guards against empty rows.
  const idsLiteral = sql.join(
    allIds.map((id) => sql`${id}`),
    sql`,`,
  )
  const [epRes, candRes, appRes, profRes] = await Promise.all([
    d.execute(sql`
      SELECT guest_id, count(*)::int AS n
        FROM episodes
       WHERE guest_id IN (${idsLiteral})
       GROUP BY guest_id
    `) as unknown as Promise<{
      rows: Array<{ guest_id: string; n: number }>
    }>,
    d.execute(sql`
      SELECT guest_id, count(*)::int AS n
        FROM guest_candidate_links
       WHERE guest_id IN (${idsLiteral})
       GROUP BY guest_id
    `) as unknown as Promise<{
      rows: Array<{ guest_id: string; n: number }>
    }>,
    d.execute(sql`
      SELECT guest_id, count(*)::int AS n
        FROM guest_application_links
       WHERE guest_id IN (${idsLiteral})
       GROUP BY guest_id
    `) as unknown as Promise<{
      rows: Array<{ guest_id: string; n: number }>
    }>,
    d.execute(sql`
      SELECT guest_id
        FROM guest_identity_profiles
       WHERE guest_id IN (${idsLiteral})
    `) as unknown as Promise<{ rows: Array<{ guest_id: string }> }>,
  ])

  const epCount = new Map<string, number>()
  for (const r of epRes.rows) epCount.set(r.guest_id, Number(r.n))
  const candCount = new Map<string, number>()
  for (const r of candRes.rows) candCount.set(r.guest_id, Number(r.n))
  const appCount = new Map<string, number>()
  for (const r of appRes.rows) appCount.set(r.guest_id, Number(r.n))
  const hasProfile = new Set<string>()
  for (const r of profRes.rows) hasProfile.add(r.guest_id)

  // 3. Merge — build final groups in map-iteration order (preserved).
  const out: DuplicateGroup[] = []
  for (const g of groupMap.values()) {
    const members: DuplicateGroupMember[] = g.memberBases.map((mb) => ({
      id: mb.id,
      name: mb.name,
      slug: mb.slug,
      created_at: mb.created_at,
      episodes: epCount.get(mb.id) ?? 0,
      candidate_links: candCount.get(mb.id) ?? 0,
      application_links: appCount.get(mb.id) ?? 0,
      has_profile: hasProfile.has(mb.id),
    }))
    out.push({
      norm: g.norm,
      group_size: g.group_size,
      members,
      most_connected_id: pickMostConnected(members),
    })
  }
  return out
}

/**
 * Pure helper — exposed for unit tests. Picks the member with the
 * highest combined relationship count; tie-break by oldest
 * `created_at`. Returns the first member's id when the list is
 * non-empty even if all counts are zero (defensive: every group has
 * at least 2 members by construction).
 */
export function pickMostConnected(members: DuplicateGroupMember[]): string {
  if (members.length === 0) return ""
  let best = members[0]
  let bestScore = scoreMember(best)
  for (let i = 1; i < members.length; i++) {
    const m = members[i]
    const s = scoreMember(m)
    if (s > bestScore) {
      best = m
      bestScore = s
      continue
    }
    if (s === bestScore) {
      // Older created_at wins the tie. Convert to ms for a stable cmp.
      if (m.created_at.getTime() < best.created_at.getTime()) {
        best = m
      }
    }
  }
  return best.id
}

function scoreMember(m: DuplicateGroupMember): number {
  return (
    m.episodes +
    m.candidate_links +
    m.application_links +
    (m.has_profile ? 1 : 0)
  )
}

// ─── Duplicate scan — social handles (CLI only) ───────────────────────

/**
 * App-level scan of `guests.external_links`. Bounded by `maxGuests`
 * (default 5000) — the lib only loads at most that many rows. CLI
 * warns when the cap is reached so the operator knows the result is a
 * sample, not the full corpus.
 *
 * Recognised platforms come from the canonical service's frozen
 * vocabulary in `GuestSocialAccounts`. Anything outside that set
 * (including the `other` blob's keys) is intentionally ignored —
 * matching the canonical matcher's behavior keeps the duplicate
 * surface and the link decision aligned.
 *
 * Returned groups are sorted deterministically:
 *   - by `members.length` DESC
 *   - then `platform` ASC, then `handle` ASC
 * Members within a group are sorted by `name` ASC, then `id` ASC.
 */
const SOCIAL_PLATFORMS = [
  "twitter",
  "instagram",
  "youtube",
  "linkedin",
  "tiktok",
  "facebook",
  "podcast",
] as const

export async function listSocialHandleDuplicates(opts: {
  maxGuests?: number
} = {}): Promise<{
  groups: SocialHandleDuplicate[]
  scanned: number
  truncated: boolean
}> {
  const d = requireDb()
  const cap = Math.max(1, opts.maxGuests ?? DEFAULT_CLI_MAX_GUESTS)

  // Bounded scan. ORDER BY created_at gives a stable, reviewable head.
  const rows = (await d.execute(sql`
    SELECT id, name, slug, external_links
      FROM guests
     ORDER BY created_at ASC, id ASC
     LIMIT ${cap + 1}
  `)) as unknown as {
    rows: Array<{
      id: string
      name: string
      slug: string
      external_links: Record<string, string> | null
    }>
  }
  const truncated = rows.rows.length > cap
  const scanRows = rows.rows.slice(0, cap)

  // Bucket by (platform, normalized handle).
  const buckets = new Map<
    string,
    { platform: string; handle: string; members: Array<{ id: string; name: string; slug: string }> }
  >()
  for (const r of scanRows) {
    const ext = r.external_links ?? {}
    for (const platform of SOCIAL_PLATFORMS) {
      const raw = ext[platform]
      if (typeof raw !== "string") continue
      const handle = normalizeHandle(raw)
      if (!handle) continue
      const key = `${platform}::${handle}`
      let b = buckets.get(key)
      if (!b) {
        b = { platform, handle, members: [] }
        buckets.set(key, b)
      }
      b.members.push({ id: r.id, name: r.name, slug: r.slug })
    }
  }

  const groups: SocialHandleDuplicate[] = []
  for (const b of buckets.values()) {
    if (b.members.length < 2) continue
    b.members.sort(
      (a, bb) => a.name.localeCompare(bb.name) || a.id.localeCompare(bb.id),
    )
    groups.push(b)
  }
  groups.sort((a, b) => {
    if (b.members.length !== a.members.length) {
      return b.members.length - a.members.length
    }
    if (a.platform !== b.platform) return a.platform.localeCompare(b.platform)
    return a.handle.localeCompare(b.handle)
  })
  return { groups, scanned: scanRows.length, truncated }
}

// ─── Duplicate scan — website hosts (CLI only) ────────────────────────

/**
 * Same shape and bounds as the social-handle scan, but keyed on
 * `external_links.website`'s normalized host (via `hostOf`).
 */
export async function listWebsiteHostDuplicates(opts: {
  maxGuests?: number
} = {}): Promise<{
  groups: WebsiteHostDuplicate[]
  scanned: number
  truncated: boolean
}> {
  const d = requireDb()
  const cap = Math.max(1, opts.maxGuests ?? DEFAULT_CLI_MAX_GUESTS)

  const rows = (await d.execute(sql`
    SELECT id, name, slug, external_links
      FROM guests
     ORDER BY created_at ASC, id ASC
     LIMIT ${cap + 1}
  `)) as unknown as {
    rows: Array<{
      id: string
      name: string
      slug: string
      external_links: Record<string, string> | null
    }>
  }
  const truncated = rows.rows.length > cap
  const scanRows = rows.rows.slice(0, cap)

  const buckets = new Map<
    string,
    {
      host: string
      members: Array<{ id: string; name: string; slug: string; website: string }>
    }
  >()
  for (const r of scanRows) {
    const ext = r.external_links ?? {}
    const website = ext.website
    if (typeof website !== "string") continue
    const host = hostOf(website)
    if (!host) continue
    let b = buckets.get(host)
    if (!b) {
      b = { host, members: [] }
      buckets.set(host, b)
    }
    b.members.push({ id: r.id, name: r.name, slug: r.slug, website })
  }

  const groups: WebsiteHostDuplicate[] = []
  for (const b of buckets.values()) {
    if (b.members.length < 2) continue
    b.members.sort(
      (a, bb) => a.name.localeCompare(bb.name) || a.id.localeCompare(bb.id),
    )
    groups.push(b)
  }
  groups.sort((a, b) => {
    if (b.members.length !== a.members.length) {
      return b.members.length - a.members.length
    }
    return a.host.localeCompare(b.host)
  })
  return { groups, scanned: scanRows.length, truncated }
}

// ─── Unlinked surfaces ────────────────────────────────────────────────

/**
 * Candidates whose operator has actively engaged with them (status in
 * UNLINKED_CANDIDATE_STATUSES) but who lack a row in
 * `guest_candidate_links`. Soft-deleted / archived candidates are
 * excluded. Bounded by `limit`.
 *
 * Order: `updated_at DESC, id ASC` — newest activity first, stable.
 */
export async function listUnlinkedAcceptedCandidates(opts: {
  limit?: number
} = {}): Promise<UnlinkedCandidate[]> {
  const d = requireDb()
  const limit = Math.min(
    Math.max(1, opts.limit ?? DEFAULT_LIST_LIMIT),
    MAX_LIST_LIMIT,
  )
  const statusList = sql.join(
    UNLINKED_CANDIDATE_STATUSES.map((s) => sql`${s}`),
    sql`,`,
  )
  const r = (await d.execute(sql`
    SELECT c.id, c.full_name, c.display_name, c.status, c.country,
           c.created_at, c.updated_at
      FROM guest_candidates c
      LEFT JOIN guest_candidate_links gcl ON gcl.candidate_id = c.id
     WHERE c.deleted_at IS NULL
       AND c.archived_at IS NULL
       AND c.status IN (${statusList})
       AND gcl.id IS NULL
     ORDER BY c.updated_at DESC, c.id ASC
     LIMIT ${limit}
  `)) as unknown as {
    rows: Array<{
      id: string
      full_name: string
      display_name: string | null
      status: string
      country: string | null
      created_at: Date
      updated_at: Date
    }>
  }
  return r.rows.map((row) => ({
    ...row,
    created_at: new Date(row.created_at),
    updated_at: new Date(row.updated_at),
  }))
}

export async function countUnlinkedAcceptedCandidates(): Promise<number> {
  const d = requireDb()
  const statusList = sql.join(
    UNLINKED_CANDIDATE_STATUSES.map((s) => sql`${s}`),
    sql`,`,
  )
  const r = (await d.execute(sql`
    SELECT count(*)::int AS n
      FROM guest_candidates c
      LEFT JOIN guest_candidate_links gcl ON gcl.candidate_id = c.id
     WHERE c.deleted_at IS NULL
       AND c.archived_at IS NULL
       AND c.status IN (${statusList})
       AND gcl.id IS NULL
  `)) as unknown as { rows: Array<{ n: number }> }
  return Number(r.rows[0]?.n ?? 0)
}

/**
 * Applications with `status='accepted'` and no
 * `guest_application_links` row. Bounded by `limit`.
 * Order: `created_at DESC, id ASC`.
 */
export async function listUnlinkedAcceptedApplications(opts: {
  limit?: number
} = {}): Promise<UnlinkedApplication[]> {
  const d = requireDb()
  const limit = Math.min(
    Math.max(1, opts.limit ?? DEFAULT_LIST_LIMIT),
    MAX_LIST_LIMIT,
  )
  const r = (await d.execute(sql`
    SELECT a.id, a.name, a.country, a.created_at
      FROM guest_applications a
      LEFT JOIN guest_application_links gal ON gal.application_id = a.id
     WHERE a.status = 'accepted'
       AND gal.id IS NULL
     ORDER BY a.created_at DESC, a.id ASC
     LIMIT ${limit}
  `)) as unknown as {
    rows: Array<{
      id: string
      name: string
      country: string | null
      created_at: Date
    }>
  }
  return r.rows.map((row) => ({
    ...row,
    created_at: new Date(row.created_at),
  }))
}

export async function countUnlinkedAcceptedApplications(): Promise<number> {
  const d = requireDb()
  const r = (await d.execute(sql`
    SELECT count(*)::int AS n
      FROM guest_applications a
      LEFT JOIN guest_application_links gal ON gal.application_id = a.id
     WHERE a.status = 'accepted'
       AND gal.id IS NULL
  `)) as unknown as { rows: Array<{ n: number }> }
  return Number(r.rows[0]?.n ?? 0)
}

// ─── Stale identity profiles ──────────────────────────────────────────

/**
 * Profiles whose `last_analyzed_at` is older than `daysOld` days
 * (default 90) or is NULL. Returns the guest's name + slug so the
 * dashboard / page can render a useful row without a second hop.
 * Bounded by `limit`. Order: NULLs first, then `last_analyzed_at ASC`,
 * then `guest_id ASC` for stable ties.
 */
export async function listStaleIdentityProfiles(opts: {
  daysOld?: number
  limit?: number
} = {}): Promise<StaleProfile[]> {
  const d = requireDb()
  const days = Math.max(1, opts.daysOld ?? DEFAULT_STALE_DAYS)
  const limit = Math.min(
    Math.max(1, opts.limit ?? DEFAULT_LIST_LIMIT),
    MAX_LIST_LIMIT,
  )
  const r = (await d.execute(sql`
    SELECT p.guest_id, g.name AS guest_name, g.slug AS guest_slug,
           p.last_analyzed_at
      FROM guest_identity_profiles p
      JOIN guests g ON g.id = p.guest_id
     WHERE p.last_analyzed_at IS NULL
        OR p.last_analyzed_at < NOW() - (${days}::int * interval '1 day')
     ORDER BY p.last_analyzed_at ASC NULLS FIRST, p.guest_id ASC
     LIMIT ${limit}
  `)) as unknown as {
    rows: Array<{
      guest_id: string
      guest_name: string
      guest_slug: string
      last_analyzed_at: Date | null
    }>
  }
  return r.rows.map((row) => ({
    guest_id: row.guest_id,
    guest_name: row.guest_name,
    guest_slug: row.guest_slug,
    last_analyzed_at: row.last_analyzed_at
      ? new Date(row.last_analyzed_at)
      : null,
  }))
}

export async function countStaleIdentityProfiles(opts: {
  daysOld?: number
} = {}): Promise<number> {
  const d = requireDb()
  const days = Math.max(1, opts.daysOld ?? DEFAULT_STALE_DAYS)
  const r = (await d.execute(sql`
    SELECT count(*)::int AS n
      FROM guest_identity_profiles
     WHERE last_analyzed_at IS NULL
        OR last_analyzed_at < NOW() - (${days}::int * interval '1 day')
  `)) as unknown as { rows: Array<{ n: number }> }
  return Number(r.rows[0]?.n ?? 0)
}

// ─── Event aggregation ────────────────────────────────────────────────

/**
 * Counts `guest-identity.linked` events in the last `hours` window,
 * sliced by the payload's `created_guest` flag. Used by the dashboard
 * to show "X linked / Y new canonicals in last 24h".
 *
 * Single SQL — three filters, three counts — to keep the dashboard
 * snapshot fast.
 */
export async function countGuestIdentityLinkedEvents(opts: {
  hours?: number
} = {}): Promise<GuestIdentityLinkedEventCounts> {
  const d = requireDb()
  const hours = Math.max(1, opts.hours ?? 24)
  const r = (await d.execute(sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE (payload->>'created_guest')::boolean = true)::int  AS created_true,
      count(*) FILTER (WHERE (payload->>'created_guest')::boolean = false)::int AS created_false
    FROM system_events
    WHERE source = 'guest-identity'
      AND event_type = 'linked'
      AND event_at >= NOW() - (${hours}::int * interval '1 hour')
  `)) as unknown as {
    rows: Array<{ total: number; created_true: number; created_false: number }>
  }
  const row = r.rows[0] ?? { total: 0, created_true: 0, created_false: 0 }
  return {
    total: Number(row.total),
    created_guest_true: Number(row.created_true),
    created_guest_false: Number(row.created_false),
  }
}

// ─── Snapshot aggregator (consumed by lib/ops/snapshot.ts) ────────────

export interface GuestIdentitySnapshot {
  canonicalCount: number
  unlinkedAcceptedCandidates: number
  unlinkedAcceptedApplications: number
  duplicateGroupCount: number
  duplicateGuestsTotal: number
  recentLinkedEvents24h: number
  recentLinkedEventsCreatedGuest24h: number
  staleProfileCount: number
  staleDaysThreshold: number
}

/**
 * Single-roundtrip-friendly aggregator: fans out 5 small queries via
 * Promise.all. Total cost on a healthy local DB is well below the
 * dashboard's 2s perf gate. The lib/ops/snapshot.ts orchestrator wraps
 * THIS function in `Promise.allSettled` so a slow guest-identity
 * section never blanks the whole page (existing P2.5.a pattern).
 */
export async function getGuestIdentitySnapshot(): Promise<GuestIdentitySnapshot> {
  const d = requireDb()
  const staleDaysThreshold = DEFAULT_STALE_DAYS

  const [canonicalRes, dupCounts, unlinkedCand, unlinkedApp, eventCounts, staleCount] =
    await Promise.all([
      d.execute(sql`SELECT count(*)::int AS n FROM guests`) as unknown as
        Promise<{ rows: Array<{ n: number }> }>,
      countDuplicateGuestNameGroups(),
      countUnlinkedAcceptedCandidates(),
      countUnlinkedAcceptedApplications(),
      countGuestIdentityLinkedEvents({ hours: 24 }),
      countStaleIdentityProfiles({ daysOld: staleDaysThreshold }),
    ])

  return {
    canonicalCount: Number(canonicalRes.rows[0]?.n ?? 0),
    unlinkedAcceptedCandidates: unlinkedCand,
    unlinkedAcceptedApplications: unlinkedApp,
    duplicateGroupCount: dupCounts.groups,
    duplicateGuestsTotal: dupCounts.guests,
    recentLinkedEvents24h: eventCounts.total,
    recentLinkedEventsCreatedGuest24h: eventCounts.created_guest_true,
    staleProfileCount: staleCount,
    staleDaysThreshold,
  }
}
