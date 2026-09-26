/**
 * «نسخة الضيف» — token, expiry and stage rules. Pure; no DB.
 *
 * Token: same pattern as the live-room token (lib/preparation/token.ts) —
 * 32 random bytes base64url to the admin once, SHA-256 hex stored.
 */

import { generateLiveToken, hashLiveToken } from "@/lib/preparation/token"

const DAY_MS = 24 * 60 * 60 * 1000

/** With a recording date: the link lives until 3 days after it. */
export const EXPIRY_AFTER_RECORDING_MS = 3 * DAY_MS
/** Without one: 14 days from issue (creation or rotation). */
export const EXPIRY_WITHOUT_DATE_MS = 14 * DAY_MS

/** Raw tokens we issue are 43 base64url chars. Anything else is not ours. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{20,128}$/

export function generateGuestLinkToken(): { token: string; hash: string } {
  return generateLiveToken()
}

export function hashGuestLinkToken(token: string): string {
  return hashLiveToken(token)
}

export function isPlausibleToken(token: string): boolean {
  return TOKEN_SHAPE.test(token)
}

/** Fallback expiry written to `expires_at` at issue time. */
export function fallbackExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + EXPIRY_WITHOUT_DATE_MS)
}

/**
 * Effective expiry. The recording date wins when set — read live from the EIR,
 * so a date fixed after the link was sent still governs it.
 */
export function effectiveExpiry(
  recordingAt: Date | null,
  fallbackExpiresAt: Date,
): Date {
  if (recordingAt && !isNaN(recordingAt.getTime())) {
    return new Date(recordingAt.getTime() + EXPIRY_AFTER_RECORDING_MS)
  }
  return fallbackExpiresAt
}

export type GuestLinkAccess = "ok" | "expired" | "revoked"

export function linkAccess(
  row: { status: string; revoked_at: Date | null; expires_at: Date },
  recordingAt: Date | null,
  now: Date = new Date(),
): GuestLinkAccess {
  if (row.status === "revoked" || row.revoked_at) return "revoked"
  if (effectiveExpiry(recordingAt, row.expires_at).getTime() <= now.getTime()) return "expired"
  return "ok"
}

/**
 * Where the guest lands. Gated on `questionnaire_submitted_at` — NOT on any
 * status — so the prep view can never be reached before the questionnaire.
 */
export type GuestStage = "questionnaire" | "welcome" | "prep"

export function guestStage(row: {
  questionnaire_submitted_at: Date | null
  welcome_seen_at: Date | null
}): GuestStage {
  if (!row.questionnaire_submitted_at) return "questionnaire"
  if (!row.welcome_seen_at) return "welcome"
  return "prep"
}
