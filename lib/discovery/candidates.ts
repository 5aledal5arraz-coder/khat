/**
 * Khat Brain Phase 5 — guest_discovery_candidates CRUD.
 *
 * RWA-F1 (2026-05-29): schema-drift resilience.
 *
 * The Phase Alpha + Beta schema additions are committed in Drizzle
 * before the corresponding migration is guaranteed to have run. The
 * stock `db.select().from(table)` issues a SELECT that names every
 * column declared in the schema; when Alpha columns don't exist in
 * the database, pg returns "column does not exist" and Next.js's
 * error boundary catches the throw — bricking `/admin/discovery`.
 *
 * The Real-World Audit caught this on its first navigation.
 *
 * This module now detects schema state once on first use and caches
 * the result. When Alpha columns are absent we issue an explicit
 * LEGACY-only projection and fill Alpha fields with null. When the
 * operator runs the migration, the next server restart picks up the
 * Alpha projection automatically.
 *
 * Same logic protects `updateCandidateAlphaPayload` from issuing an
 * UPDATE against columns that don't exist — it becomes a soft no-op
 * with a clear log line instead of crashing the worker job.
 */

import { and, desc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  guestDiscoveryCandidates,
  type AlphaAttributeConfidences,
  type AlphaEvidenceBundle,
  type AlphaPersonClassReport,
  type DiscoveryArchetype,
  type DiscoveryCandidateStatus,
  type DiscoveryEvidenceSummary,
  type DiscoveryEvidenceUrl,
  type DiscoveryPlatformSignals,
  type DiscoverySocialLinks,
  type DiscoveryStorySignals,
} from "@/lib/db/schema/discovery"

type Row = typeof guestDiscoveryCandidates.$inferSelect

// ─── RWA-F1 — schema state detection ─────────────────────────────────

/**
 * Cached result of "does this DB have the Phase Alpha columns?"
 * `null` = not yet checked. `false` = legacy DB; skip Alpha columns.
 * `true` = Alpha migration applied; safe to use full projection.
 *
 * The cache is process-local; on operator-side migration the cache
 * naturally clears on the next server restart. If you've run the
 * migration without restarting, call `__resetAlphaSchemaCache()` to
 * force a re-check.
 */
// TTL cache so that running the migration without restarting the dev
// server still flips into Alpha mode within 60 seconds. Production
// would set this much higher (e.g. an hour) since column adds happen
// at deploy time and the process is restarted anyway.
const ALPHA_CACHE_TTL_MS = 60_000
let alphaColumnsExistCache: boolean | null = null
let alphaColumnsExistCheckedAt = 0

export function __resetAlphaSchemaCache(): void {
  alphaColumnsExistCache = null
  alphaColumnsExistCheckedAt = 0
}

async function alphaColumnsExist(): Promise<boolean> {
  const now = Date.now()
  if (
    alphaColumnsExistCache !== null &&
    now - alphaColumnsExistCheckedAt < ALPHA_CACHE_TTL_MS
  ) {
    return alphaColumnsExistCache
  }
  if (!db) {
    alphaColumnsExistCache = false
    alphaColumnsExistCheckedAt = now
    return false
  }
  try {
    // Probe one Alpha column. If it exists, all 10 do (the migration
    // is atomic). information_schema is fast and broadly compatible.
    const result = await db.execute(sql`
      SELECT 1 AS ok
        FROM information_schema.columns
       WHERE table_name = 'guest_discovery_candidates'
         AND column_name = 'pipeline_version'
       LIMIT 1
    `)
    const wasAlpha = alphaColumnsExistCache === true
    alphaColumnsExistCache = (result.rows ?? []).length > 0
    alphaColumnsExistCheckedAt = now
    if (!alphaColumnsExistCache) {
      console.warn(
        "[discovery/candidates] Alpha columns absent — running in " +
          "legacy projection mode. Apply " +
          "`npm run migrate:phase-alpha-discovery-v2` to enable v2.",
      )
    } else if (!wasAlpha) {
      console.info(
        "[discovery/candidates] Alpha columns detected — switching to v2 projection.",
      )
    }
    return alphaColumnsExistCache
  } catch (err) {
    console.warn(
      "[discovery/candidates] schema probe failed; defaulting to " +
        "legacy projection:",
      err instanceof Error ? err.message : err,
    )
    alphaColumnsExistCache = false
    alphaColumnsExistCheckedAt = now
    return false
  }
}

// Explicit legacy column set — used when Alpha columns don't exist.
// Drizzle generates a SELECT naming only these columns, which pg
// accepts on any DB at or beyond Phase B (CR-era).
const LEGACY_COLUMNS = {
  id: guestDiscoveryCandidates.id,
  discovery_run_id: guestDiscoveryCandidates.discovery_run_id,
  target_episode_candidate_id:
    guestDiscoveryCandidates.target_episode_candidate_id,
  proposed_name: guestDiscoveryCandidates.proposed_name,
  proposed_role: guestDiscoveryCandidates.proposed_role,
  proposed_country: guestDiscoveryCandidates.proposed_country,
  archetype: guestDiscoveryCandidates.archetype,
  evidence_urls: guestDiscoveryCandidates.evidence_urls,
  evidence_summary: guestDiscoveryCandidates.evidence_summary,
  platform_signals: guestDiscoveryCandidates.platform_signals,
  story_signals: guestDiscoveryCandidates.story_signals,
  general_rationale: guestDiscoveryCandidates.general_rationale,
  topic_fit_rationale: guestDiscoveryCandidates.topic_fit_rationale,
  social_links: guestDiscoveryCandidates.social_links,
  editorial_fit_score: guestDiscoveryCandidates.editorial_fit_score,
  hiddenness_score: guestDiscoveryCandidates.hiddenness_score,
  novelty_score: guestDiscoveryCandidates.novelty_score,
  evidence_strength_score:
    guestDiscoveryCandidates.evidence_strength_score,
  topic_fit_score: guestDiscoveryCandidates.topic_fit_score,
  composite_score: guestDiscoveryCandidates.composite_score,
  status: guestDiscoveryCandidates.status,
  promoted_guest_id: guestDiscoveryCandidates.promoted_guest_id,
  rejection_reason: guestDiscoveryCandidates.rejection_reason,
  created_at: guestDiscoveryCandidates.created_at,
  updated_at: guestDiscoveryCandidates.updated_at,
} as const

export interface DiscoveryCandidateRecord {
  id: string
  discovery_run_id: string | null
  target_episode_candidate_id: string | null
  proposed_name: string | null
  proposed_role: string | null
  proposed_country: string | null
  archetype: DiscoveryArchetype | null
  evidence_urls: DiscoveryEvidenceUrl[]
  evidence_summary: DiscoveryEvidenceSummary | null
  platform_signals: DiscoveryPlatformSignals | null
  story_signals: DiscoveryStorySignals | null
  general_rationale: string | null
  topic_fit_rationale: string | null
  social_links: DiscoverySocialLinks | null
  editorial_fit_score: number | null
  hiddenness_score: number | null
  novelty_score: number | null
  evidence_strength_score: number | null
  topic_fit_score: number | null
  composite_score: number | null
  status: DiscoveryCandidateStatus
  promoted_guest_id: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string

  // ─── Phase Alpha fields (null on legacy rows) ────────────────────
  pipeline_version: string | null
  display_name: string | null
  full_name_normalized: string | null
  person_class_signals: AlphaPersonClassReport | null
  identity_confidence: number | null
  attribute_confidences: AlphaAttributeConfidences | null
  evidence_bundle: AlphaEvidenceBundle | null
  hidden_gem_score: number | null
  recommendation_score: number | null
  dropped_reason: string | null
}

export function mapRow(r: Row): DiscoveryCandidateRecord {
  return {
    id: r.id,
    discovery_run_id: r.discovery_run_id,
    target_episode_candidate_id: r.target_episode_candidate_id,
    proposed_name: r.proposed_name,
    proposed_role: r.proposed_role,
    proposed_country: r.proposed_country,
    archetype: (r.archetype ?? null) as DiscoveryArchetype | null,
    evidence_urls: (r.evidence_urls ?? []) as DiscoveryEvidenceUrl[],
    evidence_summary: (r.evidence_summary ?? null) as DiscoveryEvidenceSummary | null,
    platform_signals: (r.platform_signals ?? null) as DiscoveryPlatformSignals | null,
    story_signals: (r.story_signals ?? null) as DiscoveryStorySignals | null,
    general_rationale: r.general_rationale ?? null,
    topic_fit_rationale: r.topic_fit_rationale ?? null,
    social_links: (r.social_links ?? null) as DiscoverySocialLinks | null,
    editorial_fit_score: r.editorial_fit_score === null ? null : Number(r.editorial_fit_score),
    hiddenness_score: r.hiddenness_score === null ? null : Number(r.hiddenness_score),
    novelty_score: r.novelty_score === null ? null : Number(r.novelty_score),
    evidence_strength_score: r.evidence_strength_score === null ? null : Number(r.evidence_strength_score),
    topic_fit_score: r.topic_fit_score === null ? null : Number(r.topic_fit_score),
    composite_score: r.composite_score === null ? null : Number(r.composite_score),
    status: r.status as DiscoveryCandidateStatus,
    promoted_guest_id: r.promoted_guest_id,
    rejection_reason: r.rejection_reason,
    created_at: r.created_at.toISOString(),
    updated_at: r.updated_at.toISOString(),

    // ─── Phase Alpha ────────────────────────────────────────────
    // These columns return null when the migration hasn't been run
    // OR when the row was written by the legacy pipeline.
    pipeline_version: (r as Record<string, unknown>).pipeline_version
      ? String((r as Record<string, unknown>).pipeline_version)
      : null,
    display_name: (r as Record<string, unknown>).display_name
      ? String((r as Record<string, unknown>).display_name)
      : null,
    full_name_normalized: (r as Record<string, unknown>).full_name_normalized
      ? String((r as Record<string, unknown>).full_name_normalized)
      : null,
    person_class_signals:
      ((r as Record<string, unknown>).person_class_signals as
        | AlphaPersonClassReport
        | null
        | undefined) ?? null,
    identity_confidence:
      (r as Record<string, unknown>).identity_confidence == null
        ? null
        : Number((r as Record<string, unknown>).identity_confidence),
    attribute_confidences:
      ((r as Record<string, unknown>).attribute_confidences as
        | AlphaAttributeConfidences
        | null
        | undefined) ?? null,
    evidence_bundle:
      ((r as Record<string, unknown>).evidence_bundle as
        | AlphaEvidenceBundle
        | null
        | undefined) ?? null,
    hidden_gem_score:
      (r as Record<string, unknown>).hidden_gem_score == null
        ? null
        : Number((r as Record<string, unknown>).hidden_gem_score),
    recommendation_score:
      (r as Record<string, unknown>).recommendation_score == null
        ? null
        : Number((r as Record<string, unknown>).recommendation_score),
    dropped_reason: (r as Record<string, unknown>).dropped_reason
      ? String((r as Record<string, unknown>).dropped_reason)
      : null,
  }
}

export interface CreateCandidateInput {
  discovery_run_id?: string | null
  target_episode_candidate_id?: string | null
  proposed_name?: string | null
  proposed_role?: string | null
  proposed_country?: string | null
  archetype?: DiscoveryArchetype
  evidence_urls?: DiscoveryEvidenceUrl[]
  platform_signals?: DiscoveryPlatformSignals | null
}

export async function createCandidate(
  input: CreateCandidateInput,
): Promise<DiscoveryCandidateRecord> {
  const [row] = await db!
    .insert(guestDiscoveryCandidates)
    .values({
      discovery_run_id: input.discovery_run_id ?? null,
      target_episode_candidate_id: input.target_episode_candidate_id ?? null,
      proposed_name: input.proposed_name ?? null,
      proposed_role: input.proposed_role ?? null,
      proposed_country: input.proposed_country ?? null,
      archetype: input.archetype ?? null,
      evidence_urls: input.evidence_urls ?? [],
      platform_signals: input.platform_signals ?? null,
    })
    .returning()
  return mapRow(row)
}

export async function getCandidate(id: string): Promise<DiscoveryCandidateRecord | null> {
  // RWA-F1 — projection depends on whether Alpha columns exist.
  const hasAlpha = await alphaColumnsExist()
  if (hasAlpha) {
    const rows = await db!
      .select()
      .from(guestDiscoveryCandidates)
      .where(eq(guestDiscoveryCandidates.id, id))
      .limit(1)
    return rows[0] ? mapRow(rows[0]) : null
  }
  const rows = await db!
    .select(LEGACY_COLUMNS)
    .from(guestDiscoveryCandidates)
    .where(eq(guestDiscoveryCandidates.id, id))
    .limit(1)
  return rows[0] ? mapRow(rows[0] as unknown as Row) : null
}

/**
 * CR-3 — non-person patterns. Names that match these regexes are NOT
 * real human candidates and must be hidden from the operator. Covers:
 *   • Empty / null / placeholder names ("(no name)", "—", "...")
 *   • Show/podcast/program names ("سوالف الليل", "بودكاست X", "اذاعة Y")
 *   • Channel / handle markers ("قناة", "channel", lone latin handles)
 *   • Generic event/series words ("حلقة", "موسم")
 *
 * Maintained close to the listCandidates query so future patterns
 * can be added in one place. Keep patterns CONSERVATIVE — false
 * negatives (a real person slipped through) is preferable to
 * false positives (a real human hidden from the operator).
 */
/**
 * CR-3 (Arabic-aware) — JavaScript regex `\b` is defined only over
 * ASCII word characters. `\bبودكاست\b` does NOT match inside an Arabic
 * sentence. We replaced word-boundary anchors with lookarounds that
 * accept "start / end / whitespace / Arabic punctuation" on either
 * side, and we use bare substring tests for Arabic show / org words
 * where any in-token occurrence is a non-person signal.
 *
 * Range U+0600-U+06FF covers the Arabic block; Latin matches keep
 * \b for proper boundary detection.
 */
const NON_PERSON_NAME_PATTERNS: RegExp[] = [
  // ── Programs / shows / podcasts (Arabic — bare substring) ─────────
  // Any occurrence of these tokens inside a name = not a person.
  /بودكاست/i,
  /برنامج/i,
  /اذاعة|إذاعة/i,
  /قناة/i,
  /سلسلة/i,
  /منوعات/i,
  /حلقات/i,
  /(?:^|\s)حلقة(?:$|\s)/i,
  /(?:^|\s)موسم(?:$|\s)/i,
  // ── Programs / shows / podcasts (Latin — proper word boundary) ────
  /\bpodcast\b/i,
  /\bchannel\b/i,
  /\bshow\b/i,
  /\bseries\b/i,
  /\bstory\b/i,
  /\bstories\b/i,
  /\btales\b/i,
  /\bepisodes?\b/i,
  // ── Organizations / brands / cultural centers (Arabic) ────────────
  /مؤسسة/i,
  /(?:^|\s)مركز(?:$|\s)/i,
  /جمعية/i,
  /(?:^|\s)دار(?:$|\s)/i,
  /مكتبة/i,
  /إثراء|اثراء/i, // Ethraa cultural center
  // ── Organizations / brands (Latin) ────────────────────────────────
  /\bethraa\b/i,
  /\bithra\b/i,
  /\bfoundation\b/i,
  /\bcenter\b/i,
  /\bcentre\b/i,
  /\binstitute\b/i,
  /\bacademy\b/i,
  /\borganization\b/i,
  /\bcompany\b/i,
  /\bdaughter\s+of\b/i,
  /\bson\s+of\b/i,
  /\bvoice\s+of\b/i,
  /\bvoices?\s+of\b/i,
  // ── Common Kuwaiti / Arabic program-name openers ──────────────────
  /^سوالف\s/i,
  /^ليالي\s/i,
  /^صباحيات\s/i,
  /^مساءيات\s/i,
  /^همسات\s/i,
  /^أحاديث\s/i,
  /^حكايات\s/i,
  /^قصص\s/i,
  /^روايتهم\b/i,
  /^روايتها\b/i,
  // ── Latin-language "Just X" pattern — typically a show name ───────
  /^just\s+(a|an|the)\s/i,
  /^the\s+(podcast|show|series|channel)\b/i,
  // ── Latin-only network / channel codes ────────────────────────────
  /^sat-?\d+/i,        // SAT-7, SAT7
  /^mbc[\s\d-]/i,      // MBC 1, MBC-2, MBC Action...
  /^al[\s-]/i,         // "Al-Jazeera" etc. (mostly outlets)
  // ── Malformed: mixed Arabic + Latin chars in same token ───────────
  // Detect concatenations like "Alyaآليا" or "Rfoof" stuck to Arabic.
  /[A-Za-z][؀-ۿ]|[؀-ۿ][A-Za-z]/,
  // ── Latin name + slash separator (channel handle pattern) ─────────
  // e.g. "رفوف / Rfoof" — typically YouTube/Instagram handle next to
  // the channel name. Real human names don't carry their handle.
  /\s\/\s[A-Za-z]/,
  /[A-Za-z]\s\/\s/,
  // ── Generic placeholders ──────────────────────────────────────────
  /^\(no\s+name\)$/i,
  /^—+$/,
  /^…+$/,
  /^\.+$/,
  /^-+$/,
]

function isPersonName(name: string | null | undefined): boolean {
  if (!name) return false
  const trimmed = name.trim()
  if (trimmed.length === 0) return false
  // Names shorter than 2 chars are not actionable.
  if (trimmed.length < 2) return false
  for (const re of NON_PERSON_NAME_PATTERNS) {
    if (re.test(trimmed)) return false
  }
  return true
}

export async function listCandidates(
  opts: {
    discovery_run_id?: string
    status?: DiscoveryCandidateStatus
    limit?: number
    /**
     * CR-3 — when true (default), filters out non-person rows
     * client-side after the query. Set to false in admin-debug
     * contexts (e.g. /admin/khat-brain/discovery-audit if added).
     */
    only_persons?: boolean
    /**
     * CR-3 (extended) — also exclude candidates the verifier already
     * marked as `rejected` from the default list. Operator-day showed
     * 5 of 6 candidate cards were red rejected rows that wasted
     * scanning time. Default true; set false in audit contexts.
     */
    include_rejected?: boolean
  } = {},
): Promise<DiscoveryCandidateRecord[]> {
  const conditions = []
  if (opts.discovery_run_id)
    conditions.push(eq(guestDiscoveryCandidates.discovery_run_id, opts.discovery_run_id))
  if (opts.status) conditions.push(eq(guestDiscoveryCandidates.status, opts.status))

  // RWA-F1 — fall back to legacy column projection when Alpha
  // columns don't exist in this DB. Either path renders correctly;
  // the legacy path simply leaves the Alpha fields as null.
  const hasAlpha = await alphaColumnsExist()
  const rows = hasAlpha
    ? await db!
        .select()
        .from(guestDiscoveryCandidates)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(guestDiscoveryCandidates.composite_score))
        .limit(opts.limit ?? 200)
    : ((await db!
        .select(LEGACY_COLUMNS)
        .from(guestDiscoveryCandidates)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(guestDiscoveryCandidates.composite_score))
        .limit(opts.limit ?? 200)) as unknown as Row[])
  let mapped = rows.map(mapRow)
  // CR-3 (extended) — hide verifier-rejected rows by default so the
  // operator's surface stays editorial-grade. The records remain in
  // DB for audit; pass include_rejected: true to see them.
  if (opts.include_rejected !== true && !opts.status) {
    mapped = mapped.filter((c) => c.status !== "rejected")
  }
  if (opts.only_persons === false) return mapped
  return mapped.filter((c) => isPersonName(c.proposed_name))
}

export interface UpdateCandidateVerificationInput {
  id: string
  evidence_summary?: DiscoveryEvidenceSummary | null
  story_signals?: DiscoveryStorySignals | null
  editorial_fit_score?: number | null
  general_rationale?: string | null
  topic_fit_rationale?: string | null
  social_links?: DiscoverySocialLinks | null
  topic_fit_score?: number | null
}

export async function updateCandidateVerification(
  input: UpdateCandidateVerificationInput,
): Promise<DiscoveryCandidateRecord | null> {
  const patch: Record<string, unknown> = {
    updated_at: new Date(),
  }
  if (input.evidence_summary !== undefined) patch.evidence_summary = input.evidence_summary
  if (input.story_signals !== undefined) patch.story_signals = input.story_signals
  if (input.editorial_fit_score !== undefined) patch.editorial_fit_score = input.editorial_fit_score
  if (input.general_rationale !== undefined) patch.general_rationale = input.general_rationale
  if (input.topic_fit_rationale !== undefined) patch.topic_fit_rationale = input.topic_fit_rationale
  if (input.social_links !== undefined) patch.social_links = input.social_links
  if (input.topic_fit_score !== undefined) patch.topic_fit_score = input.topic_fit_score
  const [row] = await db!
    .update(guestDiscoveryCandidates)
    .set(patch)
    .where(eq(guestDiscoveryCandidates.id, input.id))
    .returning()
  return row ? mapRow(row) : null
}

export interface UpdateCandidateScoresInput {
  id: string
  editorial_fit_score?: number | null
  hiddenness_score?: number | null
  novelty_score?: number | null
  evidence_strength_score?: number | null
  composite_score?: number | null
}

export async function updateCandidateScores(
  input: UpdateCandidateScoresInput,
): Promise<DiscoveryCandidateRecord | null> {
  const patch: Record<string, unknown> = { updated_at: new Date() }
  for (const k of [
    "editorial_fit_score",
    "hiddenness_score",
    "novelty_score",
    "evidence_strength_score",
    "composite_score",
  ] as const) {
    const v = input[k]
    if (v !== undefined) patch[k] = v
  }
  const [row] = await db!
    .update(guestDiscoveryCandidates)
    .set(patch)
    .where(eq(guestDiscoveryCandidates.id, input.id))
    .returning()
  return row ? mapRow(row) : null
}

/**
 * Phase Alpha — single writer for the full Alpha payload. Called by
 * the verify handler when ALPHA_DISCOVERY_FLAG is enabled and the
 * pipeline returns a decision. Idempotent for the same candidate id.
 */
export interface UpdateCandidateAlphaInput {
  id: string
  pipeline_version: string | null
  display_name: string | null
  full_name_normalized: string | null
  person_class_signals: AlphaPersonClassReport | null
  identity_confidence: number | null
  attribute_confidences: AlphaAttributeConfidences | null
  evidence_bundle: AlphaEvidenceBundle | null
  editorial_fit_score?: number | null
  hidden_gem_score: number | null
  recommendation_score: number | null
  evidence_strength_score?: number | null
  dropped_reason: string | null
}

export async function updateCandidateAlphaPayload(
  input: UpdateCandidateAlphaInput,
): Promise<DiscoveryCandidateRecord | null> {
  // RWA-F1 — when Alpha columns are absent we still write the legacy-
  // safe fields (`editorial_fit_score`, `evidence_strength_score`)
  // so the rest of the verify flow keeps working. The Alpha-only
  // fields are skipped with a single log line per worker process.
  const hasAlpha = await alphaColumnsExist()
  const patch: Record<string, unknown> = { updated_at: new Date() }
  if (hasAlpha) {
    patch.pipeline_version = input.pipeline_version
    patch.display_name = input.display_name
    patch.full_name_normalized = input.full_name_normalized
    patch.person_class_signals = input.person_class_signals
    patch.identity_confidence = input.identity_confidence
    patch.attribute_confidences = input.attribute_confidences
    patch.evidence_bundle = input.evidence_bundle
    patch.hidden_gem_score = input.hidden_gem_score
    patch.recommendation_score = input.recommendation_score
    patch.dropped_reason = input.dropped_reason
  }
  if (input.editorial_fit_score !== undefined) {
    patch.editorial_fit_score = input.editorial_fit_score
  }
  if (input.evidence_strength_score !== undefined) {
    patch.evidence_strength_score = input.evidence_strength_score
  }
  if (hasAlpha) {
    const [row] = await db!
      .update(guestDiscoveryCandidates)
      .set(patch)
      .where(eq(guestDiscoveryCandidates.id, input.id))
      .returning()
    return row ? mapRow(row) : null
  }
  // Legacy DB — drop Alpha fields from the UPDATE entirely. We still
  // return the (legacy) row so callers can continue without a null
  // check explosion.
  const [row] = await db!
    .update(guestDiscoveryCandidates)
    .set(patch)
    .where(eq(guestDiscoveryCandidates.id, input.id))
    .returning(LEGACY_COLUMNS)
  return row ? mapRow(row as unknown as Row) : null
}

export async function setCandidateStatus(
  id: string,
  status: DiscoveryCandidateStatus,
  opts: { rejection_reason?: string | null; promoted_guest_id?: string | null } = {},
): Promise<DiscoveryCandidateRecord | null> {
  const patch: Record<string, unknown> = { status, updated_at: new Date() }
  if (opts.rejection_reason !== undefined) patch.rejection_reason = opts.rejection_reason
  if (opts.promoted_guest_id !== undefined) patch.promoted_guest_id = opts.promoted_guest_id
  const [row] = await db!
    .update(guestDiscoveryCandidates)
    .set(patch)
    .where(eq(guestDiscoveryCandidates.id, id))
    .returning()
  return row ? mapRow(row) : null
}
