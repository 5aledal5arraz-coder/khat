import { notFound } from "next/navigation"
import { getOfferByToken, recordOfferView, getOfferCompanyName } from "@/lib/partnership-offers"
import type { PublicPartnershipOffer } from "@/types/database"
import { OfferClient } from "./offer-client"

export const dynamic = "force-dynamic"

export default async function OfferPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const offer = await getOfferByToken(token)

  // Unknown token or unpublished draft → 404 (don't reveal existence).
  if (!offer || !offer.published) notFound()

  // Password-gated: the client component handles unlocking via the verify API.
  if (offer.password_hash) {
    return <OfferClient token={token} requiresPassword initialOffer={null} />
  }

  // Open link: record the view and render directly.
  await recordOfferView(token).catch(() => {})
  const company_name = await getOfferCompanyName(offer.lead_id)
  const publicOffer: PublicPartnershipOffer = {
    title: offer.title,
    intro: offer.intro,
    body: offer.body,
    packages: offer.packages,
    validity_note: offer.validity_note,
    contact_email: offer.contact_email,
    company_name,
  }
  return <OfferClient token={token} requiresPassword={false} initialOffer={publicOffer} />
}
