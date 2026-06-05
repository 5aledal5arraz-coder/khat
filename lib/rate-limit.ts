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
 * Extract client IP from a Next.js request.
 * Checks x-forwarded-for (set by reverse proxies) first,
 * then falls back to x-real-ip, then to a generic key.
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return request.headers.get('x-real-ip') || 'unknown'
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
  request: NextRequest,
  action: string,
  maxRequests: number,
  windowMs: number,
): IpRateLimitResult {
  cleanupExpired()

  const ip = getClientIp(request)

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
