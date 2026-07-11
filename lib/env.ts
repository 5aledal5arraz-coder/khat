/**
 * Typed environment configuration — one documented source for the external
 * service credentials + core config the app depends on.
 *
 * Why this exists: `process.env.FOO` reads were scattered across ~90 sites with
 * no validation and easy typos. `env.FOO` gives autocomplete, typo-proofing,
 * and one place to see every credential. `validateEnv()` (called at server +
 * worker boot) fails fast on missing REQUIRED config instead of surfacing a
 * confusing error on the first request that needs it.
 *
 * Semantics: every accessor is a LAZY getter that reads `process.env` on each
 * access, so `env.FOO` is byte-identical to `process.env.FOO` (same
 * `string | undefined`, honours late changes / test stubs). Swapping a read is
 * therefore always safe.
 *
 * Scope boundary — what is NOT here (intentionally):
 *   • DATABASE_URL / DB_POOL_* — owned by lib/db.ts (the connection layer).
 *   • Load-time tuning knobs (WORKER_*, KHAT_RATE_LIMIT_*, *_INTERVAL_MS) and
 *     feature flags (PREP_V2_ENABLED, KHAT_HYBRID_TOPICS_ENABLED, …) — read once
 *     at their point of use; centralising them buys little.
 *   • Dev/migration-only flags (SMOKE_*, MIGRATE_*_REVERSE) — tooling, not runtime config.
 */

/** Read a var lazily so `env.X` tracks `process.env.X` exactly (incl. test stubs). */
function get(name: string): string | undefined {
  const v = process.env[name]
  return v === undefined || v === "" ? undefined : v
}

export const env = {
  // ─── AI providers ────────────────────────────────────────────────────────
  get OPENAI_API_KEY() { return process.env.OPENAI_API_KEY },
  get GEMINI_API_KEY() { return process.env.GEMINI_API_KEY },
  get GOOGLE_API_KEY() { return process.env.GOOGLE_API_KEY },
  get GOOGLE_BOOKS_KEY() { return process.env.GOOGLE_BOOKS_KEY },
  get GOOGLE_VIDEO_API_KEY() { return process.env.GOOGLE_VIDEO_API_KEY },
  get GEMINI_RETRIEVAL_MODEL() { return process.env.GEMINI_RETRIEVAL_MODEL },
  get GEMINI_REASONING_MODEL() { return process.env.GEMINI_REASONING_MODEL },

  // ─── YouTube / podcast sources ───────────────────────────────────────────
  get YOUTUBE_API_KEY() { return process.env.YOUTUBE_API_KEY },
  get YOUTUBE_API_KEY2() { return process.env.YOUTUBE_API_KEY2 },
  get YOUTUBE_CHANNEL_ID() { return process.env.YOUTUBE_CHANNEL_ID },
  get YOUTUBE_CHANNEL_HANDLE() { return process.env.YOUTUBE_CHANNEL_HANDLE },
  get YOUTUBE_EXTRA_PLAYLIST_IDS() { return process.env.YOUTUBE_EXTRA_PLAYLIST_IDS },
  get RSS_FEED_URL() { return process.env.RSS_FEED_URL },

  // ─── External research ───────────────────────────────────────────────────
  get LISTEN_NOTES_API_KEY() { return process.env.LISTEN_NOTES_API_KEY },
  get X_BEARER_TOKEN() { return process.env.X_BEARER_TOKEN },
  // Instagram Graph API (official Business Discovery + hashtag search).
  // Token: long-lived, from a Meta app with instagram_basic via Facebook
  // Login for Business. Account id: the podcast's own IG professional
  // account (the anchor for business_discovery/hashtag calls).
  get IG_GRAPH_TOKEN() { return process.env.IG_GRAPH_TOKEN },
  get IG_BUSINESS_ACCOUNT_ID() { return process.env.IG_BUSINESS_ACCOUNT_ID },
  /** Optional Graph version override, e.g. "v24.0" (default v23.0). */
  get IG_GRAPH_VERSION() { return process.env.IG_GRAPH_VERSION },

  // ─── Email (Resend) ──────────────────────────────────────────────────────
  get RESEND_API_KEY() { return process.env.RESEND_API_KEY },
  get RESEND_FROM_EMAIL() { return process.env.RESEND_FROM_EMAIL },
  get RESEND_REPLY_TO() { return process.env.RESEND_REPLY_TO },
  get RESEND_WEBHOOK_SECRET() { return process.env.RESEND_WEBHOOK_SECRET },

  // ─── Operational notifications ───────────────────────────────────────────
  get ADMIN_NOTIFY_EMAIL() { return process.env.ADMIN_NOTIFY_EMAIL },
  get CANDIDATE_NOTIFY_EMAIL() { return process.env.CANDIDATE_NOTIFY_EMAIL },

  // ─── Secrets ─────────────────────────────────────────────────────────────
  // (NEXT_PUBLIC_* stay inline — Next build-inlines them into client bundles.)
  get NEWSLETTER_TRACKING_SECRET() { return process.env.NEWSLETTER_TRACKING_SECRET },
  get OWNER_EMAIL() { return process.env.OWNER_EMAIL },
  get OWNER_PASSWORD() { return process.env.OWNER_PASSWORD },
}

/** Vars without which the app cannot function at all. */
const REQUIRED = ["DATABASE_URL"] as const

/**
 * Important service credentials — not fatal if absent (a dev box may run
 * without them, and features degrade gracefully), but we log a warning at boot
 * so a misconfigured production deploy is obvious in the logs.
 */
const RECOMMENDED = [
  "OPENAI_API_KEY",
  "YOUTUBE_API_KEY",
  "RESEND_API_KEY",
] as const

export interface EnvValidationResult {
  ok: boolean
  missingRequired: string[]
  missingRecommended: string[]
}

/**
 * Validate configuration at boot. Throws on missing REQUIRED vars (fail fast);
 * returns the report (and console.warns) for missing RECOMMENDED vars. Call
 * once from server instrumentation + the worker entrypoint.
 */
export function validateEnv(opts: { throwOnRequired?: boolean } = {}): EnvValidationResult {
  const throwOnRequired = opts.throwOnRequired ?? true
  const missingRequired = REQUIRED.filter((k) => !get(k))
  const missingRecommended = RECOMMENDED.filter((k) => !get(k))

  if (missingRecommended.length > 0) {
    console.warn(
      `[env] missing recommended config (features will degrade): ${missingRecommended.join(", ")}`,
    )
  }
  if (missingRequired.length > 0) {
    const msg = `[env] missing REQUIRED config: ${missingRequired.join(", ")}`
    if (throwOnRequired) throw new Error(msg)
    console.error(msg)
  }
  return {
    ok: missingRequired.length === 0,
    missingRequired: [...missingRequired],
    missingRecommended: [...missingRecommended],
  }
}
