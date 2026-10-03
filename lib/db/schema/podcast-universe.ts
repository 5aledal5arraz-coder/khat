/**
 * Podcast Universe — Milestone 1 (docs/podcast-universe-plan-v1.md §B1).
 *
 * An ISOLATED index of other podcasts' uploads and the people who appeared on
 * them. Nothing here is a Khat guest: `podcast_people` is deliberately a new
 * entity (Decision 8) and only points at `guests` / `guest_candidates` through
 * nullable links when the same real person enters Khat's workflow. No existing
 * table is rewritten by this module (D12).
 *
 * Enumerations are TEXT + a CHECK (not pg enums) so a later milestone can widen
 * them with an additive migration instead of an `ALTER TYPE`.
 *
 * Deviations from the B1 sketch, each additive and chosen under D1 (preserve
 * evidence / auditability):
 *   • `khat_guest_id` / `khat_guest_candidate_id` / `ai_run_id` are TEXT, because
 *     `guests.id`, `guest_candidates.id` and `ai_runs.id` are TEXT in this DB.
 *     `ai_run_id` has no FK: ai_runs rows are rolled up by retention.
 *   • `podcast_episodes.guest_extraction_note` / `_run_id` — B18 requires
 *     "failed with explicit reason"; the reason needs a column.
 *   • `podcast_people.nationality_basis` / `gender_basis` — which rule produced
 *     the status (D9), and the guard that stops a re-derivation from
 *     overwriting an admin's manual decision.
 *   • `podcast_crawl_runs.run_type` also allows `guest_extract`, with
 *     `budget_limit_usd` — Decision 14: every long indexing job carries an
 *     enforced budget, and this is the run table B1 already gave an
 *     `ai_cost_usd` column to.
 *   • `podcast_quota_usage` — B4 application-side quota counters (see below).
 *   • `podcast_person_events` — B16: "all identity changes must be audited".
 *     `admin_audit_logs` targets admin users and swallows its own errors; an
 *     identity correction must not succeed without its audit row.
 */
import { sql } from "drizzle-orm"
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  numeric,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core"
import { guests } from "./guests"
import { guestCandidates } from "./guest-candidates"

// ─── Enumerations (single source for the CHECKs and the TS types) ────────

export const PODCAST_REGISTRY_TYPES = [
  "core_interview",
  "context_coverage",
  "candidate",
  "rejected",
  "dormant",
] as const
export type PodcastRegistryType = (typeof PODCAST_REGISTRY_TYPES)[number]

export const PODCAST_REGISTRY_SOURCES = [
  "khaled",
  "marzouq",
  "manual",
  "youtube_search",
  "index_expansion",
] as const
export type PodcastRegistrySource = (typeof PODCAST_REGISTRY_SOURCES)[number]

export const PODCAST_CHANNEL_VERIFICATION = ["pending", "verified", "rejected"] as const
export type PodcastChannelVerification = (typeof PODCAST_CHANNEL_VERIFICATION)[number]

export const PODCAST_CRAWL_STATUSES = ["never", "running", "complete", "partial", "failed"] as const
export type PodcastChannelCrawlStatus = (typeof PODCAST_CRAWL_STATUSES)[number]

export const PODCAST_DURATION_CLASSES = ["core_longform", "midform_context", "short_clip"] as const
export type PodcastDurationClass = (typeof PODCAST_DURATION_CLASSES)[number]

export const PODCAST_AVAILABILITY = ["public", "unavailable", "deleted", "private", "unknown"] as const
export type PodcastAvailability = (typeof PODCAST_AVAILABILITY)[number]

export const PODCAST_EXTRACTION_STATUSES = [
  "pending",
  "running",
  "succeeded",
  "no_guest",
  "skipped",
  "failed",
] as const
export type PodcastExtractionStatus = (typeof PODCAST_EXTRACTION_STATUSES)[number]

export const PODCAST_CONTENT_KINDS = [
  "guest_interview",
  "panel",
  "solo_host",
  "narrated_story",
  "documentary",
  "other",
  "unclear",
] as const
export type PodcastContentKind = (typeof PODCAST_CONTENT_KINDS)[number]

export const PODCAST_IDENTITY_STATUSES = ["unverified", "probable", "verified", "conflicted"] as const
export type PodcastIdentityStatus = (typeof PODCAST_IDENTITY_STATUSES)[number]

export const PODCAST_EVIDENCE_STATUSES = ["unknown", "probable", "verified", "conflicted"] as const
export type PodcastEvidenceStatus = (typeof PODCAST_EVIDENCE_STATUSES)[number]

export const PODCAST_GENDER_MARKERS = ["male", "female", "unknown"] as const
export type PodcastGenderMarker = (typeof PODCAST_GENDER_MARKERS)[number]

export const PODCAST_LIFE_STATUSES = ["alive", "deceased", "unknown"] as const
export type PodcastLifeStatus = (typeof PODCAST_LIFE_STATUSES)[number]

/** Which rule set the person's nationality / gender status (D9). */
/**
 * `khat_candidate` = a linked guest_candidates row. Its `country` can be
 * LLM-derived (discovery-v2 propose/score), so it is PROBABLE-grade evidence
 * only — never a VERIFIED basis (see chk_podcast_people_verified_*_basis).
 */
export const PODCAST_EVIDENCE_BASES = ["none", "episode_metadata", "khat_candidate", "khat_guest", "manual"] as const
export type PodcastEvidenceBasis = (typeof PODCAST_EVIDENCE_BASES)[number]

/**
 * HOW a VERIFIED nationality was verified (M1 closeout addendum, 2026-10-03).
 * Required whenever nationality_status = 'verified' (CHECK). A manual «كويتي»
 * from the review queue is `manual_editorial`.
 */
export const PODCAST_NAT_VERIFICATION_METHODS = ["source_evidence", "existing_khat_record", "manual_editorial"] as const
export type PodcastNatVerificationMethod = (typeof PODCAST_NAT_VERIFICATION_METHODS)[number]

export const PODCAST_ALIAS_SOURCES = ["episode", "manual", "wikidata", "khat_guest", "verification"] as const
export type PodcastAliasSource = (typeof PODCAST_ALIAS_SOURCES)[number]

export const PODCAST_EXTRACTION_SOURCES = ["metadata_ai", "metadata_rule", "transcript", "manual"] as const
export type PodcastExtractionSource = (typeof PODCAST_EXTRACTION_SOURCES)[number]

export const PODCAST_EVIDENCE_FIELDS = ["title", "description", "transcript", "manual"] as const
export type PodcastEvidenceField = (typeof PODCAST_EVIDENCE_FIELDS)[number]

/**
 * `rejected`   — an operator (or a deterministic rule) unlinked it.
 * `superseded` — a later successful re-extraction of the same episode did not
 *                reproduce it (re-extraction REPLACES, it never adds on top).
 * Neither is ever deleted; neither counts anywhere (INACTIVE_APPEARANCE_STATUSES).
 */
export const PODCAST_APPEARANCE_STATUSES = ["extracted", "verified", "review", "rejected", "superseded"] as const
export const INACTIVE_APPEARANCE_STATUSES = ["rejected", "superseded"] as const
export type PodcastAppearanceStatus = (typeof PODCAST_APPEARANCE_STATUSES)[number]

export const PODCAST_RUN_TYPES = [
  "initial",
  "incremental",
  "metadata_refresh",
  "channel_verify",
  "guest_extract",
] as const
export type PodcastRunType = (typeof PODCAST_RUN_TYPES)[number]

export const PODCAST_RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "partial",
  "failed",
  "budget_stopped",
] as const
export type PodcastRunStatus = (typeof PODCAST_RUN_STATUSES)[number]

/** `col IN ('a','b')` for a CHECK. Values are compile-time constants above. */
function inList(col: string, values: readonly string[]) {
  return sql.raw(`${col} IN (${values.map((v) => `'${v}'`).join(", ")})`)
}

// ─── 1. podcast_channels ─────────────────────────────────────────────────

export const podcastChannels = pgTable(
  "podcast_channels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: text("platform").notNull().default("youtube"),
    /**
     * Canonical UC… id. NULL only while a handle-only seed awaits
     * verification (channels.list forHandle fills it).
     */
    youtube_channel_id: text("youtube_channel_id"),
    handle: text("handle"),
    name: text("name").notNull(),
    country_code: text("country_code"),
    default_language: text("default_language"),
    registry_type: text("registry_type").$type<PodcastRegistryType>().notNull(),
    registry_source: text("registry_source").$type<PodcastRegistrySource>().notNull(),
    verification_status: text("verification_status")
      .$type<PodcastChannelVerification>()
      .notNull()
      .default("pending"),
    uploads_playlist_id: text("uploads_playlist_id"),
    subscriber_count: bigint("subscriber_count", { mode: "number" }),
    reported_video_count: bigint("reported_video_count", { mode: "number" }),
    last_crawled_at: timestamp("last_crawled_at", { withTimezone: true }),
    last_successful_crawl_at: timestamp("last_successful_crawl_at", { withTimezone: true }),
    latest_known_video_id: text("latest_known_video_id"),
    latest_known_published_at: timestamp("latest_known_published_at", { withTimezone: true }),
    crawl_status: text("crawl_status").$type<PodcastChannelCrawlStatus>().notNull().default("never"),
    /**
     * Addendum 2 (c): the channel's hosts, filled MANUALLY (or by accepting a
     * HOST_CANDIDATE_REVIEW suggestion). Excluded deterministically by the
     * extraction validator — a host is never a guest of their own channel.
     */
    host_names: text("host_names").array().notNull().default(sql`'{}'::text[]`),
    /**
     * Program-scoped hosts: a channel like ثمانية or Alphacast carries many
     * programs, and a program's host can be a real GUEST on another program
     * of the same channel (محمد آل جابر hosts «جادي», guests on «فنجان»).
     * `[{ program: "بودكاست جادي", hosts: ["محمد آل جابر", …] }]` — applies
     * only to episodes whose title contains `program`. Filled manually.
     */
    program_hosts: jsonb("program_hosts").$type<Array<{ program: string; hosts: string[] }>>().notNull().default([]),
    /** Operator pause (B14 «Pause»): no crawl job starts while true. */
    paused: boolean("paused").notNull().default(false),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_podcast_channels_youtube_id").on(t.youtube_channel_id),
    uniqueIndex("uq_podcast_channels_handle").on(t.handle).where(sql`handle IS NOT NULL`),
    index("idx_podcast_channels_registry_type").on(t.registry_type),
    index("idx_podcast_channels_verification").on(t.verification_status),
    check("chk_podcast_channels_platform", sql`platform = 'youtube'`),
    check("chk_podcast_channels_registry_type", inList("registry_type", PODCAST_REGISTRY_TYPES)),
    check("chk_podcast_channels_registry_source", inList("registry_source", PODCAST_REGISTRY_SOURCES)),
    check("chk_podcast_channels_verification", inList("verification_status", PODCAST_CHANNEL_VERIFICATION)),
    check("chk_podcast_channels_crawl_status", inList("crawl_status", PODCAST_CRAWL_STATUSES)),
    check("chk_podcast_channels_has_key", sql`youtube_channel_id IS NOT NULL OR handle IS NOT NULL`),
  ],
)

// ─── 2. podcast_episodes ─────────────────────────────────────────────────

export const podcastEpisodes = pgTable(
  "podcast_episodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel_id: uuid("channel_id")
      .notNull()
      .references(() => podcastChannels.id, { onDelete: "restrict" }),
    youtube_video_id: text("youtube_video_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    published_at: timestamp("published_at", { withTimezone: true }).notNull(),
    duration_seconds: integer("duration_seconds").notNull(),
    view_count: bigint("view_count", { mode: "number" }),
    view_count_checked_at: timestamp("view_count_checked_at", { withTimezone: true }),
    language: text("language"),
    duration_class: text("duration_class").$type<PodcastDurationClass>().notNull(),
    availability_status: text("availability_status").$type<PodcastAvailability>().notNull().default("public"),
    guest_extraction_status: text("guest_extraction_status")
      .$type<PodcastExtractionStatus>()
      .notNull()
      .default("pending"),
    /** Why an extraction failed / was skipped — never a bare `failed` (B18, D8). */
    guest_extraction_note: text("guest_extraction_note"),
    /** The guest_extract run that last touched this episode. */
    guest_extraction_run_id: uuid("guest_extraction_run_id"),
    content_kind: text("content_kind").$type<PodcastContentKind>(),
    metadata_hash: text("metadata_hash"),
    raw_metadata: jsonb("raw_metadata").$type<Record<string, unknown>>(),
    first_seen_at: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_podcast_episodes_video_id").on(t.youtube_video_id),
    index("idx_podcast_episodes_channel_published").on(t.channel_id, t.published_at.desc()),
    index("idx_podcast_episodes_class_extraction").on(t.duration_class, t.guest_extraction_status),
    index("idx_podcast_episodes_published").on(t.published_at),
    check("chk_podcast_episodes_duration_nonneg", sql`duration_seconds >= 0`),
    check("chk_podcast_episodes_duration_class", inList("duration_class", PODCAST_DURATION_CLASSES)),
    check("chk_podcast_episodes_availability", inList("availability_status", PODCAST_AVAILABILITY)),
    check("chk_podcast_episodes_extraction", inList("guest_extraction_status", PODCAST_EXTRACTION_STATUSES)),
    check(
      "chk_podcast_episodes_content_kind",
      sql.raw(`content_kind IS NULL OR content_kind IN (${PODCAST_CONTENT_KINDS.map((v) => `'${v}'`).join(", ")})`),
    ),
  ],
)

// ─── 3. podcast_people ───────────────────────────────────────────────────

export const podcastPeople = pgTable(
  "podcast_people",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    canonical_name: text("canonical_name").notNull(),
    normalized_name_key: text("normalized_name_key").notNull(),
    identity_status: text("identity_status").$type<PodcastIdentityStatus>().notNull().default("unverified"),
    nationality_code: text("nationality_code"),
    nationality_status: text("nationality_status").$type<PodcastEvidenceStatus>().notNull().default("unknown"),
    nationality_basis: text("nationality_basis").$type<PodcastEvidenceBasis>().notNull().default("none"),
    nationality_verification_method: text("nationality_verification_method").$type<PodcastNatVerificationMethod>(),
    gender_marker: text("gender_marker").$type<PodcastGenderMarker>().notNull().default("unknown"),
    gender_status: text("gender_status").$type<PodcastEvidenceStatus>().notNull().default("unknown"),
    gender_basis: text("gender_basis").$type<PodcastEvidenceBasis>().notNull().default("none"),
    life_status: text("life_status").$type<PodcastLifeStatus>().notNull().default("unknown"),
    wikidata_id: text("wikidata_id"),
    khat_guest_id: text("khat_guest_id").references(() => guests.id, { onDelete: "set null" }),
    khat_guest_candidate_id: text("khat_guest_candidate_id").references(() => guestCandidates.id, {
      onDelete: "set null",
    }),
    /**
     * Set when this person was merged into another (B16 «merge verified
     * duplicate»). The row is kept — never deleted — and its appearances move.
     */
    merged_into_person_id: uuid("merged_into_person_id"),
    needs_identity_review: boolean("needs_identity_review").notNull().default(false),
    identity_notes: text("identity_notes"),
    first_seen_at: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    last_verified_at: timestamp("last_verified_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_podcast_people_name_key").on(t.normalized_name_key),
    index("idx_podcast_people_nationality").on(t.nationality_code),
    index("idx_podcast_people_nationality_gender").on(t.nationality_code, t.gender_marker),
    index("idx_podcast_people_khat_guest").on(t.khat_guest_id),
    index("idx_podcast_people_khat_candidate").on(t.khat_guest_candidate_id),
    index("idx_podcast_people_needs_review").on(t.needs_identity_review),
    check("chk_podcast_people_identity", inList("identity_status", PODCAST_IDENTITY_STATUSES)),
    check("chk_podcast_people_nat_status", inList("nationality_status", PODCAST_EVIDENCE_STATUSES)),
    check("chk_podcast_people_nat_basis", inList("nationality_basis", PODCAST_EVIDENCE_BASES)),
    check("chk_podcast_people_gender_marker", inList("gender_marker", PODCAST_GENDER_MARKERS)),
    check("chk_podcast_people_gender_status", inList("gender_status", PODCAST_EVIDENCE_STATUSES)),
    check("chk_podcast_people_gender_basis", inList("gender_basis", PODCAST_EVIDENCE_BASES)),
    check("chk_podcast_people_life", inList("life_status", PODCAST_LIFE_STATUSES)),
    // Decision 3 / B18 at the storage layer: a VERIFIED nationality can only
    // come from a trusted Khat record or a human decision — never from episode
    // metadata (that tops out at PROBABLE).
    check(
      "chk_podcast_people_verified_nat_basis",
      sql`nationality_status <> 'verified' OR nationality_basis IN ('khat_guest', 'manual')`,
    ),
    check(
      "chk_podcast_people_nat_method",
      sql.raw(
        `nationality_verification_method IS NULL OR nationality_verification_method IN (${PODCAST_NAT_VERIFICATION_METHODS.map((v) => `'${v}'`).join(", ")})`,
      ),
    ),
    // verified ⇒ we recorded HOW (addendum). Together with the basis CHECK
    // above, metadata can still never produce a verified nationality.
    check(
      "chk_podcast_people_verified_has_method",
      sql`nationality_status <> 'verified' OR nationality_verification_method IS NOT NULL`,
    ),
    check(
      "chk_podcast_people_method_basis",
      sql`nationality_verification_method IS NULL
        OR (nationality_verification_method = 'manual_editorial' AND nationality_basis = 'manual')
        OR (nationality_verification_method = 'existing_khat_record' AND nationality_basis = 'khat_guest')
        OR (nationality_verification_method = 'source_evidence' AND nationality_basis IN ('manual', 'khat_guest'))`,
    ),
    check(
      "chk_podcast_people_verified_gender_basis",
      sql`gender_status <> 'verified' OR gender_basis IN ('khat_guest', 'manual')`,
    ),
  ],
)

// ─── 4. podcast_person_aliases ───────────────────────────────────────────

export const podcastPersonAliases = pgTable(
  "podcast_person_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    person_id: uuid("person_id")
      .notNull()
      .references(() => podcastPeople.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalized_alias: text("normalized_alias").notNull(),
    source: text("source").$type<PodcastAliasSource>().notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_podcast_person_aliases_normalized").on(t.normalized_alias),
    uniqueIndex("uq_podcast_person_aliases_person_alias").on(t.person_id, t.normalized_alias),
    check("chk_podcast_person_aliases_source", inList("source", PODCAST_ALIAS_SOURCES)),
  ],
)

// ─── 5. podcast_guest_appearances ────────────────────────────────────────

export const podcastGuestAppearances = pgTable(
  "podcast_guest_appearances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    person_id: uuid("person_id")
      .notNull()
      .references(() => podcastPeople.id, { onDelete: "restrict" }),
    episode_id: uuid("episode_id")
      .notNull()
      .references(() => podcastEpisodes.id, { onDelete: "restrict" }),
    is_primary_guest: boolean("is_primary_guest").notNull().default(false),
    role_text: text("role_text"),
    extraction_source: text("extraction_source").$type<PodcastExtractionSource>().notNull(),
    extraction_confidence: numeric("extraction_confidence", { precision: 4, scale: 3 }).notNull(),
    evidence_field: text("evidence_field").$type<PodcastEvidenceField>().notNull(),
    evidence_text: text("evidence_text"),
    /** The name exactly as the episode metadata wrote it (pre-normalization). */
    display_name: text("display_name"),
    nationality_claim_code: text("nationality_claim_code"),
    nationality_claim_text: text("nationality_claim_text"),
    gender_signal: text("gender_signal").$type<PodcastGenderMarker>().notNull().default("unknown"),
    gender_evidence_text: text("gender_evidence_text"),
    topic_hint: text("topic_hint"),
    /**
     * extracted  — evidenced appearance, identity linked automatically (no namesake).
     * review     — the appearance is fully evidenced, but it was attached to a NEW
     *              person record because another person already has the same name
     *              (B8 namesake rule); the identity awaits a human merge/keep decision.
     * verified / rejected / superseded — see PODCAST_APPEARANCE_STATUSES.
     */
    verification_status: text("verification_status")
      .$type<PodcastAppearanceStatus>()
      .notNull()
      .default("extracted"),
    ai_run_id: text("ai_run_id"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_podcast_appearances_person_episode").on(t.person_id, t.episode_id),
    index("idx_podcast_appearances_person").on(t.person_id),
    index("idx_podcast_appearances_episode").on(t.episode_id),
    index("idx_podcast_appearances_verification").on(t.verification_status),
    index("idx_podcast_appearances_primary").on(t.is_primary_guest),
    check("chk_podcast_appearances_source", inList("extraction_source", PODCAST_EXTRACTION_SOURCES)),
    check("chk_podcast_appearances_field", inList("evidence_field", PODCAST_EVIDENCE_FIELDS)),
    check("chk_podcast_appearances_gender", inList("gender_signal", PODCAST_GENDER_MARKERS)),
    check("chk_podcast_appearances_status", inList("verification_status", PODCAST_APPEARANCE_STATUSES)),
    check(
      "chk_podcast_appearances_confidence",
      sql`extraction_confidence >= 0 AND extraction_confidence <= 1`,
    ),
  ],
)

// ─── 6. podcast_crawl_runs ───────────────────────────────────────────────

export const podcastCrawlRuns = pgTable(
  "podcast_crawl_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel_id: uuid("channel_id").references(() => podcastChannels.id, { onDelete: "set null" }),
    run_type: text("run_type").$type<PodcastRunType>().notNull(),
    status: text("status").$type<PodcastRunStatus>().notNull().default("queued"),
    started_at: timestamp("started_at", { withTimezone: true }),
    completed_at: timestamp("completed_at", { withTimezone: true }),
    playlist_pages: integer("playlist_pages").notNull().default(0),
    video_ids_seen: integer("video_ids_seen").notNull().default(0),
    episodes_inserted: integer("episodes_inserted").notNull().default(0),
    episodes_updated: integer("episodes_updated").notNull().default(0),
    /** YouTube quota UNITS — never dollars (D10). */
    youtube_read_units: integer("youtube_read_units").notNull().default(0),
    youtube_search_calls: integer("youtube_search_calls").notNull().default(0),
    /** AI dollars — never quota units (D10). */
    ai_cost_usd: numeric("ai_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    /**
     * Money RESERVED for an in-flight paid call (its worst-case estimate),
     * released when the call returns. The hard cap counts actual recorded
     * cost (ai_cost_usd) + open reservations; a call that bills nothing
     * (429 / no credits) releases its reservation and costs 0.
     */
    reserved_usd: numeric("reserved_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    /** Hard cap for a guest_extract run (Decision 14 / B13); null for crawl runs. */
    budget_limit_usd: numeric("budget_limit_usd", { precision: 12, scale: 6 }),
    cursor_state: jsonb("cursor_state").$type<Record<string, unknown>>(),
    error_summary: text("error_summary"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_podcast_crawl_runs_channel").on(t.channel_id, t.created_at.desc()),
    index("idx_podcast_crawl_runs_created").on(t.created_at),
    // At most ONE active guest_extract run: two concurrent «ابدأ» clicks must
    // not create two runs (two budgets, two chains over the same episodes).
    uniqueIndex("uq_podcast_crawl_runs_active_extract")
      .on(t.run_type)
      .where(sql`run_type = 'guest_extract' AND status IN ('queued', 'running')`),
    check("chk_podcast_crawl_runs_type", inList("run_type", PODCAST_RUN_TYPES)),
    check("chk_podcast_crawl_runs_status", inList("status", PODCAST_RUN_STATUSES)),
  ],
)

// ─── 7. podcast_person_events — identity audit trail (B16) ───────────────

export const podcastPersonEvents = pgTable(
  "podcast_person_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // RESTRICT: an audit trail must not vanish with its subject. People are
    // never deleted by this module (merge/unlink are statuses), so this only
    // ever blocks an out-of-band delete.
    person_id: uuid("person_id")
      .notNull()
      .references(() => podcastPeople.id, { onDelete: "restrict" }),
    /** add_alias | unlink_appearance | merge | split | link_khat_guest | … */
    action: text("action").notNull(),
    /** admin_users.id of the operator, or `system:<job>` for automated changes. */
    actor_id: text("actor_id"),
    before_state: jsonb("before_state").$type<Record<string, unknown>>(),
    after_state: jsonb("after_state").$type<Record<string, unknown>>(),
    note: text("note"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_podcast_person_events_person").on(t.person_id, t.created_at.desc())],
)

// ─── 8. podcast_quota_usage — application-side YouTube quota ledger (B4) ──

/**
 * One row per (Pacific quota day, kind). The crawler reserves units here
 * BEFORE each YouTube call with a single conditional UPSERT, so two crawls
 * running at once cannot overshoot the cap (the row lock serialises them) and
 * a run that spans midnight is charged to the day the call was made — which a
 * SUM over `podcast_crawl_runs` by created_at could not do. Units, never
 * dollars (D10). `kind`: 'read' (2,000/day) | 'search' (20 calls/day).
 */
export const podcastQuotaUsage = pgTable(
  "podcast_quota_usage",
  {
    /** The YouTube quota day — midnight America/Los_Angeles, as a DATE. */
    quota_day: text("quota_day").notNull(),
    kind: text("kind").notNull(),
    units: integer("units").notNull().default(0),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_podcast_quota_usage_day_kind").on(t.quota_day, t.kind),
    check("chk_podcast_quota_usage_kind", sql`kind IN ('read', 'search')`),
    check("chk_podcast_quota_usage_units", sql`units >= 0`),
  ],
)
