/**
 * Khat Brain — AI Router types.
 *
 * Provider-agnostic surface. Generators describe WHAT they want
 * (task_kind, prompt, input) and the router decides HOW to execute it
 * (which provider, which model, retries, telemetry).
 */

import type {
  AiTaskKind,
  AiProvider,
  AiRunStatus,
} from "@/lib/db/schema/ai-runs"
import type { JsonRepairStage } from "@/lib/ai/json-repair"

export type { AiTaskKind, AiProvider, AiRunStatus }
export type { JsonRepairStage }

/**
 * Reasoning effort for GPT-5-family (and other reasoning) models.
 * Mirrors the OpenAI Responses API union minus "minimal" (legacy gpt-5.0
 * alias) and "max" (needs an SDK ≥ 6.19 type; use "xhigh" until then).
 * Ignored by providers/models without a reasoning dial.
 */
export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh"

/**
 * Single shape every generator passes through `runAiTask`. Keep it
 * intentionally minimal — provider-specific options (e.g. `temperature`,
 * `response_format`) live on `provider_options`.
 */
export interface AiTaskRequest {
  /** Optional EIR scope for this call. */
  eirId?: string | null
  /**
   * Production-readiness fix sprint — direct season pointer so per-season
   * cost / quality reporting doesn't have to join through eir_id. Set
   * whenever the call is attributable to a season (hybrid generation,
   * prep V2, etc.).
   */
  seasonId?: string | null
  /** Free-form subject pointer for non-EIR calls. */
  subjectTable?: string | null
  subjectId?: string | null

  taskKind: AiTaskKind
  /** Structured input snapshot logged into ai_runs.input_snapshot. */
  input: Record<string, unknown>
  /**
   * The prompt body. Either a single string (system + user combined) or
   * an array of {role, content} pairs. The adapter reshapes for its
   * provider.
   */
  prompt: PromptInput

  /** Force a provider; defaults to router decision. */
  preferredProvider?: AiProvider
  /** Force a model name; defaults to router decision. */
  preferredModel?: string

  /**
   * Phase 0 — prompt version string written to ai_runs.prompt_version.
   *
   * Set this whenever the call uses a versioned prompt (the consolidated
   * builders in lib/ai/prompts/* export `VERSION` for this purpose). The
   * eval CLI filters baselines by prompt_version, so leaving this null
   * means the run is invisible to A/B comparisons. Legacy inline prompts
   * that haven't been versioned yet can omit it without breaking anything.
   */
  promptVersion?: string | null

  /**
   * Whether the response should be parsed as JSON. When true, the router
   * sets `response_format: json_object` (OpenAI) and stamps the parsed
   * value into `output_snapshot.json`.
   */
  expectJson?: boolean

  /** Provider-specific tuning (temperature, max_tokens, etc.). */
  providerOptions?: Record<string, unknown>

  /** Override max latency before timed_out. Default: 120_000 ms. */
  timeoutMs?: number

  /**
   * Max retries on a *transient* adapter failure (rate-limit, timeout,
   * 5xx / network). Total attempts = 1 + maxRetries. Retries use
   * exponential backoff with jitter and stay within the same ai_runs row
   * and rate-limit permit. Non-transient failures (quota_exceeded,
   * auth_failed) are never retried. Default: 2.
   */
  maxRetries?: number

  /**
   * Phase 1.6 — actor attribution for rate limiting.
   *
   * Free-form id of who/what initiated this call: an admin user id
   * (e.g. the `id` column from `admin_users`), a cron job name
   * ("retention", "discovery-cron"), or an eval tag ("eval-runner").
   * Written to `ai_runs.actor_id` and `ai_rate_limit_events.actor_id`.
   *
   * NULL is permitted and means "anonymous / unattributed" — the rate
   * limiter still counts these against the global tier limits, but the
   * actor allowlist won't match.
   */
  actorId?: string | null

  /**
   * Phase 1.6 — per-call rate-limit bypass.
   *
   * Set to `true` only for callers that have an independent throttle
   * (background workers with their own concurrency control, retention
   * job, evals, scheduled-task framework). The bypass is audited in
   * `ai_rate_limit_events` with decision='bypassed_call' so misuse is
   * visible. Defaults to `false`.
   */
  bypassRateLimit?: boolean
}

export type PromptInput = string | PromptMessage[]

export interface PromptMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface AiTaskResult<TParsed = unknown> {
  /** ai_runs.id — caller can correlate logs. */
  runId: string
  status: AiRunStatus
  /** Raw text from the provider (model output). */
  rawText: string | null
  /** Parsed JSON when `expectJson: true`; otherwise null. */
  parsed: TParsed | null
  provider: AiProvider
  modelName: string
  latencyMs: number
  tokensIn: number | null
  tokensOut: number | null
  costUsd: number | null
  errorClass: string | null
  errorMessage: string | null
  /**
   * How many retries were spent before the (final) attempt. 0 means the
   * first attempt succeeded or failed non-transiently.
   */
  retryCount: number
  /**
   * When `expectJson` and the provider's JSON needed recovery, the stage
   * that salvaged it (`sanitize` | `extract_block` | `truncation_repair`).
   * `null` means the response parsed strictly (or wasn't JSON). Surfaces
   * silent provider degradation that would otherwise be invisible.
   */
  jsonRepairStage: JsonRepairStage | null
}

/**
 * Provider adapter contract. Each provider (OpenAI, Gemini, Anthropic)
 * implements this. Router calls adapter.execute() and writes the result
 * into ai_runs.
 */
export interface ProviderAdapter {
  readonly provider: AiProvider
  /** Whether this adapter is usable in the current environment (env vars set). */
  isAvailable(): boolean
  execute(req: ResolvedRequest): Promise<AdapterResult>
}

export interface ResolvedRequest {
  modelName: string
  prompt: PromptMessage[]
  expectJson: boolean
  providerOptions: Record<string, unknown>
  timeoutMs: number
  /**
   * Task-kind default reasoning effort resolved by the router from the
   * registry. Callers override per-call via
   * `providerOptions.reasoningEffort`. Adapters for providers without a
   * reasoning dial ignore it.
   */
  reasoningEffort?: ReasoningEffort
}

export interface AdapterResult {
  rawText: string
  tokensIn: number | null
  tokensOut: number | null
  costUsd: number | null
}
