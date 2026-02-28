import { Metadata } from "next"
import { ResourcesClient, type Resource } from "./resources-client"
import { getApprovedResources } from "@/lib/queries/curated-resources"

export const metadata: Metadata = {
  title: "خطوط",
  description: "اختيارات أسبوعية من كتب ومقالات وروابط تكمّل رحلة الاستماع",
}

export default async function ResourcesPage() {
  const dbResources = await getApprovedResources()

  const resources: Resource[] = dbResources.map((r) => ({
    id: r.id,
    title: r.title,
    author: r.author || "",
    description: r.description || "",
    type: (r.type as "book" | "article" | "link") || "link",
    url: r.url || "#",
    topics: r.topic ? [r.topic] : [],
    approvedAt: r.approved_at?.toISOString() ?? r.created_at?.toISOString() ?? "",
  }))

  return <ResourcesClient resources={resources} />
}
