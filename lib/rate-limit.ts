import { SupabaseClient } from '@supabase/supabase-js'

interface RateLimitConfig {
  action: string
  maxRequests: number
  windowMs: number
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
 * Check and record rate limit using Supabase rate_limits table
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  userId: string,
  limitKey: keyof typeof RATE_LIMITS
): Promise<RateLimitResult> {
  const config = RATE_LIMITS[limitKey]
  if (!config) {
    return { allowed: true, remaining: 999, resetAt: new Date() }
  }

  const windowStart = new Date(Date.now() - config.windowMs)

  // Count requests in window
  const { count, error } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', config.action)
    .gte('created_at', windowStart.toISOString())

  if (error) {
    // Fail open - allow the request but log the error
    console.error('Rate limit check failed:', error)
    return { allowed: true, remaining: 0, resetAt: new Date(Date.now() + config.windowMs) }
  }

  const currentCount = count ?? 0
  const remaining = Math.max(0, config.maxRequests - currentCount)
  const allowed = currentCount < config.maxRequests

  if (allowed) {
    // Record this request
    await supabase.from('rate_limits').insert({
      user_id: userId,
      action: config.action,
    })
  }

  return {
    allowed,
    remaining: allowed ? remaining - 1 : 0,
    resetAt: new Date(Date.now() + config.windowMs),
  }
}
