/**
 * A8 — HTTP-layer rate limiter for the admin API surface.
 *
 * Token bucket per (session-or-IP) × (read-or-mutation) tier. Lives
 * in-memory inside the single PM2 web process.
 *
 * Why a token bucket (and not a fixed window):
 *   • Smooth: bursts up to the capacity are allowed; sustained rate
 *     drains at `refill_per_second`. Matches operator intuition
 *     ("click a few buttons quickly" succeeds; "loop forever" fails).
 *   • Self-recovering: keys with low recent activity build their
 *     bucket back up automatically.
 *
 * Why in-memory (and not Redis):
 *   • Single PM2 web process today (`instances: 1` in
 *     ecosystem.config.js). Multi-instance + cross-instance fairness
 *     would require Redis. Documented as a v2 follow-up.
 *
 * Memory bounds:
 *   • Map capped at MAP_MAX_SIZE entries. When exceeded, entries
 *     last touched > MAP_PRUNE_MAX_AGE_MS are pruned lazily on the
 *     next request. Pathological growth: bounded by the prune
 *     threshold + the size cap (no unbounded leak).
 *
 * Threat model:
 *   • Stolen session token in a tight loop → mutation bucket drains
 *     in ~60 requests, then 429s sustained at 1/sec. Caps AI-budget
 *     blast radius before it reaches the AI router.
 *   • Brute-force login (no session cookie yet) → keyed by IP. 60
 *     login attempts/min/IP cap.
 *   • Accidental operator rapid-click → bursts within capacity pass;
 *     never trips during normal workflow.
 *
 * Out of scope:
 *   • Per-route specialization (e.g. extra-strict on AI endpoints).
 *     v1 uses two tiers only; documented for future tightening.
 *   • Authenticated-IP family clustering (NAT). Acceptable v1 limit.
 *   • Adaptive limits based on cluster load. Statically tuned.
 */

import { createHash } from "node:crypto"
import type { NextRequest } from "next/server"

// ─── Policy ──────────────────────────────────────────────────────────

export interface RateLimitPolicy {
  /** Tokens added per second of elapsed time. */
  refill_per_second: number
  /** Maximum tokens the bucket can accumulate. */
  capacity: number
}

/**
 * Read tier: GET, HEAD. Generous — ~10/sec sustained, 600 burst.
 * Calibrated so a power-operator who tab-storms 20 admin pages does
 * not trip it.
 */
export const READ_POLICY: RateLimitPolicy = {
  refill_per_second: 10,
  capacity: 600,
}

/**
 * Mutation tier: POST, PUT, PATCH, DELETE. Strict — 1/sec sustained,
 * 60 burst. Normal operator click rate is well under 1/sec; abuse or
 * automation loops exhaust the bucket in ~60 requests and then 429
 * sustained.
 */
export const MUTATION_POLICY: RateLimitPolicy = {
  refill_per_second: 1,
  capacity: 60,
}

// ─── Internal store ──────────────────────────────────────────────────

interface Bucket {
  /** Float — fractional tokens accrue during the elapsed-time refill. */
  tokens: number
  /** Last time we touched (refilled or decremented) this bucket. */
  last_refill_ms: number
}

const buckets = new Map<string, Bucket>()

/** Maximum entries kept in memory before lazy prune fires. */
const MAP_MAX_SIZE = 5_000

/** Entries older than this (since last refill) are eligible for prune. */
const MAP_PRUNE_MAX_AGE_MS = 10 * 60_000

/**
 * Lazy bounded prune. Only runs when the map exceeds MAP_MAX_SIZE,
 * which under realistic operator usage will essentially never happen
 * (one entry per active session × tier). The cleanup runs O(N) once
 * when it does fire, then the map stays small until the next breach.
 */
function pruneIfNeeded(now: number): void {
  if (buckets.size <= MAP_MAX_SIZE) return
  const cutoff = now - MAP_PRUNE_MAX_AGE_MS
  for (const [key, b] of buckets) {
    if (b.last_refill_ms < cutoff) buckets.delete(key)
  }
}

// ─── Key derivation ──────────────────────────────────────────────────

/**
 * Hash the session token so we never store the raw bearer in the map.
 * 16 hex chars (8 bytes of entropy) is enough to avoid collisions
 * across a couple of thousand simultaneous admin sessions.
 */
function hashSession(token: string): string {
  return "sess:" + createHash("sha256").update(token).digest("hex").slice(0, 16)
}

/**
 * Extract the first hop of `X-Forwarded-For`, falling back to a
 * sentinel when the header is missing. The droplet sits behind an
 * HTTPS-terminating proxy that sets XFF; in dev there's no proxy and
 * the header is absent, so we fall back to a single "dev" bucket
 * (acceptable — there's only one developer machine hitting localhost).
 */
function ipFromRequest(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    if (first) return first
  }
  // Next.js doesn't expose req.ip on every runtime; fall back when XFF
  // is absent (e.g. local dev, direct curl).
  return "unknown-ip"
}

/**
 * Produce the rate-limit map key for a request. Prefers the session
 * token (one-way hashed) so the same operator across multiple IPs is
 * tracked as one identity. Falls back to IP when no session yet (e.g.
 * a login POST or the very first request).
 */
export function keyForRequest(req: NextRequest): string {
  const sessionToken = req.cookies.get("__admin_session")?.value
  if (sessionToken) return hashSession(sessionToken)
  return "ip:" + ipFromRequest(req)
}

/**
 * Pick the appropriate policy based on HTTP method. GET/HEAD are
 * reads (generous); everything else is treated as a mutation (strict).
 * OPTIONS is bucketed with reads because CORS preflights are
 * generally low-cost.
 */
export function policyForRequest(req: NextRequest): RateLimitPolicy {
  const m = req.method
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return READ_POLICY
  return MUTATION_POLICY
}

// ─── Decision ─────────────────────────────────────────────────────────

export interface RateLimitDecision {
  allowed: boolean
  /**
   * On the allowed path, the number of tokens remaining (informational).
   * On the rejected path, 0.
   */
  remaining: number
  /**
   * Seconds the caller should wait before retrying. On the allowed
   * path this is 0. On the rejected path this is the ceiling of the
   * time until the bucket has at least 1 token again, capped at 60s
   * to avoid suggesting absurd waits.
   */
  retry_after_seconds: number
}

const MAX_RETRY_AFTER_SECONDS = 60

/**
 * Atomically refill the bucket based on elapsed time, then try to
 * spend one token. Returns the decision. Single-threaded Node makes
 * the get/refill/decrement sequence atomic by construction; no lock
 * needed.
 *
 * Time source is `Date.now()` — monotonic enough for our purposes.
 * We don't use `performance.now()` because the bucket needs to survive
 * (within memory) across the natural Node clock; the precision delta
 * is irrelevant at the second-level granularity we operate at.
 */
export function checkRateLimit(opts: {
  key: string
  policy: RateLimitPolicy
}): RateLimitDecision {
  const now = Date.now()
  pruneIfNeeded(now)

  let bucket = buckets.get(opts.key)
  if (!bucket) {
    // First request for this key — start with a full bucket so the
    // first interaction doesn't pay a refill tax.
    bucket = { tokens: opts.policy.capacity, last_refill_ms: now }
    buckets.set(opts.key, bucket)
  } else {
    // Refill based on elapsed time since the last touch. Cap at the
    // bucket's capacity so it never grows unbounded.
    const elapsedSeconds = (now - bucket.last_refill_ms) / 1000
    bucket.tokens = Math.min(
      opts.policy.capacity,
      bucket.tokens + elapsedSeconds * opts.policy.refill_per_second,
    )
    bucket.last_refill_ms = now
  }

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      retry_after_seconds: 0,
    }
  }

  // Bucket exhausted. Compute how long until 1 token will be refilled.
  const deficit = 1 - bucket.tokens
  const retry = Math.min(
    MAX_RETRY_AFTER_SECONDS,
    Math.max(1, Math.ceil(deficit / opts.policy.refill_per_second)),
  )
  return {
    allowed: false,
    remaining: 0,
    retry_after_seconds: retry,
  }
}

// ─── Test-only helpers ───────────────────────────────────────────────
//
// These exist so tests (and operator-side smoke scenarios) can reset
// state between runs without restarting the process. Not exported for
// general consumption — the symbol names start with an underscore to
// make their internal-use intent obvious.

/** @internal Reset all buckets. Test/diagnostic use only. */
export function _resetForTests(): void {
  buckets.clear()
}

/** @internal Current bucket count. Test/diagnostic use only. */
export function _bucketCount(): number {
  return buckets.size
}
