import { getCuratedResources, getCuratedResourceCounts, getLastGenerationTime } from "@/lib/queries/curated-resources"
import { ResourcesAdmin } from "./resources-client"

export const dynamic = "force-dynamic"

export default async function AdminResourcesPage() {
  const [resources, counts, lastGenerated] = await Promise.all([
    getCuratedResources(),
    getCuratedResourceCounts(),
    getLastGenerationTime(),
  ])

  return (
    <ResourcesAdmin
      initialResources={resources}
      counts={counts}
      lastGenerated={lastGenerated?.toISOString() ?? null}
    />
  )
}
