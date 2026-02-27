import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { topics } from "@/lib/db/schema"
import { generateCuratedResources } from "@/lib/openai"
import { insertCuratedResources, getExistingResourceTitles } from "@/lib/queries/curated-resources"

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const topicsList = await db!.select().from(topics)
  if (topicsList.length === 0) {
    return NextResponse.json({ error: "No topics found" }, { status: 400 })
  }

  const existingTitles = await getExistingResourceTitles()

  const result = await generateCuratedResources(
    topicsList.map((t) => ({ name: t.name, description: t.description })),
    existingTitles
  )

  if (!result.success || !result.data) {
    return NextResponse.json({ error: result.error }, { status: 500 })
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
