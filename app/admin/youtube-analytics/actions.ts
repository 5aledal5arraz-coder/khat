"use server"

import { revalidatePath } from "next/cache"

import { getAdminAuthUser } from "@/lib/api-utils"
import {
  fetchAgeBands,
  fetchCountries,
  saveSnapshot,
  windowOfDays,
  windowSinceFirstEpisode,
} from "@/lib/youtube/analytics"
import { clearAccessTokenCache, deleteGrant } from "@/lib/youtube/oauth"

/**
 * ── OWNER, CHECKED IN EVERY ACTION ────────────────────────────────────────
 * A Server Action is a public POST endpoint with a hard-to-guess name, not a
 * private function — the page's own `requireAdmin()` guards the RENDER and
 * nothing else. These two actions read the channel's private analytics and
 * destroy a stored credential, so each one re-checks for itself.
 */
async function requireOwner(): Promise<{ email: string } | { error: string }> {
  const user = await getAdminAuthUser()
  if (!user || !user.is_active) return { error: "غير مصرّح" }
  if (user.role !== "OWNER") return { error: "هذه العملية للمالك فقط" }
  return { email: user.email }
}

export type ActionResult = { ok: true; message: string } | { ok: false; error: string }

export async function refreshAudienceAction(windowKey: string): Promise<ActionResult> {
  const auth = await requireOwner()
  if ("error" in auth) return { ok: false, error: auth.error }

  // «منذ أول حلقة» derives its start from `min(episodes.release_date)`, so it
  // is a stated window rather than a guessed one — see windowSinceFirstEpisode.
  let window: { startDate: string; endDate: string } | null
  if (windowKey === "since-first") {
    window = await windowSinceFirstEpisode()
    if (!window) {
      return { ok: false, error: "ما فيه حلقة بتاريخ نشر في القاعدة — تعذّر تحديد البداية" }
    }
  } else {
    const days = Number(windowKey)
    if (!Number.isInteger(days) || days < 7 || days > 3650) {
      return { ok: false, error: "فترة غير معروفة" }
    }
    window = windowOfDays(days)
  }

  const { startDate, endDate } = window

  try {
    // Sequential, not Promise.all: the two calls share one access token and
    // one rate limit, and firing them together only doubles the chance of a
    // 429 on a job that runs by hand a few times a month.
    const countries = await fetchCountries(startDate, endDate)
    await saveSnapshot("countries", countries)

    const ages = await fetchAgeBands(startDate, endDate)
    await saveSnapshot("age_gender", ages)

    revalidatePath("/admin/youtube-analytics")
    revalidatePath("/partner")

    return {
      ok: true,
      message: `تم القياس: ${countries.rows.length} دولة و${ages.rows.length} فئة عمرية — من ${startDate} إلى ${endDate}`,
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function disconnectAction(): Promise<ActionResult> {
  const auth = await requireOwner()
  if ("error" in auth) return { ok: false, error: auth.error }

  try {
    await deleteGrant()
    // Without this the cached access token keeps working for up to an hour
    // after "disconnect" — a disconnect that does not disconnect.
    clearAccessTokenCache()
    revalidatePath("/admin/youtube-analytics")
    return {
      ok: true,
      message:
        "أُلغي الربط من الموقع. لإلغائه من جهة جوجل أيضًا: حسابك ← الأمان ← تطبيقات لها وصول.",
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
