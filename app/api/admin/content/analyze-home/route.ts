import { revalidatePath } from "next/cache"
import { requireAdminAPI } from "@/lib/api-utils"
import { getEpisodes } from "@/lib/supabase/queries"
import { getEpisodeEnrichment } from "@/lib/episode-enrichments"
import { getStudioSessions, getTranscriptForSession } from "@/lib/studio"
import { analyzeEpisodesForHome, type HomeAnalysisInput } from "@/lib/openai"
import {
  computeRelationships,
  buildTopicTaxonomy,
  saveKnowledgeMap,
  type EpisodeAnalysis,
  type EpisodeKnowledgeMap,
} from "@/lib/episode-knowledge"
import { createConfigStore } from "@/lib/config-store"
import type { HomeQuote, DailyReflection, EmotionalPath, PathSlug } from "@/types/database"
import type { HomeQuotesConfig, EmotionalPathsConfig, DailyReflectionsConfig } from "@/types/home-content"
import type { TopicsConfig, TopicConfig } from "@/types/topics"

export const maxDuration = 300

interface ProgressEvent {
  type: "progress" | "result" | "done" | "error"
  step?: string
  detail?: string
  percent?: number
  stats?: Record<string, number>
}

function sendEvent(controller: ReadableStreamDefaultController, event: ProgressEvent) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
}

// Path metadata (title, subtitle, icon, color)
const PATH_META: Record<PathSlug, { title: string; subtitle: string; icon: string; color: string }> = {
  "understanding-people": { title: "فهم الناس", subtitle: "حلقات عن العلاقات والتواصل والتعاطف", icon: "Users", color: "#6366f1" },
  "motivation-work": { title: "الدافع والعمل", subtitle: "حلقات عن الطموح والإنجاز والمهنة", icon: "Rocket", color: "#f59e0b" },
  "faith-meaning": { title: "الإيمان والمعنى", subtitle: "حلقات عن الروحانيات والهدف والقيم", icon: "Heart", color: "#10b981" },
  "self-awareness": { title: "وعي الذات", subtitle: "حلقات عن النمو الشخصي والتأمل الذاتي", icon: "Eye", color: "#8b5cf6" },
}

// Topic color palette for the taxonomy
const TOPIC_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444",
  "#06b6d4", "#ec4899", "#14b8a6", "#f97316", "#3b82f6",
]

/**
 * POST /api/admin/content/analyze-home
 * Streams progress events as it analyzes episodes and populates home page.
 */
export async function POST() {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // ── Step 1: Load episodes ──
        sendEvent(controller, { type: "progress", step: "loading", detail: "جارٍ تحميل الحلقات...", percent: 5 })

        const allEpisodes = await getEpisodes({ limit: 200 })

        if (allEpisodes.length === 0) {
          sendEvent(controller, { type: "error", detail: "لم يتم العثور على أي حلقات" })
          controller.close()
          return
        }

        // Split into seasons
        const season1 = allEpisodes.filter((ep) =>
          ep.season === 1 ||
          ep.title.includes("الموسم الأول") ||
          ep.title.includes("موسم 1") ||
          (ep.episode_number != null && ep.episode_number <= 30)
        )
        const season2 = allEpisodes.filter((ep) =>
          ep.season === 2 ||
          ep.title.includes("الموسم الثاني") ||
          ep.title.includes("موسم 2") ||
          (ep.episode_number != null && ep.episode_number > 30)
        )

        // If no clear season info, treat all as Season 1
        const episodesToAnalyze = season1.length > 0 ? [...season2, ...season1] : allEpisodes

        sendEvent(controller, {
          type: "progress", step: "loading",
          detail: `تم تحميل ${allEpisodes.length} حلقة (الموسم الأول: ${season1.length}، الموسم الثاني: ${season2.length})`,
          percent: 10,
        })

        // ── Step 2: Load enrichments and transcripts ──
        sendEvent(controller, { type: "progress", step: "enrichments", detail: "جارٍ تحميل الإثراءات والنصوص...", percent: 15 })

        const studioSessions = await getStudioSessions()
        const videoToSession = new Map<string, string>()
        for (const s of studioSessions) {
          if (s.video_id) videoToSession.set(s.video_id, s.id)
        }

        // Load enrichments + transcript snippets in parallel
        const aiInputs: HomeAnalysisInput[] = []

        for (const ep of episodesToAnalyze) {
          const enrichment = await getEpisodeEnrichment(ep.id)

          let transcriptSnippet: string | null = null
          const sessionId = videoToSession.get(ep.id)
          if (sessionId) {
            const transcript = await getTranscriptForSession(sessionId)
            if (transcript?.transcript_clean) {
              transcriptSnippet = transcript.transcript_clean.slice(0, 600)
            }
          }

          aiInputs.push({
            episode_id: ep.id,
            title: ep.title,
            slug: ep.slug,
            season: ep.season ?? (season2.some((s) => s.id === ep.id) ? 2 : season1.some((s) => s.id === ep.id) ? 1 : null),
            guest_name: ep.guest?.name || null,
            description: ep.description || null,
            enrichment_summary: enrichment?.hero_summary || enrichment?.full_summary || null,
            enrichment_takeaways: enrichment?.takeaways || null,
            enrichment_topics: enrichment?.topics || null,
            transcript_snippet: transcriptSnippet,
          })
        }

        sendEvent(controller, {
          type: "progress", step: "enrichments",
          detail: `تم تحميل الإثراءات لـ ${aiInputs.filter((i) => i.enrichment_summary).length} حلقة والنصوص لـ ${aiInputs.filter((i) => i.transcript_snippet).length} حلقة`,
          percent: 20,
        })

        // ── Step 3: AI Analysis ──
        sendEvent(controller, { type: "progress", step: "ai", detail: "جارٍ تحليل الحلقات بالذكاء الاصطناعي...", percent: 25 })

        const aiResult = await analyzeEpisodesForHome(aiInputs, (chunkIndex, totalChunks) => {
          const aiPercent = 25 + Math.round((chunkIndex / totalChunks) * 40)
          sendEvent(controller, {
            type: "progress", step: "ai",
            detail: `جارٍ تحليل الدفعة ${chunkIndex + 1} من ${totalChunks}...`,
            percent: aiPercent,
          })
        })

        if (!aiResult.success || !aiResult.data) {
          sendEvent(controller, { type: "error", detail: aiResult.error || "فشل في تحليل الحلقات" })
          controller.close()
          return
        }

        sendEvent(controller, {
          type: "progress", step: "ai",
          detail: `تم تحليل ${aiResult.data.length} حلقة بنجاح`,
          percent: 65,
        })

        // ── Step 4: Build Knowledge Map ──
        sendEvent(controller, { type: "progress", step: "map", detail: "جارٍ بناء خريطة المعرفة...", percent: 70 })

        const episodeAnalyses: Record<string, EpisodeAnalysis> = {}

        for (const result of aiResult.data) {
          const input = aiInputs.find((i) => i.episode_id === result.episode_id)
          if (!input) continue

          episodeAnalyses[result.episode_id] = {
            episode_id: result.episode_id,
            title: input.title,
            slug: input.slug,
            season: input.season,
            guest_name: input.guest_name,
            main_topic: result.main_topic,
            secondary_topics: result.secondary_topics || [],
            emotional_path: result.emotional_path,
            keywords: result.keywords || [],
            mood: result.mood,
            best_quote: result.best_quote,
            reflection: result.reflection,
            related_episode_ids: [], // computed next
          }
        }

        // Compute relationships
        const relationships = computeRelationships(episodeAnalyses)
        for (const [id, related] of Object.entries(relationships)) {
          if (episodeAnalyses[id]) {
            episodeAnalyses[id].related_episode_ids = related
          }
        }

        // Build taxonomy
        const taxonomy = buildTopicTaxonomy(episodeAnalyses)

        const knowledgeMap: EpisodeKnowledgeMap = {
          episodes: episodeAnalyses,
          topic_taxonomy: taxonomy,
          relationships,
          analyzed_at: new Date().toISOString(),
          season_1_count: Object.values(episodeAnalyses).filter((e) => e.season === 1).length,
          season_2_count: Object.values(episodeAnalyses).filter((e) => e.season === 2).length,
        }

        await saveKnowledgeMap(knowledgeMap)

        sendEvent(controller, {
          type: "progress", step: "map",
          detail: `تم بناء الخريطة: ${Object.keys(episodeAnalyses).length} حلقة، ${taxonomy.length} موضوع`,
          percent: 75,
        })

        // ── Step 5: Populate Config Files ──
        sendEvent(controller, { type: "progress", step: "populate", detail: "جارٍ ملء محتوى الصفحة الرئيسية...", percent: 80 })

        const now = new Date().toISOString()
        const analyses = Object.values(episodeAnalyses)

        // Sort: Season 2 first, then Season 1, then by episode number
        const sorted = [...analyses].sort((a, b) => {
          if ((a.season || 1) !== (b.season || 1)) return (b.season || 1) - (a.season || 1)
          return 0
        })

        // 5a. Populate home-quotes.json
        const quotesStore = createConfigStore<HomeQuotesConfig>("home-quotes.json", { quotes: [] })
        const newQuotes: HomeQuote[] = sorted.map((ep, i) => ({
          id: `hq-${crypto.randomUUID()}`,
          text: ep.best_quote.text,
          attribution: ep.best_quote.attribution,
          episode_id: ep.episode_id,
          episode_slug: ep.slug,
          episode_title: ep.title,
          theme: ep.best_quote.theme,
          status: "published" as const,
          created_at: now,
          updated_at: now,
        }))
        await quotesStore.write({ quotes: newQuotes })

        sendEvent(controller, {
          type: "progress", step: "populate",
          detail: `تم إنشاء ${newQuotes.length} اقتباس`,
          percent: 83,
        })

        // 5b. Populate emotional-paths.json
        const pathsStore = createConfigStore<EmotionalPathsConfig>("emotional-paths.json", { paths: [] })
        const pathEpisodes: Record<PathSlug, string[]> = {
          "understanding-people": [],
          "motivation-work": [],
          "faith-meaning": [],
          "self-awareness": [],
        }
        const pathQuotes: Record<PathSlug, string[]> = {
          "understanding-people": [],
          "motivation-work": [],
          "faith-meaning": [],
          "self-awareness": [],
        }

        for (const ep of sorted) {
          const path = ep.emotional_path as PathSlug
          if (pathEpisodes[path]) {
            pathEpisodes[path].push(ep.episode_id)
          }
          // Link the corresponding quote
          const quoteMatch = newQuotes.find((q) => q.episode_id === ep.episode_id)
          if (quoteMatch && pathQuotes[path]) {
            pathQuotes[path].push(quoteMatch.id)
          }
        }

        const pathSlugs: PathSlug[] = ["understanding-people", "motivation-work", "faith-meaning", "self-awareness"]
        const newPaths: EmotionalPath[] = pathSlugs.map((slug, i) => ({
          id: `path-${i + 1}`,
          slug,
          title: PATH_META[slug].title,
          subtitle: PATH_META[slug].subtitle,
          icon: PATH_META[slug].icon,
          color: PATH_META[slug].color,
          episode_ids: pathEpisodes[slug],
          quote_ids: pathQuotes[slug],
          order: i + 1,
        }))
        await pathsStore.write({ paths: newPaths })

        sendEvent(controller, {
          type: "progress", step: "populate",
          detail: `تم توزيع الحلقات على ${pathSlugs.length} مسارات`,
          percent: 87,
        })

        // 5c. Populate daily-reflections.json
        const reflectionsStore = createConfigStore<DailyReflectionsConfig>("daily-reflections.json", { reflections: [] })

        // Generate reflections — spread across dates starting from today
        const today = new Date()
        const newReflections: DailyReflection[] = sorted.map((ep, i) => {
          const date = new Date(today)
          date.setDate(date.getDate() + i)
          const dateStr = date.toISOString().split("T")[0]
          const quoteMatch = newQuotes.find((q) => q.episode_id === ep.episode_id)

          return {
            id: `dr-${crypto.randomUUID()}`,
            date: dateStr,
            short_quote: ep.reflection.short_quote,
            reflection: ep.reflection.reflection_text,
            thinking_question: ep.reflection.thinking_question,
            attribution: ep.guest_name || "بودكاست خط",
            episode_id: ep.episode_id,
            episode_slug: ep.slug,
            episode_title: ep.title,
            quote_id: quoteMatch?.id,
            quote_text: quoteMatch?.text,
            path_slug: ep.emotional_path as PathSlug,
            path_title: PATH_META[ep.emotional_path as PathSlug]?.title,
            status: "published" as const,
            created_at: now,
            updated_at: now,
          }
        })
        await reflectionsStore.write({ reflections: newReflections })

        sendEvent(controller, {
          type: "progress", step: "populate",
          detail: `تم إنشاء ${newReflections.length} تأمل يومي`,
          percent: 92,
        })

        // 5d. Populate topics.json
        const topicsStore = createConfigStore<TopicsConfig>("topics.json", { topics: [] })
        const newTopics: TopicConfig[] = taxonomy.slice(0, 20).map((t, i) => ({
          id: `topic-${crypto.randomUUID()}`,
          name: t.name,
          slug: t.slug,
          description: `${t.count} حلقة`,
          color: TOPIC_COLORS[i % TOPIC_COLORS.length],
          created_at: now,
          updated_at: now,
        }))
        await topicsStore.write({ topics: newTopics })

        sendEvent(controller, {
          type: "progress", step: "populate",
          detail: `تم إنشاء ${newTopics.length} موضوع`,
          percent: 97,
        })

        // ── Revalidate all affected pages ──
        revalidatePath("/")
        revalidatePath("/paths")
        revalidatePath("/admin/home-content")
        revalidatePath("/admin/content/analyze")

        // ── Done ──
        sendEvent(controller, {
          type: "done",
          percent: 100,
          stats: {
            episodes_analyzed: Object.keys(episodeAnalyses).length,
            season_1: knowledgeMap.season_1_count,
            season_2: knowledgeMap.season_2_count,
            quotes_created: newQuotes.length,
            reflections_created: newReflections.length,
            topics_created: newTopics.length,
            paths_populated: pathSlugs.filter((s) => pathEpisodes[s].length > 0).length,
            relationships_computed: Object.keys(relationships).length,
          },
        })
      } catch (error) {
        console.error("Home analysis error:", error)
        sendEvent(controller, { type: "error", detail: "حدث خطأ أثناء التحليل" })
      } finally {
        controller.close()
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
