/**
 * Preparation Studio — rate-limit policy table.
 *
 * One place to change the budget. Every preparation admin route imports
 * `enforcePreparationRateLimit()` and passes an action key from this table.
 *
 * Limits are per-admin-user (not per-IP), so admins sharing a NAT don't
 * collide. They are sized for realistic editorial workloads, not for
 * continuous integration.
 */

import { NextResponse } from "next/server"
import { checkAdminRateLimit } from "@/lib/rate-limit"
import { getAdminAuthUser } from "@/lib/api-utils"

const HOUR = 60 * 60 * 1000

/**
 * Policy. Keep numbers here — don't sprinkle them across routes.
 *
 *  research      — Gemini + YouTube + synthesis + verifier. Expensive per call,
 *                  60–90s latency. 10/hour is plenty for iterative research.
 *  generate      — 9 GPT-4o editorial calls in sequence. Most expensive action
 *                  in the whole app. 5/hour caps it at ~5$/hour/admin.
 *  regenerate    — A single GPT-4o call. 30/hour allows rapid iteration on
 *                  individual sections without opening the door to abuse.
 *  approve       — Status transitions only. Cheap; limit exists to prevent
 *                  state-spam from a compromised cookie.
 *  rotate_token  — Mints a new live token. Rare in practice but cheap.
 */
export const PREPARATION_LIMITS = {
  research: { action: "preparation.research", max: 10, windowMs: HOUR },
  generate: { action: "preparation.generate", max: 5, windowMs: HOUR },
  regenerate: { action: "preparation.regenerate", max: 30, windowMs: HOUR },
  approve: { action: "preparation.approve", max: 60, windowMs: HOUR },
  rotate_token: { action: "preparation.rotate_token", max: 10, windowMs: HOUR },
  // identify — lightweight Gemini + YouTube lookup run BEFORE research so
  // the admin picks a real identity. Cheap relative to full research but
  // still an LLM + API call, so we cap higher than research.
  identify: { action: "preparation.identify", max: 30, windowMs: HOUR },
} as const

export type PreparationLimitKey = keyof typeof PREPARATION_LIMITS

/**
 * Gate an admin route by rate limit. Returns `null` when allowed, or a
 * NextResponse (429) when the caller should be rejected. Always pair this
 * with `requireAdminAPI()` — if the user isn't authenticated we fall through
 * to a 429 rather than leak internal state.
 */
export async function enforcePreparationRateLimit(
  key: PreparationLimitKey,
): Promise<NextResponse | null> {
  const user = await getAdminAuthUser()
  if (!user) {
    // Caller should already have gated with requireAdminAPI, but be safe.
    return NextResponse.json({ error: "يجب تسجيل الدخول أولاً" }, { status: 401 })
  }

  const policy = PREPARATION_LIMITS[key]
  const result = checkAdminRateLimit(user.id, policy.action, policy.max, policy.windowMs)

  if (result.allowed) return null

  const minutes = Math.max(1, Math.ceil(result.retryAfterSeconds / 60))
  return NextResponse.json(
    {
      error: `تجاوزت الحد المسموح لهذه العملية. حاول مرة أخرى بعد ${minutes} دقيقة.`,
      retry_after_seconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    },
  )
}
