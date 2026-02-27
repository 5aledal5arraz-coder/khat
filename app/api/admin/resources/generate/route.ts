import { NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { db } from "@/lib/db"
import { topics } from "@/lib/db/schema"
import { generateCuratedResources } from "@/lib/openai"
import { insertCuratedResources, getExistingResourceTitles } from "@/lib/queries/curated-resources"

export async function POST() {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const topicsList = await db!.select().from(topics)
  if (topicsList.length === 0) {
    return NextResponse.json({ error: "لا توجد مواضيع في قاعدة البيانات" }, { status: 400 })
  }

  const existingTitles = await getExistingResourceTitles()

  const result = await generateCuratedResources(
    topicsList.map((t) => ({ name: t.name, description: t.description })),
    existingTitles
  )

  if (!result.success || !result.data) {
    return NextResponse.json({ error: result.error || "فشل في إنشاء الموارد" }, { status: 500 })
  }

  const batchId = crypto.randomUUID()
  const toInsert = result.data.map((r) => ({
    title: r.title,
    author: r.author,
    description: r.description,
    url: r.url,
    type: r.type,
    topic: r.topic,
    ai_reasoning: r.reasoning,
    status: "pending",
    batch_id: batchId,
  }))

  const inserted = await insertCuratedResources(toInsert)

  return NextResponse.json({ success: true, count: inserted.length, batch_id: batchId })
}
