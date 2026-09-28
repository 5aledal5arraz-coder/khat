/**
 * Season-planning AI jobs — shared job contracts.
 *
 *   season.hybrid_generate — the Hybrid topic generator (market signals +
 *                            original thinking + memory → N candidates).
 *                            Measured 2.5–9 min; its own wall is 580s.
 *   season.batch_generate  — the guided-wizard engines: a fresh batch, the
 *                            intelligent completion, a single-slot regenerate,
 *                            a guest-first injection and the «موضوع جديد لنفس
 *                            الضيف» alternative. Each is one or more AI calls
 *                            that used to run inside the Server Action.
 *
 * Both ran in the request behind nginx's 120s cut. They now run in the worker;
 * the action returns a jobId and the wizard/panel watches it, then refreshes
 * to pick up the persisted candidates (every engine writes its cards to
 * `khat_map_episode_candidates` itself — the job result only carries counts,
 * titles and the operator message).
 *
 * SIDE-EFFECT-FREE (no db, no handler registration): Server Actions and pages
 * import these constants without pulling the engines into their bundles.
 */

import type { KhatMapGuestSocialAccounts } from "@/types/khat-map"
import type { KhatMapMustIncludeRole } from "@/lib/khat-map/v2/completion"

// ─── Hybrid ──────────────────────────────────────────────────────────────────

export const SEASON_HYBRID_GENERATE_JOB = "season.hybrid_generate"

export function hybridDedupeKey(seasonId: string | null): string {
  return `hybrid:${seasonId ?? "global"}`
}

export interface HybridJobPayload extends Record<string, unknown> {
  seasonId: string | null
  language: "ar" | "en"
  count: number
  allowKuwaitBias: boolean
  createdBy: string | null
  /** A market stage was auto-kicked at enqueue time (banner in the result). */
  analysisKicked: boolean
}

export interface HybridJobResult extends Record<string, unknown> {
  ok: boolean
  generation_id: string | null
  generated_for_review: number
  auto_filtered: number
  unenriched: number
  analysis_pending: boolean
  reason?: string
  fallback_path?: string
  preview_titles: string[]
  /** Set when the run produced nothing usable — the card shows it. */
  messageAr?: string
  /** Set on a run that produced cards but with a caveat (e.g. un-enriched). */
  warningAr?: string
}

// ─── Guided-wizard batches ───────────────────────────────────────────────────

export const SEASON_BATCH_GENERATE_JOB = "season.batch_generate"

export type SeasonBatchMode =
  | "generate"
  | "auto_complete"
  | "regenerate_slot"
  | "inject_guest"
  | "alternative"

/**
 * One in-flight run per (season, mode[, card]). A second «ولّد» on the same
 * season attaches to the running batch; a slot regenerate and a batch may run
 * side by side because they write different cards.
 */
export function seasonBatchDedupeKey(
  seasonId: string,
  mode: SeasonBatchMode,
  topicCandidateId?: string | null,
): string {
  return topicCandidateId
    ? `season_batch:${seasonId}:${mode}:${topicCandidateId}`
    : `season_batch:${seasonId}:${mode}`
}

export function seasonBatchDedupePrefix(seasonId: string): string {
  return `season_batch:${seasonId}:`
}

export interface SeasonBatchGuestInput {
  full_name: string
  bio: string | null
  social_accounts: KhatMapGuestSocialAccounts
  official_website: string | null
}

export interface SeasonBatchJobPayload extends Record<string, unknown> {
  seasonId: string
  mode: SeasonBatchMode
  adminId: string
  size?: number
  /** auto_complete — the roles to fill, computed at enqueue time. */
  requiredRoles?: KhatMapMustIncludeRole[]
  /** regenerate_slot / alternative — the card that triggered the run. */
  topicCandidateId?: string | null
  /** inject_guest / alternative — the guest to anchor new topics on. */
  guest?: SeasonBatchGuestInput | null
  batchIndex?: number
  angleCount?: number
}

export interface SeasonBatchJobResult extends Record<string, unknown> {
  ok: boolean
  mode: SeasonBatchMode
  /** Cards now waiting in the review stack. */
  cards: number
  titles: string[]
  batch_index?: number
  /** EDITORIAL_FILTERS_TOO_STRICT | ALL_CANDIDATES_DEDUPED | EMPTY_BATCH | ANGLE_BANK_EXHAUSTED */
  code?: string
  messageAr?: string
  retryable?: boolean
}

/**
 * Our own AI budget/concurrency ceiling (router RateLimitError). Distinct from
 * a failure: nothing is broken and waiting genuinely fixes it.
 */
export const AI_RATE_LIMITED_MESSAGE =
  "تم بلوغ حدّ استخدام الذكاء الاصطناعي مؤقّتاً. انتظر بضع دقائق ثم أعد التوليد."
