import { NextRequest } from "next/server"
import { pool } from "@/lib/db"
import { checkIpRateLimit } from "@/lib/rate-limit"
import {
  successResponse,
  errorResponse,
  rateLimitResponse,
  validateOrigin,
  validateCustomHeader,
} from "@/lib/api-utils"
import { ALLOWED_EVENT_TYPES } from "@/types/personalization"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ---------------------------------------------------------------------------
// Deduplication: prevent identical events within 30 seconds
// Key: "visitor_id:event_type:target_id" → timestamp
// ---------------------------------------------------------------------------

const DEDUP_WINDOW_MS = 30_000
const recentEvents = new Map<string, number>()
let lastDedupCleanup = Date.now()

function isDuplicate(visitorId: string, eventType: string, targetId: string): boolean {
  // Periodic cleanup every 60s
  const now = Date.now()
  if (now - lastDedupCleanup > 60_000) {
    for (const [key, ts] of recentEvents) {
      if (now - ts > DEDUP_WINDOW_MS) recentEvents.delete(key)
    }
    lastDedupCleanup = now
  }

  const key = `${visitorId}:${eventType}:${targetId}`
  const lastSeen = recentEvents.get(key)
  if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
    return true
  }
  recentEvents.set(key, now)
  return false
}

export async function POST(request: NextRequest) {
  // CSRF checks
  if (!validateOrigin(request)) {
    return errorResponse("طلب غير صالح", 403)
  }
  if (!validateCustomHeader(request)) {
    return errorResponse("طلب غير صالح", 403)
  }

  // IP rate limit: 120 events/hour
  const rateCheck = checkIpRateLimit(request, "visitor_event", 120, 60 * 60 * 1000)
  if (!rateCheck.allowed) {
    return rateLimitResponse()
  }

  // Read visitor ID from cookie
  const visitorId = request.cookies.get("khat_vid")?.value
  if (!visitorId || !UUID_RE.test(visitorId)) {
    return errorResponse("معرّف الزائر غير صالح", 400)
  }

  // Parse body
  let body: { event_type?: string; target_id?: string; metadata?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    return errorResponse("بيانات غير صالحة", 400)
  }

  const { event_type, target_id, metadata } = body

  // Validate event_type
  if (!event_type || !(ALLOWED_EVENT_TYPES as readonly string[]).includes(event_type)) {
    return errorResponse("نوع الحدث غير صالح", 400)
  }

  // Validate target_id
  if (!target_id || typeof target_id !== "string" || target_id.length > 500) {
    return errorResponse("معرّف الهدف غير صالح", 400)
  }

  // Deduplicate: same visitor + event_type + target_id within 30s → skip
  if (isDuplicate(visitorId, event_type, target_id)) {
    return successResponse({ ok: true, deduplicated: true })
  }

  // Insert event
  try {
    await pool!.query(
      `INSERT INTO visitor_events (visitor_id, event_type, target_id, metadata)
       VALUES ($1, $2, $3, $4)`,
      [visitorId, event_type, target_id, JSON.stringify(metadata ?? {})]
    )
  } catch (error) {
    console.error("Failed to insert visitor event:", error)
    return errorResponse("حدث خطأ أثناء تسجيل الحدث", 500)
  }

  return successResponse({ ok: true })
}
