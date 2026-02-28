import { getAllPartners } from "@/lib/queries/partnerships"
import { PartnershipsForm } from "./partnerships-form"

export default async function PartnershipsPage() {
  const partners = await getAllPartners()
  return <PartnershipsForm initialPartners={partners} />
}
