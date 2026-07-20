/**
 * Khat Brain — AI telemetry.
 *
 * Single, mandatory log of every AI call made by every generator. The
 * AI Router (lib/ai-router) writes one row per task: opens with status
 * "running" before invoking the provider, then updates to "succeeded"
 * or "failed" with latency, tokens, cost, and error metadata.
 *
 * Replaces the per-feature run tables (e.g. guest_candidate_ai_runs)
 * over time. For Phase 1 we coexist with those domain-specific tables —
 * new code writes here; existing tables stay until their generators are
 * migrated.
 */

import { pgTable, text, jsonb, timestamp, integer, real } from "drizzle-orm/pg-core"
import { episodeIntelligenceRecords } from "./eir"
import { khatMapSeasons } from "./khat-map"

/** What the AI is being asked to do — drives model selection. */
export const AI_TASK_KINDS = [
  "structural", // chapters, timestamps, clip cuts, JSON extraction → fast cheap model
  "editorial", // quotes, summaries, ideas, deep analysis → strong model
  "discovery", // hidden-guest search, archetype generation
  "verification", // fact-check, identity confirmation, source check
  "research", // web research synthesis (long context)
  "analysis", // performance / quality analysis
] as const
export type AiTaskKind = (typeof AI_TASK_KINDS)[number]

/**
 * Non-routed telemetry task kinds. These AI calls are logged in `ai_runs`
 * for cost/observability but NEVER pass through `runAiTask` / the registry:
 *   - "transcription" — audio → text (`lib/whisper.ts`); per-minute pricing,
 *     not the chat Responses API.
 *   - "embedding"     — text → vector (`lib/khat-map/learning/embeddings.ts`);
 *     input-only, no output tokens.
 *   - "research_retrieval" — Gemini grounded web search in preparation
 *     (`lib/ai/preparation/research/gemini.ts`, `preparation/identify.ts`);
 *     returns grounding metadata (real URLs + snippets), not the router's
 *     text/JSON contract, so it can't route through `runAiTask`.
 *   - "research_reasoning" — Gemini JSON reasoning over a fixed corpus
 *     (`preparation/research/gemini.ts` synthesizer/verifier passes).
 *   - "guest_identify"     — Gemini grounded identity disambiguation
 *     (`preparation/identify.ts`).
 * They are recorded via `recordAiRun()` (`lib/ai-router/record-run.ts`), so
 * they are DELIBERATELY absent from `DEFAULT_MODELS` / `FALLBACK_CHAINS` /
 * `TASK_TIER` — those stay exhaustive over the registry-routed kinds only,
 * and these must not surface as configurable models in the Settings hub.
 */
export const AI_TELEMETRY_TASK_KINDS = [
  "transcription",
  "embedding",
  "research_retrieval",
  "research_reasoning",
  "guest_identify",
] as const
export type AiTelemetryTaskKind = (typeof AI_TELEMETRY_TASK_KINDS)[number]

/**
 * Every value the `ai_runs.task_kind` column can hold: a registry-routed
 * kind OR a telemetry-only kind. Widen HERE (not `AiTaskKind`) when adding a
 * new non-routed telemetry source, so the registry Records stay exhaustive.
 * The column is free-form `text` (no pgEnum / CHECK), so this is a
 * compile-time-only distinction — no migration is needed to add a kind.
 */
export type AiRunTaskKind = AiTaskKind | AiTelemetryTaskKind

/** Provider identifier. Adapters live in lib/ai-router/providers. */
export const AI_PROVIDERS = ["openai", "gemini", "anthropic"] as const
export type AiProvider = (typeof AI_PROVIDERS)[number]

/** Run lifecycle. */
export const AI_RUN_STATUSES = [
  "running",
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
] as const
export type AiRunStatus = (typeof AI_RUN_STATUSES)[number]

export const aiRuns = pgTable("ai_runs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  // ─── Subject ─────────────────────────────────────────────────────────
  /**
   * Optional EIR scope. When present, this run is reasoning about a
   * specific episode in the pipeline. Most editorial generators set this.
   */
  eir_id: text("eir_id").references(() => episodeIntelligenceRecords.id, {
    onDelete: "set null",
  }),
  /**
   * Production-readiness fix — direct season pointer so per-season cost
   * + quality analytics don't have to join through EIR. Set whenever
   * the run can be attributed to a season (hybrid generation, prep V2,
   * deep analysis on a season-scoped EIR). NULL for purely generic
   * runs (provider health probes, seedless utilities).
   */
  season_id: text("season_id").references(() => khatMapSeasons.id, {
    onDelete: "set null",
  }),
  /**
   * Looser pointer for non-EIR work (e.g. season-level generation,
   * guest-candidate enrichment). Free-form table+id pair so we can
   * reference any row without a dedicated FK per source type.
   */
  subject_table: text("subject_table"),
  subject_id: text("subject_id"),

  // ─── Routing ─────────────────────────────────────────────────────────
  task_kind: text("task_kind").$type<AiRunTaskKind>().notNull(),
  provider: text("provider").$type<AiProvider>().notNull(),
  model_name: text("model_name").notNull(),
  /**
   * Phase 0 — prompt versioning for measurable AI quality.
   *
   * Free-form string set by the caller (or the prompt builder it uses).
   * Recommended shape: "<feature>-vX.Y" (e.g. "hybrid-v1.0").
   *
   * Nullable so legacy call sites that haven't migrated yet keep working;
   * the eval CLI ignores runs without prompt_version when computing per-
   * version comparisons. Once Phase 0.5 completes, every call site that
   * goes through the consolidated prompt builders sets this.
   */
  prompt_version: text("prompt_version"),

  // ─── Payload (truncated/snapshot — NOT a full transcript) ───────────
  prompt_hash: text("prompt_hash"),
  input_snapshot: jsonb("input_snapshot").$type<Record<string, unknown>>(),
  output_snapshot: jsonb("output_snapshot").$type<Record<string, unknown>>(),

  // ─── Lifecycle ───────────────────────────────────────────────────────
  status: text("status")
    .$type<AiRunStatus>()
    .notNull()
    .default("running"),
  started_at: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completed_at: timestamp("completed_at", { withTimezone: true }),
  latency_ms: integer("latency_ms"),

  // ─── Cost accounting ─────────────────────────────────────────────────
  tokens_in: integer("tokens_in"),
  tokens_out: integer("tokens_out"),
  cost_usd: real("cost_usd"),

  // ─── Failure metadata ────────────────────────────────────────────────
  error_class: text("error_class"),
  error_message: text("error_message"),

  // ─── Phase 1.5 — retention bookkeeping ──────────────────────────────
  /**
   * Set to the wall-clock time the retention job nulled out this row's
   * JSONB snapshots (input_snapshot, output_snapshot, prompt_hash,
   * error_message). NULL means the row still has full debugging data.
   *
   * Stripped rows survive forever — preserves prompt_version diversity,
   * cost / latency / token analytics, error_class distribution, and the
   * eir_id / season_id linkage. The retention contract guarantees that
   * stripping is the most a retention pass ever does to ai_runs; no row
   * is ever fully deleted by the job.
   */
  stripped_at: timestamp("stripped_at", { withTimezone: true }),

  // ─── Phase 1.6 — actor attribution for rate limiting ────────────────
  /**
   * Free-form identifier of who/what initiated this run: an admin user
   * id, a cron job name ("retention", "discovery-cron"), an eval runner
   * tag ("eval-runner"), or a server-side automated trigger. NULL when
   * the call site hasn't been migrated yet — the rate-limit policy
   * treats null as the global anonymous actor.
   *
   * Used by the rate limiter to:
   *   • match against the env-var bypass allowlist
   *     (KHAT_RATE_LIMIT_BYPASS_ACTORS=actor1,actor2)
   *   • attribute concurrency / daily-cost decisions in ai_rate_limit_events
   *
   * Free-form text so we don't have to pre-register every cron / job.
   */
  actor_id: text("actor_id"),
})
