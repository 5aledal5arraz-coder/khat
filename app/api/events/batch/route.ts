import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { visitorEvents } from "@/lib/db/schema"
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
const MAX_BATCH_SIZE = 50

interface BatchEvent {
  event_type: string
  target_id: string
  metadata?: Record<string, unknown>
}

export async function POST(request: NextRequest) {
  // sendBeacon requests (page unload) won't have custom headers — allow if origin matches
  const isBlobRequest = request.headers.get("content-type")?.includes("text/plain")
  if (!validateOrigin(request)) {
    return errorResponse("طلب غير صالح", 403)
  }
  if (!isBlobRequest && !validateCustomHeader(request)) {
    return errorResponse("طلب غير صالح", 403)
  }

  const rateCheck = checkIpRateLimit(request, "visitor_event_batch", 30, 60 * 60 * 1000)
  if (!rateCheck.allowed) {
    return rateLimitResponse()
  }

  const visitorId = request.cookies.get("khat_vid")?.value
  if (!visitorId || !UUID_RE.test(visitorId)) {
    return errorResponse("معرّف الزائر غير صالح", 400)
  }

  let body: { events?: BatchEvent[] }
  try {
    body = await request.json()
  } catch {
    return errorResponse("بيانات غير صالحة", 400)
  }

  const { events } = body
  if (!Array.isArray(events) || events.length === 0) {
    return errorResponse("لا توجد أحداث", 400)
  }

  if (events.length > MAX_BATCH_SIZE) {
    return errorResponse(`الحد الأقصى ${MAX_BATCH_SIZE} حدث`, 400)
  }

  // Validate and prepare rows
  const rows = []
  for (const ev of events) {
    if (!ev.event_type || !(ALLOWED_EVENT_TYPES as readonly string[]).includes(ev.event_type)) {
      continue // skip invalid events
    }
    if (!ev.target_id || typeof ev.target_id !== "string" || ev.target_id.length > 500) {
      continue
    }
    rows.push({
      visitor_id: visitorId,
      event_type: ev.event_type,
      target_id: ev.target_id,
      metadata: ev.metadata ?? {},
    })
  }

  if (rows.length === 0) {
    return successResponse({ ok: true, inserted: 0 })
  }

  try {
    // Batch insert using Drizzle
    await db!.insert(visitorEvents).values(
      rows.map((row) => ({
        visitor_id: row.visitor_id,
        event_type: row.event_type,
        target_id: row.target_id,
        metadata: row.metadata as Record<string, unknown>,
      }))
    )
  } catch (error) {
    console.error("Failed to batch insert visitor events:", error)
    return errorResponse("حدث خطأ أثناء تسجيل الأحداث", 500)
  }

  return successResponse({ ok: true, inserted: rows.length })
}
