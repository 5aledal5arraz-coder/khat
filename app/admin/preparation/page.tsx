import { listPreparations } from "@/lib/preparation/queries"
import { PreparationListClient } from "./preparation-list-client"

export const dynamic = "force-dynamic"

export default async function PreparationListPage() {
  const items = await listPreparations()
  return <PreparationListClient initialItems={items} />
}
