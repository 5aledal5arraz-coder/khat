import { NextRequest } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import {
  getStudioSession,
  getTranscriptForSession,
  createTranscript,
  createAiOutput,
  getAiOutputForSession,
  getChaptersForSession,
  createChapters,
  getClipsForSession,
  createClips,
  getWebsitePackageForSession,
  createWebsitePackage,
  getDeepAnalysisForSession,
  createDeepAnalysis,
  getGuestIntelligenceForSession,
  createGuestIntelligence,
  getEpisodeIntelligenceForSession,
  saveEpisodeIntelligence,
  getGrowthPackageForSession,
  runGrowthPackageForSession,
  revalidateStudio,
} from "@/lib/studio"
import { resolveEirIdForSession } from "@/lib/studio/analysis-records"
import {
  generateStudioPackage,
  generateStudioChapters,
  generateStudioClips,
  generateWebsitePackage,
  generateDeepAnalysis,
  generateGuestIntelligence,
  generateGlobalEpisodeIntelligence,
  STUDIO_PROMPT_VERSION,
  EDITORIAL_MODEL,
} from "@/lib/ai"
import type { GlobalEpisodeIntelligence } from "@/lib/ai/episode-intelligence"
import { fetchTranscriptServer } from "@/lib/youtube/transcript-server"
import { transcribeAudioFile } from "@/lib/whisper"
import { downloadYouTubeAudio } from "@/lib/youtube/download"
import path from "path"
import fs from "fs/promises"
export const maxDuration = 300

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  // Parse which steps to run
  let steps: string[] = []
  let forceRegenerate = false
  try {
    const body = await request.json()
    steps = body.steps || ["transcript", "episode_intelligence", "ai_output", "chapters", "clips", "website_package", "deep_analysis", "guest_intelligence", "growth_package"]
    forceRegenerate = body.force === true
  } catch {
    steps = ["transcript", "episode_intelligence", "ai_output", "chapters", "clips", "website_package", "deep_analysis", "guest_intelligence", "growth_package"]
  }

  const encoder = new TextEncoder()
  const log = (action: string, detail?: Record<string, unknown>) => {
    const isError = action.includes("error") || action.includes("fatal") || action.includes("failed")
    const fn = isError ? console.error : console.info
    fn(`[Studio:generate-stream] [${id}] ${action}`, detail ? JSON.stringify(detail) : "")
  }

  log("pipeline_start", { steps, force: forceRegenerate })

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        if (event === "step_complete" || event === "step_skip") {
          const d = data as Record<string, unknown>
          log(event, { step: d.step, cached: d.cached, duration_ms: Date.now() - stepStartTimeRef })
        }
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      let stepStartTimeRef = Date.now()

      try {
        const session = await getStudioSession(id)
        if (!session) {
          log("error", { reason: "session_not_found" })
          send("error", { message: "الجلسة غير موجودة" })
          return // finally block will close the controller
        }

        log("session_loaded", { source: session.source, video_id: session.video_id, title: session.video_title })
        send("started", { steps, sessionId: id })

        // Resolve the studio-session → EIR link ONCE so every generator's
        // ai_runs row is attributable to this session (subject_id) and its
        // episode (eir_id → season_id derived by the router). subject_table
        // is the real "studio_sessions" table, not a dropped one.
        const eirContext = {
          eirId: await resolveEirIdForSession(id),
          subjectTable: "studio_sessions" as const,
          subjectId: id,
        }

        // Global Episode Intelligence — shared across all editorial generators.
        // Pre-hydrate from persistence so downstream steps benefit even when the
        // `episode_intelligence` step itself isn't in this run (e.g. regenerating
        // only the website package).
        let episodeIntelligence: GlobalEpisodeIntelligence | null = null
        try {
          const persisted = await getEpisodeIntelligenceForSession(id)
          if (persisted?.status === "ready" && persisted.data?.episode_essence) {
            episodeIntelligence = persisted.data
            log("episode_intelligence_hydrated", { source: "persisted" })
          }
        } catch (err) {
          log("episode_intelligence_hydrate_failed", { error: err instanceof Error ? err.message : String(err) })
        }

        for (const step of steps) {
          log("step_start", { step, provider: step === "transcript" ? "yt-dlp/whisper" : "openai" })
          send("step_start", { step })
          stepStartTimeRef = Date.now()

          try {
            switch (step) {
              // ----------------------------------------------------------
              // TRANSCRIPT
              // ----------------------------------------------------------
              case "transcript": {
                const existing = await getTranscriptForSession(id)
                if (!forceRegenerate && existing?.status === "ready" && existing.transcript_clean && existing.transcript_clean.trim().length >= 10) {
                  send("step_complete", { step, cached: true })
                  break
                }

                // For audio sessions, use Whisper; for YouTube, try caption extraction first
                if (session.source === "audio") {
                  send("step_progress", { step, message: "تحويل الصوت إلى نص عبر Whisper..." })
                  if (!session.audio_filename) throw new Error("لم يتم العثور على ملف صوتي لهذه الجلسة")
                  const audioDir = path.join(process.cwd(), "data", "studio-audio")
                  const filePath = path.join(audioDir, id, session.audio_filename)
                  await fs.access(filePath)
                  const whisperResult = await transcribeAudioFile(filePath, "ar", {
                    subjectTable: "studio_sessions",
                    subjectId: id,
                  })
                  if (!whisperResult.success || !whisperResult.text) {
                    throw new Error(whisperResult.error || "فشل في تحويل الصوت إلى نص")
                  }
                  const saveResult = await createTranscript(id, "whisper", whisperResult.text, "ar")
                  if (!saveResult.success) throw new Error(saveResult.error || "فشل في حفظ النص")
                  send("step_complete", { step, cached: false })
                } else if (session.video_id) {
                  // Strategy 1: Fast caption extraction via proxies (no download needed)
                  send("step_progress", { step, message: "جلب النص التلقائي من يوتيوب..." })
                  const captionResult = await fetchTranscriptServer(session.video_id)

                  if (captionResult.success && captionResult.text && captionResult.text.trim().length >= 10) {
                    // Captions found — save directly to DB
                    const saveResult = await createTranscript(id, "youtube_captions", captionResult.text, captionResult.language || "ar")
                    if (!saveResult.success) {
                      throw new Error(saveResult.error || "فشل في حفظ النص")
                    }
                  } else {
                    // Strategy 2: Download audio + Whisper transcription
                    send("step_progress", { step, message: "تحميل الصوت من يوتيوب وتحويله إلى نص..." })
                    const tempDir = path.join(process.cwd(), "data", "studio-audio", id, "yt-temp")
                    let ytCleanup: (() => Promise<void>) | null = null
                    try {
                      const download = await downloadYouTubeAudio(session.video_id!, tempDir)
                      ytCleanup = download.cleanup
                      const whisperRes = await transcribeAudioFile(download.filePath, "ar", {
                        subjectTable: "studio_sessions",
                        subjectId: id,
                      })
                      if (!whisperRes.success || !whisperRes.text) {
                        throw new Error(whisperRes.error || "فشل في تحويل الصوت إلى نص")
                      }
                      const ytSaveResult = await createTranscript(id, "whisper", whisperRes.text, "ar")
                      if (!ytSaveResult.success) throw new Error(ytSaveResult.error || "فشل في حفظ النص")
                    } finally {
                      if (ytCleanup) await ytCleanup()
                      try { await fs.rm(tempDir, { recursive: true, force: true }) } catch (err) { console.debug("[Studio:generate-stream] temp dir cleanup failed:", err) }
                    }
                  }
                  send("step_complete", { step, cached: false })
                } else {
                  send("step_skip", { step, reason: "لا يوجد مصدر صوت أو فيديو" })
                }
                break
              }

              // ----------------------------------------------------------
              // EPISODE INTELLIGENCE (Global Episode Understanding)
              // ----------------------------------------------------------
              case "episode_intelligence": {
                // Reuse the pre-hydrated persisted intelligence unless forced.
                if (!forceRegenerate && episodeIntelligence?.episode_essence) {
                  send("step_complete", { step, cached: true })
                  break
                }

                const transcript = await getTranscriptForSession(id)
                if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
                  throw new Error("لا يوجد نص جاهز — اجلب النص التلقائي أولاً")
                }

                send("step_progress", { step, message: "تحليل الحلقة بالكامل..." })

                const result = await generateGlobalEpisodeIntelligence(
                  transcript.transcript_clean,
                  session.video_title || ""
                )

                if (result.success) {
                  episodeIntelligence = result.data
                  // Persist so every later deliverable reuses one shared analysis.
                  await saveEpisodeIntelligence(id, {
                    status: "ready",
                    data: result.data,
                    raw_openai_response: result.raw || null,
                  })
                  log("episode_intelligence_complete", {
                    ideas: result.data.core_ideas.length,
                    moments: result.data.strongest_moments.length,
                    themes: result.data.themes.length,
                    controversy: result.data.controversy_moments.length,
                    clip_seeds: result.data.clip_seed_moments.length,
                  })
                } else {
                  // Non-fatal: editorial generators work without intelligence, just less coherent
                  await saveEpisodeIntelligence(id, {
                    status: "error",
                    error_message: result.error,
                  })
                  log("episode_intelligence_failed", { error: result.error })
                }

                send("step_complete", { step, cached: false })
                break
              }

              // ----------------------------------------------------------
              // AI OUTPUT
              // ----------------------------------------------------------
              case "ai_output": {
                if (!forceRegenerate) {
                  const existing = await getAiOutputForSession(id)
                  if (existing?.status === "ready") {
                    send("step_complete", { step, cached: true })
                    break
                  }
                }

                const transcript = await getTranscriptForSession(id)
                if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
                  throw new Error("لا يوجد نص جاهز — اجلب النص التلقائي أولاً")
                }

                send("step_progress", { step, message: "توليد مخرجات AI..." })

                // Create placeholder
                await createAiOutput(id, {
                  model: EDITORIAL_MODEL,
                  prompt_version: STUDIO_PROMPT_VERSION,
                  status: "generating",
                  title_best: "",
                  title_alternatives: [],
                  thumbnail_text_options: [],
                  youtube_description: "",
                  seo_keywords: [],
                  hashtags: [],
                  raw_openai_response: null,
                  error_message: null,
                })

                const result = await generateStudioPackage(
                  transcript.transcript_clean,
                  session.video_title || "",
                  session.channel_title || "",
                  episodeIntelligence,
                  eirContext
                )

                if (!result.success || !result.data) {
                  await createAiOutput(id, {
                    model: EDITORIAL_MODEL,
                    prompt_version: STUDIO_PROMPT_VERSION,
                    status: "error",
                    title_best: "",
                    title_alternatives: [],
                    thumbnail_text_options: [],
                    youtube_description: "",
                    seo_keywords: [],
                    hashtags: [],
                    raw_openai_response: null,
                    error_message: result.error || "فشل التوليد",
                  })
                  throw new Error(result.error || "فشل في توليد مخرجات AI")
                }

                await createAiOutput(id, {
                  // The actual model the router used (from
                  // generateStudioPackage), not the static editorial label;
                  // falls back to the label only if raw telemetry is absent.
                  model: (result.raw?.model as string | undefined) ?? EDITORIAL_MODEL,
                  prompt_version: STUDIO_PROMPT_VERSION,
                  status: "ready",
                  title_best: result.data.title_best,
                  title_alternatives: result.data.title_alternatives,
                  thumbnail_text_options: result.data.thumbnail_text_options,
                  youtube_description: result.data.youtube_description,
                  seo_keywords: result.data.seo_keywords,
                  hashtags: result.data.hashtags,
                  raw_openai_response: result.raw || null,
                  error_message: null,
                })

                send("step_complete", { step, cached: false })
                break
              }

              // ----------------------------------------------------------
              // CHAPTERS
              // ----------------------------------------------------------
              case "chapters": {
                if (!forceRegenerate) {
                  const existing = await getChaptersForSession(id)
                  if (existing?.status === "ready") {
                    send("step_complete", { step, cached: true })
                    break
                  }
                }

                const transcript = await getTranscriptForSession(id)
                if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
                  throw new Error("لا يوجد نص جاهز — اجلب النص التلقائي أولاً")
                }

                send("step_progress", { step, message: "توليد الفصول الزمنية..." })

                await createChapters(id, {
                  status: "generating",
                  chapters: [],
                  raw_openai_response: null,
                  error_message: null,
                })

                const result = await generateStudioChapters(
                  transcript.transcript_clean,
                  session.video_title || "",
                  session.duration_seconds,
                  eirContext
                )

                if (!result.success || !result.data) {
                  await createChapters(id, {
                    status: "error",
                    chapters: [],
                    raw_openai_response: null,
                    error_message: result.error || "فشل التوليد",
                  })
                  throw new Error(result.error || "فشل في توليد الفصول الزمنية")
                }

                await createChapters(id, {
                  status: "ready",
                  chapters: result.data.chapters,
                  raw_openai_response: result.raw || null,
                  error_message: null,
                })

                send("step_complete", { step, cached: false })
                break
              }

              // ----------------------------------------------------------
              // CLIPS
              // ----------------------------------------------------------
              case "clips": {
                if (!forceRegenerate) {
                  const existing = await getClipsForSession(id)
                  if (existing?.status === "ready") {
                    send("step_complete", { step, cached: true })
                    break
                  }
                }

                const transcript = await getTranscriptForSession(id)
                if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
                  throw new Error("لا يوجد نص جاهز — اجلب النص التلقائي أولاً")
                }

                send("step_progress", { step, message: "توليد المقاطع القصيرة..." })

                await createClips(id, {
                  status: "generating",
                  clips: [],
                  raw_openai_response: null,
                  error_message: null,
                })

                const result = await generateStudioClips(
                  transcript.transcript_clean,
                  session.video_title || "",
                  session.duration_seconds,
                  null, // no visual analysis in bulk generation
                  eirContext
                )

                if (!result.success || !result.data) {
                  await createClips(id, {
                    status: "error",
                    clips: [],
                    raw_openai_response: null,
                    error_message: result.error || "فشل التوليد",
                  })
                  throw new Error(result.error || "فشل في توليد المقاطع القصيرة")
                }

                await createClips(id, {
                  status: "ready",
                  clips: result.data.clips,
                  raw_openai_response: result.raw || null,
                  error_message: null,
                })

                send("step_complete", { step, cached: false })
                break
              }

              // ----------------------------------------------------------
              // WEBSITE PACKAGE
              // ----------------------------------------------------------
              case "website_package": {
                if (!forceRegenerate) {
                  const existing = await getWebsitePackageForSession(id)
                  if (existing?.status === "ready") {
                    send("step_complete", { step, cached: true })
                    break
                  }
                }

                const transcript = await getTranscriptForSession(id)
                if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
                  throw new Error("لا يوجد نص جاهز — اجلب النص التلقائي أولاً")
                }

                send("step_progress", { step, message: "توليد حزمة الموقع..." })

                await createWebsitePackage(id, {
                  status: "generating",
                  hero_summary: null,
                  full_summary: null,
                  takeaways: [],
                  quotes: [],

                  resources: [],
                  timestamps: [],
                  linked_episode_id: session.video_id || null,
                  raw_openai_response: null,
                  error_message: null,
                })

                const result = await generateWebsitePackage(
                  transcript.transcript_clean,
                  session.video_title || "",
                  session.duration_seconds,
                  episodeIntelligence,
                  eirContext
                )

                if (!result.success || !result.data) {
                  await createWebsitePackage(id, {
                    status: "error",
                    hero_summary: null,
                    full_summary: null,
                    takeaways: [],
                    quotes: [],
  
                    resources: [],
                    timestamps: [],
                    linked_episode_id: session.video_id || null,
                    raw_openai_response: null,
                    error_message: result.error || "فشل التوليد",
                  })
                  throw new Error(result.error || "فشل في توليد حزمة الموقع")
                }

                await createWebsitePackage(id, {
                  status: "ready",
                  hero_summary: result.data.hero_summary,
                  full_summary: result.data.full_summary,
                  takeaways: result.data.takeaways,
                  quotes: result.data.quotes,

                  resources: result.data.resources,
                  timestamps: result.data.timestamps,
                  linked_episode_id: session.video_id || null,
                  guest_package: result.data.guest_name ? {
                    guest_name: result.data.guest_name,
                    guest_bio: result.data.guest_bio || "",
                    guest_photo_url: null,
                    guest_external_links: {},
                  } : null,
                  raw_openai_response: {
                    ...(result.raw || {}),
                    guest_name: result.data.guest_name,
                    guest_bio: result.data.guest_bio,
                  },
                  error_message: null,
                })

                send("step_complete", { step, cached: false })
                break
              }

              // ----------------------------------------------------------
              // DEEP ANALYSIS
              // ----------------------------------------------------------
              case "deep_analysis": {
                if (!forceRegenerate) {
                  const existing = await getDeepAnalysisForSession(id)
                  if (existing?.status === "ready") {
                    send("step_complete", { step, cached: true })
                    break
                  }
                }

                const transcript = await getTranscriptForSession(id)
                if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
                  throw new Error("لا يوجد نص جاهز — اجلب النص التلقائي أولاً")
                }

                send("step_progress", { step, message: "توليد التحليل العميق..." })

                await createDeepAnalysis(id, { status: "generating" })

                const result = await generateDeepAnalysis(
                  transcript.transcript_clean,
                  session.video_title || "",
                  episodeIntelligence,
                  eirContext
                )

                if (!result.success) {
                  await createDeepAnalysis(id, {
                    status: "error",
                    error_message: result.error || "فشل التوليد",
                  })
                  throw new Error(result.error || "فشل في توليد التحليل العميق")
                }

                await createDeepAnalysis(id, {
                  status: "ready",
                  themes: result.data.themes,
                  thesis: result.data.thesis,
                  arguments: result.data.arguments,
                  emotional_moments: result.data.emotional_moments,
                  lessons: result.data.lessons,
                  contradictions: result.data.contradictions,
                  dialogue_map: result.data.dialogue_map,
                  conversation_arc: result.data.conversation_arc,
                  open_questions: result.data.open_questions,
                  raw_openai_response: result.raw || null,
                })

                send("step_complete", { step, cached: false })
                break
              }

              // ----------------------------------------------------------
              // GUEST INTELLIGENCE
              // ----------------------------------------------------------
              case "guest_intelligence": {
                if (!forceRegenerate) {
                  const existing = await getGuestIntelligenceForSession(id)
                  if (existing?.status === "ready") {
                    send("step_complete", { step, cached: true })
                    break
                  }
                }

                const transcript = await getTranscriptForSession(id)
                if (!transcript || transcript.status !== "ready" || !transcript.transcript_clean) {
                  throw new Error("لا يوجد نص جاهز — اجلب النص التلقائي أولاً")
                }

                send("step_progress", { step, message: "توليد ملف الضيف الذكي..." })

                await createGuestIntelligence(id, { status: "generating" })

                const result = await generateGuestIntelligence(
                  transcript.transcript_clean,
                  session.video_title || "",
                  episodeIntelligence,
                  eirContext
                )

                if (!result.success) {
                  await createGuestIntelligence(id, {
                    status: "error",
                    error_message: result.error || "فشل التوليد",
                  })
                  throw new Error(result.error || "فشل في توليد ملف الضيف")
                }

                await createGuestIntelligence(id, {
                  status: "ready",
                  detected_name: result.data.detected_name,
                  detected_bio: result.data.detected_bio,
                  confidence_score: result.data.confidence_score,
                  speaking_style: result.data.speaking_style,
                  key_positions: result.data.key_positions,
                  notable_quotes: result.data.notable_quotes,
                  raw_openai_response: result.raw || null,
                })

                send("step_complete", { step, cached: false })
                break
              }

              // ----------------------------------------------------------
              // GROWTH PACKAGE (copy-ready YouTube growth deliverable)
              // ----------------------------------------------------------
              case "growth_package": {
                if (!forceRegenerate) {
                  const existing = await getGrowthPackageForSession(id)
                  if (existing?.status === "ready") {
                    send("step_complete", { step, cached: true })
                    break
                  }
                }

                send("step_progress", { step, message: "توليد حزمة النمو..." })

                const result = await runGrowthPackageForSession(id, {
                  intelligence: episodeIntelligence,
                  onProgress: (slice) => send("step_progress", { step, message: `توليد حزمة النمو: ${slice}` }),
                })

                if (!result.success) {
                  throw new Error(result.error || "فشل في توليد حزمة النمو")
                }

                log("growth_package_complete", {
                  thumbnails: result.data?.thumbnail_concepts.length ?? 0,
                  social: result.data?.social_posts.length ?? 0,
                  shorts: result.data?.short_form_ideas.length ?? 0,
                  has_strategy: Boolean(result.data?.marketing_strategy),
                })
                send("step_complete", { step, cached: false })
                break
              }

              default:
                send("step_skip", { step, reason: "خطوة غير معروفة" })
            }
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "خطأ غير متوقع"
            log("step_error", { step, error: errMsg, duration_ms: Date.now() - stepStartTimeRef })
            send("step_error", { step, message: errMsg })
            // Continue to next step instead of aborting the entire pipeline
          }
        }

        log("pipeline_done", { steps })
        revalidateStudio(id)
        send("done", { success: true })
      } catch (err) {
        log("pipeline_fatal", { error: err instanceof Error ? err.message : String(err) })
        send("error", {
          message: err instanceof Error ? err.message : "خطأ غير متوقع",
        })
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
