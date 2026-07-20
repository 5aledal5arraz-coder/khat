"use server"

import { revalidatePath } from "next/cache"
import { requireActionRole } from "@/lib/api-utils"
import { getOrCreateOfferForLead } from "@/lib/partnership-offers"

/**
 * Create (seed-from-proposal) the offer for a lead.
 *
 * Split out of the page's render path: previously the offer page called
 * `getOrCreateOfferForLead` while rendering, so merely *viewing* it (allowed for
 * any authenticated admin, including a read-only VIEWER) wrote a new offer row +
 * secret share token. Creation is now an explicit, role-gated action. Idempotent
 * — `getOrCreateOfferForLead` returns the existing offer if one already exists.
 */
export async function createOfferForLeadAction(
  leadId: string,
): Promise<{ success: boolean; error?: string }> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { success: false, error: gate.error }
  if (!leadId) return { success: false, error: "معرّف الطلب مطلوب" }

  const offer = await getOrCreateOfferForLead(leadId)
  if (!offer) {
    return {
      success: false,
      error: "تعذّر إنشاء العرض — تأكد من وجود الطلب واقتراح جاهز",
    }
  }

  revalidatePath(`/admin/offers/${leadId}`)
  return { success: true }
}
