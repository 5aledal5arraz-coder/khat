/**
 * Phase 2.4.b — pure helpers for the guest-identity backfill script.
 *
 * No DB. No I/O. Easy to unit-test. All four helpers are used by
 * `scripts/backfill-guest-identity-links.ts` and locked down by
 * `tests/backfill/guest-identity-routing.test.ts`.
 *
 * Why a separate file: keeping these out of the script's main file
 * means the test suite can import them without triggering the
 * script's top-level main() side effects.
 */

import type {
  GuestSocialAccounts,
  GuestSourceSummary,
} from "@/lib/db/schema/guest-identity"

// ─── routeOutcome ─────────────────────────────────────────────────────

/**
 * Given an `ensureGuest` confidence outcome + the operator's flag
 * state, return the action the backfill should take. Pure function;
 * zero side effects.
 */
export type RouteAction =
  | "auto_link"
  | "requires_review"
  | "create_canonical_and_link"
  | "would_create_canonical_skip"

export interface RouteFlags {
  confirm: boolean
  confirmCreateCanonicals: boolean
}

export function routeOutcome(
  confidence: "high" | "medium" | "low" | "none",
  flags: RouteFlags,
): RouteAction {
  if (confidence === "high" || confidence === "medium") {
    // Both confirm modes route the same way: auto-link via junction
    // insert. Dry-run + write-confirm both produce this label; the
    // caller decides whether to execute or merely plan.
    return "auto_link"
  }
  if (confidence === "low") {
    // `low` never auto-writes regardless of flags (operator
    // P2.4 §10 Q1). Always queue for admin review.
    return "requires_review"
  }
  // confidence === "none"
  if (flags.confirm && flags.confirmCreateCanonicals) {
    return "create_canonical_and_link"
  }
  // dry-run, or --confirm without --confirm-create-canonicals:
  // surface in new_canonical_proposals, do NOT create.
  return "would_create_canonical_skip"
}

// ─── parseSocialLinksBlob ─────────────────────────────────────────────

const SOCIAL_PATTERNS: Array<{
  platform: keyof Omit<GuestSocialAccounts, "other">
  re: RegExp
}> = [
  { platform: "twitter", re: /https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/[A-Za-z0-9_]+/i },
  { platform: "instagram", re: /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+/i },
  { platform: "youtube", re: /https?:\/\/(?:www\.)?youtube\.com\/(?:@[A-Za-z0-9_-]+|channel\/[A-Za-z0-9_-]+|c\/[A-Za-z0-9_-]+|user\/[A-Za-z0-9_-]+)/i },
  { platform: "linkedin", re: /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9-]+/i },
  { platform: "tiktok", re: /https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9_.]+/i },
  { platform: "facebook", re: /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9.]+/i },
  { platform: "website", re: /https?:\/\/(?!(?:www\.)?(?:twitter|x|instagram|youtube|linkedin|tiktok|facebook)\.com)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\S*/i },
]

/**
 * Heuristic parser for `guest_applications.social_links` (free-text).
 * Extracts the first match per platform. Anything unrecognised goes
 * into `unparsed_text` so a failed parse is **metadata only, never
 * fatal** (operator constraint).
 *
 * Empty / null input → empty record.
 */
export function parseSocialLinksBlob(blob: string | null | undefined): {
  social_accounts: GuestSocialAccounts
  unparsed_text: string | null
} {
  if (!blob || !blob.trim()) {
    return { social_accounts: {}, unparsed_text: null }
  }
  const social_accounts: GuestSocialAccounts = {}
  let remaining = blob

  for (const { platform, re } of SOCIAL_PATTERNS) {
    const m = remaining.match(re)
    if (m && !social_accounts[platform]) {
      social_accounts[platform] = m[0]
      // Strip the matched URL so subsequent regexes (esp. the catch-
      // all "website" pattern) don't double-match the same string.
      remaining = remaining.replace(m[0], " ")
    }
  }

  const cleaned = remaining.replace(/\s+/g, " ").trim()
  return {
    social_accounts,
    unparsed_text: cleaned || null,
  }
}

// ─── buildSourceSummary ───────────────────────────────────────────────

export interface SourceSummaryInputs {
  /** Discovery link count + most-recent linked_at. */
  discovery: { runs: number; last_seen: string | null }
  /** First linked application id + its received_at (if any). */
  application: { id: string | null; received_at: string | null }
  /** Candidate link count + most-recent linked_at. */
  candidates: { count: number; last_seen: string | null }
  /** Studio session count + most-recent created_at. */
  studio: { sessions: number; last_seen: string | null }
  /** Preparation record count + most-recent updated_at. */
  preparation: { records: number; last_seen: string | null }
  /** Canonical guests.created_at — used as the manual-source anchor. */
  manual_last_seen: string | null
}

/**
 * Compose a `GuestSourceSummary` from raw counts/timestamps. The
 * result has **stable key ordering** (discovery → application →
 * candidates → studio → preparation → manual) for deterministic
 * diffing of `source_summary` JSONB across re-runs.
 *
 * Empty sections (zero counts AND no linked rows) are omitted to
 * keep the JSONB lean — but the existence of a populated key in
 * the result is the operator's signal that "this surface has at
 * least one tie to this guest".
 */
export function buildSourceSummary(
  inputs: SourceSummaryInputs,
): GuestSourceSummary {
  const out: GuestSourceSummary = {}

  // Iterate in a fixed order so JSON.stringify produces stable output.
  if (inputs.discovery.runs > 0 && inputs.discovery.last_seen) {
    out.discovery = {
      runs: inputs.discovery.runs,
      last_seen: inputs.discovery.last_seen,
    }
  }
  if (inputs.application.id) {
    out.application = {
      id: inputs.application.id,
      received_at: inputs.application.received_at,
    }
  }
  if (inputs.candidates.count > 0) {
    out.candidates = {
      count: inputs.candidates.count,
      last_seen: inputs.candidates.last_seen,
    }
  }
  if (inputs.studio.sessions > 0) {
    out.studio = {
      sessions: inputs.studio.sessions,
      last_seen: inputs.studio.last_seen,
    }
  }
  if (inputs.preparation.records > 0) {
    out.preparation = {
      records: inputs.preparation.records,
      last_seen: inputs.preparation.last_seen,
    }
  }
  if (inputs.manual_last_seen) {
    out.manual = { last_seen: inputs.manual_last_seen }
  }
  return out
}

// ─── stripEmpty ───────────────────────────────────────────────────────

/**
 * Remove keys whose value is `null | undefined | empty-object | empty-array`.
 * Stable-ordered: the iteration order matches the input's insertion
 * order, which (for the source-summary case) we control via
 * `buildSourceSummary`. Pure; no DB.
 */
export function stripEmpty<T extends Record<string, unknown>>(obj: T): T {
  const out = {} as Record<string, unknown>
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    if (typeof v === "object" && !Array.isArray(v)) {
      if (Object.keys(v as Record<string, unknown>).length === 0) continue
    }
    if (Array.isArray(v) && v.length === 0) continue
    out[k] = v
  }
  return out as T
}
