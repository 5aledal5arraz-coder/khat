import { notFound } from "next/navigation"
import { getGuestRecord, resolveGuestNextBestAction } from "@/lib/guest-crm/record"
import { GuestRecordView } from "./guest-record-view"

export const dynamic = "force-dynamic"

export default async function GuestCastingRecordPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const record = await getGuestRecord(id)
  if (!record) notFound()

  const nextAction = resolveGuestNextBestAction(record)
  return <GuestRecordView record={record} nextAction={nextAction} />
}
