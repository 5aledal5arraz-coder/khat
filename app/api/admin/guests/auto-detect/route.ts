import { requireAdminAPI } from "@/lib/api-utils"
import { detectGuestsForEpisodes, type GuestDetectionInput } from "@/lib/openai"
import { getAllGuests, createGuest, updateGuest } from "@/lib/admin/queries"
import { getEpisodes } from "@/lib/supabase/queries"
import { assignGuestToEpisode, getGuestAssignments } from "@/lib/episode-guests"
import { getStudioSessions, getTranscriptForSession } from "@/lib/studio"
import type { Guest } from "@/types/database"

export const maxDuration = 120

type EventType = "progress" | "result" | "done" | "error"

interface ResultItem {
  episode_id: string
  episode_title: string
  guest_name: string | null
  guest_bio: string | null
  action: "created" | "linked" | "needs_review" | "no_guest" | "bio_updated"
  confidence: string
}

interface Stats {
  total: number
  processed: number
  created: number
  linked: number
  bio_updated: number
  needs_review: number
  no_guest: number
  skipped: number
}

export async function POST(request: Request) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  let category: string | undefined
  try {
    const body = await request.json()
    if (body.category) category = body.category
  } catch {
    // No body — scan all episodes
  }

  let closed = false

  function emit(
    controller: ReadableStreamDefaultController,
    type: EventType,
    data: Record<string, unknown> = {},
  ) {
    if (closed) return
    try {
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify({ type, ...data })}\n\n`),
      )
    } catch {
      closed = true
    }
  }

  function finish(controller: ReadableStreamDefaultController) {
    if (closed) return
    closed = true
    try { controller.close() } catch { /* already closed */ }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const stats: Stats = {
        total: 0, processed: 0, created: 0, linked: 0,
        bio_updated: 0, needs_review: 0, no_guest: 0, skipped: 0,
      }

      try {
        emit(controller, "progress", { step: "loading", detail: "جارٍ تحميل البيانات...", percent: 5 })

        const [episodes, existingGuests, assignments, studioSessions] = await Promise.all([
          getEpisodes({ limit: 200, category }),
          getAllGuests(),
          getGuestAssignments(),
          getStudioSessions(),
        ])

        stats.total = episodes.length

        const guestMap = new Map<string, Guest>()
        for (const g of existingGuests) guestMap.set(g.name.trim().toLowerCase(), g)

        const videoToSession = new Map<string, string>()
        for (const s of studioSessions) {
          if (s.video_id) videoToSession.set(s.video_id, s.id)
        }

        // Filter to episodes that need processing
        emit(controller, "progress", { step: "filtering", detail: "جارٍ تصفية الحلقات...", percent: 10 })

        const toProcess = episodes.filter((ep) => {
          if (assignments[ep.id]) { stats.skipped++; return false }
          if (ep.guest_id) {
            const guest = existingGuests.find((g) => g.id === ep.guest_id)
            if (guest?.bio) { stats.skipped++; return false }
          }
          return true
        })

        if (toProcess.length === 0) {
          emit(controller, "done", { stats: { ...stats, processed: 0 } })
          finish(controller)
          return
        }

        emit(controller, "progress", {
          step: "filtering",
          detail: `${toProcess.length} حلقة من أصل ${episodes.length}`,
          percent: 15,
        })

        // Load transcripts from Studio sessions
        emit(controller, "progress", { step: "transcripts", detail: "جارٍ تحميل النصوص...", percent: 20 })

        const transcripts = new Map<string, string>()
        const sessionIds = toProcess.map((ep) => videoToSession.get(ep.id)).filter(Boolean) as string[]

        if (sessionIds.length > 0) {
          const results = await Promise.all(sessionIds.map((sid) => getTranscriptForSession(sid)))
          for (let i = 0; i < sessionIds.length; i++) {
            const t = results[i]
            if (t?.transcript_clean) {
              const session = studioSessions.find((s) => s.id === sessionIds[i])
              if (session?.video_id) {
                transcripts.set(session.video_id, t.transcript_clean.slice(0, 800))
              }
            }
          }
        }

        emit(controller, "progress", { step: "transcripts", detail: `${transcripts.size} نص متاح`, percent: 25 })

        // AI detection
        emit(controller, "progress", { step: "ai", detail: "جارٍ التحليل بالذكاء الاصطناعي...", percent: 30 })

        const aiInput: GuestDetectionInput[] = toProcess.map((ep) => ({
          episode_id: ep.id,
          title: ep.title,
          description: ep.description || null,
          transcript_snippet: transcripts.get(ep.id) || null,
        }))

        const aiResult = await detectGuestsForEpisodes(aiInput, (chunkIndex, totalChunks) => {
          const pct = 30 + Math.round((chunkIndex / totalChunks) * 40)
          emit(controller, "progress", { step: "ai", detail: `الدفعة ${chunkIndex + 1} من ${totalChunks}...`, percent: pct })
        })

        if (!aiResult.success || !aiResult.data) {
          emit(controller, "error", { detail: aiResult.error || "فشل التحليل" })
          finish(controller)
          return
        }

        // Process detections
        emit(controller, "progress", { step: "processing", detail: "جارٍ إنشاء وربط الضيوف...", percent: 75 })

        for (let i = 0; i < aiResult.data.length; i++) {
          const d = aiResult.data[i]
          const episode = episodes.find((ep) => ep.id === d.episode_id)
          if (!episode) continue

          stats.processed++
          const pct = 75 + Math.round((i / aiResult.data.length) * 20)

          const emitResult = (result: ResultItem) => emit(controller, "result", { percent: pct, result })

          if (!d.guest_name) {
            stats.no_guest++
            emitResult({ episode_id: d.episode_id, episode_title: episode.title, guest_name: null, guest_bio: null, action: "no_guest", confidence: d.confidence })
            continue
          }

          if (d.needs_review) {
            stats.needs_review++
            emitResult({ episode_id: d.episode_id, episode_title: episode.title, guest_name: d.guest_name, guest_bio: d.guest_bio, action: "needs_review", confidence: d.confidence })
            continue
          }

          const key = d.guest_name.trim().toLowerCase()
          let guest = guestMap.get(key)

          if (guest) {
            let action: ResultItem["action"] = "linked"
            if (!guest.bio && d.guest_bio) {
              await updateGuest(guest.id, { bio: d.guest_bio })
              action = "bio_updated"
              stats.bio_updated++
            }
            await assignGuestToEpisode(d.episode_id, guest.id)
            stats.linked++
            emitResult({ episode_id: d.episode_id, episode_title: episode.title, guest_name: d.guest_name, guest_bio: guest.bio || d.guest_bio, action, confidence: d.confidence })
          } else {
            const slug = d.guest_name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w\u0600-\u06FF-]/g, "")
            const created = await createGuest({
              name: d.guest_name,
              slug: slug || `guest-${crypto.randomUUID()}`,
              bio: d.guest_bio || null,
              photo_url: null,
              external_links: null,
              testimonial: null,
            })

            if (created.success && created.data) {
              guest = created.data
              guestMap.set(key, guest)
              await assignGuestToEpisode(d.episode_id, guest.id)
              stats.created++
              stats.linked++
              emitResult({ episode_id: d.episode_id, episode_title: episode.title, guest_name: d.guest_name, guest_bio: d.guest_bio, action: "created", confidence: d.confidence })
            } else {
              stats.needs_review++
              emitResult({ episode_id: d.episode_id, episode_title: episode.title, guest_name: d.guest_name, guest_bio: d.guest_bio, action: "needs_review", confidence: d.confidence })
            }
          }
        }

        emit(controller, "done", { stats, percent: 100 })
      } catch (error) {
        console.error("Auto-detect guests error:", error)
        emit(controller, "error", { detail: "حدث خطأ أثناء التحليل" })
      } finally {
        finish(controller)
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
