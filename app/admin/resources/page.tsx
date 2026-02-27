import { getCuratedResources, getCuratedResourceCounts, getLastGenerationTime } from "@/lib/queries/curated-resources"
import { ResourcesAdmin } from "./resources-client"

export const dynamic = "force-dynamic"

export default async function AdminResourcesPage() {
  const [resources, deletedResources, counts, lastGenerated] = await Promise.all([
    getCuratedResources(),
    getCuratedResources("deleted"),
    getCuratedResourceCounts(),
    getLastGenerationTime(),
  ])

  return (
    <ResourcesAdmin
      initialResources={[...resources, ...deletedResources]}
      counts={counts}
      lastGenerated={lastGenerated?.toISOString() ?? null}
    />
  )
}
