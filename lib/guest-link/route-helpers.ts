/**
 * «نسخة الضيف» — shared plumbing for the public /api/prepare/[token]/* routes.
 *
 * Every guest endpoint: private/no-store + noindex headers, token → link
 * resolution with the same expiry/revoke rule as the page, and (for POSTs)
 * origin check + JSON-only + a 16KB body cap read BEFORE parsing.
 */

import { NextResponse, type NextRequest } from "next/server"
import { validateOrigin } from "@/lib/api-utils"
import { checkIpRateLimit } from "@/lib/rate-limit"
import { GUEST_LINK_MAX_BODY_BYTES } from "@/lib/validation/guest-link"
import { linkAccess } from "./access"
import { findGuestLinkByToken, type ResolvedGuestLink } from "./service"

export const GUEST_PRIVATE_HEADERS: Record<string, string> = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow",
}

/** Per-IP limits (Yousef). Windows in ms. */
export const GUEST_RATE_LIMITS = {
  read: { max: 60, windowMs: 60_000 },
  submit: { max: 10, windowMs: 3_600_000 },
  /** Autosave fires on step change only — its own, looser bucket. */
  draft: { max: 60, windowMs: 3_600_000 },
  suggestion: { max: 20, windowMs: 3_600_000 },
} as const

export function guestJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: GUEST_PRIVATE_HEADERS })
}

export function rateLimited(
  request: NextRequest,
  bucket: keyof typeof GUEST_RATE_LIMITS,
): NextResponse | null {
  const { max, windowMs } = GUEST_RATE_LIMITS[bucket]
  const r = checkIpRateLimit(request, `guest_link_${bucket}`, max, windowMs)
  if (r.allowed) return null
  return guestJson({ error: "محاولات كثيرة، جرّب بعد شوي" }, 429)
}

/** Resolve a token to a USABLE link, or the response to send instead. */
export async function resolveUsable(
  token: string,
): Promise<{ ok: true; link: ResolvedGuestLink } | { ok: false; response: NextResponse }> {
  const link = await findGuestLinkByToken(token)
  if (!link) return { ok: false, response: guestJson({ error: "الرابط غير صالح" }, 404) }
  const access = linkAccess(link.row, link.recordingAt)
  if (access !== "ok") {
    return { ok: false, response: guestJson({ error: "الرابط لم يعد متاحاً" }, 410) }
  }
  return { ok: true, link }
}

/**
 * Origin + content-type + size cap, then parse. The cap is enforced on the
 * bytes actually read, not only on the (spoofable) Content-Length header.
 */
export async function readGuestJson(
  request: NextRequest,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  if (!validateOrigin(request)) {
    return { ok: false, response: guestJson({ error: "طلب غير صالح" }, 403) }
  }
  const ct = request.headers.get("content-type") ?? ""
  if (!ct.toLowerCase().startsWith("application/json")) {
    return { ok: false, response: guestJson({ error: "طلب غير صالح" }, 415) }
  }
  const declared = Number(request.headers.get("content-length") ?? "0")
  if (declared > GUEST_LINK_MAX_BODY_BYTES) {
    return { ok: false, response: guestJson({ error: "البيانات أكبر من المسموح" }, 413) }
  }
  let raw: string
  try {
    raw = await request.text()
  } catch {
    return { ok: false, response: guestJson({ error: "بيانات غير صالحة" }, 400) }
  }
  if (Buffer.byteLength(raw, "utf8") > GUEST_LINK_MAX_BODY_BYTES) {
    return { ok: false, response: guestJson({ error: "البيانات أكبر من المسموح" }, 413) }
  }
  try {
    return { ok: true, body: JSON.parse(raw) }
  } catch {
    return { ok: false, response: guestJson({ error: "بيانات غير صالحة" }, 400) }
  }
}
