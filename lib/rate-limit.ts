import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { rateLimits } from '@/lib/db/schema'
import { eq, and, gte, count } from 'drizzle-orm'

interface RateLimitConfig {
  action: string
  maxRequests: number
  windowMs: number
}

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
 * Checks x-forwarded-for (set by reverse proxies / Vercel) first,
 * then falls back to x-real-ip, then to a generic key.
 */
function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    // x-forwarded-for can be a comma-separated list; the first is the client
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

// Rate limit configurations
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  create_article: { action: 'create_article', maxRequests: 5, windowMs: 60 * 60 * 1000 },       // 5 per hour
  create_thought: { action: 'create_thought', maxRequests: 20, windowMs: 60 * 60 * 1000 },      // 20 per hour
  create_comment: { action: 'create_comment', maxRequests: 30, windowMs: 60 * 60 * 1000 },      // 30 per hour
  create_report:  { action: 'create_report', maxRequests: 10, windowMs: 24 * 60 * 60 * 1000 },  // 10 per day
  toggle_like:    { action: 'toggle_like', maxRequests: 100, windowMs: 60 * 60 * 1000 },         // 100 per hour
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetAt: Date
}

/**
 * Check and record rate limit using rate_limits table via pool
 */
export async function checkRateLimit(
  userId: string,
  limitKey: keyof typeof RATE_LIMITS
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[limitKey]
  if (!config) {
    return { allowed: true, remaining: 999, resetAt: new Date() }
  }

  const windowStart = new Date(Date.now() - config.windowMs)

  try {
    // Count requests in window
    const result = await db!.select({ cnt: count() })
      .from(rateLimits)
      .where(and(
        eq(rateLimits.user_id, userId),
        eq(rateLimits.action, config.action),
        gte(rateLimits.created_at, windowStart)
      ))

    const currentCount = result[0]?.cnt ?? 0
    const remaining = Math.max(0, config.maxRequests - currentCount)
    const allowed = currentCount < config.maxRequests

    if (allowed) {
      // Record this request
      await db!.insert(rateLimits).values({ user_id: userId, action: config.action })
    }

    return {
      allowed,
      remaining: allowed ? remaining - 1 : 0,
      resetAt: new Date(Date.now() + config.windowMs),
    }
  } catch (err) {
    // Fail closed - deny the request when DB is unavailable to prevent abuse
    console.error('Rate limit check failed:', err)
    return { allowed: false, remaining: 0, resetAt: new Date(Date.now() + config.windowMs) }
  }
}
