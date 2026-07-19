/**
 * Khat Brain Phase 6 — canonical guest service.
 *
 * Single entry point for "is this person a known guest, and if so,
 * which row?" Used by:
 *   - Discovery promotion (admin clicks Promote on a candidate)
 *   - Khat Map guest candidate conversion
 *   - Studio guest_intelligence promotion
 *   - Guest application acceptance
 *   - Backfill scripts
 *
 * ## Design rules
 *
 *   1. Never silently merge uncertain matches. Low-confidence matches
 *      return `requires_review` and the caller decides.
 *   2. Matching is deterministic and explainable — every match returns
 *      a list of `reasons` so the admin can audit.
 *   3. Confidence levels:
 *        - high     → slug match OR exact unique social handle
 *        - medium   → normalized name AND (country OR website domain)
 *        - low      → normalized name only
 *   4. The service does NOT scrape or call AI. Pure DB matching.
 */

import { eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { guests } from "@/lib/db/schema/guests"
import {
  guestIdentityProfiles,
  guestDiscoveryLinks,
  type GuestSocialAccounts,
  type GuestSourceSummary,
} from "@/lib/db/schema/guest-identity"

export interface IdentityHints {
  /** Display name (Arabic or English). Required for matching. */
  name?: string | null
  /** Pre-computed slug if known (e.g. from a previous Promote). */
  slug?: string | null
  /** Country/region — used as a tiebreaker for medium-confidence matches. */
  country?: string | null
  /** Per-platform handle. Exact match on any handle is high-confidence. */
  social_accounts?: GuestSocialAccounts | null
  /** Canonical website URL. */
  website?: string | null
  /** Known aliases / alternative spellings. */
  aliases?: string[]
  /** Bio (won't drive matching, just stored on create). */
  bio?: string | null
  /** Photo URL on create. */
  photo_url?: string | null
  /** External-link blob for the guests row. */
  external_links?: Record<string, string>
  /**
   * Admin-only contact channels fixated onto the guests row at promotion.
   * NEVER rendered publicly. Callers should pass null (not "") when absent.
   * Do not drive matching — stored/backfilled only.
   */
  phone?: string | null
  email?: string | null
}

export type MatchConfidence = "high" | "medium" | "low" | "none"

export interface GuestMatch {
  guest_id: string | null
  confidence: MatchConfidence
  reasons: string[]
}

export interface EnsureGuestResult {
  guest_id: string
  created: boolean
  /** "high" | "medium" — anything below medium triggers requires_review. */
  confidence: MatchConfidence
  reasons: string[]
  /** Set when the caller asked for a match but it was too uncertain. */
  requires_review: boolean
}

// ─── Normalization helpers ────────────────────────────────────────────

const ARABIC_DIACRITICS = /[\u064B-\u0652\u0670]/g
const NORMALIZE_RE = /[^a-z0-9\u0600-\u06ff\s]+/gi

export function normalizeName(name: string | null | undefined): string {
  if (!name) return ""
  return name
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, "")
    .replace(NORMALIZE_RE, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function normalizeHandle(handle: string | null | undefined): string {
  if (!handle) return ""
  // Accept @user, https://twitter.com/user, twitter.com/@user, etc.
  return handle
    .toLowerCase()
    .replace(/^.*?(?:twitter\.com|x\.com|instagram\.com|tiktok\.com|youtube\.com|linkedin\.com\/in)\//, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "")
    .replace(/^www\./, "")
    .trim()
}

export function normalizeSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(ARABIC_DIACRITICS, "")
    .replace(NORMALIZE_RE, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

export function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase()
  } catch {
    return null
  }
}

// ─── findGuestMatch ───────────────────────────────────────────────────

interface GuestRow {
  id: string
  name: string
  slug: string
  external_links: Record<string, string> | null
}

/**
 * Phase 8 — index-aware narrowing.
 *
 * Instead of `SELECT * FROM guests` and filtering in app code,
 * `loadCandidatesByNormalizedName` uses the generated normalized_name
 * column + index. We still fall back to "load all" when:
 *   - the caller has no name (slug-only or social-handle-only path),
 *   - or the name normalizes to empty.
 *
 * The DB's `normalized_name` is always TRIMMED (via the GENERATED
 * expression's whitespace collapse), and our TS `normalizeName` also
 * trims, so equality comparison is sound.
 */
async function loadCandidatesByNormalizedName(
  normalizedName: string,
): Promise<GuestRow[]> {
  if (!normalizedName) return []
  // The generated column includes leading/trailing single spaces in
  // edge cases (the regex collapses but doesn't trim). Use btrim() to
  // match our JS .trim().
  const rows = await db!
    .select({
      id: guests.id,
      name: guests.name,
      slug: guests.slug,
      external_links: guests.external_links,
    })
    .from(guests)
    .where(sql`btrim(${guests.normalized_name}) = ${normalizedName}`)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    external_links: (r.external_links ?? null) as Record<string, string> | null,
  }))
}

/** Fallback path for social-handle / website-host matching that needs
 *  to scan all rows. Acceptable because handles + URLs are sparse. */
async function loadAllGuestsForMatching(): Promise<GuestRow[]> {
  const rows = await db!
    .select({
      id: guests.id,
      name: guests.name,
      slug: guests.slug,
      external_links: guests.external_links,
    })
    .from(guests)
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    external_links: (r.external_links ?? null) as Record<string, string> | null,
  }))
}

function collectHandles(hints: IdentityHints): string[] {
  const out: string[] = []
  const sa = hints.social_accounts ?? {}
  for (const k of ["twitter", "instagram", "youtube", "linkedin", "tiktok", "facebook", "podcast"] as const) {
    const v = sa[k]
    if (typeof v === "string" && v.trim()) out.push(normalizeHandle(v))
  }
  if (sa.other && typeof sa.other === "object") {
    for (const v of Object.values(sa.other)) {
      if (typeof v === "string" && v.trim()) out.push(normalizeHandle(v))
    }
  }
  return out.filter(Boolean)
}

function collectGuestRowHandles(row: GuestRow): string[] {
  const out: string[] = []
  const ext = row.external_links ?? {}
  for (const v of Object.values(ext)) {
    if (typeof v === "string" && v.trim()) out.push(normalizeHandle(v))
  }
  return out.filter(Boolean)
}

export async function findGuestMatch(hints: IdentityHints): Promise<GuestMatch> {
  // Slug match — high confidence (admin pre-computed it).
  if (hints.slug) {
    const slugRows = await db!
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.slug, hints.slug))
      .limit(1)
    if (slugRows[0]) {
      return {
        guest_id: slugRows[0].id,
        confidence: "high",
        reasons: [`slug match: ${hints.slug}`],
      }
    }
  }

  // Phase 8 — narrow social/website search to a smaller set when we
  // have a name (most callers do); otherwise scan all rows.
  const norm = normalizeName(hints.name ?? null)
  const aliasesNorm = (hints.aliases ?? []).map(normalizeName).filter(Boolean)

  // Social handle exact match — high confidence. We need to scan all
  // guests because external_links is JSONB and not indexed. Acceptable
  // — only fires when hints supply a handle.
  const myHandles = new Set(collectHandles(hints))
  if (myHandles.size > 0) {
    const all = await loadAllGuestsForMatching()
    for (const row of all) {
      const rowHandles = collectGuestRowHandles(row)
      const overlap = rowHandles.filter((h) => myHandles.has(h))
      if (overlap.length > 0) {
        return {
          guest_id: row.id,
          confidence: "high",
          reasons: [`social handle match: ${overlap[0]}`],
        }
      }
    }
  }

  // Website domain match — high confidence when both sides agree on host.
  const myHost = hostOf(hints.website ?? null)
  if (myHost) {
    const all = await loadAllGuestsForMatching()
    for (const row of all) {
      const ext = row.external_links ?? {}
      const rowHost = hostOf(ext.website ?? null)
      if (rowHost && rowHost === myHost) {
        return {
          guest_id: row.id,
          confidence: "high",
          reasons: [`website match: ${myHost}`],
        }
      }
    }
  }

  // Name + tiebreaker — medium / low confidence. Uses the indexed
  // normalized_name column for the primary lookup, then collects
  // alias matches separately (also via the same column).
  if (!norm) {
    return { guest_id: null, confidence: "none", reasons: ["no name"] }
  }

  const primary = await loadCandidatesByNormalizedName(norm)
  const candidates: Array<{ row: GuestRow; reason: string }> = primary.map((row) => ({
    row,
    reason: `normalized name match: "${norm}"`,
  }))
  if (aliasesNorm.length > 0) {
    for (const a of aliasesNorm) {
      const aliasMatches = await loadCandidatesByNormalizedName(a)
      for (const row of aliasMatches) {
        if (!candidates.find((c) => c.row.id === row.id)) {
          candidates.push({ row, reason: `alias match: "${a}"` })
        }
      }
    }
  }

  if (candidates.length === 0) {
    return { guest_id: null, confidence: "none", reasons: [`no name match for "${norm}"`] }
  }
  if (candidates.length === 1) {
    // Single name match — medium confidence; admin should still confirm.
    return {
      guest_id: candidates[0].row.id,
      confidence: "medium",
      reasons: [candidates[0].reason],
    }
  }

  // Multiple name matches — low confidence; conflict.
  return {
    guest_id: null,
    confidence: "low",
    reasons: [
      `${candidates.length} guests share normalized name "${norm}"`,
      ...candidates.map((c) => `  - ${c.row.id}: ${c.row.name}`),
    ],
  }
}

// ─── ensureGuest ──────────────────────────────────────────────────────

export interface EnsureGuestOptions {
  /**
   * Caller's tolerance for uncertain matches:
   *   - "strict"  (default) — requires_review for medium and below
   *   - "auto"    — accept high+medium, requires_review for low/none-with-conflict
   *   - "create_on_low" — create a fresh guest unless we have a high match
   */
  acceptance?: "strict" | "auto" | "create_on_low"
}

export async function ensureGuest(
  hints: IdentityHints,
  opts: EnsureGuestOptions = {},
): Promise<EnsureGuestResult> {
  const acceptance = opts.acceptance ?? "auto"
  const match = await findGuestMatch(hints)

  // Decision matrix. The "create new" branch is reached by elimination
  // (not requires_review, not use_existing) so we don't carry a flag
  // for it — the early-return + final fall-through encode the same
  // semantics with fewer locals.
  let useExisting = false
  let requiresReview = false

  if (match.confidence === "high") useExisting = true
  else if (match.confidence === "medium") {
    if (acceptance === "strict") requiresReview = true
    else useExisting = true
  } else if (match.confidence === "low") {
    if (acceptance !== "create_on_low") requiresReview = true
    // else: fall through to create
  }
  // else (none): fall through to create

  if (requiresReview) {
    // Caller can resolve via UI or pass acceptance=auto on a re-run.
    // We do NOT create; we DO NOT silently merge.
    return {
      guest_id: match.guest_id ?? "",
      created: false,
      confidence: match.confidence,
      reasons: match.reasons,
      requires_review: true,
    }
  }

  if (useExisting) {
    // Fixation on promotion: backfill contact channels onto the matched
    // guest WITHOUT clobbering values already set (COALESCE — the first
    // promotion that carries a channel wins; admin edits win over this).
    // No-op for the many callers that don't supply phone/email, so the
    // shared chokepoint's behavior is unchanged for them. Admin-only data.
    if (hints.phone != null || hints.email != null) {
      await db!
        .update(guests)
        .set({
          phone: sql`COALESCE(${guests.phone}, ${hints.phone ?? null})`,
          email: sql`COALESCE(${guests.email}, ${hints.email ?? null})`,
        })
        .where(eq(guests.id, match.guest_id!))
    }
    return {
      guest_id: match.guest_id!,
      created: false,
      confidence: match.confidence,
      reasons: match.reasons,
      requires_review: false,
    }
  }

  // Create.
  if (!hints.name || !hints.name.trim()) {
    throw new Error("ensureGuest: cannot create guest without `name`")
  }
  // G-042 — every new guest gets a uniform `g-NNN` slug from the chokepoint
  // sequence. `hints.slug` is a matching hint only; it never seeds the new
  // slug. `uniqueSlugFor` wraps it as a belt-and-suspenders collision net.
  const slug = await uniqueSlugFor(await nextGuestSlug())
  const externalLinks: Record<string, string> = { ...(hints.external_links ?? {}) }
  if (hints.website && !externalLinks.website) externalLinks.website = hints.website
  // Promote canonical handles into external_links so future matches succeed.
  if (hints.social_accounts) {
    for (const [k, v] of Object.entries(hints.social_accounts)) {
      if (typeof v === "string" && !externalLinks[k]) externalLinks[k] = v
    }
  }

  const [row] = await db!
    .insert(guests)
    .values({
      name: hints.name.trim(),
      slug,
      bio: hints.bio ?? null,
      photo_url: hints.photo_url ?? null,
      external_links: externalLinks,
      // Fixation on promotion — admin-only channels, never public.
      phone: hints.phone ?? null,
      email: hints.email ?? null,
    })
    .returning({ id: guests.id })

  return {
    guest_id: row.id,
    created: true,
    confidence: "high",
    reasons: ["created new guest", ...match.reasons],
    requires_review: false,
  }
}

/**
 * G-042 — the single source of new-guest slugs. Draws the next value from the
 * `guest_slug_seq` Postgres SEQUENCE (defined in scripts/post-schema.sql:
 * atomic + concurrency-safe, no max+1 race) and formats it as `g-NNN`,
 * zero-padded to 3 digits (`g-001`, `g-042`; naturally `g-1000` past 999).
 *
 * REQUIRES the sequence to exist. Until post-schema.sql is (re)applied this
 * throws and guest creation is blocked — that is the intended stop-point, NOT
 * a silent fallback to a parallel slug format.
 */
export async function nextGuestSlug(): Promise<string> {
  const result = await db!.execute(
    sql`SELECT 'g-' || lpad(nextval('guest_slug_seq')::text, 3, '0') AS slug`,
  )
  const slug = (result.rows[0] as { slug?: string } | undefined)?.slug
  if (!slug) throw new Error("nextGuestSlug: guest_slug_seq returned no value")
  return slug
}

async function uniqueSlugFor(base: string): Promise<string> {
  if (!base) base = `guest-${Date.now().toString(36)}`
  let candidate = base
  let i = 1
  while (true) {
    const existing = await db!
      .select({ id: guests.id })
      .from(guests)
      .where(eq(guests.slug, candidate))
      .limit(1)
    if (existing.length === 0) return candidate
    i++
    candidate = `${base}-${i}`
    if (i > 50) {
      // Safety net — extremely unlikely.
      return `${base}-${Date.now().toString(36)}`
    }
  }
}

// ─── previewEnsureGuest (P2.4.b) ──────────────────────────────────────
//
// Read-only sibling of `ensureGuest`. Performs the **same matching
// logic** by delegating to `findGuestMatch` — zero duplicated matcher
// internals (operator constraint). When the match is `none`, also
// computes the slug that `ensureGuest` would assign to a new row by
// reusing the same `uniqueSlugFor` helper that the writer path uses.
//
// Critical contract: **NO DB WRITES**. Used by the P2.4.b backfill in
// dry-run mode and by any future preview UI. The function only issues
// SELECTs (via the underlying matcher helpers + the slug-uniqueness
// check). Safe to call any number of times.
//
// Return shape mirrors `EnsureGuestResult` but with a different
// semantic: `created: false` is hard-coded; `requires_review` is
// computed using the same decision matrix as `ensureGuest` under the
// "auto" acceptance mode (the only mode the backfill uses).

export interface PreviewEnsureGuestResult {
  guest_id: string | null
  confidence: MatchConfidence
  reasons: string[]
  /**
   * True when the caller should NOT proceed (low-confidence conflict
   * with an existing guest). Caller surfaces this to the admin.
   */
  requires_review: boolean
  /**
   * When `confidence === 'none'`, the slug that `ensureGuest` would
   * assign to a freshly-created guest row. Computed via the same
   * `uniqueSlugFor` helper used by the writer path. NULL for other
   * confidences (no new row would be created).
   */
  would_create_slug: string | null
}

export async function previewEnsureGuest(
  hints: IdentityHints,
): Promise<PreviewEnsureGuestResult> {
  const match = await findGuestMatch(hints)

  // Decision matrix — mirrors ensureGuest's "auto" acceptance mode.
  // The backfill always uses "auto" (high+medium auto-link; low+none
  // routed by the script's own --confirm flags).
  let requiresReview = false
  if (match.confidence === "low") requiresReview = true

  // G-042 — a new guest's slug is a `g-NNN` value assigned from the
  // guest_slug_seq SEQUENCE at create time. A dry-run must NOT consume a
  // sequence value, so the exact slug is unknowable here and stays null.
  const wouldCreateSlug: string | null = null

  return {
    guest_id: match.guest_id,
    confidence: match.confidence,
    reasons: match.reasons,
    requires_review: requiresReview,
    would_create_slug: wouldCreateSlug,
  }
}

// ─── Source-summary deep merge (Phase 8) ──────────────────────────────
//
// guest_identity_profiles.source_summary used to be wholesale-replaced
// on every write — meaning a studio update would erase the application
// trail. Phase 8 routes every write through `mergeSourceSummary` which
// preserves untouched source sections.

export type SourceKey = keyof GuestSourceSummary

/**
 * Returns a new source_summary that overlays `patch` onto `existing`,
 * preserving sections not present in the patch.
 *
 * Rules:
 *   - Each top-level key (discovery, application, studio, …) is its
 *     own atomic section — sections in `patch` REPLACE the same
 *     section in `existing`; other sections are kept intact.
 *   - When patching a section, if the patch lacks `last_seen` we
 *     auto-stamp the current time.
 *   - When `existing` is null, the patch becomes the result.
 */
export function mergeSourceSummary(
  existing: GuestSourceSummary | null | undefined,
  patch: GuestSourceSummary | null | undefined,
  /** Optional explicit source key. When set, only this section is
   *  considered the "patch" — anything else in `patch` is ignored. */
  sourceKey?: SourceKey,
): GuestSourceSummary | undefined {
  if (!patch) return existing ?? undefined
  const base: GuestSourceSummary = { ...(existing ?? {}) }
  const now = new Date().toISOString()

  const apply = (key: SourceKey) => {
    const incoming = (patch as Record<string, unknown>)[key as string]
    if (!incoming || typeof incoming !== "object") return
    // Stamp last_seen if missing.
    const stamped = { ...(incoming as Record<string, unknown>) }
    if (!("last_seen" in stamped) && !("received_at" in stamped)) {
      stamped.last_seen = now
    }
    ;(base as Record<string, unknown>)[key as string] = stamped
  }

  if (sourceKey) {
    apply(sourceKey)
  } else {
    // Apply each section that's actually present in patch.
    for (const key of Object.keys(patch) as SourceKey[]) {
      apply(key)
    }
  }
  return base
}

// ─── Identity profile CRUD ────────────────────────────────────────────

type IdentityProfileRow = typeof guestIdentityProfiles.$inferSelect

export type IdentityProfilePatch = Partial<
  Omit<IdentityProfileRow, "id" | "guest_id" | "created_at" | "updated_at">
>

export async function getGuestIdentityProfile(guestId: string): Promise<IdentityProfileRow | null> {
  const rows = await db!
    .select()
    .from(guestIdentityProfiles)
    .where(eq(guestIdentityProfiles.guest_id, guestId))
    .limit(1)
  return rows[0] ?? null
}

export async function createGuestIdentityProfile(
  guestId: string,
  patch: IdentityProfilePatch = {},
): Promise<IdentityProfileRow> {
  const existing = await getGuestIdentityProfile(guestId)
  if (existing) return existing
  const [row] = await db!
    .insert(guestIdentityProfiles)
    .values({
      guest_id: guestId,
      ...patch,
    })
    .returning()
  return row
}

export async function updateGuestIdentityProfile(
  guestId: string,
  patch: IdentityProfilePatch,
): Promise<IdentityProfileRow> {
  const existing = await getGuestIdentityProfile(guestId)
  if (!existing) {
    // Create-with-merge: if the caller supplied a source_summary, treat
    // it as the patch on null existing — same code path either way.
    const initialPatch: IdentityProfilePatch = { ...patch }
    if (patch.source_summary !== undefined) {
      initialPatch.source_summary = mergeSourceSummary(
        null,
        patch.source_summary as GuestSourceSummary,
      )
    }
    return createGuestIdentityProfile(guestId, initialPatch)
  }

  // Phase 8 — deep-merge source_summary instead of overwriting.
  const merged: IdentityProfilePatch = { ...patch }
  if (patch.source_summary !== undefined) {
    merged.source_summary = mergeSourceSummary(
      existing.source_summary as GuestSourceSummary | null,
      patch.source_summary as GuestSourceSummary,
    )
  }

  const [row] = await db!
    .update(guestIdentityProfiles)
    .set({
      ...merged,
      updated_at: new Date(),
    })
    .where(eq(guestIdentityProfiles.guest_id, guestId))
    .returning()
  return row
}

// ─── Discovery → guest links ──────────────────────────────────────────

export async function linkDiscoveryCandidateToGuest(input: {
  discovery_candidate_id: string
  guest_id: string
  discovery_run_id?: string | null
  link_type?: string
  confidence_score?: number | null
}): Promise<{ id: string }> {
  // Idempotent: a discovery candidate resolves to exactly one guest, so
  // re-promoting the same candidate must NOT create a second link row.
  // Previously a blind insert with no unique constraint, so promoting twice
  // duplicated the link. Reuse (and refresh) the existing link if present.
  // The `discovery_candidate_id` unique index (see post-schema.sql) is the
  // durable guarantee; this check makes the code correct even before it's
  // applied to a given environment.
  const [existing] = await db!
    .select({ id: guestDiscoveryLinks.id })
    .from(guestDiscoveryLinks)
    .where(eq(guestDiscoveryLinks.discovery_candidate_id, input.discovery_candidate_id))
    .limit(1)

  if (existing) {
    await db!
      .update(guestDiscoveryLinks)
      .set({
        guest_id: input.guest_id,
        discovery_run_id: input.discovery_run_id ?? null,
        link_type: input.link_type ?? "promoted",
        confidence_score: input.confidence_score ?? null,
      })
      .where(eq(guestDiscoveryLinks.id, existing.id))
    return { id: existing.id }
  }

  const [row] = await db!
    .insert(guestDiscoveryLinks)
    .values({
      guest_id: input.guest_id,
      discovery_candidate_id: input.discovery_candidate_id,
      discovery_run_id: input.discovery_run_id ?? null,
      link_type: input.link_type ?? "promoted",
      confidence_score: input.confidence_score ?? null,
    })
    .returning({ id: guestDiscoveryLinks.id })
  return { id: row.id }
}
