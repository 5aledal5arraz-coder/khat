/**
 * Dynamic model selection — the policy layer between the static registry
 * and the live OpenAI account.
 *
 * Resolution order for the default OpenAI path (per task kind):
 *
 *   1. per-call `preferredModel`             — code-level, used verbatim
 *      (handled in router.ts before this module is consulted)
 *   2. env override   KHAT_AI_MODEL_<KIND>   — operator pin on the box
 *   3. config override (admin Settings → AI) — config_store key
 *      `ai_model_overrides`, editable live, no deploy needed
 *   4. registry default                       — FALLBACK_CHAINS[kind][0]
 *
 * Whatever wins is then checked against the live model catalog
 * (model-catalog.ts). If it isn't available to this API key, we walk the
 * task's fallback chain to the first available model and log the reason
 * once per process. If the catalog itself is unavailable we fail open and
 * use the selection unchecked — catalog problems must never block AI.
 *
 * Adopting a future model (e.g. gpt-5.7-sol) therefore requires ZERO code
 * changes: set the override in Settings (optionally with pricing so
 * cost telemetry stays accurate) or export KHAT_AI_MODEL_EDITORIAL=… .
 * Full strategy doc: docs/ai-model-selection.md
 *
 * Storage + caching mirror runtime-config.ts (15s TTL, fail-safe reads).
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { configStore } from "@/lib/db/schema/system"
import type { AiTaskKind, ReasoningEffort } from "./types"
import {
  DEFAULT_MODELS,
  FALLBACK_CHAINS,
  lookupPricing,
  registerRuntimePricing,
} from "./registry"
import {
  getModelCatalog,
  relevantTextModels,
  detectGptFamilies,
  newerFamilyThanKnown,
  type GptFamily,
} from "./model-catalog"

const CONFIG_KEY = "ai_model_overrides"
const CACHE_TTL_MS = 15_000

export const AI_TASK_KINDS = Object.keys(DEFAULT_MODELS) as AiTaskKind[]

const EFFORTS: ReadonlySet<string> = new Set(["none", "low", "medium", "high", "xhigh"])
/** API model ids (incl. fine-tune ids like "ft:gpt-…:org:suffix:id"). */
const MODEL_ID_RE = /^[a-zA-Z0-9._:-]{1,120}$/

// ─── Override storage (config_store, admin-editable) ────────────────────────

export interface TaskModelOverride {
  model: string | null
  reasoningEffort: ReasoningEffort | null
  /** Optional pricing so cost telemetry works for models the registry
   *  doesn't know yet. USD per 1M tokens. */
  inputCostPer1M: number | null
  outputCostPer1M: number | null
}

export type AiModelOverrides = Partial<Record<AiTaskKind, TaskModelOverride>>

function sanitizeOverride(raw: unknown): TaskModelOverride | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const model =
    typeof o.model === "string" && MODEL_ID_RE.test(o.model.trim())
      ? o.model.trim()
      : null
  const reasoningEffort =
    typeof o.reasoningEffort === "string" && EFFORTS.has(o.reasoningEffort)
      ? (o.reasoningEffort as ReasoningEffort)
      : null
  const cost = (v: unknown) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const inputCostPer1M = cost(o.inputCostPer1M)
  const outputCostPer1M = cost(o.outputCostPer1M)
  if (!model && !reasoningEffort) return null
  return { model, reasoningEffort, inputCostPer1M, outputCostPer1M }
}

function sanitizeOverrides(raw: unknown): AiModelOverrides {
  const out: AiModelOverrides = {}
  if (!raw || typeof raw !== "object") return out
  for (const kind of AI_TASK_KINDS) {
    const o = sanitizeOverride((raw as Record<string, unknown>)[kind])
    if (o) out[kind] = o
  }
  return out
}

let overridesCache: { value: AiModelOverrides; at: number } | null = null

export function invalidateModelOverridesCache(): void {
  overridesCache = null
}

export async function readAiModelOverrides(opts?: {
  fresh?: boolean
}): Promise<AiModelOverrides> {
  if (!opts?.fresh && overridesCache && Date.now() - overridesCache.at < CACHE_TTL_MS) {
    return overridesCache.value
  }
  if (!db) return {}
  try {
    const rows = await db
      .select({ value: configStore.value })
      .from(configStore)
      .where(eq(configStore.key, CONFIG_KEY))
      .limit(1)
    const value = sanitizeOverrides(rows[0]?.value)
    overridesCache = { value, at: Date.now() }
    return value
  } catch {
    // Fail-safe: never let a settings lookup break the AI hot path.
    return overridesCache?.value ?? {}
  }
}

/** Set (or clear, with null) one task kind's override. */
export async function writeAiModelOverride(
  taskKind: AiTaskKind,
  override: TaskModelOverride | null,
): Promise<void> {
  if (!db) throw new Error("Database not available")
  const current = await readAiModelOverrides({ fresh: true })
  const next: AiModelOverrides = { ...current }
  const sanitized = override ? sanitizeOverride(override) : null
  if (sanitized) next[taskKind] = sanitized
  else delete next[taskKind]
  await db
    .insert(configStore)
    .values({ key: CONFIG_KEY, value: next })
    .onConflictDoUpdate({
      target: configStore.key,
      set: { value: next, updated_at: new Date() },
    })
  invalidateModelOverridesCache()
}

// ─── Selection (pure core + IO shell) ────────────────────────────────────────

export type ModelSelectionSource = "env" | "config" | "default" | "fallback"

export interface PickedModel {
  modelName: string
  source: ModelSelectionSource
  /** What was asked for before availability checking. */
  requestedModel: string
  /** Set when requestedModel ≠ modelName (or fail-open kept it). */
  fallbackReason: string | null
}

/**
 * Pure selection: compose env > config > default, then availability-check
 * against the catalog and walk the fallback chain. Unit-tested directly.
 */
export function pickModel(input: {
  chain: readonly string[]
  envModel: string | null
  overrideModel: string | null
  catalogIds: ReadonlySet<string> | null
}): PickedModel {
  const { chain, envModel, overrideModel, catalogIds } = input
  const requestedModel = envModel ?? overrideModel ?? chain[0]
  const baseSource: ModelSelectionSource = envModel
    ? "env"
    : overrideModel
      ? "config"
      : "default"

  // Catalog unknown → fail open: use the selection unchecked.
  if (!catalogIds) {
    return { modelName: requestedModel, source: baseSource, requestedModel, fallbackReason: null }
  }
  if (catalogIds.has(requestedModel)) {
    return { modelName: requestedModel, source: baseSource, requestedModel, fallbackReason: null }
  }
  for (const candidate of chain) {
    if (candidate === requestedModel) continue
    if (catalogIds.has(candidate)) {
      return {
        modelName: candidate,
        source: "fallback",
        requestedModel,
        fallbackReason: `"${requestedModel}" is not available to this API key — fell back to "${candidate}"`,
      }
    }
  }
  // Nothing in the chain is available either — fail open with the request
  // (a provider 404 is more honest than inventing a model).
  return {
    modelName: requestedModel,
    source: baseSource,
    requestedModel,
    fallbackReason: `"${requestedModel}" and the whole fallback chain are unavailable to this key — using it anyway (fail-open)`,
  }
}

function envModelFor(taskKind: AiTaskKind): string | null {
  const v = process.env[`KHAT_AI_MODEL_${taskKind.toUpperCase()}`]?.trim()
  return v && MODEL_ID_RE.test(v) ? v : null
}

export interface ResolvedModelChoice extends PickedModel {
  reasoningEffort?: ReasoningEffort
}

/** Log each distinct fallback once per process, not once per AI call. */
const warnedFallbacks = new Set<string>()

/**
 * Resolve the effective OpenAI model for a task kind. Used by the router
 * on the default path (no per-call preferredModel) and by diagnostics.
 * Never throws.
 */
export async function resolveModelChoice(
  taskKind: AiTaskKind,
): Promise<ResolvedModelChoice> {
  const chain = FALLBACK_CHAINS[taskKind]
  const [overrides, catalog] = await Promise.all([
    readAiModelOverrides(),
    getModelCatalog(),
  ])
  const override = overrides[taskKind]
  const picked = pickModel({
    chain,
    envModel: envModelFor(taskKind),
    overrideModel: override?.model ?? null,
    catalogIds: catalog.ids,
  })

  if (picked.fallbackReason) {
    const key = `${taskKind}:${picked.requestedModel}→${picked.modelName}`
    if (!warnedFallbacks.has(key)) {
      warnedFallbacks.add(key)
      console.warn(`[ai-router] ${taskKind}: ${picked.fallbackReason}`)
    }
  }

  // Register override pricing so ai_runs cost accounting keeps working
  // for models the static registry doesn't know yet.
  if (
    override?.model === picked.modelName &&
    override.inputCostPer1M !== null &&
    override.outputCostPer1M !== null
  ) {
    registerRuntimePricing("openai", picked.modelName, {
      inputCostPer1M: override.inputCostPer1M,
      outputCostPer1M: override.outputCostPer1M,
    })
  }

  return {
    ...picked,
    reasoningEffort: override?.reasoningEffort ?? DEFAULT_MODELS[taskKind].reasoningEffort,
  }
}

// ─── Diagnostics snapshot (settings AI tab + `npm run ai:models`) ────────────
// Fully JSON-serializable — it crosses the server→client component boundary.

export interface AiModelsCatalogDiagnostics {
  refreshedAt: string | null
  lastAttemptAt: string | null
  lastError: string | null
  stale: boolean
  /** null = catalog never fetched (availability checks fail open). */
  textModelCount: number | null
  /** Relevant text-model ids — feeds the override editor's datalist. */
  textModels: string[]
  families: GptFamily[]
  /** A GPT family newer than the chains know about, e.g. "5.7". */
  newerFamily: string | null
}

export interface AiModelsTaskDiagnostics {
  taskKind: AiTaskKind
  chain: readonly string[]
  envModel: string | null
  override: TaskModelOverride | null
  effective: ResolvedModelChoice
  pricingKnown: boolean
}

export interface AiModelsDiagnostics {
  catalog: AiModelsCatalogDiagnostics
  tasks: AiModelsTaskDiagnostics[]
}

export async function getAiModelsDiagnostics(opts?: {
  forceRefresh?: boolean
}): Promise<AiModelsDiagnostics> {
  const catalog = await getModelCatalog({ forceRefresh: opts?.forceRefresh })
  const overrides = await readAiModelOverrides({ fresh: true })
  const tasks: AiModelsTaskDiagnostics[] = []
  for (const taskKind of AI_TASK_KINDS) {
    const effective = await resolveModelChoice(taskKind)
    tasks.push({
      taskKind,
      chain: FALLBACK_CHAINS[taskKind],
      envModel: envModelFor(taskKind),
      override: overrides[taskKind] ?? null,
      effective,
      pricingKnown: lookupPricing("openai", effective.modelName) !== null,
    })
  }
  const textModels = catalog.ids ? relevantTextModels(catalog.ids) : []
  const families = catalog.ids ? detectGptFamilies(catalog.ids) : []
  return {
    catalog: {
      refreshedAt: catalog.refreshedAt,
      lastAttemptAt: catalog.lastAttemptAt,
      lastError: catalog.lastError,
      stale: catalog.stale,
      textModelCount: catalog.ids ? textModels.length : null,
      textModels,
      families,
      newerFamily: newerFamilyThanKnown(families),
    },
    tasks,
  }
}
