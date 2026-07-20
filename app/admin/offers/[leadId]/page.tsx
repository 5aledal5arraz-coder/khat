import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowRight } from "lucide-react"
import { requireAdmin } from "@/lib/api-utils"
import { getSponsorshipLeadById } from "@/lib/admin/queries"
import { getOfferByLead } from "@/lib/partnership-offers"
import { OfferEditor } from "./offer-editor"
import { CreateOfferCTA } from "./create-offer-cta"

export const dynamic = "force-dynamic"

export default async function OfferEditorPage({
  params,
}: {
  params: Promise<{ leadId: string }>
}) {
  await requireAdmin()
  const { leadId } = await params

  const lead = await getSponsorshipLeadById(leadId)
  if (!lead) notFound()

  // Read-only load: viewing this page must NOT create anything. Seeding the
  // offer from the AI proposal is an explicit, role-gated action (the CTA
  // below) so a read-only VIEWER opening the page can't mint an offer + token.
  const offer = await getOfferByLead(leadId)

  return (
    <div className="space-y-6" dir="rtl" lang="ar">
      <div>
        <Link
          href="/admin/submissions?tab=sponsors"
          className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          العودة إلى طلبات الشراكة
        </Link>
        <h1 className="text-[22px] font-bold tracking-tight">صفحة العرض</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          عرض شراكة قابل للتعديل لـ{" "}
          <span className="font-medium text-foreground">{lead.company_name}</span> — انشره وأرسل
          الرابط السرّي للشركة.
        </p>
      </div>

      {offer ? (
        <OfferEditor offer={offer} companyName={lead.company_name} />
      ) : (
        <CreateOfferCTA leadId={leadId} />
      )}
    </div>
  )
}
