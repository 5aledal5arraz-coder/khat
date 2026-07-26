/**
 * Model catalog — live discovery of what THIS account's keys can use.
 *
 * Two providers, one mechanism:
 *   • OpenAI — `GET https://api.openai.com/v1/models`
 *   • Gemini — `GET https://generativelanguage.googleapis.com/v1beta/models`
 *     (free; the list endpoint is not billed)
 *
 * Each provider gets its own cached id list (6h TTL, stale-while-revalidate)
 * and its own error state. The selection layer (model-selection.ts) checks
 * chosen models against the catalog and falls back down a chain when a
 * configured model isn't available; the settings "AI" tab and
 * `npm run ai:models` render it for operators; the benchmark auto-discovery
 * scan (benchmark/scan.ts) reads it to find models nobody has measured yet.
 *
 * Why Gemini is here at all: it was not, and that was a real hole. Gemini
 * runs the entire grounded-retrieval path and is a live benchmark candidate,
 * yet the only catalog queried was OpenAI's and the relevance filter was
 * `/^(gpt-\d|o\d)/` — so no Gemini model could EVER be seen by the
 * availability check or auto-benchmarked. A pinned-but-retired
 * GEMINI_*_MODEL announced itself as a 404 in production, and a newly
 * released Gemini was invisible forever.
 *
 * Fail-open by design, per provider: if a models endpoint is unreachable (or
 * its key is unset), that provider's `ids` is null (or its last good
 * snapshot) and callers treat every model as possibly-available. One
 * provider's outage never affects the other, and a catalog hiccup must never
 * take down AI calls. Never throws.
 */

import { env } from "@/lib/env"

const TTL_MS = 6 * 60 * 60 * 1000 // 6h — model lists change ~monthly
const FETCH_TIMEOUT_MS = 5_000

/** Providers with a live model-listing endpoint. */
export const CATALOG_PROVIDERS = ["openai", "gemini"] as const
export type CatalogProvider = (typeof CATALOG_PROVIDERS)[number]

/**
 * The newest OpenAI text-model family the fallback chains in registry.ts
 * were written against. When the live catalog contains a family newer
 * than this, diagnostics surface "newer family available — adopt it via
 * a model override" instead of silently staying behind.
 */
export const KNOWN_LATEST_FAMILY = "5.6"

/**
 * Same contract as KNOWN_LATEST_FAMILY, for Gemini: the newest family the
 * Gemini defaults in lib/ai/gemini.ts are written against (gemini-3.6-*).
 */
export const KNOWN_LATEST_GEMINI_FAMILY = "3.6"

export interface ModelCatalog {
  /** All model ids available to this key. null = never fetched successfully. */
  ids: ReadonlySet<string> | null
  /** ISO timestamp of the last successful fetch. */
  refreshedAt: string | null
  /** ISO timestamp of the last attempt (successful or not). */
  lastAttemptAt: string | null
  /** Why the last attempt failed (null when it succeeded). */
  lastError: string | null
  /** Whether the snapshot is past its TTL at read time. */
  stale: boolean
}

interface CatalogState {
  ids: Set<string> | null
  refreshedAtMs: number
  lastAttemptAtMs: number
  lastError: string | null
}

function emptyState(): CatalogState {
  return { ids: null, refreshedAtMs: 0, lastAttemptAtMs: 0, lastError: null }
}

const states: Record<CatalogProvider, CatalogState> = {
  openai: emptyState(),
  gemini: emptyState(),
}

/** Single-flight guard so concurrent callers share one fetch, per provider. */
const inflight: Record<CatalogProvider, Promise<void> | null> = {
  openai: null,
  gemini: null,
}

async function fetchJson(url: string, headers: Record<string, string>): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal })
    if (!res.ok) throw new Error(`GET ${new URL(url).pathname} → HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(t)
  }
}

async function fetchOpenAiModelIds(): Promise<Set<string>> {
  const key = env.OPENAI_API_KEY
  if (!key) throw new Error("OPENAI_API_KEY is not set")
  const j = (await fetchJson("https://api.openai.com/v1/models", {
    Authorization: `Bearer ${key}`,
  })) as { data?: Array<{ id?: unknown }> }
  const ids = new Set<string>()
  for (const m of j.data ?? []) {
    if (typeof m.id === "string") ids.add(m.id)
  }
  if (ids.size === 0) throw new Error("GET /v1/models returned an empty list")
  return ids
}

/** Bound on pagination so a malformed nextPageToken can't spin forever. */
const GEMINI_MAX_PAGES = 5

/**
 * Gemini's list endpoint differs from OpenAI's in three ways that all have
 * to be handled or the ids are wrong rather than missing:
 *   • ids are returned fully qualified (`models/gemini-3.6-flash`) — the rest
 *     of the router speaks bare ids, so the prefix is stripped here.
 *   • the response is paginated (default 50); `pageSize` + `nextPageToken`.
 *   • the list includes embedding/vision-only models, distinguished by
 *     `supportedGenerationMethods` rather than by name — anything that can't
 *     `generateContent` is not a model the router could call.
 */
async function fetchGeminiModelIds(): Promise<Set<string>> {
  const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY
  if (!key) throw new Error("GEMINI_API_KEY is not set")
  const ids = new Set<string>()
  let pageToken: string | undefined
  for (let page = 0; page < GEMINI_MAX_PAGES; page++) {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models` +
      `?key=${encodeURIComponent(key)}&pageSize=200` +
      (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "")
    const j = (await fetchJson(url, {})) as {
      models?: Array<{ name?: unknown; supportedGenerationMethods?: unknown }>
      nextPageToken?: unknown
    }
    for (const m of j.models ?? []) {
      if (typeof m.name !== "string") continue
      const methods = Array.isArray(m.supportedGenerationMethods)
        ? m.supportedGenerationMethods
        : []
      if (!methods.includes("generateContent")) continue
      ids.add(m.name.replace(/^models\//, ""))
    }
    pageToken = typeof j.nextPageToken === "string" && j.nextPageToken ? j.nextPageToken : undefined
    if (!pageToken) break
  }
  if (ids.size === 0) throw new Error("GET /v1beta/models returned no generateContent models")
  return ids
}

async function refresh(provider: CatalogProvider): Promise<void> {
  const pending = inflight[provider]
  if (pending) return pending
  const run = (async () => {
    const state = states[provider]
    state.lastAttemptAtMs = Date.now()
    try {
      state.ids =
        provider === "openai" ? await fetchOpenAiModelIds() : await fetchGeminiModelIds()
      state.refreshedAtMs = Date.now()
      state.lastError = null
    } catch (err) {
      // Keep the last good snapshot; record why the refresh failed.
      state.lastError = err instanceof Error ? err.message : String(err)
      console.warn(
        `[ai-router] ${provider} model catalog refresh failed: ${state.lastError}`,
      )
    } finally {
      inflight[provider] = null
    }
  })()
  inflight[provider] = run
  return run
}

function snapshot(provider: CatalogProvider): ModelCatalog {
  const state = states[provider]
  return {
    ids: state.ids,
    refreshedAt: state.refreshedAtMs ? new Date(state.refreshedAtMs).toISOString() : null,
    lastAttemptAt: state.lastAttemptAtMs
      ? new Date(state.lastAttemptAtMs).toISOString()
      : null,
    lastError: state.lastError,
    stale: state.refreshedAtMs === 0 || Date.now() - state.refreshedAtMs > TTL_MS,
  }
}

/**
 * Read one provider's catalog. First call (or `forceRefresh`) fetches
 * synchronously; a stale-but-present snapshot is returned immediately while a
 * background refresh runs (stale-while-revalidate). Never throws.
 */
export async function getProviderModelCatalog(
  provider: CatalogProvider,
  opts?: { forceRefresh?: boolean },
): Promise<ModelCatalog> {
  const state = states[provider]
  const neverLoaded = state.ids === null
  const isStale = Date.now() - state.refreshedAtMs > TTL_MS
  if (opts?.forceRefresh || neverLoaded) {
    await refresh(provider)
  } else if (isStale) {
    void refresh(provider)
  }
  return snapshot(provider)
}

/**
 * The OpenAI catalog. Kept as the bare `getModelCatalog` because the OpenAI
 * path is what every task-kind fallback chain is made of — Gemini is reached
 * through `preferredProvider`, not through a chain.
 */
export async function getModelCatalog(opts?: {
  forceRefresh?: boolean
}): Promise<ModelCatalog> {
  return getProviderModelCatalog("openai", opts)
}

/** The Gemini catalog (grounded retrieval + benchmark candidates). */
export async function getGeminiModelCatalog(opts?: {
  forceRefresh?: boolean
}): Promise<ModelCatalog> {
  return getProviderModelCatalog("gemini", opts)
}

/**
 * Fire-and-forget boot warm-up (server instrumentation + worker). Warms BOTH
 * providers: they are independent, and a missing GEMINI_API_KEY just leaves
 * that catalog null — which is the same fail-open state as never having
 * fetched it.
 */
export function warmModelCatalog(): void {
  for (const provider of CATALOG_PROVIDERS) void refresh(provider)
}

// ─── Pure helpers (unit-tested; also used by diagnostics) ───────────────────

/**
 * Text-generation models relevant to the router: gpt-* / o* chat models,
 * excluding audio/realtime/image/embedding/moderation/legacy-chat lines.
 */
export function relevantTextModels(ids: Iterable<string>): string[] {
  const out: string[] = []
  for (const id of ids) {
    if (!/^(gpt-\d|o\d)/.test(id)) continue
    if (/(realtime|transcribe|tts|audio|image|embedding|whisper|moderation|search|codex|-chat-)/.test(id)) continue
    out.push(id)
  }
  return out.sort()
}

/**
 * Gemini text-generation models relevant to the router.
 *
 * `supportedGenerationMethods` already removed embedding-only models at fetch
 * time; this drops the remaining non-text and non-general lines by id, the
 * same way the OpenAI filter does: TTS/image/video/audio variants, and the
 * dated `-preview-MM-DD` / `-exp-*` snapshots, which are point-in-time
 * aliases that would each register as their own "family" and flood both the
 * override datalist and the auto-benchmark scan.
 */
export function relevantGeminiTextModels(ids: Iterable<string>): string[] {
  const out: string[] = []
  for (const id of ids) {
    if (!/^gemini-\d/.test(id)) continue
    if (/(embedding|aqa|tts|image|imagen|veo|vision|audio|native-audio|live|thinking-exp)/.test(id)) continue
    if (/(-exp\b|-exp-|-preview-\d)/.test(id)) continue
    out.push(id)
  }
  return out.sort()
}

export interface GptFamily {
  /** e.g. "5.6", "5.4", "4o", "o3" */
  family: string
  /** Display name: "gpt-5.6", "gpt-4o", "o3" */
  label: string
  models: string[]
}

/** Group relevant models into GPT families, newest first. */
export function detectGptFamilies(ids: Iterable<string>): GptFamily[] {
  const groups = new Map<string, string[]>()
  for (const id of relevantTextModels(ids)) {
    const m = id.match(/^gpt-(\d+(?:\.\d+)?|4o)/) ?? id.match(/^(o\d+)/)
    const family = m ? m[1] : "other"
    const list = groups.get(family) ?? []
    list.push(id)
    groups.set(family, list)
  }
  const numeric = (f: string) => {
    const n = Number.parseFloat(f)
    return Number.isFinite(n) ? n : -1 // "4o"/"o3"/"other" sort below numbered families
  }
  return [...groups.entries()]
    .map(([family, models]) => ({
      family,
      label: /^(o\d|other)/.test(family) ? family : `gpt-${family}`,
      models,
    }))
    .sort((a, b) => numeric(b.family) - numeric(a.family))
}

/** Group relevant Gemini models into families ("3.6", "2.5"), newest first. */
export function detectGeminiFamilies(ids: Iterable<string>): GptFamily[] {
  const groups = new Map<string, string[]>()
  for (const id of relevantGeminiTextModels(ids)) {
    const m = id.match(/^gemini-(\d+(?:\.\d+)?)/)
    if (!m) continue
    const list = groups.get(m[1]) ?? []
    list.push(id)
    groups.set(m[1], list)
  }
  return [...groups.entries()]
    .map(([family, models]) => ({ family, label: `gemini-${family}`, models }))
    .sort((a, b) => Number.parseFloat(b.family) - Number.parseFloat(a.family))
}

/**
 * The newest family strictly beyond what the fallback chains know about,
 * or null. Drives the "newer model available" diagnostics banner.
 *
 * `known` is a parameter so the same comparison serves both providers —
 * the OpenAI and Gemini version lines are unrelated number spaces, and
 * comparing one against the other's watermark is how "gemini-3.6 is older
 * than gpt-5.6" would become a silent yes.
 */
export function newerFamilyThanKnown(
  families: GptFamily[],
  known: string = KNOWN_LATEST_FAMILY,
): string | null {
  const knownNum = Number.parseFloat(known)
  const newest = families.find((f) => Number.isFinite(Number.parseFloat(f.family)))
  if (!newest) return null
  return Number.parseFloat(newest.family) > knownNum ? newest.family : null
}
