/**
 * POST /api/track — the visitor counter's collector (one page view per call).
 *
 * Public and mutating, so it carries the same guards as every other public
 * write (`validateOrigin` + `checkIpRateLimit`). It CANNOT use
 * `validateMutation`: its custom-header half needs `X-Requested-With`, and
 * `navigator.sendBeacon` cannot set headers.
 *
 * Contract: ALWAYS 204, never a body, never an error to the client — a
 * counter must not be able to break or slow a page, and a uniform answer
 * tells a probe nothing about which rule dropped its request. Every rule lives
 * in `lib/analytics/visitor.ts` (`buildPageView`); this file is only I/O.
 *
 * Cost: ONE single-row INSERT on the shared pool, nothing else, and at most
 * `GLOBAL_INSERT_CAP` of them per minute per process. The DB
 * connection ceiling is tight (two pools already claim 20 of 22), so there is
 * no read, no upsert, and no second statement here.
 */

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { analyticsEvents } from "@/lib/db/schema"
import { validateOrigin } from "@/lib/api-utils"
import { checkIpRateLimit, getClientIp } from "@/lib/rate-limit"
import {
  buildPageView,
  visitorSecret,
  rateLimitKey,
  takeGlobalInsertSlot,
  MAX_BODY_BYTES,
  TRACK_RATE_LIMIT,
} from "@/lib/analytics/visitor"

/**
 * A missing salt key makes this endpoint a silent no-op (every view is
 * dropped as `no_secret`). Say so ONCE per process — not per request, which
 * would flood the log on every page view.
 */
let warnedNoSecret = false

function done() {
  return new NextResponse(null, { status: 204 })
}

export async function POST(request: NextRequest) {
  try {
    if (!validateOrigin(request)) return done()
    const ip = getClientIp(request)
    // Keyed by `rateLimitKey` (IPv6 → its /64), not the raw address: the
    // limiter reads `x-real-ip` from whatever source it is handed.
    const keyed = { headers: { get: (n: string) => (n === "x-real-ip" ? rateLimitKey(ip) : null) } }
    if (!checkIpRateLimit(keyed, "track_page_view", TRACK_RATE_LIMIT.max, TRACK_RATE_LIMIT.windowMs).allowed) {
      return done()
    }

    const declared = Number(request.headers.get("content-length") ?? "0")
    if (declared > MAX_BODY_BYTES) return done()
    const text = await request.text()
    if (text.length > MAX_BODY_BYTES) return done()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return done()
    }

    const decision = buildPageView({
      body,
      ip,
      userAgent: request.headers.get("user-agent"),
      host: request.headers.get("host"),
      hasAdminSession: Boolean(request.cookies.get("__admin_session")?.value),
      dnt: request.headers.get("dnt"),
      gpc: request.headers.get("sec-gpc"),
      now: new Date(),
      secret: visitorSecret(),
    })
    if ("skip" in decision && decision.skip === "no_secret" && !warnedNoSecret) {
      warnedNoSecret = true
      console.warn("[track] ANALYTICS_SALT_SECRET is not set — no page views are being counted.")
    }
    if ("skip" in decision || !db) return done()
    if (!takeGlobalInsertSlot()) return done()

    await db.insert(analyticsEvents).values(decision.row)
  } catch (e) {
    // Logged, never surfaced: the visitor's page does not care.
    console.error("[track] page view not recorded:", e instanceof Error ? e.message : e)
  }
  return done()
}
