"use server"

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import { invalidate } from "@/lib/cache"
import {
  createUpcomingEpisode,
  updateUpcomingEpisode,
  UPCOMING_STATUSES,
  type UpcomingEpisodeStatus,
} from "@/lib/queries/upcoming-episodes"

/**
 * Writes for `/admin/upcoming`.
 *
 * Two actions, both gated at EDITOR — the same gate every other content
 * mutation uses. Uniqueness of the slug across `episodes` AND
 * `upcoming_episodes` is enforced inside the query layer, not here, so an
 * action can never bypass it by forgetting a step.
 */

export interface UpcomingFormInput {
  id?: string
  eir_id: string
  slug: string
  title: string
  guest_id: string | null
  summary: string | null
  axes: string[]
  guest_message: string | null
  guest_message_audio_url: string | null
  guest_message_audio_duration: number | null
  expected_date: string | null
  status: string
}

type ActionResult = { success: boolean; error?: string; id?: string; slug?: string }

function parseStatus(value: string): UpcomingEpisodeStatus | null {
  return (UPCOMING_STATUSES as readonly string[]).includes(value)
    ? (value as UpcomingEpisodeStatus)
    : null
}

/**
 * A published «حلقة قادمة» page is visible in exactly two places, and BOTH are
 * cached — so a save that skips either one looks to Khaled like a save that did
 * nothing (the recurring KHAT failure mode).
 *
 *  · `invalidate("homepage")` — the guest strip's upcoming faces become links
 *    the moment a row is published, and that resolution lives inside the
 *    homepage-tagged cache.
 *  · `/sitemap.xml` — the third public surface these rows reach.
 *
 * `/episodes/[slug]` itself needs nothing: it is `force-dynamic`, and the
 * two-step resolver's `cache()` is per-request only.
 */
function revalidateSurfaces(slug?: string) {
  invalidate("homepage")
  revalidatePath("/admin/upcoming")
  revalidatePath("/")
  revalidatePath("/sitemap.xml")
  if (slug) revalidatePath(`/episodes/${slug}`)
}

export async function saveUpcomingEpisodeAction(
  input: UpcomingFormInput,
): Promise<ActionResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }

  const status = parseStatus(input.status)
  if (!status) return { success: false, error: "حالة غير معروفة" }

  // The date arrives from `<input type="date">` as `YYYY-MM-DD` or "". Anything
  // else is a hand-edited payload and must not reach a `date` column.
  const expected = input.expected_date?.trim() || null
  if (expected && !/^\d{4}-\d{2}-\d{2}$/.test(expected)) {
    return { success: false, error: "التاريخ غير صالح" }
  }

  // A WORD FROM THE GUEST NEEDS A GUEST — and refusing here is the whole point.
  //
  // The message renders inside the guest card, because its attribution line is
  // «— {الاسم}، قبل نزول الحلقة» and there is no honest way to sign it without
  // one. Found on the demo page: a message was written, saved, stored, and
  // simply never appeared — the operator had typed real words into a field that
  // silently discarded them. Nothing failed, which is exactly the shape of
  // failure this project keeps paying for.
  //
  // Refused rather than rendered unsigned: an unattributed testimonial is worse
  // than a missing one, and the operator is one dropdown away from fixing it.
  const hasMessage =
    Boolean(input.guest_message?.trim()) || Boolean(input.guest_message_audio_url?.trim())
  if (hasMessage && !input.guest_id?.trim()) {
    return {
      success: false,
      error: "كتبتَ كلمة من الضيف بدون اختيار الضيف — اختر الضيف أولاً، وإلا لن تظهر الكلمة في الصفحة",
    }
  }

  const payload = {
    eir_id: input.eir_id,
    slug: input.slug,
    title: input.title,
    guest_id: input.guest_id,
    summary: input.summary,
    axes: Array.isArray(input.axes) ? input.axes : [],
    guest_message: input.guest_message,
    guest_message_audio_url: input.guest_message_audio_url,
    guest_message_audio_duration: input.guest_message_audio_duration,
    expected_date: expected,
    status,
  }

  const result = input.id
    ? await updateUpcomingEpisode(input.id, payload)
    : await createUpcomingEpisode(payload)

  if (!result.ok) return { success: false, error: result.error }

  revalidateSurfaces(result.row.slug)
  return { success: true, id: result.row.id, slug: result.row.slug }
}

/**
 * «سحب» / «نشر» straight from the list.
 *
 * Withdrawing keeps the row — deleting it would break a link that is already
 * out in the world, which is the one outcome the schema was shaped to avoid.
 * (Withdrawn pages stop being served; the row survives as the record of why.)
 */
export async function setUpcomingStatusAction(
  id: string,
  nextStatus: string,
): Promise<ActionResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }

  const status = parseStatus(nextStatus)
  if (!status) return { success: false, error: "حالة غير معروفة" }
  if (!id) return { success: false, error: "المعرّف مفقود" }

  const result = await updateUpcomingEpisode(id, { status })
  if (!result.ok) return { success: false, error: result.error }

  revalidateSurfaces(result.row.slug)
  return { success: true, id: result.row.id, slug: result.row.slug }
}
