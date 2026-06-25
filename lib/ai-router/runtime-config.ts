/**
 * Runtime-editable AI router configuration.
 *
 * The rate-limit policy (mode + per-tier caps) historically came ONLY from
 * environment variables (`KHAT_RATE_LIMIT_*`), which means changing a daily
 * cost cap or flipping enforce/report needed a redeploy + restart. This module
 * adds a DB-backed override layer so an operator can change those live from the
 * admin Settings hub.
 *
 * Storage: a single row in the generic `config_store` key/value table under
 * `ai_runtime_config` — no schema migration. Each field is nullable; `null`
 * means "inherit the env/default value", so an operator only overrides what
 * they explicitly set.
 *
 * Read path safety: `acquireRateLimitPermit()` runs before every AI call, so
 * the effective getters MUST be cheap and fail-safe. We cache the override for
 * a short TTL and fall back to env defaults on any DB error — the rate limiter
 * never blocks on (or breaks because of) this lookup.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { configStore } from "@/lib/db/schema/system"
import type { RateLimitMode, RateLimitTier } from "@/lib/db/schema/ai-rate-limit-events"
import { readMode, readLimits, type TierLimits } from "./rate-limit"

const CONFIG_KEY = "ai_runtime_config"
const CACHE_TTL_MS = 15_000

/**
 * DB override. Every field is nullable — `null` means "inherit env/default".
 * The admin UI pre-fills with the effective values and saves full objects, so
 * in practice tiers are either fully set or fully inherited.
 */
export interface AiRuntimeConfig {
  mode: RateLimitMode | null
  light: TierLimits | null
  expensive: TierLimits | null
}

const EMPTY: AiRuntimeConfig = { mode: null, light: null, expensive: null }

let cache: { value: AiRuntimeConfig; at: number } | null = null

export function invalidateAiRuntimeCache(): void {
  cache = null
}

function sanitizeTier(t: unknown): TierLimits | null {
  if (!t || typeof t !== "object") return null
  const o = t as Record<string, unknown>
  const mc = Number(o.maxConcurrent)
  const dc = Number(o.maxDailyCostUsd)
  if (!Number.isFinite(mc) || mc <= 0 || !Number.isFinite(dc) || dc <= 0) return null
  return { maxConcurrent: Math.floor(mc), maxDailyCostUsd: dc }
}

function sanitize(raw: unknown): AiRuntimeConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<AiRuntimeConfig>
  const mode =
    r.mode === "off" || r.mode === "report" || r.mode === "enforce" ? r.mode : null
  return { mode, light: sanitizeTier(r.light), expensive: sanitizeTier(r.expensive) }
}

/**
 * Read the raw override (cached). `fresh` forces a DB read (used right after a
 * write, or by the admin page that wants the canonical row).
 */
export async function readAiRuntimeOverride(opts?: {
  fresh?: boolean
}): Promise<AiRuntimeConfig> {
  if (!opts?.fresh && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value
  }
  if (!db) return EMPTY
  try {
    const rows = await db
      .select({ value: configStore.value })
      .from(configStore)
      .where(eq(configStore.key, CONFIG_KEY))
      .limit(1)
    const value = sanitize(rows[0]?.value)
    cache = { value, at: Date.now() }
    return value
  } catch {
    // Fail-safe: never let a settings lookup break the AI hot path.
    return cache?.value ?? EMPTY
  }
}

export async function writeAiRuntimeOverride(cfg: AiRuntimeConfig): Promise<void> {
  if (!db) throw new Error("Database not available")
  const value = sanitize(cfg)
  await db
    .insert(configStore)
    .values({ key: CONFIG_KEY, value })
    .onConflictDoUpdate({
      target: configStore.key,
      set: { value, updated_at: new Date() },
    })
  invalidateAiRuntimeCache()
}

/** Effective mode = DB override ?? env default. */
export async function getEffectiveMode(): Promise<RateLimitMode> {
  const o = await readAiRuntimeOverride()
  return o.mode ?? readMode()
}

/** Effective per-tier limits = DB override per tier ?? env default per tier. */
export async function getEffectiveLimits(): Promise<Record<RateLimitTier, TierLimits>> {
  const o = await readAiRuntimeOverride()
  const env = readLimits()
  return {
    light: o.light ?? env.light,
    expensive: o.expensive ?? env.expensive,
  }
}

/**
 * Convenience for the admin UI / ops dashboard: the effective config plus which
 * fields are env-inherited vs DB-overridden, so the surface can show the source.
 */
export async function getEffectiveAiConfig(): Promise<{
  mode: RateLimitMode
  modeOverridden: boolean
  limits: Record<RateLimitTier, TierLimits>
  lightOverridden: boolean
  expensiveOverridden: boolean
  envMode: RateLimitMode
  envLimits: Record<RateLimitTier, TierLimits>
}> {
  const o = await readAiRuntimeOverride({ fresh: true })
  const envMode = readMode()
  const envLimits = readLimits()
  return {
    mode: o.mode ?? envMode,
    modeOverridden: o.mode !== null,
    limits: { light: o.light ?? envLimits.light, expensive: o.expensive ?? envLimits.expensive },
    lightOverridden: o.light !== null,
    expensiveOverridden: o.expensive !== null,
    envMode,
    envLimits,
  }
}
