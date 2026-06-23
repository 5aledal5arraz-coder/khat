"use client"

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react"
import type { Episode } from "@/types/database"
import type { TabStatus } from "../components/shared"
import { useTranscript } from "./transcript-context"
import { useContent } from "./content-context"
import { useChapters } from "./chapters-context"
import { useClips } from "./clips-context"
import { useWebsitePkg } from "./website-pkg-context"
import { useGuest } from "./guest-context"
import { useAnalyzer } from "./analyzer-context"
import { useSession } from "./session-context"
import { useDeepAnalysis } from "./deep-analysis-context"
import { useGuestIntelligence } from "./guest-intelligence-context"
import { useGrowth } from "./growth-context"

// ---------------------------------------------------------------------------
// Generate-All step definitions
// ---------------------------------------------------------------------------

export type GenerateAllStep = "transcript" | "episode_intelligence" | "ai_output" | "chapters" | "clips" | "website_package" | "deep_analysis" | "guest_intelligence" | "growth_package"

export const GENERATE_ALL_STEPS: { key: GenerateAllStep; label: string }[] = [
  { key: "transcript", label: "النص التلقائي" },
  { key: "episode_intelligence", label: "فهم الحلقة" },
  { key: "ai_output", label: "مخرجات AI" },
  { key: "chapters", label: "الفصول الزمنية" },
  { key: "clips", label: "المقاطع القصيرة" },
  { key: "website_package", label: "حزمة الموقع" },
  { key: "deep_analysis", label: "التحليل العميق" },
  { key: "guest_intelligence", label: "ملف الضيف" },
  { key: "growth_package", label: "حزمة النمو" },
]

interface PublishContextValue {
  episodes: Episode[]
  loadEpisodes: () => Promise<void>
  generateAll: () => Promise<void>
  generateAllRunning: boolean
  generateAllCurrentStep: GenerateAllStep | null
  generateAllCompleted: GenerateAllStep[]
  generateAllError: string
  tabStatuses: Record<string, TabStatus>
}

const PublishContext = createContext<PublishContextValue | null>(null)

export function usePublish() {
  const ctx = useContext(PublishContext)
  if (!ctx) throw new Error("usePublish must be used within PublishProvider")
  return ctx
}

export function PublishProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useSession()

  // Read statuses from domain contexts
  const {
    transcriptStatus, setTranscriptStatus, setTranscriptError, reloadTranscript,
  } = useTranscript()
  const {
    aiStatus, setAiStatus, setAiError, reloadContent,
  } = useContent()
  const {
    chaptersStatus, setChaptersStatus, setChaptersError, reloadChapters,
  } = useChapters()
  const {
    clipsStatus, setClipsStatus, setClipsError, reloadClips,
  } = useClips()
  const {
    websitePkgStatus, setWebsitePkgStatus, setWebsitePkgError, reloadWebsitePkg,
  } = useWebsitePkg()
  const {
    deepAnalysisStatus, setDeepAnalysisStatus, reloadDeepAnalysis,
  } = useDeepAnalysis()
  const {
    guestIntelligenceStatus, setGuestIntelligenceStatus, reloadGuestIntelligence,
  } = useGuestIntelligence()
  const {
    growthStatus, setGrowthStatus, reloadGrowth,
  } = useGrowth()
  const { guestPackageStatus } = useGuest()
  const { analyzerStatus } = useAnalyzer()

  // --- Episodes ---
  const [episodes, setEpisodes] = useState<Episode[]>([])

  const loadEpisodes = useCallback(async () => {
    try {
      const res = await fetch(`/api/episodes?limit=50`)
      if (!res.ok) {
        console.error("[Studio] loadEpisodes failed:", res.status)
        return
      }
      const eps = await res.json()
      setEpisodes(Array.isArray(eps) ? eps : [])
    } catch (err) {
      console.error("[Studio] loadEpisodes error:", err)
    }
  }, [])

  // --- Generate All ---
  const [generateAllRunning, setGenerateAllRunning] = useState(false)
  const [generateAllCurrentStep, setGenerateAllCurrentStep] = useState<GenerateAllStep | null>(null)
  const [generateAllCompleted, setGenerateAllCompleted] = useState<GenerateAllStep[]>([])
  const [generateAllError, setGenerateAllError] = useState("")

  const generateAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    return () => { generateAbortRef.current?.abort() }
  }, [])

  // --- Reload all data after SSE ---
  const reloadAllData = useCallback(async () => {
    await Promise.all([
      reloadTranscript(),
      reloadContent(),
      reloadChapters(),
      reloadClips(),
      reloadWebsitePkg(),
      reloadDeepAnalysis(),
      reloadGuestIntelligence(),
      reloadGrowth(),
    ])
  }, [reloadTranscript, reloadContent, reloadChapters, reloadClips, reloadWebsitePkg, reloadDeepAnalysis, reloadGuestIntelligence, reloadGrowth])

  const generateAll = useCallback(async () => {
    generateAbortRef.current?.abort()
    const abortController = new AbortController()
    generateAbortRef.current = abortController

    setGenerateAllRunning(true)
    setGenerateAllCurrentStep(null)
    setGenerateAllError("")

    // Detect already-completed steps
    const alreadyCompleted: GenerateAllStep[] = []
    if (transcriptStatus === "ready") alreadyCompleted.push("transcript")
    if (aiStatus === "ready") alreadyCompleted.push("ai_output")
    if (chaptersStatus === "ready") alreadyCompleted.push("chapters")
    if (clipsStatus === "ready") alreadyCompleted.push("clips")
    if (websitePkgStatus === "ready") alreadyCompleted.push("website_package")
    if (deepAnalysisStatus === "ready") alreadyCompleted.push("deep_analysis")
    if (guestIntelligenceStatus === "ready") alreadyCompleted.push("guest_intelligence")
    if (growthStatus === "ready") alreadyCompleted.push("growth_package")
    setGenerateAllCompleted([...alreadyCompleted])

    const stepsToRun = GENERATE_ALL_STEPS
      .map(s => s.key)
      .filter(key => !alreadyCompleted.includes(key))

    if (stepsToRun.length === 0) {
      setGenerateAllRunning(false)
      return
    }

    // Update UI status for steps that will run
    for (const step of stepsToRun) {
      switch (step) {
        case "transcript": setTranscriptStatus("generating"); setTranscriptError(""); break
        case "ai_output": setAiStatus("generating"); setAiError(""); break
        case "chapters": setChaptersStatus("generating"); setChaptersError(""); break
        case "clips": setClipsStatus("generating"); setClipsError(""); break
        case "website_package": setWebsitePkgStatus("generating"); setWebsitePkgError(""); break
        case "deep_analysis": setDeepAnalysisStatus("generating"); break
        case "guest_intelligence": setGuestIntelligenceStatus("generating"); break
        case "growth_package": setGrowthStatus("generating"); break
      }
    }

    try {
      const response = await fetch(`/api/admin/studio/${sessionId}/generate-stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: stepsToRun }),
        signal: abortController.signal,
      })

      if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => "فشل في الاتصال بالخادم")
        setGenerateAllError(errorText)
        setGenerateAllRunning(false)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split("\n")
        buffer = ""

        let currentEvent = ""
        let currentData = ""

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim()
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6).trim()
          } else if (line === "" && currentEvent && currentData) {
            try {
              const data = JSON.parse(currentData)

              switch (currentEvent) {
                case "step_start": {
                  const step = data.step as GenerateAllStep
                  setGenerateAllCurrentStep(step)
                  switch (step) {
                    case "transcript": setTranscriptStatus("generating"); break
                    case "ai_output": setAiStatus("generating"); break
                    case "chapters": setChaptersStatus("generating"); break
                    case "clips": setClipsStatus("generating"); break
                    case "website_package": setWebsitePkgStatus("generating"); break
                    case "deep_analysis": setDeepAnalysisStatus("generating"); break
                    case "guest_intelligence": setGuestIntelligenceStatus("generating"); break
                    case "growth_package": setGrowthStatus("generating"); break
                  }
                  break
                }

                case "step_complete": {
                  const step = data.step as GenerateAllStep
                  setGenerateAllCompleted(prev => prev.includes(step) ? prev : [...prev, step])
                  switch (step) {
                    case "transcript": setTranscriptStatus("ready"); break
                    case "ai_output": setAiStatus("ready"); break
                    case "chapters": setChaptersStatus("ready"); break
                    case "clips": setClipsStatus("ready"); break
                    case "website_package": setWebsitePkgStatus("ready"); break
                    case "deep_analysis": setDeepAnalysisStatus("ready"); break
                    case "guest_intelligence": setGuestIntelligenceStatus("ready"); break
                    case "growth_package": setGrowthStatus("ready"); break
                  }
                  break
                }

                case "step_error": {
                  const step = data.step as GenerateAllStep
                  const stepLabel = GENERATE_ALL_STEPS.find(s => s.key === step)?.label || step
                  setGenerateAllError(`[${stepLabel}] ${data.message}`)
                  switch (step) {
                    case "transcript": setTranscriptStatus("error"); setTranscriptError(data.message); break
                    case "ai_output": setAiStatus("error"); setAiError(data.message); break
                    case "chapters": setChaptersStatus("error"); setChaptersError(data.message); break
                    case "clips": setClipsStatus("error"); setClipsError(data.message); break
                    case "website_package": setWebsitePkgStatus("error"); setWebsitePkgError(data.message); break
                    case "deep_analysis": setDeepAnalysisStatus("error"); break
                    case "guest_intelligence": setGuestIntelligenceStatus("error"); break
                    case "growth_package": setGrowthStatus("error"); break
                  }
                  break
                }

                case "step_skip": {
                  const step = data.step as GenerateAllStep
                  setGenerateAllCompleted(prev => prev.includes(step) ? prev : [...prev, step])
                  break
                }

                case "error": {
                  setGenerateAllError(data.message)
                  break
                }

                case "done": {
                  setGenerateAllCurrentStep(null)
                  break
                }
              }
            } catch (parseErr) {
              console.warn("[Studio] Skipping malformed SSE chunk:", parseErr)
            }

            currentEvent = ""
            currentData = ""
          } else if (line !== "") {
            buffer += line + "\n"
          }
        }
      }

      await reloadAllData()

    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return
      console.error("[Studio] generateAll SSE error:", err)
      setGenerateAllError("حدث خطأ في الاتصال بالخادم")
    } finally {
      setGenerateAllRunning(false)
    }
  }, [
    sessionId, transcriptStatus, aiStatus, chaptersStatus, clipsStatus, websitePkgStatus,
    deepAnalysisStatus, guestIntelligenceStatus, growthStatus,
    setTranscriptStatus, setTranscriptError, setAiStatus, setAiError,
    setChaptersStatus, setChaptersError, setClipsStatus, setClipsError,
    setWebsitePkgStatus, setWebsitePkgError,
    setDeepAnalysisStatus, setGuestIntelligenceStatus, setGrowthStatus,
    reloadAllData,
  ])

  // --- Derive tab statuses ---
  // All inputs are already canonical StudioStageStatus, so this is just a passthrough
  // for the simple cases and a min/max for derived ones.
  const tabStatuses: Record<string, TabStatus> = {
    overview: transcriptStatus,
    youtube: aiStatus,
    site: websitePkgStatus,
    timestamps: (() => {
      if (chaptersStatus === "ready" || websitePkgStatus === "ready") return "ready"
      if (chaptersStatus === "generating" || websitePkgStatus === "generating") return "generating"
      if (chaptersStatus === "error" || websitePkgStatus === "error") return "error"
      return "idle"
    })(),
    clips: clipsStatus,
    seo: (() => {
      if (aiStatus === "ready" || websitePkgStatus === "ready") return "ready"
      if (aiStatus === "generating" || websitePkgStatus === "generating") return "generating"
      if (aiStatus === "error" || websitePkgStatus === "error") return "error"
      return "idle"
    })(),
    guest: guestPackageStatus,
    export: websitePkgStatus === "ready" ? "ready" : "idle",
    analyzer: analyzerStatus,
  }

  return (
    <PublishContext.Provider value={{
      episodes, loadEpisodes,
      generateAll, generateAllRunning, generateAllCurrentStep, generateAllCompleted, generateAllError,
      tabStatuses,
    }}>
      {children}
    </PublishContext.Provider>
  )
}
