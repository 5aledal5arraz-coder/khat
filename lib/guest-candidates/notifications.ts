/**
 * Guest Candidates — notifications.
 *
 * Writes to `guest_candidate_notifications` log and optionally delivers via
 * Resend. All sends are non-blocking from the caller's perspective (errors are
 * logged to the row but never thrown).
 *
 * Independence: references only the candidates schema + the shared email
 * infrastructure. No FK to guests / episodes / studio.
 */

import { env } from "@/lib/env"
import { db } from "@/lib/db"
import {
  guestCandidateNotifications,
  prepFormLinks,
  guestCandidates,
} from "@/lib/db/schema/guest-candidates"
import { desc, eq } from "drizzle-orm"
import type { GuestCandidateNotification } from "@/types/database"
import { sendPrepSubmittedAdmin } from "@/lib/email/send"

function requireDb() {
  if (!db) throw new Error("Database not configured")
  return db
}

export const CANDIDATE_NOTIFY_EMAIL =
  env.CANDIDATE_NOTIFY_EMAIL ||
  env.ADMIN_NOTIFY_EMAIL ||
  "khatpodcast@hotmail.com"

// ---------------------------------------------------------------------------
// Low-level logging helper
// ---------------------------------------------------------------------------

interface LogNotificationInput {
  candidateId: string
  prepLinkId?: string | null
  notificationType: GuestCandidateNotification["notification_type"]
  deliveryChannel: GuestCandidateNotification["delivery_channel"]
  recipient?: string | null
  payload?: Record<string, unknown>
  deliveredAt?: Date | null
  deliveryError?: string | null
}

export async function logNotification(input: LogNotificationInput): Promise<GuestCandidateNotification> {
  const d = requireDb()
  const [row] = await d
    .insert(guestCandidateNotifications)
    .values({
      candidate_id: input.candidateId,
      prep_link_id: input.prepLinkId ?? null,
      notification_type: input.notificationType,
      delivery_channel: input.deliveryChannel,
      recipient: input.recipient ?? null,
      payload_json: input.payload ?? null,
      delivered_at: input.deliveredAt ?? null,
      delivery_error: input.deliveryError ?? null,
    })
    .returning()
  return row as unknown as GuestCandidateNotification
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

export async function listCandidateNotifications(
  candidateId: string
): Promise<GuestCandidateNotification[]> {
  const d = requireDb()
  const rows = await d
    .select()
    .from(guestCandidateNotifications)
    .where(eq(guestCandidateNotifications.candidate_id, candidateId))
    .orderBy(desc(guestCandidateNotifications.created_at))
  return rows as unknown as GuestCandidateNotification[]
}

export async function listRecentNotifications(limit = 50): Promise<GuestCandidateNotification[]> {
  const d = requireDb()
  const rows = await d
    .select()
    .from(guestCandidateNotifications)
    .orderBy(desc(guestCandidateNotifications.created_at))
    .limit(limit)
  return rows as unknown as GuestCandidateNotification[]
}

// ---------------------------------------------------------------------------
// Dispatchers — high-level "something happened, notify admin"
// ---------------------------------------------------------------------------

export interface NotifyPrepSubmittedInput {
  candidateId: string
  prepLinkId: string
  completionPercent: number
  isFinal: boolean
}

/**
 * Called on every prep form submission (draft or final). A log row is always
 * inserted. Email is dispatched only on final submissions and never throws.
 */
export async function notifyPrepSubmitted(input: NotifyPrepSubmittedInput): Promise<void> {
  const d = requireDb()

  // Resolve candidate + link for context
  const [cand] = await d
    .select({
      id: guestCandidates.id,
      full_name: guestCandidates.full_name,
      display_name: guestCandidates.display_name,
      category: guestCandidates.category,
    })
    .from(guestCandidates)
    .where(eq(guestCandidates.id, input.candidateId))
    .limit(1)

  const [link] = await d
    .select({ id: prepFormLinks.id, token: prepFormLinks.token })
    .from(prepFormLinks)
    .where(eq(prepFormLinks.id, input.prepLinkId))
    .limit(1)

  const payload = {
    candidate_name: cand?.display_name || cand?.full_name || "مرشح",
    category: cand?.category ?? null,
    completion_percent: input.completionPercent,
    is_final: input.isFinal,
    prep_link_token: link?.token ?? null,
  }

  // Draft (partial) — log in-app only, skip email to avoid noise.
  if (!input.isFinal) {
    await logNotification({
      candidateId: input.candidateId,
      prepLinkId: input.prepLinkId,
      notificationType: "prep_submitted",
      deliveryChannel: "in_app",
      payload,
      deliveredAt: new Date(),
    })
    return
  }

  // Final — send admin email (non-throwing).
  const recipient = CANDIDATE_NOTIFY_EMAIL
  let deliveryError: string | null = null
  let deliveredAt: Date | null = null
  try {
    await sendPrepSubmittedAdmin(recipient, {
      candidateName: payload.candidate_name,
      category: payload.category,
      completionPercent: input.completionPercent,
      candidateId: input.candidateId,
    })
    deliveredAt = new Date()
  } catch (err) {
    deliveryError = err instanceof Error ? err.message : String(err)
  }

  await logNotification({
    candidateId: input.candidateId,
    prepLinkId: input.prepLinkId,
    notificationType: "prep_submitted",
    deliveryChannel: "email",
    recipient,
    payload,
    deliveredAt,
    deliveryError,
  })
}

/** First-time open of a prep link — log-only, no email. */
export async function notifyPrepOpened(input: { candidateId: string; prepLinkId: string }): Promise<void> {
  await logNotification({
    candidateId: input.candidateId,
    prepLinkId: input.prepLinkId,
    notificationType: "prep_opened",
    deliveryChannel: "in_app",
    deliveredAt: new Date(),
  })
}
