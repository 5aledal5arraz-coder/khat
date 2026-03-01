import { NextRequest, NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { getWebsitePackageForSession } from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"
import { db, USE_DB } from "@/lib/db"
import { sql } from "drizzle-orm"
import { getEpisodeOverride, setEpisodeOverride } from "@/lib/episode-overrides"
import { setEpisodeQuotesEntry } from "@/lib/episode-quotes"
import { setEpisodeEnrichment } from "@/lib/episode-enrichments"
import { appendPushLog } from "@/lib/studio-push-log"
import { invalidateEpisodeCache } from "@/lib/cache/episode-cache"
import { fetchAllEpisodes } from "@/lib/youtube/queries"
import { autoLinkGuestForEpisode } from "@/lib/guest-linker"
import type { EpisodeEnrichment } from "@/types/episodes"

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
  const authError = await requireAdminAPI()
  if (authError) return authError
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

    // Build RPC params for atomic push (DB path)
    if (USE_DB) {
      let rpcOverride: Record<string, unknown> | null = null
      let rpcQuotes: Record<string, unknown> | null = null
      let rpcEnrichment: Record<string, unknown> | null = null

      // Title override
      if (fields.title && pkg.custom_title) {
        const existing = await getEpisodeOverride(episodeId)
        rpcOverride = {
          original_title: existing?.originalTitle || episodeTitle,
          custom_title: pkg.custom_title,
          custom_description: existing?.customDescription || null,
        }
        pushedFields.push("title")
      }

      // Description override
      if (fields.description && pkg.full_summary) {
        const existing = await getEpisodeOverride(episodeId)
        rpcOverride = {
          ...(rpcOverride || {}),
          original_title: rpcOverride?.original_title || existing?.originalTitle || episodeTitle,
          custom_title: rpcOverride?.custom_title || existing?.customTitle || episodeTitle,
          custom_description: pkg.full_summary,
        }
        pushedFields.push("description")
      }

      // Quotes
      if (fields.quotes && pkg.quotes.length > 0) {
        const selectedIndices = pkg.selected_quote_indices
          ? new Set(pkg.selected_quote_indices)
          : null
        const quotesToPush = selectedIndices
          ? pkg.quotes.filter((_, i) => selectedIndices.has(i))
          : pkg.quotes

        if (quotesToPush.length > 0) {
          rpcQuotes = {
            episode_title: episodeTitle,
            quotes: quotesToPush.map((q) => ({
              id: `studio-quote-${crypto.randomUUID()}`,
              text: q.text,
              theme: q.theme,
              speaker: q.speaker,
            })),
            status: "published",
            generated_at: new Date().toISOString(),
            published_at: new Date().toISOString(),
          }
          pushedFields.push("quotes")
        }
      }

      // Enrichments
      const enrichmentFields: Record<string, unknown> = {}
      let hasEnrichment = false

      if (fields.hero_summary && pkg.hero_summary) {
        enrichmentFields.hero_summary = pkg.hero_summary
        hasEnrichment = true
        pushedFields.push("hero_summary")
      }
      if (fields.full_summary && pkg.full_summary) {
        enrichmentFields.full_summary = pkg.full_summary
        hasEnrichment = true
        pushedFields.push("full_summary")
      }
      if (fields.takeaways && pkg.takeaways.length > 0) {
        const selectedIndices = pkg.selected_takeaway_indices
          ? new Set(pkg.selected_takeaway_indices)
          : null
        const takeawaysToPush = selectedIndices
          ? pkg.takeaways.filter((_, i) => selectedIndices.has(i))
          : pkg.takeaways
        if (takeawaysToPush.length > 0) {
          enrichmentFields.takeaways = takeawaysToPush
          hasEnrichment = true
          pushedFields.push("takeaways")
        }
      }
      if (fields.topics && pkg.topics.length > 0) {
        enrichmentFields.topics = pkg.topics
        hasEnrichment = true
        pushedFields.push("topics")
      }
      if (fields.resources && pkg.resources.length > 0) {
        enrichmentFields.resources = pkg.resources
        hasEnrichment = true
        pushedFields.push("resources")
      }
      if (fields.timestamps && pkg.timestamps.length > 0) {
        enrichmentFields.timestamps = pkg.timestamps
        hasEnrichment = true
        pushedFields.push("timestamps")
      }

      if (hasEnrichment) {
        rpcEnrichment = enrichmentFields
      }

      // Atomic push via RPC
      const rpcOverrideJson = rpcOverride ? JSON.stringify(rpcOverride) : null
      const rpcQuotesJson = rpcQuotes ? JSON.stringify(rpcQuotes) : null
      const rpcEnrichmentJson = rpcEnrichment ? JSON.stringify(rpcEnrichment) : null
      const logJson = JSON.stringify({
        session_id: sessionId,
        episode_title: episodeTitle,
        pushed_fields: pushedFields,
        pushed_at: new Date().toISOString(),
      })

      await db!.execute(sql`
        SELECT push_episode_data(
          ${episodeId},
          ${rpcOverrideJson}::jsonb,
          ${rpcQuotesJson}::jsonb,
          ${rpcEnrichmentJson}::jsonb,
          ${logJson}::jsonb
        )
      `)
    } else {
      // Fallback: individual lib calls (JSON config-store)

      // 1. Title override
      if (fields.title && pkg.custom_title) {
        const existing = await getEpisodeOverride(episodeId)
        await setEpisodeOverride({
          id: episodeId,
          originalTitle: existing?.originalTitle || episodeTitle,
          customTitle: pkg.custom_title,
          customDescription: existing?.customDescription,
        })
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
        const selectedIndices = pkg.selected_quote_indices
          ? new Set(pkg.selected_quote_indices)
          : null
        const quotesToPush = selectedIndices
          ? pkg.quotes.filter((_, i) => selectedIndices.has(i))
          : pkg.quotes

        if (quotesToPush.length > 0) {
          await setEpisodeQuotesEntry({
            episodeId,
            episodeTitle,
            quotes: quotesToPush.map((q) => ({
              id: `studio-quote-${crypto.randomUUID()}`,
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
      }

      // 4. Enrichments
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
        const selectedIndices = pkg.selected_takeaway_indices
          ? new Set(pkg.selected_takeaway_indices)
          : null
        const takeawaysToPush = selectedIndices
          ? pkg.takeaways.filter((_, i) => selectedIndices.has(i))
          : pkg.takeaways
        if (takeawaysToPush.length > 0) {
          enrichment.takeaways = takeawaysToPush
          hasEnrichment = true
          pushedFields.push("takeaways")
        }
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
    }

    // Auto-link guest if extracted by AI
    let guestLink: { linked: boolean; guestId?: string; guestName?: string; guestSlug?: string; created?: boolean } | null = null
    const guestPkg = pkg.guest_package as { guest_name: string; guest_bio: string; guest_photo_url: string | null; guest_external_links: Record<string, string> } | null
    // Fallback to raw_openai_response for older packages without guest_package
    const rawResponse = pkg.raw_openai_response as Record<string, unknown> | null
    const guestName = guestPkg?.guest_name || (rawResponse?.guest_name as string | undefined)
    const guestBio = guestPkg?.guest_bio || (rawResponse?.guest_bio as string | undefined)
    const guestPhotoUrl = guestPkg?.guest_photo_url || null
    const guestExternalLinks = guestPkg?.guest_external_links && Object.keys(guestPkg.guest_external_links).length > 0
      ? guestPkg.guest_external_links
      : null
    if (guestName && guestName.trim()) {
      guestLink = await autoLinkGuestForEpisode(episodeId, guestName, guestBio || null, guestPhotoUrl, guestExternalLinks)
    }

    // Invalidate episode cache + revalidate public pages
    await invalidateEpisodeCache()
    revalidatePath("/")
    revalidatePath("/episodes")
    revalidatePath("/admin/episodes")
    revalidatePath(`/admin/episodes/${episodeId}`)

    return NextResponse.json({
      success: true,
      episodeId,
      pushedFields,
      guestLink: guestLink || null,
    })
  } catch (error) {
    console.error("Push to episode error:", error)
    return NextResponse.json(
      { error: "حدث خطأ أثناء النشر" },
      { status: 500 }
    )
  }
}
