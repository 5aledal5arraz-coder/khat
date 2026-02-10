"use client"

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react"
import type {
  StudioSession, StudioTranscript, StudioAiOutput,
  StudioChapters, StudioChapterItem,
  StudioClips, StudioClipItem,
  StudioWebsitePackage, WebsiteQuoteItem, WebsiteResourceItem, WebsiteTimestampItem,
  StudioAnalyzer,
  Episode,
} from "@/types/database"
import type { TabStatus } from "./shared"

// ---------------------------------------------------------------------------
// Generate-All step definitions
// ---------------------------------------------------------------------------

export type GenerateAllStep = "transcript" | "ai_output" | "chapters" | "clips" | "website_package"

export const GENERATE_ALL_STEPS: { key: GenerateAllStep; label: string }[] = [
  { key: "transcript", label: "النص التلقائي" },
  { key: "ai_output", label: "مخرجات AI" },
  { key: "chapters", label: "الفصول الزمنية" },
  { key: "clips", label: "المقاطع القصيرة" },
  { key: "website_package", label: "حزمة الموقع" },
]

// ---------------------------------------------------------------------------
// Context value type
// ---------------------------------------------------------------------------

interface StudioSessionContextValue {
  session: StudioSession

  // Transcript
  transcript: StudioTranscript | null
  transcriptStatus: "not_fetched" | "fetching" | "ready" | "error"
  transcriptError: string
  fetchTranscript: () => Promise<void>
  transcribeAudio: () => Promise<void>
  uploadTranscript: (file: File) => Promise<void>
  transcriptUploading: boolean

  // AI Outputs
  aiOutput: StudioAiOutput | null
  aiStatus: "idle" | "generating" | "ready" | "error"
  aiError: string
  generateAiOutput: () => Promise<void>
  updateAiField: (field: string, value: unknown) => Promise<void>

  // Chapters
  chapters: StudioChapters | null
  chaptersItems: StudioChapterItem[]
  chaptersStatus: "idle" | "generating" | "ready" | "error"
  chaptersError: string
  generateChapters: () => Promise<void>
  updateChaptersItems: (items: StudioChapterItem[]) => void
  saveChapters: (items: StudioChapterItem[]) => Promise<void>

  // Clips
  clips: StudioClips | null
  clipsItems: StudioClipItem[]
  clipsStatus: "idle" | "generating" | "ready" | "error"
  clipsError: string
  generateClips: () => Promise<void>
  updateClipsItems: (items: StudioClipItem[]) => void
  saveClips: (items: StudioClipItem[]) => Promise<void>

  // Website Package
  websitePkg: StudioWebsitePackage | null
  websitePkgStatus: "idle" | "generating" | "ready" | "error"
  websitePkgError: string
  heroSummary: string
  fullSummary: string
  takeaways: string[]
  topics: string[]
  quotes: WebsiteQuoteItem[]
  resources: WebsiteResourceItem[]
  timestamps: WebsiteTimestampItem[]
  generateWebsitePackage: () => Promise<void>
  updateWebsitePkgField: (updates: Record<string, unknown>) => void
  setHeroSummary: (v: string) => void
  setFullSummary: (v: string) => void
  setTakeaways: (v: string[]) => void
  setTopics: (v: string[]) => void
  setQuotes: (v: WebsiteQuoteItem[]) => void
  setResources: (v: WebsiteResourceItem[]) => void
  setTimestamps: (v: WebsiteTimestampItem[]) => void

  // Analyzer
  analyzer: StudioAnalyzer | null
  analyzerStatus: "idle" | "generating" | "ready" | "error"
  analyzerError: string
  generateAnalyzer: () => Promise<void>

  // Episodes (for push)
  episodes: Episode[]
  loadEpisodes: () => Promise<void>

  // Generate All
  generateAll: () => Promise<void>
  generateAllRunning: boolean
  generateAllCurrentStep: GenerateAllStep | null
  generateAllCompleted: GenerateAllStep[]
  generateAllError: string

  // Tab statuses (derived)
  tabStatuses: Record<string, TabStatus>

  // Debounced auto-save for website package
  debouncedSaveWebPkg: (updates: Record<string, unknown>) => void
}

const StudioSessionContext = createContext<StudioSessionContextValue | null>(null)

export function useStudioSession() {
  const ctx = useContext(StudioSessionContext)
  if (!ctx) throw new Error("useStudioSession must be used within StudioSessionProvider")
  return ctx
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function StudioSessionProvider({
  session,
  children,
}: {
  session: StudioSession
  children: ReactNode
}) {
  // --- Transcript state ---
  const [transcript, setTranscript] = useState<StudioTranscript | null>(null)
  const [transcriptStatus, setTranscriptStatus] = useState<"not_fetched" | "fetching" | "ready" | "error">("not_fetched")
  const [transcriptError, setTranscriptError] = useState("")
  const [transcriptUploading, setTranscriptUploading] = useState(false)

  // --- AI Output state ---
  const [aiOutput, setAiOutput] = useState<StudioAiOutput | null>(null)
  const [aiStatus, setAiStatus] = useState<"idle" | "generating" | "ready" | "error">("idle")
  const [aiError, setAiError] = useState("")

  // --- Chapters state ---
  const [chapters, setChapters] = useState<StudioChapters | null>(null)
  const [chaptersItems, setChaptersItems] = useState<StudioChapterItem[]>([])
  const [chaptersStatus, setChaptersStatus] = useState<"idle" | "generating" | "ready" | "error">("idle")
  const [chaptersError, setChaptersError] = useState("")

  // --- Clips state ---
  const [clips, setClips] = useState<StudioClips | null>(null)
  const [clipsItems, setClipsItems] = useState<StudioClipItem[]>([])
  const [clipsStatus, setClipsStatus] = useState<"idle" | "generating" | "ready" | "error">("idle")
  const [clipsError, setClipsError] = useState("")

  // --- Website Package state ---
  const [websitePkg, setWebsitePkg] = useState<StudioWebsitePackage | null>(null)
  const [websitePkgStatus, setWebsitePkgStatus] = useState<"idle" | "generating" | "ready" | "error">("idle")
  const [websitePkgError, setWebsitePkgError] = useState("")
  const [heroSummary, setHeroSummary] = useState("")
  const [fullSummary, setFullSummary] = useState("")
  const [takeaways, setTakeaways] = useState<string[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [quotes, setQuotes] = useState<WebsiteQuoteItem[]>([])
  const [resources, setResources] = useState<WebsiteResourceItem[]>([])
  const [timestamps, setTimestamps] = useState<WebsiteTimestampItem[]>([])

  // --- Analyzer state ---
  const [analyzer, setAnalyzer] = useState<StudioAnalyzer | null>(null)
  const [analyzerStatus, setAnalyzerStatus] = useState<"idle" | "generating" | "ready" | "error">("idle")
  const [analyzerError, setAnalyzerError] = useState("")

  // --- Episodes ---
  const [episodes, setEpisodes] = useState<Episode[]>([])

  // --- Generate All ---
  const [generateAllRunning, setGenerateAllRunning] = useState(false)
  const [generateAllCurrentStep, setGenerateAllCurrentStep] = useState<GenerateAllStep | null>(null)
  const [generateAllCompleted, setGenerateAllCompleted] = useState<GenerateAllStep[]>([])
  const [generateAllError, setGenerateAllError] = useState("")

  // --- Refs ---
  const webPkgSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chaptersSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clipsSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const sid = session.id

  // --- Eager load all data on mount ---
  useEffect(() => {
    const loadAll = async () => {
      const [transcriptRes, aiRes, chaptersRes, clipsRes, pkgRes, analyzerRes] = await Promise.all([
        fetch(`/api/admin/studio/${sid}/transcript`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/admin/studio/${sid}/generate`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/admin/studio/${sid}/chapters`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/admin/studio/${sid}/clips`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/admin/studio/${sid}/website-package`).then(r => r.ok ? r.json() : null).catch(() => null),
        fetch(`/api/admin/studio/${sid}/analyzer`).then(r => r.ok ? r.json() : null).catch(() => null),
      ])

      // Transcript
      if (transcriptRes?.transcript) {
        const t = transcriptRes.transcript as StudioTranscript
        setTranscript(t)
        setTranscriptStatus(t.status === "error" ? "error" : "ready")
        if (t.error_message) setTranscriptError(t.error_message)
      }

      // AI Output
      if (aiRes?.output) {
        const o = aiRes.output as StudioAiOutput
        setAiOutput(o)
        setAiStatus(o.status === "error" ? "error" : o.status === "generating" ? "generating" : "ready")
        if (o.error_message) setAiError(o.error_message)
      }

      // Chapters
      if (chaptersRes?.chapters) {
        const c = chaptersRes.chapters as StudioChapters
        setChapters(c)
        setChaptersItems(c.chapters || [])
        setChaptersStatus(c.status === "error" ? "error" : c.status === "generating" ? "generating" : "ready")
        if (c.error_message) setChaptersError(c.error_message)
      }

      // Clips
      if (clipsRes?.clips) {
        const c = clipsRes.clips as StudioClips
        setClips(c)
        setClipsItems(c.clips || [])
        setClipsStatus(c.status === "error" ? "error" : c.status === "generating" ? "generating" : "ready")
        if (c.error_message) setClipsError(c.error_message)
      }

      // Website Package
      if (pkgRes?.package) {
        const p = pkgRes.package as StudioWebsitePackage
        setWebsitePkg(p)
        setHeroSummary(p.hero_summary || "")
        setFullSummary(p.full_summary || "")
        setTakeaways(p.takeaways || [])
        setTopics(p.topics || [])
        setQuotes(p.quotes || [])
        setResources(p.resources || [])
        setTimestamps(p.timestamps || [])
        setWebsitePkgStatus(p.status === "error" ? "error" : p.status === "generating" ? "generating" : "ready")
        if (p.error_message) setWebsitePkgError(p.error_message)
      }

      // Analyzer
      if (analyzerRes?.analyzer) {
        const a = analyzerRes.analyzer as StudioAnalyzer
        setAnalyzer(a)
        setAnalyzerStatus(a.status === "error" ? "error" : a.status === "generating" ? "generating" : "ready")
        if (a.error_message) setAnalyzerError(a.error_message)
      }
    }

    loadAll()
  }, [sid])

  // --- Transcript actions ---
  const fetchTranscript = useCallback(async () => {
    setTranscriptStatus("fetching")
    setTranscriptError("")
    try {
      const res = await fetch(`/api/admin/studio/${sid}/transcript`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setTranscriptStatus("error")
        setTranscriptError(data.error || "فشل في جلب النص")
        return
      }
      setTranscript(data.transcript)
      setTranscriptStatus("ready")
    } catch {
      setTranscriptStatus("error")
      setTranscriptError("حدث خطأ في الاتصال")
    }
  }, [sid])

  const transcribeAudio = useCallback(async () => {
    setTranscriptStatus("fetching")
    setTranscriptError("")
    try {
      const res = await fetch(`/api/admin/studio/${sid}/transcript/whisper`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setTranscriptStatus("error")
        setTranscriptError(data.error || "فشل في تحويل الصوت إلى نص")
        return
      }
      setTranscript(data.transcript)
      setTranscriptStatus("ready")
    } catch {
      setTranscriptStatus("error")
      setTranscriptError("حدث خطأ في الاتصال")
    }
  }, [sid])

  const uploadTranscript = useCallback(async (file: File) => {
    setTranscriptUploading(true)
    setTranscriptError("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/admin/studio/${sid}/transcript/upload`, { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) {
        setTranscriptError(data.error || "فشل في رفع الملف")
        setTranscriptStatus("error")
        return
      }
      setTranscript(data.transcript)
      setTranscriptStatus("ready")
    } catch {
      setTranscriptError("حدث خطأ أثناء رفع الملف")
      setTranscriptStatus("error")
    } finally {
      setTranscriptUploading(false)
    }
  }, [sid])

  // --- AI Output actions ---
  const generateAiOutput = useCallback(async () => {
    setAiStatus("generating")
    setAiError("")
    try {
      const res = await fetch(`/api/admin/studio/${sid}/generate`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setAiStatus("error")
        setAiError(data.error || "فشل في التوليد")
        return
      }
      setAiOutput(data.output)
      setAiStatus("ready")
    } catch {
      setAiStatus("error")
      setAiError("حدث خطأ في الاتصال")
    }
  }, [sid])

  const updateAiField = useCallback(async (field: string, value: unknown) => {
    try {
      const res = await fetch(`/api/admin/studio/${sid}/ai-output`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok && aiOutput) {
        setAiOutput({ ...aiOutput, [field]: value })
      }
    } catch {
      // ignore
    }
  }, [sid, aiOutput])

  // --- Chapters actions ---
  const generateChapters = useCallback(async () => {
    setChaptersStatus("generating")
    setChaptersError("")
    try {
      const res = await fetch(`/api/admin/studio/${sid}/chapters`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) { setChaptersStatus("error"); setChaptersError(json.error || "فشل"); return }
      setChapters(json.chapters)
      setChaptersItems(json.chapters.chapters || [])
      setChaptersStatus("ready")
    } catch {
      setChaptersStatus("error")
      setChaptersError("حدث خطأ في الاتصال")
    }
  }, [sid])

  const saveChapters = useCallback(async (items: StudioChapterItem[]) => {
    try {
      await fetch(`/api/admin/studio/${sid}/chapters`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapters: items }),
      })
    } catch { /* ignore */ }
  }, [sid])

  const updateChaptersItems = useCallback((items: StudioChapterItem[]) => {
    setChaptersItems(items)
    if (chaptersSaveTimerRef.current) clearTimeout(chaptersSaveTimerRef.current)
    chaptersSaveTimerRef.current = setTimeout(() => saveChapters(items), 1000)
  }, [saveChapters])

  // --- Clips actions ---
  const generateClips = useCallback(async () => {
    setClipsStatus("generating")
    setClipsError("")
    try {
      const res = await fetch(`/api/admin/studio/${sid}/clips`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) { setClipsStatus("error"); setClipsError(json.error || "فشل"); return }
      setClips(json.clips)
      setClipsItems(json.clips.clips || [])
      setClipsStatus("ready")
    } catch {
      setClipsStatus("error")
      setClipsError("حدث خطأ في الاتصال")
    }
  }, [sid])

  const saveClips = useCallback(async (items: StudioClipItem[]) => {
    try {
      await fetch(`/api/admin/studio/${sid}/clips`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clips: items }),
      })
    } catch { /* ignore */ }
  }, [sid])

  const updateClipsItems = useCallback((items: StudioClipItem[]) => {
    setClipsItems(items)
    if (clipsSaveTimerRef.current) clearTimeout(clipsSaveTimerRef.current)
    clipsSaveTimerRef.current = setTimeout(() => saveClips(items), 1000)
  }, [saveClips])

  // --- Website Package actions ---
  const generateWebsitePackage = useCallback(async () => {
    setWebsitePkgStatus("generating")
    setWebsitePkgError("")
    try {
      const res = await fetch(`/api/admin/studio/${sid}/website-package`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) { setWebsitePkgStatus("error"); setWebsitePkgError(json.error || "فشل"); return }
      const p = json.package as StudioWebsitePackage
      setWebsitePkg(p)
      setHeroSummary(p.hero_summary || "")
      setFullSummary(p.full_summary || "")
      setTakeaways(p.takeaways || [])
      setTopics(p.topics || [])
      setQuotes(p.quotes || [])
      setResources(p.resources || [])
      setTimestamps(p.timestamps || [])
      setWebsitePkgStatus("ready")
    } catch {
      setWebsitePkgStatus("error")
      setWebsitePkgError("حدث خطأ في الاتصال")
    }
  }, [sid])

  const autoSaveWebPkg = useCallback(async (updates: Record<string, unknown>) => {
    try {
      await fetch(`/api/admin/studio/${sid}/website-package`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
    } catch { /* ignore */ }
  }, [sid])

  const debouncedSaveWebPkg = useCallback((updates: Record<string, unknown>) => {
    if (webPkgSaveTimerRef.current) clearTimeout(webPkgSaveTimerRef.current)
    webPkgSaveTimerRef.current = setTimeout(() => autoSaveWebPkg(updates), 1000)
  }, [autoSaveWebPkg])

  const updateWebsitePkgField = useCallback((updates: Record<string, unknown>) => {
    debouncedSaveWebPkg(updates)
  }, [debouncedSaveWebPkg])

  // --- Analyzer actions ---
  const generateAnalyzer = useCallback(async () => {
    setAnalyzerStatus("generating")
    setAnalyzerError("")
    try {
      const res = await fetch(`/api/admin/studio/${sid}/analyzer`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) { setAnalyzerStatus("error"); setAnalyzerError(json.error || "فشل"); return }
      setAnalyzer(json.analyzer)
      setAnalyzerStatus("ready")
    } catch {
      setAnalyzerStatus("error")
      setAnalyzerError("حدث خطأ في الاتصال")
    }
  }, [sid])

  // --- Episodes ---
  const loadEpisodes = useCallback(async () => {
    try {
      const res = await fetch(`/api/episodes?limit=50`)
      if (res.ok) {
        const eps = await res.json()
        setEpisodes(Array.isArray(eps) ? eps : [])
      }
    } catch { /* ignore */ }
  }, [])

  // --- Generate All ---
  const generateAll = useCallback(async () => {
    setGenerateAllRunning(true)
    setGenerateAllCurrentStep(null)
    setGenerateAllCompleted([])
    setGenerateAllError("")

    try {
      // Step 1: Transcript (skip if already ready)
      if (transcriptStatus !== "ready") {
        setGenerateAllCurrentStep("transcript")
        setTranscriptStatus("fetching")
        setTranscriptError("")

        // Use Whisper endpoint for audio sessions, YouTube captions for YouTube sessions
        const transcriptEndpoint = session.source === "audio"
          ? `/api/admin/studio/${sid}/transcript/whisper`
          : `/api/admin/studio/${sid}/transcript`

        const res = await fetch(transcriptEndpoint, { method: "POST" })
        const data = await res.json()
        if (!res.ok) {
          setTranscriptStatus("error")
          setTranscriptError(data.error || "فشل في جلب النص")
          setGenerateAllError(
            session.source === "audio"
              ? "فشل في تحويل الصوت إلى نص"
              : "فشل في جلب النص التلقائي"
          )
          setGenerateAllRunning(false)
          return
        }
        setTranscript(data.transcript)
        setTranscriptStatus("ready")
      }
      setGenerateAllCompleted(prev => [...prev, "transcript"])

      // Step 2: AI Output
      setGenerateAllCurrentStep("ai_output")
      setAiStatus("generating")
      setAiError("")
      {
        const res = await fetch(`/api/admin/studio/${sid}/generate`, { method: "POST" })
        const data = await res.json()
        if (!res.ok) {
          setAiStatus("error")
          setAiError(data.error || "فشل")
          setGenerateAllError("فشل في توليد مخرجات AI")
          setGenerateAllRunning(false)
          return
        }
        setAiOutput(data.output)
        setAiStatus("ready")
      }
      setGenerateAllCompleted(prev => [...prev, "ai_output"])

      // Step 3: Chapters
      setGenerateAllCurrentStep("chapters")
      setChaptersStatus("generating")
      setChaptersError("")
      {
        const res = await fetch(`/api/admin/studio/${sid}/chapters`, { method: "POST" })
        const json = await res.json()
        if (!res.ok) {
          setChaptersStatus("error")
          setChaptersError(json.error || "فشل")
          setGenerateAllError("فشل في توليد الفصول")
          setGenerateAllRunning(false)
          return
        }
        setChapters(json.chapters)
        setChaptersItems(json.chapters.chapters || [])
        setChaptersStatus("ready")
      }
      setGenerateAllCompleted(prev => [...prev, "chapters"])

      // Step 4: Clips
      setGenerateAllCurrentStep("clips")
      setClipsStatus("generating")
      setClipsError("")
      {
        const res = await fetch(`/api/admin/studio/${sid}/clips`, { method: "POST" })
        const json = await res.json()
        if (!res.ok) {
          setClipsStatus("error")
          setClipsError(json.error || "فشل")
          setGenerateAllError("فشل في توليد المقاطع")
          setGenerateAllRunning(false)
          return
        }
        setClips(json.clips)
        setClipsItems(json.clips.clips || [])
        setClipsStatus("ready")
      }
      setGenerateAllCompleted(prev => [...prev, "clips"])

      // Step 5: Website Package
      setGenerateAllCurrentStep("website_package")
      setWebsitePkgStatus("generating")
      setWebsitePkgError("")
      {
        const res = await fetch(`/api/admin/studio/${sid}/website-package`, { method: "POST" })
        const json = await res.json()
        if (!res.ok) {
          setWebsitePkgStatus("error")
          setWebsitePkgError(json.error || "فشل")
          setGenerateAllError("فشل في توليد حزمة الموقع")
          setGenerateAllRunning(false)
          return
        }
        const p = json.package as StudioWebsitePackage
        setWebsitePkg(p)
        setHeroSummary(p.hero_summary || "")
        setFullSummary(p.full_summary || "")
        setTakeaways(p.takeaways || [])
        setTopics(p.topics || [])
        setQuotes(p.quotes || [])
        setResources(p.resources || [])
        setTimestamps(p.timestamps || [])
        setWebsitePkgStatus("ready")
      }
      setGenerateAllCompleted(prev => [...prev, "website_package"])
      setGenerateAllCurrentStep(null)
    } catch {
      setGenerateAllError("حدث خطأ غير متوقع")
    } finally {
      setGenerateAllRunning(false)
    }
  }, [sid, session.source, transcriptStatus])

  // --- Derive tab statuses ---
  const tabStatuses: Record<string, TabStatus> = {
    overview: transcriptStatus === "ready" ? "ready" : transcriptStatus === "fetching" ? "generating" : transcriptStatus === "error" ? "error" : "idle",
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
      if (aiStatus === "ready" && websitePkgStatus === "ready") return "ready"
      if (aiStatus === "ready" || websitePkgStatus === "ready") return "ready"
      if (aiStatus === "generating" || websitePkgStatus === "generating") return "generating"
      return "idle"
    })(),
    export: websitePkgStatus === "ready" ? "ready" : "idle",
    analyzer: analyzerStatus,
  }

  const value: StudioSessionContextValue = {
    session,
    transcript, transcriptStatus, transcriptError, fetchTranscript, transcribeAudio, uploadTranscript, transcriptUploading,
    aiOutput, aiStatus, aiError, generateAiOutput, updateAiField,
    chapters, chaptersItems, chaptersStatus, chaptersError, generateChapters, updateChaptersItems, saveChapters,
    clips, clipsItems, clipsStatus, clipsError, generateClips, updateClipsItems, saveClips,
    websitePkg, websitePkgStatus, websitePkgError,
    heroSummary, fullSummary, takeaways, topics, quotes, resources, timestamps,
    generateWebsitePackage, updateWebsitePkgField, debouncedSaveWebPkg,
    setHeroSummary, setFullSummary, setTakeaways, setTopics, setQuotes, setResources, setTimestamps,
    analyzer, analyzerStatus, analyzerError, generateAnalyzer,
    episodes, loadEpisodes,
    generateAll, generateAllRunning, generateAllCurrentStep, generateAllCompleted, generateAllError,
    tabStatuses,
  }

  return (
    <StudioSessionContext.Provider value={value}>
      {children}
    </StudioSessionContext.Provider>
  )
}
