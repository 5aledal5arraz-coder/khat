import { env } from "@/lib/env"
import crypto from "crypto"

function getSecret(): string {
  const secret = env.NEWSLETTER_TRACKING_SECRET || env.RESEND_API_KEY
  if (!secret) throw new Error("NEWSLETTER_TRACKING_SECRET or RESEND_API_KEY is required for tracking")
  return secret
}

/** Create an HMAC-signed tracking token encoding a delivery ID */
export function createTrackingToken(deliveryId: string): string {
  const sig = crypto.createHmac("sha256", getSecret()).update(deliveryId).digest("hex").slice(0, 16)
  return Buffer.from(`${deliveryId}.${sig}`).toString("base64url")
}

/** Verify a tracking token and extract the delivery ID. Returns null if invalid. */
export function verifyTrackingToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf-8")
    const dotIndex = decoded.lastIndexOf(".")
    if (dotIndex === -1) return null
    const deliveryId = decoded.slice(0, dotIndex)
    const sig = decoded.slice(dotIndex + 1)
    const expected = crypto.createHmac("sha256", getSecret()).update(deliveryId).digest("hex").slice(0, 16)
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    return deliveryId
  } catch {
    return null
  }
}

/** Build open-tracking pixel URL */
export function getPixelUrl(baseUrl: string, deliveryId: string): string {
  const token = createTrackingToken(deliveryId)
  return `${baseUrl}/api/newsletter/track/open?t=${token}`
}

/** Build click-tracking URL wrapping an original link */
export function getClickUrl(baseUrl: string, deliveryId: string, linkToken: string): string {
  const token = createTrackingToken(deliveryId)
  return `${baseUrl}/api/newsletter/track/click?t=${token}&l=${linkToken}`
}
