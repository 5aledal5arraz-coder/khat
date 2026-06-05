import { notFound, redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { getPreparationById } from "@/lib/preparation/queries"
import { findEirIdByPreparationId } from "@/lib/khat-brain/episode-workspace"
import { PreparationStudioClient } from "./preparation-studio-client"
import { PrepV2View } from "./prep-v2-view"
import type { PrepV2Payload } from "@/lib/preparation/v2/types"

export const dynamic = "force-dynamic"

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ legacy?: string }>
}

async function loadPrepV2(id: string): Promise<PrepV2Payload | null> {
  if (!db) return null
  const rows = await db
    .select({ prep_v2: episodePreparations.prep_v2 })
    .from(episodePreparations)
    .where(eq(episodePreparations.id, id))
    .limit(1)
  return (rows[0]?.prep_v2 as PrepV2Payload | null) ?? null
}

export default async function PreparationStudioPage({
  params,
  searchParams,
}: Props) {
  const { id } = await params
  const { legacy } = await searchParams

  // UX-3a — when this preparation is linked to an EIR, hand the
  // operator off to the new Episode Workspace's preparation tab.
  // The `?legacy=1` escape hatch keeps the old page reachable for one
  // release in case the new tab is missing something.
  if (legacy !== "1") {
    const eirId = await findEirIdByPreparationId(id)
    if (eirId) {
      redirect(`/admin/khat-brain/episodes/${eirId}?tab=preparation`)
    }
  }

  const [prep, prepV2] = await Promise.all([
    getPreparationById(id),
    loadPrepV2(id),
  ])
  if (!prep) notFound()
  return (
    <div>
      {prepV2 && <PrepV2View payload={prepV2} />}
      <PreparationStudioClient initial={prep} />
    </div>
  )
}
