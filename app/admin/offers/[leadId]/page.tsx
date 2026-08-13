import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowRight, ChevronLeft, FileText } from "lucide-react"
import { requireAdmin } from "@/lib/api-utils"
import { getSponsorshipLeadById } from "@/lib/admin/queries"
import { getOfferByLead } from "@/lib/partnership-offers"
import { listOfferResponses } from "@/lib/offer-responses"
import { listOfferCounters } from "@/lib/offer-counters"
import { OfferEditor } from "./offer-editor"
import { OfferResponsesPanel } from "./offer-responses-panel"
import { NegotiationPanel } from "./negotiation-panel"
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
  const responses = offer ? await listOfferResponses(offer.id) : []
  const counters = offer && responses.length > 0 ? await listOfferCounters(offer.id) : []

  /**
   * ── THE SCREEN FOLLOWS THE STAGE ─────────────────────────────────────────
   * Before a reply, the open question is the offer itself, so the editor is the
   * screen. After a reply, the content is settled and the open question is the
   * price and the package — ten fields to change one number is the wrong shape
   * for that conversation.
   *
   * One condition decides it, and it is the arrival of the first reply. Nothing
   * is removed: the full editor is still one click away, because "we agreed on
   * everything except the price" is the common case, not the only one.
   */
  const negotiating = Boolean(offer) && responses.length > 0

  const editor = offer ? (
    <OfferEditor
      offer={offer}
      companyName={lead.company_name}
      leadEmail={lead.email}
      contactName={lead.contact_name}
    />
  ) : null

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
        <h1 className="text-[22px] font-bold tracking-tight">
          {negotiating ? "التفاوض على العرض" : "صفحة العرض"}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {negotiating ? (
            <>
              ردّت{" "}
              <span className="font-medium text-foreground">{lead.company_name}</span> — بقي الاتفاق
              على السعر والباقة.
            </>
          ) : (
            <>
              عرض شراكة قابل للتعديل لـ{" "}
              <span className="font-medium text-foreground">{lead.company_name}</span> — انشره وأرسل
              الرابط السرّي للشركة.
            </>
          )}
        </p>
      </div>

      {!offer ? (
        <CreateOfferCTA leadId={leadId} />
      ) : negotiating ? (
        <>
          <NegotiationPanel offer={offer} responses={responses} counters={counters} />

          {/*
            `<details>` rather than React state, the same call as the episode
            index: it is closed on the server, so the editor is never briefly
            the default while JS loads, and it stays operable if JS never
            arrives at all.
          */}
          <details className="group rounded-2xl border border-border/60 bg-card" data-full-editor>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-[13px] font-semibold">
              <FileText className="h-4 w-4 text-muted-foreground" />
              تعديل العرض كاملاً
              <span className="text-[11px] font-normal text-muted-foreground">
                — العنوان والنص والباقات والنشر والإرسال
              </span>
              <ChevronLeft className="ms-auto h-4 w-4 text-muted-foreground transition-transform group-open:-rotate-90" />
            </summary>
            <div className="border-t border-border/50 p-5">{editor}</div>
          </details>
        </>
      ) : (
        <>
          {editor}
          <OfferResponsesPanel offerId={offer.id} responses={responses} />
        </>
      )}
    </div>
  )
}
