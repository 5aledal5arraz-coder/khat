/**
 * OpenAI model catalog — live discovery of what THIS API key can use.
 *
 * Queries `GET /v1/models` and caches the id list in-process (6h TTL,
 * stale-while-revalidate). The selection layer (model-selection.ts) checks
 * chosen models against this catalog and falls back down a chain when a
 * configured model isn't available; the settings "AI" tab and
 * `npm run ai:models` render it for operators.
 *
 * Fail-open by design: if the models endpoint is unreachable, `ids` is
 * null (or the last good snapshot) and callers treat every model as
 * possibly-available — a catalog hiccup must never take down AI calls.
 * Never throws.
 */

import { env } from "@/lib/env"

const TTL_MS = 6 * 60 * 60 * 1000 // 6h — model lists change ~monthly
const FETCH_TIMEOUT_MS = 5_000

/**
 * The newest OpenAI text-model family the fallback chains in registry.ts
 * were written against. When the live catalog contains a family newer
 * than this, diagnostics surface "newer family available — adopt it via
 * a model override" instead of silently staying behind.
 */
export const KNOWN_LATEST_FAMILY = "5.6"

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

const state: CatalogState = {
  ids: null,
  refreshedAtMs: 0,
  lastAttemptAtMs: 0,
  lastError: null,
}

/** Single-flight guard so concurrent callers share one fetch. */
let inflight: Promise<void> | null = null

async function fetchModelIds(): Promise<Set<string>> {
  const key = env.OPENAI_API_KEY
  if (!key) throw new Error("OPENAI_API_KEY is not set")
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`GET /v1/models → HTTP ${res.status}`)
    const j = (await res.json()) as { data?: Array<{ id?: unknown }> }
    const ids = new Set<string>()
    for (const m of j.data ?? []) {
      if (typeof m.id === "string") ids.add(m.id)
    }
    if (ids.size === 0) throw new Error("GET /v1/models returned an empty list")
    return ids
  } finally {
    clearTimeout(t)
  }
}

async function refresh(): Promise<void> {
  if (inflight) return inflight
  inflight = (async () => {
    state.lastAttemptAtMs = Date.now()
    try {
      const ids = await fetchModelIds()
      state.ids = ids
      state.refreshedAtMs = Date.now()
      state.lastError = null
    } catch (err) {
      // Keep the last good snapshot; record why the refresh failed.
      state.lastError = err instanceof Error ? err.message : String(err)
      console.warn(`[ai-router] model catalog refresh failed: ${state.lastError}`)
    } finally {
      inflight = null
    }
  })()
  return inflight
}

function snapshot(): ModelCatalog {
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
 * Read the catalog. First call (or `forceRefresh`) fetches synchronously;
 * a stale-but-present snapshot is returned immediately while a background
 * refresh runs (stale-while-revalidate). Never throws.
 */
export async function getModelCatalog(opts?: {
  forceRefresh?: boolean
}): Promise<ModelCatalog> {
  const neverLoaded = state.ids === null
  const isStale = Date.now() - state.refreshedAtMs > TTL_MS
  if (opts?.forceRefresh || neverLoaded) {
    await refresh()
  } else if (isStale) {
    void refresh()
  }
  return snapshot()
}

/** Fire-and-forget boot warm-up (server instrumentation + worker). */
export function warmModelCatalog(): void {
  void refresh()
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

/**
 * The newest family strictly beyond what the fallback chains know about,
 * or null. Drives the "newer model available" diagnostics banner.
 */
export function newerFamilyThanKnown(families: GptFamily[]): string | null {
  const known = Number.parseFloat(KNOWN_LATEST_FAMILY)
  const newest = families.find((f) => Number.isFinite(Number.parseFloat(f.family)))
  if (!newest) return null
  return Number.parseFloat(newest.family) > known ? newest.family : null
}
