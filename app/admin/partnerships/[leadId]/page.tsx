import { notFound } from "next/navigation"
import { getPartnerRecord, resolveNextBestAction } from "@/lib/partnership-crm"
import { partnershipRef } from "@/lib/partnership-ref"
import { PartnerRecordView } from "./partner-record-view"

export const dynamic = "force-dynamic"

export default async function PartnerRecordPage({
  params,
}: {
  params: Promise<{ leadId: string }>
}) {
  const { leadId } = await params
  const record = await getPartnerRecord(leadId)
  if (!record) notFound()

  const nextAction = resolveNextBestAction(record)
  const reference = partnershipRef(record.lead.id)

  return <PartnerRecordView record={record} nextAction={nextAction} reference={reference} />
}
