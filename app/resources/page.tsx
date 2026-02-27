import { Metadata } from "next"
import { ResourcesClient, type Resource } from "./resources-client"
import { getApprovedResources } from "@/lib/queries/curated-resources"

export const metadata: Metadata = {
  title: "الموارد",
  description: "كتب وروابط مذكورة في حلقات خط",
}

export default async function ResourcesPage() {
  const dbResources = await getApprovedResources()

  const resources: Resource[] = dbResources.map((r) => ({
    id: r.id,
    title: r.title,
    author: r.author || "",
    type: (r.type as "book" | "article" | "link") || "link",
    url: r.url || "#",
    episodes: [],
    topics: r.topic ? [r.topic] : [],
  }))

  return <ResourcesClient resources={resources} />
}
