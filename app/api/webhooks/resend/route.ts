import { NextRequest, NextResponse } from "next/server"
import { WEBHOOK_SECRET } from "@/lib/email/resend"
import { verifyResendSignature, processResendEvent } from "@/lib/newsletter/webhook"

// Server-to-server endpoint authenticated by the Svix signature (NOT CSRF).
export const dynamic = "force-dynamic"

export async function POST(request: NextRequest) {
  // Raw body is required for signature verification — read it before parsing.
  const body = await request.text()

  if (!WEBHOOK_SECRET) {
    console.error("[resend-webhook] RESEND_WEBHOOK_SECRET is not configured — rejecting")
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 })
  }

  const valid = verifyResendSignature({
    secret: WEBHOOK_SECRET,
    svixId: request.headers.get("svix-id"),
    svixTimestamp: request.headers.get("svix-timestamp"),
    svixSignature: request.headers.get("svix-signature"),
    body,
  })
  if (!valid) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 })
  }

  let event: unknown
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 })
  }

  try {
    const result = await processResendEvent(event as Parameters<typeof processResendEvent>[0])
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error("[resend-webhook] processing error:", err)
    // 500 → Resend retries delivery, so a transient DB blip doesn't lose the event.
    return NextResponse.json({ error: "processing failed" }, { status: 500 })
  }
}
