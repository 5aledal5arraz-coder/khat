"use server"

/**
 * «نسخة الضيف» — admin server actions for the guest link.
 *
 * Role gates: link lifecycle (create / rotate / revoke) and PUBLISH are
 * ADMIN — publishing is what puts content in front of the guest. Curation
 * (location, sample questions, suggestion decisions) is EDITOR.
 *
 * Nothing here sends anything to the guest: the WhatsApp message is copied by
 * Khaled and sent from his own phone.
 */

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import {
  createGuestLink,
  decideGuestSuggestion,
  getActiveLinkForEir,
  revokeGuestLink,
  rotateGuestLink,
  setHousePhoto,
  updateGuestLinkFields,
  writePublishedSnapshot,
} from "@/lib/guest-link/service"
import { buildPreview, loadEirLinkContext } from "@/lib/guest-link/admin"
import { parseSampleOverrides } from "@/lib/guest-link/view"
import {
  guestLinkLocationSchema,
  sampleOverrideSchema,
  sanitizeGuestText,
  validateMapUrl,
} from "@/lib/validation/guest-link"

export type GuestLinkActionResult =
  | { ok: true; message: string; token?: string }
  | { ok: false; message: string }

function revalidate(eirId: string) {
  revalidatePath(`/admin/khat-brain/episodes/${eirId}`)
}

export async function createGuestLinkAction(
  eirId: string,
  displayName: string,
): Promise<GuestLinkActionResult> {
  const gate = await requireActionRole("ADMIN")
  if (!gate.ok) return { ok: false, message: gate.error }
  const name = sanitizeGuestText(displayName ?? "").slice(0, 120)
  if (name.length < 2) return { ok: false, message: "اكتب اسم الضيف كما نناديه." }
  const ctx = await loadEirLinkContext(eirId)
  if (!ctx) return { ok: false, message: "الحلقة غير موجودة." }
  const r = await createGuestLink({
    eirId,
    guestId: ctx.guestId,
    displayName: name,
    createdBy: gate.user.id,
  })
  if ("error" in r) return { ok: false, message: "فيه رابط فعّال لهذا الضيف في هذه الحلقة." }
  revalidate(eirId)
  return { ok: true, message: "تم إنشاء الرابط — انسخه الحين.", token: r.token }
}

export async function rotateGuestLinkAction(eirId: string): Promise<GuestLinkActionResult> {
  const gate = await requireActionRole("ADMIN")
  if (!gate.ok) return { ok: false, message: gate.error }
  const link = await getActiveLinkForEir(eirId)
  if (!link) return { ok: false, message: "ما فيه رابط فعّال." }
  const r = await rotateGuestLink(link.id)
  if (!r) return { ok: false, message: "تعذّر تجديد الرابط." }
  revalidate(eirId)
  return { ok: true, message: "تم تجديد الرابط — الرابط القديم توقف.", token: r.token }
}

export async function revokeGuestLinkAction(eirId: string): Promise<GuestLinkActionResult> {
  const gate = await requireActionRole("ADMIN")
  if (!gate.ok) return { ok: false, message: gate.error }
  const link = await getActiveLinkForEir(eirId)
  if (!link) return { ok: false, message: "ما فيه رابط فعّال." }
  const ok = await revokeGuestLink(link.id)
  revalidate(eirId)
  return ok ? { ok: true, message: "تم إلغاء الرابط." } : { ok: false, message: "تعذّر الإلغاء." }
}

export async function saveGuestLinkDetailsAction(
  eirId: string,
  input: {
    guest_display_name: string
    location_label: string
    address: string
    map_url: string
    show_schedule: boolean
  },
): Promise<GuestLinkActionResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  const link = await getActiveLinkForEir(eirId)
  if (!link) return { ok: false, message: "ما فيه رابط فعّال." }

  const parsed = guestLinkLocationSchema.safeParse({
    location_label: input.location_label ?? "",
    address: input.address ?? "",
    map_url: input.map_url ?? "",
    show_schedule: Boolean(input.show_schedule),
  })
  if (!parsed.success) return { ok: false, message: "تحقق من الحقول (طولها أو صيغتها)." }
  let mapUrl: string | null = null
  if (parsed.data.map_url) {
    const m = validateMapUrl(parsed.data.map_url)
    if (!m.ok) return { ok: false, message: m.error }
    mapUrl = m.url
  }
  const name = sanitizeGuestText(input.guest_display_name ?? "").slice(0, 120)
  if (name.length < 2) return { ok: false, message: "اكتب اسم الضيف كما نناديه." }

  const ok = await updateGuestLinkFields(link.id, {
    guest_display_name: name,
    location_label: parsed.data.location_label || null,
    address: parsed.data.address || null,
    map_url: mapUrl,
    show_schedule: parsed.data.show_schedule,
    location_updated_at: new Date(),
  })
  revalidate(eirId)
  return ok ? { ok: true, message: "تم الحفظ." } : { ok: false, message: "تعذّر الحفظ." }
}

export async function removeHousePhotoAction(eirId: string): Promise<GuestLinkActionResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  const link = await getActiveLinkForEir(eirId)
  if (!link) return { ok: false, message: "ما فيه رابط فعّال." }
  // The file is deleted only once the published snapshot no longer shows it.
  const ok = await setHousePhoto(link.id, null)
  revalidate(eirId)
  return ok ? { ok: true, message: "أُزيلت الصورة." } : { ok: false, message: "تعذّر الحذف." }
}

export async function setSampleOverrideAction(
  eirId: string,
  questionId: string,
  override: { hidden?: boolean; pinned?: boolean; text?: string | null },
): Promise<GuestLinkActionResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  const link = await getActiveLinkForEir(eirId)
  if (!link) return { ok: false, message: "ما فيه رابط فعّال." }
  if (typeof questionId !== "string" || questionId.length > 200) {
    return { ok: false, message: "سؤال غير صالح." }
  }
  const parsed = sampleOverrideSchema.safeParse({
    ...(override.hidden !== undefined ? { hidden: override.hidden } : {}),
    ...(override.pinned !== undefined ? { pinned: override.pinned } : {}),
    ...(typeof override.text === "string" ? { text: override.text } : {}),
  })
  if (!parsed.success) return { ok: false, message: "النص أطول من المسموح." }

  const all = parseSampleOverrides(link.sample_overrides)
  const current = { ...(all[questionId] ?? {}) }
  if (parsed.data.hidden !== undefined) current.hidden = parsed.data.hidden || undefined
  if (parsed.data.pinned !== undefined) current.pinned = parsed.data.pinned || undefined
  if (override.text === null || parsed.data.text === "") delete current.text
  else if (parsed.data.text !== undefined) current.text = parsed.data.text
  const clean = Object.fromEntries(Object.entries(current).filter(([, v]) => v !== undefined))
  if (Object.keys(clean).length) all[questionId] = clean
  else delete all[questionId]

  const ok = await updateGuestLinkFields(link.id, { sample_overrides: all as Record<string, unknown> })
  revalidate(eirId)
  return ok ? { ok: true, message: "تم." } : { ok: false, message: "تعذّر الحفظ." }
}

/**
 * Publish = freeze the CURRENT preview as the guest's snapshot. The guest
 * never reads the live prep; a later prep edit only raises the stale badge
 * until someone republishes.
 */
export async function publishGuestLinkAction(eirId: string): Promise<GuestLinkActionResult> {
  const gate = await requireActionRole("ADMIN")
  if (!gate.ok) return { ok: false, message: gate.error }
  const link = await getActiveLinkForEir(eirId)
  if (!link) return { ok: false, message: "ما فيه رابط فعّال." }
  const ctx = await loadEirLinkContext(eirId)
  if (!ctx) return { ok: false, message: "الحلقة غير موجودة." }
  const prep = ctx.prep?.prep_v2 ?? null
  if (!prep) return { ok: false, message: "ما فيه إعداد مولَّد للنشر بعد." }

  const { view, refs } = buildPreview(link, prep, ctx.recordingAt)
  const ok = await writePublishedSnapshot(link.id, {
    view,
    refs,
    by: gate.user.email ?? gate.user.id,
    prepId: ctx.prep!.id,
    prepUpdatedAt: ctx.prep!.updated_at,
    scheduleAt: ctx.recordingAt,
  })
  revalidate(eirId)
  return ok ? { ok: true, message: "تم النشر للضيف." } : { ok: false, message: "تعذّر النشر." }
}

export async function decideGuestSuggestionAction(
  eirId: string,
  suggestionId: string,
  decision: "accepted" | "rejected",
): Promise<GuestLinkActionResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  if (decision !== "accepted" && decision !== "rejected") {
    return { ok: false, message: "قرار غير صالح." }
  }
  const row = await decideGuestSuggestion(suggestionId, eirId, decision, gate.user.email ?? gate.user.id)
  revalidate(eirId)
  if (!row) return { ok: false, message: "الاقتراح غير موجود أو سبق البتّ فيه." }
  return { ok: true, message: decision === "accepted" ? "تم القبول." : "تم الرفض." }
}
