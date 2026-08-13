import { notFound } from "next/navigation"
import { getOfferByToken, recordOfferView, buildPublicOffer } from "@/lib/partnership-offers"
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
  // Whitelisted in ONE place — see `buildPublicOffer`. The private columns
  // (status, internal_note) are absent by construction, not by subtraction.
  const publicOffer = await buildPublicOffer(offer)
  return <OfferClient token={token} requiresPassword={false} initialOffer={publicOffer} />
}
