import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// In-memory IP-based rate limiter (for public/unauthenticated endpoints)
// ---------------------------------------------------------------------------

interface IpBucket {
  count: number
  resetAt: number
}

/** Per-action store. Each action gets its own Map so limits are independent. */
const ipStores = new Map<string, Map<string, IpBucket>>()

/** Evict expired entries periodically to prevent unbounded growth. */
const CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes
let lastCleanup = Date.now()

function cleanupExpired() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now

  for (const store of ipStores.values()) {
    for (const [ip, bucket] of store) {
      if (now >= bucket.resetAt) {
        store.delete(ip)
      }
    }
  }
}

/**
 * Anything with request headers. A route handler passes its `NextRequest`; a
 * server component (e.g. /prepare/[token], which must rate-limit its own GET)
 * passes `{ headers: await headers() }` — the IP logic is the same either way.
 */
export type RateLimitSource = Pick<NextRequest, 'headers'> | { headers: { get(name: string): string | null } }

/**
 * The client IP as OUR proxy saw it — never as the client claims it.
 *
 * Production nginx sets `X-Real-IP $remote_addr` (overwritten, so the client
 * cannot supply it) and `X-Forwarded-For $proxy_add_x_forwarded_for`, which
 * APPENDS the real address to whatever the client sent. The FIRST XFF entry
 * is therefore attacker-controlled: keying on it let one client rotate a fake
 * value per request and walk past every per-IP limit. Order of trust:
 *   1. `x-real-ip` — set by nginx, not forwardable by the client.
 *   2. the LAST `x-forwarded-for` entry — the hop our proxy appended.
 *   3. "unknown".
 */
export function getClientIp(request: RateLimitSource): string {
  const real = request.headers.get('x-real-ip')?.trim()
  if (real) return real
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded.split(',').map((h) => h.trim()).filter(Boolean)
    if (hops.length) return hops[hops.length - 1]
  }
  return 'unknown'
}

/**
 * The per-IP rate-limit key. IPv6 is keyed by its /64: one subscriber is
 * normally handed a whole /64, so keying by full address let a single client
 * rotate 2^64 addresses past the limit. IPv4 (and IPv4-mapped IPv6) stay
 * per-address.
 */
export function rateLimitKey(ip: string): string {
  const raw = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0]
  if (!raw.includes(":")) return raw
  const mapped = raw.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mapped) return mapped[1]
  const [head, tail = ""] = raw.split("::")
  const h = head ? head.split(":") : []
  const t = raw.includes("::") && tail ? tail.split(":") : []
  const groups = raw.includes("::") ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t] : h
  if (groups.length < 4 || groups.slice(0, 4).some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return raw
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`
}

export interface IpRateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

/**
 * Check IP-based rate limit. No database dependency — runs in-memory.
 *
 * @param request - The incoming Next.js request (used to extract client IP)
 * @param action  - A unique key for the rate-limited action (e.g. "media_kit_verify")
 * @param maxRequests - Maximum allowed requests in the window
 * @param windowMs - Time window in milliseconds
 */
export function checkIpRateLimit(
  request: RateLimitSource,
  action: string,
  maxRequests: number,
  windowMs: number,
): IpRateLimitResult {
  cleanupExpired()

  // IPv6 → its /64 for EVERY action (was only /api/track): keyed by full
  // address, one subscriber could rotate through its /64 past any limit.
  const ip = rateLimitKey(getClientIp(request))

  if (!ipStores.has(action)) {
    ipStores.set(action, new Map())
  }
  const store = ipStores.get(action)!

  const now = Date.now()
  let bucket = store.get(ip)

  // Reset bucket if the window has passed
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
    store.set(ip, bucket)
  }

  bucket.count++
  const allowed = bucket.count <= maxRequests
  const remaining = Math.max(0, maxRequests - bucket.count)

  return {
    allowed,
    remaining,
    resetAt: new Date(bucket.resetAt),
  }
}

// ---------------------------------------------------------------------------
// Admin-keyed rate limiter (for authenticated admin routes)
// ---------------------------------------------------------------------------
//
// The IP limiter above is wrong for admin endpoints because admins frequently
// share an office NAT and would rate-limit each other. This variant is keyed
// by admin user id (taken from the verified session), falling back to IP only
// when the id is unavailable. It reuses the same per-action store shape so
// expiry cleanup works identically.

/** Separate namespace so admin limits don't clobber IP limits. */
const ADMIN_PREFIX = "admin:"

export interface AdminRateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
  /** Seconds until the limit resets — convenient for Retry-After headers. */
  retryAfterSeconds: number
}

/**
 * Check an admin-keyed rate limit.
 *
 * @param adminId      - Stable id of the authenticated admin user
 * @param action       - Unique key for the rate-limited action
 * @param maxRequests  - Maximum allowed requests in the window
 * @param windowMs     - Time window in milliseconds
 */
export function checkAdminRateLimit(
  adminId: string,
  action: string,
  maxRequests: number,
  windowMs: number,
): AdminRateLimitResult {
  cleanupExpired()

  const key = ADMIN_PREFIX + action
  if (!ipStores.has(key)) {
    ipStores.set(key, new Map())
  }
  const store = ipStores.get(key)!

  const now = Date.now()
  let bucket = store.get(adminId)

  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs }
    store.set(adminId, bucket)
  }

  bucket.count++
  const allowed = bucket.count <= maxRequests
  const remaining = Math.max(0, maxRequests - bucket.count)
  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))

  return {
    allowed,
    remaining,
    resetAt: new Date(bucket.resetAt),
    retryAfterSeconds,
  }
}
