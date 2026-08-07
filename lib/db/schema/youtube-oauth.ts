import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core"

/**
 * ── THE CHANNEL OWNER'S GRANT, AND WHY IT NEEDS A TABLE OF ITS OWN ─────────
 * Everything the site shows from YouTube today — views, subscribers, video
 * metadata — comes from `YOUTUBE_API_KEY`, a public key against the Data API.
 * Age bands, country mix and peak hours are NOT public: they are the channel
 * owner's own numbers, they live in the YouTube ANALYTICS API, and Google
 * hands them to no API key of any kind. They require an OAuth grant made by
 * the person who owns the channel.
 *
 * That grant comes back as a REFRESH TOKEN — a long-lived credential that can
 * mint access tokens for as long as it is not revoked. It is the most
 * sensitive string this application stores after the database password.
 *
 * ── WHY NOT `config-store` ────────────────────────────────────────────────
 * `lib/config-store.ts` writes JSON into `config/`, and `config/` IS TRACKED
 * IN GIT (`git ls-files config` lists analytics.json, daily-reflections.json
 * and a dozen more; only three narrow paths are ignored). A refresh token put
 * there is a refresh token committed to the repository — the exact class of
 * accident this project already had to clean up once with a history rewrite.
 * So: the database, encrypted, never the filesystem.
 *
 * ── ONE ROW, BY CONSTRUCTION ──────────────────────────────────────────────
 * There is one channel. `id` is a fixed primary key (`SINGLETON`) rather than
 * a uuid, so a second connect UPSERTs over the first instead of quietly
 * leaving two grants where a later reader picks whichever it finds. Revoking
 * is a delete, and a delete is what "disconnected" means — there is no
 * `is_active` flag to be true while the token is dead.
 */
export const youtubeOauthCredentials = pgTable("youtube_oauth_credentials", {
  /** Always the literal "SINGLETON". See the note above. */
  id: text("id").primaryKey(),

  /**
   * The refresh token, AES-256-GCM. NEVER the plaintext, and never logged.
   * Format is `v1:<iv>:<authTag>:<ciphertext>`, all base64url — versioned so a
   * future key rotation can be told apart from a decrypt failure rather than
   * guessed at. See lib/youtube/token-crypto.ts.
   */
  refresh_token_encrypted: text("refresh_token_encrypted").notNull(),

  /**
   * The scopes Google ACTUALLY granted, not the ones we asked for. A user can
   * untick a scope on the consent screen and Google will still return a
   * token; without this the first analytics call is where we would find out.
   */
  granted_scopes: jsonb("granted_scopes").$type<string[]>().notNull(),

  /** The channel this grant reads. Guards against a grant made by the wrong Google account. */
  channel_id: text("channel_id"),
  /** Which Google account consented — shown in the admin so it can be recognised. */
  google_account_email: text("google_account_email"),

  /** The admin who connected it ("admin:<email>"), for the audit trail. */
  connected_by: text("connected_by"),
  connected_at: timestamp("connected_at", { withTimezone: true }).defaultNow(),

  /**
   * When a call last SUCCEEDED, and when one last failed with why. A grant
   * that Google has revoked keeps looking healthy from the outside — the row
   * is still there and still decrypts — so the admin screen reads these two
   * rather than the row's existence. Nothing in this codebase gets to fail
   * silently again.
   */
  last_used_at: timestamp("last_used_at", { withTimezone: true }),
  last_error: text("last_error"),
  last_error_at: timestamp("last_error_at", { withTimezone: true }),

  updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
})

/**
 * A dated measurement of the audience, as YouTube Analytics reported it.
 *
 * ── WHY THIS IS STORED AND NOT JUST FETCHED ───────────────────────────────
 * `/partner` prints numbers to companies, and its governing rule is that a
 * figure carries its source or it does not appear. A live fetch cannot say
 * WHEN it was true, and "40% from Saudi" over 28 days is a different claim
 * from the same number over the channel's lifetime. The row keeps the window
 * (`period_start`/`period_end`) attached to the numbers it produced, so the
 * page can print the window beside them instead of implying "now, forever".
 *
 * It also means a Google outage degrades to a slightly older measurement with
 * an honest date on it, rather than to a blank section.
 */
export const youtubeAudienceSnapshots = pgTable(
  "youtube_audience_snapshots",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),

    /** `countries` | `age_gender`. One row per report, so one can refresh without the other. */
    report: text("report").notNull(),

    /** The window the numbers describe. Inclusive, YYYY-MM-DD as the API takes them. */
    period_start: text("period_start").notNull(),
    period_end: text("period_end").notNull(),

    /** The rows as returned, already mapped to `{ key, percent }` or `{ key, views }`. */
    data: jsonb("data").$type<unknown>().notNull(),

    measured_at: timestamp("measured_at", { withTimezone: true }).defaultNow(),
  },
  // The only read this table ever serves is "the newest row for this report",
  // so the index is declared HERE rather than in post-schema.sql — a schema
  // that omits it makes `db:generate` propose DROPPING it on the next run,
  // which is exactly what happened the first time this table was written.
  //
  // Plain ascending, no DESC: Postgres reads a btree backwards at the same
  // cost, every other index in this schema is ascending, and a `sql` DESC
  // expression serialises into the snapshot differently from a plain column —
  // a difference that only ever surfaces as a phantom migration later.
  (t) => [index("youtube_audience_snapshots_report_measured_idx").on(t.report, t.measured_at)]
)
