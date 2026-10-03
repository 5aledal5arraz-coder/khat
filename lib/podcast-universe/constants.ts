/**
 * Podcast Universe — fixed numbers from the approved spec
 * (docs/podcast-universe-plan-v1.md). One place, so a test can pin them and a
 * reviewer can diff them. Side-effect free (no db import).
 */

// ─── Job types (B11) — MUST match HANDLER_TIMEOUT_MS keys in worker.ts ────
export const PU_JOB_CHANNEL_VERIFY = "podcast.channel.verify"
export const PU_JOB_INITIAL_CRAWL = "podcast.channel.initial_crawl"
export const PU_JOB_INCREMENTAL_CRAWL = "podcast.channel.incremental_crawl"
export const PU_JOB_GUEST_EXTRACT = "podcast.episode.guest_extract"
export const PU_JOB_PERSON_RESOLVE = "podcast.person.resolve"
export const PU_JOB_WEEKLY_SYNC = "podcast.weekly_sync"

export const PU_JOB_TYPES = [
  PU_JOB_CHANNEL_VERIFY,
  PU_JOB_INITIAL_CRAWL,
  PU_JOB_INCREMENTAL_CRAWL,
  PU_JOB_GUEST_EXTRACT,
  PU_JOB_PERSON_RESOLVE,
  PU_JOB_WEEKLY_SYNC,
] as const

/** B11 attempts. */
export const PU_ATTEMPTS = {
  [PU_JOB_CHANNEL_VERIFY]: 3,
  [PU_JOB_INITIAL_CRAWL]: 3,
  [PU_JOB_INCREMENTAL_CRAWL]: 3,
  [PU_JOB_GUEST_EXTRACT]: 2,
  [PU_JOB_PERSON_RESOLVE]: 3,
  [PU_JOB_WEEKLY_SYNC]: 1,
} as const

// ─── Duration classes (Decision 2 / B1) ──────────────────────────────────
export const CORE_LONGFORM_MIN_SECONDS = 1200
export const MIDFORM_MIN_SECONDS = 480

// ─── YouTube quota (Decision 13 / B4) — application-side caps ────────────
export const PU_DAILY_READ_UNITS_CAP = 2000
export const PU_DAILY_SEARCH_CALLS_CAP = 20
/** Quota cost per call (YouTube Data API v3). search.list counts as a CALL. */
export const YT_UNIT_COST = { channels: 1, playlistItems: 1, videos: 1 } as const
export const YT_PAGE_SIZE = 50

// ─── Incremental crawl (B5) ──────────────────────────────────────────────
/** Always read at least this many pages (2 × 50 = 100 uploads) for overlap. */
export const INCREMENTAL_MIN_PAGES = 2

// ─── Guest extraction (B6 / B13) ─────────────────────────────────────────
/**
 * v2 (Addendum 2): one person per guest entry, channel hosts passed in and
 * excluded. v3 (noura 2026-10-03): a nationality claim's evidence_text must
 * include the guest's name. Bumping the version changes the job dedupe key
 * and the ai_runs prompt_version, so runs stay distinguishable.
 */
export const GUEST_EXTRACT_PROMPT_VERSION = "podcast-universe-guest-extract-v3"
export const EXTRACT_BATCH_DEFAULT = 40
export const EXTRACT_BATCH_MAX = 50
export const EXTRACT_BATCH_FALLBACK = 20
export const DESCRIPTION_EXCERPT_MAX = 1200
/** B13 hard cap for the initial M1 seed indexing/extraction run. */
export const M1_EXTRACT_BUDGET_USD = 3.0
/** B13 target (informational — the cap is what is enforced). */
export const M1_EXTRACT_TARGET_USD = 1.5

// ─── Rehost / exposure (Decision 4) — M1 only DISPLAYS exposure ──────────
export const VIEWS_LABEL_AR = "التعرّض"
