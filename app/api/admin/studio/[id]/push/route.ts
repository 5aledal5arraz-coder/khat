import { NextRequest, NextResponse } from "next/server"
import { getWebsitePackageForSession } from "@/lib/studio"
import { getEpisodeOverride, setEpisodeOverride } from "@/lib/episode-overrides"
import { setEpisodeQuotesEntry } from "@/lib/episode-quotes"
import { setEpisodeEnrichment } from "@/lib/episode-enrichments"
import { appendPushLog } from "@/lib/studio-push-log"
import { fetchAllEpisodes } from "@/lib/youtube/queries"
import type { EpisodeEnrichment } from "@/types/ads"

interface PushFields {
  title?: boolean
  description?: boolean
  hero_summary?: boolean
  full_summary?: boolean
  takeaways?: boolean
  quotes?: boolean
  topics?: boolean
  resources?: boolean
  timestamps?: boolean
}

/**
 * POST /api/admin/studio/[id]/push — push website package data to episode
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params

  const pkg = await getWebsitePackageForSession(sessionId)
  if (!pkg || pkg.status !== "ready") {
    return NextResponse.json(
      { error: "لا توجد حزمة جاهزة للنشر" },
      { status: 400 }
    )
  }

  if (!pkg.linked_episode_id) {
    return NextResponse.json(
      { error: "لم يتم ربط الحزمة بحلقة — حدد الحلقة أولاً" },
      { status: 400 }
    )
  }

  let body: { fields: PushFields }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "بيانات غير صالحة" }, { status: 400 })
  }

  const { fields } = body
  if (!fields || typeof fields !== "object") {
    return NextResponse.json({ error: "يجب تحديد الحقول المراد نشرها" }, { status: 400 })
  }

  const episodeId = pkg.linked_episode_id
  const pushedFields: string[] = []

  try {
    // Find the episode to get its title for overrides and log
    let episodeTitle = ""
    try {
      const episodes = await fetchAllEpisodes()
      const ep = episodes.find((e) => e.id === episodeId)
      episodeTitle = ep?.title || episodeId
    } catch {
      episodeTitle = episodeId
    }

    // 1. Title override
    if (fields.title && pkg.hero_summary) {
      const existing = await getEpisodeOverride(episodeId)
      await setEpisodeOverride({
        id: episodeId,
        originalTitle: existing?.originalTitle || episodeTitle,
        customTitle: episodeTitle, // keep original title — override only if explicitly different
        customDescription: existing?.customDescription,
      })
      // Note: title push uses the existing episode title by default.
      // The admin can edit the AI output title in the studio before pushing.
      pushedFields.push("title")
    }

    // 2. Description override
    if (fields.description && pkg.full_summary) {
      const existing = await getEpisodeOverride(episodeId)
      await setEpisodeOverride({
        id: episodeId,
        originalTitle: existing?.originalTitle || episodeTitle,
        customTitle: existing?.customTitle || episodeTitle,
        customDescription: pkg.full_summary,
      })
      pushedFields.push("description")
    }

    // 3. Quotes
    if (fields.quotes && pkg.quotes.length > 0) {
      await setEpisodeQuotesEntry({
        episodeId,
        episodeTitle,
        quotes: pkg.quotes.map((q, i) => ({
          id: `studio-quote-${Date.now()}-${i}`,
          text: q.text,
          theme: q.theme,
          speaker: q.speaker,
        })),
        transcript: null,
        status: "published",
        generatedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
      })
      pushedFields.push("quotes")
    }

    // 4. Enrichments (summary, takeaways, topics, resources, timestamps)
    const enrichment: EpisodeEnrichment = {
      episodeId,
      updatedAt: new Date().toISOString(),
    }
    let hasEnrichment = false

    if (fields.hero_summary && pkg.hero_summary) {
      enrichment.hero_summary = pkg.hero_summary
      hasEnrichment = true
      pushedFields.push("hero_summary")
    }

    if (fields.full_summary && pkg.full_summary) {
      enrichment.full_summary = pkg.full_summary
      hasEnrichment = true
      pushedFields.push("full_summary")
    }

    if (fields.takeaways && pkg.takeaways.length > 0) {
      enrichment.takeaways = pkg.takeaways
      hasEnrichment = true
      pushedFields.push("takeaways")
    }

    if (fields.topics && pkg.topics.length > 0) {
      enrichment.topics = pkg.topics
      hasEnrichment = true
      pushedFields.push("topics")
    }

    if (fields.resources && pkg.resources.length > 0) {
      enrichment.resources = pkg.resources
      hasEnrichment = true
      pushedFields.push("resources")
    }

    if (fields.timestamps && pkg.timestamps.length > 0) {
      enrichment.timestamps = pkg.timestamps
      hasEnrichment = true
      pushedFields.push("timestamps")
    }

    if (hasEnrichment) {
      await setEpisodeEnrichment(enrichment)
    }

    // Write audit log
    await appendPushLog({
      sessionId,
      episodeId,
      episodeTitle,
      pushedFields,
      pushedAt: new Date().toISOString(),
    })

    return NextResponse.json({
      success: true,
      episodeId,
      pushedFields,
    })
  } catch (error) {
    console.error("Push to episode error:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء النشر" },
      { status: 500 }
    )
  }
}
