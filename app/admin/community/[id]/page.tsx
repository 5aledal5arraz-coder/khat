import { notFound } from "next/navigation"
import { getCommunityRecord } from "@/lib/community/record"
import { communityRef } from "@/lib/community-ref"
import { CommunityRecordView } from "./community-record-view"

export const dynamic = "force-dynamic"

export default async function CommunityRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const record = await getCommunityRecord(id)
  if (!record) notFound()
  return <CommunityRecordView record={record} reference={communityRef(record.contribution.id)} />
}
