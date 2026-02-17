import { getAllTopics } from "@/lib/topics-config"
import { TopicsManager } from "./topics-manager"

export default async function TopicsAdminPage() {
  const topics = await getAllTopics()
  return <TopicsManager initialTopics={topics} />
}
