import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { visitorEvents } from "@/lib/db/schema"
import { eq } from "drizzle-orm"
import { validateOrigin, validateCustomHeader, errorResponse } from "@/lib/api-utils"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  if (!validateOrigin(request)) {
    return errorResponse("طلب غير صالح", 403)
  }
  if (!validateCustomHeader(request)) {
    return errorResponse("طلب غير صالح", 403)
  }

  const visitorId = request.cookies.get("khat_vid")?.value
  if (!visitorId || !UUID_RE.test(visitorId)) {
    return errorResponse("معرّف الزائر غير صالح", 400)
  }

  // Delete all events for this visitor
  await db!.delete(visitorEvents).where(eq(visitorEvents.visitor_id, visitorId))

  // Clear cookie
  const response = NextResponse.json({ ok: true })
  response.cookies.set("khat_vid", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  })

  return response
}
