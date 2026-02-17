"use client"

import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from "react"
import type {
  StudioSession, StudioTranscript, StudioAiOutput,
  StudioChapters, StudioChapterItem,
  StudioClips, StudioClipItem,
  StudioWebsitePackage, WebsiteQuoteItem, WebsiteResourceItem, WebsiteTimestampItem,
  StudioAnalyzer,
  StudioTranscriptProcessingStatus, StudioTranscriptSummary, StudioTranscriptQuote,
  Episode,
  AudioEditSuggestion,
} from "@/types/database"
import type { TabStatus } from "./shared"
import { fetchTranscriptClient } from "@/lib/youtube/transcript-client"

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

  // Transcript Processing (AI article, summary, quotes)
  processingStatus: StudioTranscriptProcessingStatus
  processingError: string
  transcriptArticle: string | null
  transcriptSummary: StudioTranscriptSummary | null
  transcriptQuotes: StudioTranscriptQuote[] | null
  processTranscript: () => Promise<void>

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
  selectedTitle: string
  heroSummary: string
  fullSummary: string
  takeaways: string[]
  topics: string[]
  quotes: WebsiteQuoteItem[]
  resources: WebsiteResourceItem[]
  timestamps: WebsiteTimestampItem[]
  selectedQuoteIndices: Set<number>
  selectedTakeawayIndices: Set<number>
  generateWebsitePackage: () => Promise<void>
  updateWebsitePkgField: (updates: Record<string, unknown>) => void
  setSelectedTitle: (v: string) => void
  setHeroSummary: (v: string) => void
  setFullSummary: (v: string) => void
  setTakeaways: (v: string[]) => void
  setTopics: (v: string[]) => void
  setQuotes: (v: WebsiteQuoteItem[]) => void
  setResources: (v: WebsiteResourceItem[]) => void
  setTimestamps: (v: WebsiteTimestampItem[]) => void
  setSelectedQuoteIndices: (v: Set<number>) => void
  setSelectedTakeawayIndices: (v: Set<number>) => void

  // Analyzer
  analyzer: StudioAnalyzer | null
  analyzerStatus: "idle" | "generating" | "ready" | "error"
  analyzerError: string
  generateAnalyzer: () => Promise<void>

  // Audio tools (audio sessions only)
  audioStartSeconds: number | null
  audioEndSeconds: number | null
  audioBestIntro: string | null
  audioIntroStatus: "idle" | "generating" | "ready" | "error"
  audioIntroError: string
  setAudioStartSeconds: (v: number | null) => void
  setAudioEndSeconds: (v: number | null) => void
  saveAudioTimestamps: (start: number | null, end: number | null) => Promise<void>
  generateBestIntro: () => Promise<void>

  // Audio edit suggestions (audio sessions only)
  editSuggestions: AudioEditSuggestion[] | null
  editSuggestionsStatus: "idle" | "generating" | "ready" | "error"
  editSuggestionsError: string
  editSuggestionsCutSeconds: number
  generateEditSuggestions: () => Promise<void>

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

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
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

  // --- Transcript Processing state ---
  const [processingStatus, setProcessingStatus] = useState<StudioTranscriptProcessingStatus>("idle")
  const [processingError, setProcessingError] = useState("")
  const [transcriptArticle, setTranscriptArticle] = useState<string | null>(null)
  const [transcriptSummary, setTranscriptSummary] = useState<StudioTranscriptSummary | null>(null)
  const [transcriptQuotes, setTranscriptQuotes] = useState<StudioTranscriptQuote[] | null>(null)

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
  const [selectedTitle, setSelectedTitle] = useState(session.video_title || "")
  const [heroSummary, setHeroSummary] = useState("")
  const [fullSummary, setFullSummary] = useState("")
  const [takeaways, setTakeaways] = useState<string[]>([])
  const [topics, setTopics] = useState<string[]>([])
  const [quotes, setQuotes] = useState<WebsiteQuoteItem[]>([])
  const [resources, setResources] = useState<WebsiteResourceItem[]>([])
  const [timestamps, setTimestamps] = useState<WebsiteTimestampItem[]>([])
  const [selectedQuoteIndices, setSelectedQuoteIndices] = useState<Set<number>>(new Set())
  const [selectedTakeawayIndices, setSelectedTakeawayIndices] = useState<Set<number>>(new Set())

  // --- Analyzer state ---
  const [analyzer, setAnalyzer] = useState<StudioAnalyzer | null>(null)
  const [analyzerStatus, setAnalyzerStatus] = useState<"idle" | "generating" | "ready" | "error">("idle")
  const [analyzerError, setAnalyzerError] = useState("")

  // --- Audio tools state ---
  const [audioStartSeconds, setAudioStartSeconds] = useState<number | null>(session.audio_start_seconds ?? null)
  const [audioEndSeconds, setAudioEndSeconds] = useState<number | null>(session.audio_end_seconds ?? null)
  const [audioBestIntro, setAudioBestIntro] = useState<string | null>(session.audio_best_intro ?? null)
  const [audioIntroStatus, setAudioIntroStatus] = useState<"idle" | "generating" | "ready" | "error">(
    session.audio_best_intro ? "ready" : "idle"
  )
  const [audioIntroError, setAudioIntroError] = useState("")

  // --- Audio edit suggestions state ---
  const [editSuggestions, setEditSuggestions] = useState<AudioEditSuggestion[] | null>(
    session.audio_edit_suggestions ?? null
  )
  const [editSuggestionsStatus, setEditSuggestionsStatus] = useState<"idle" | "generating" | "ready" | "error">(
    session.audio_edit_suggestions ? "ready" : "idle"
  )
  const [editSuggestionsError, setEditSuggestionsError] = useState("")
  const [editSuggestionsCutSeconds, setEditSuggestionsCutSeconds] = useState(
    session.audio_edit_suggestions
      ? session.audio_edit_suggestions.reduce((sum, s) => sum + (s.end_seconds - s.start_seconds), 0)
      : 0
  )

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
        // Load processing state
        if (t.processing_status) setProcessingStatus(t.processing_status)
        if (t.transcript_article) setTranscriptArticle(t.transcript_article)
        if (t.summary) setTranscriptSummary(t.summary)
        if (t.quotes_extracted) setTranscriptQuotes(t.quotes_extracted)
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
        if (p.custom_title) setSelectedTitle(p.custom_title)
        setHeroSummary(p.hero_summary || "")
        setFullSummary(p.full_summary || "")
        setTakeaways(p.takeaways || [])
        setTopics(p.topics || [])
        setQuotes(p.quotes || [])
        setResources(p.resources || [])
        setTimestamps(p.timestamps || [])
        // Initialize selections: if saved, use saved; otherwise select all
        if (p.selected_quote_indices) {
          setSelectedQuoteIndices(new Set(p.selected_quote_indices))
        } else if (p.quotes?.length) {
          setSelectedQuoteIndices(new Set(p.quotes.map((_, i) => i)))
        }
        if (p.selected_takeaway_indices) {
          setSelectedTakeawayIndices(new Set(p.selected_takeaway_indices))
        } else if (p.takeaways?.length) {
          setSelectedTakeawayIndices(new Set(p.takeaways.map((_, i) => i)))
        }
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

  /**
   * Helper: extract transcript from YouTube with fallback cascade.
   * 1. Try caption extraction (fast & free)
   * 2. If no captions → download audio via yt-dlp and transcribe with Whisper
   * Returns the saved transcript or throws with an error message.
   */
  const extractAndSaveTranscript = useCallback(async (): Promise<StudioTranscript> => {
    if (!session.video_id) {
      throw new Error("لا يوجد معرّف فيديو لهذه الجلسة")
    }

    // Step 1: Try client-side caption extraction (fast path)
    const extraction = await fetchTranscriptClient(session.video_id)

    if (extraction.success && extraction.text) {
      // Captions found — save via existing endpoint
      const res = await fetch(`/api/admin/studio/${sid}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_text: extraction.text,
          language: extraction.language || "ar",
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "فشل في حفظ النص")
      }

      return data.transcript as StudioTranscript
    }

    // Step 2: No captions — fallback to YouTube audio → Whisper transcription
    const res = await fetch(`/api/admin/studio/${sid}/transcript/youtube-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: session.video_id }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || "فشل في تحويل صوت يوتيوب إلى نص")
    }

    return data.transcript as StudioTranscript
  }, [sid, session.video_id])

  const fetchTranscript = useCallback(async () => {
    setTranscriptStatus("fetching")
    setTranscriptError("")
    try {
      const saved = await extractAndSaveTranscript()
      setTranscript(saved)
      setTranscriptStatus("ready")
    } catch (err) {
      setTranscriptStatus("error")
      setTranscriptError(err instanceof Error ? err.message : "حدث خطأ في الاتصال")
    }
  }, [extractAndSaveTranscript])

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

  // --- Transcript Processing action ---
  const processTranscriptAction = useCallback(async () => {
    setProcessingStatus("processing")
    setProcessingError("")
    try {
      const res = await fetch(`/api/admin/studio/${sid}/transcript/process`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setProcessingStatus("error")
        setProcessingError(data.error || "فشل في معالجة النص")
        return
      }
      const t = data.transcript as StudioTranscript
      setTranscript(t)
      setTranscriptArticle(t.transcript_article)
      setTranscriptSummary(t.summary)
      setTranscriptQuotes(t.quotes_extracted)
      setProcessingStatus("ready")
    } catch {
      setProcessingStatus("error")
      setProcessingError("حدث خطأ في الاتصال")
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
      // Select all by default on fresh generation
      setSelectedQuoteIndices(new Set((p.quotes || []).map((_, i) => i)))
      setSelectedTakeawayIndices(new Set((p.takeaways || []).map((_, i) => i)))
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

  // --- Audio tools actions ---
  const saveAudioTimestamps = useCallback(async (start: number | null, end: number | null) => {
    try {
      await fetch(`/api/admin/studio/${sid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_start_seconds: start, audio_end_seconds: end }),
      })
    } catch { /* ignore */ }
  }, [sid])

  const generateBestIntro = useCallback(async () => {
    setAudioIntroStatus("generating")
    setAudioIntroError("")
    try {
      const res = await fetch(`/api/admin/studio/${sid}/audio-intro`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setAudioIntroStatus("error")
        setAudioIntroError(data.error || "فشل في تحليل الافتتاحية")
        return
      }
      const intro = data.intro as { start_seconds: number; end_seconds: number; reason: string; transcript_excerpt: string }
      const introText = `${formatTime(intro.start_seconds)} → ${formatTime(intro.end_seconds)}\n${intro.reason}\n\n${intro.transcript_excerpt}`
      setAudioBestIntro(introText)
      setAudioStartSeconds(intro.start_seconds)
      setAudioEndSeconds(intro.end_seconds)
      setAudioIntroStatus("ready")
    } catch {
      setAudioIntroStatus("error")
      setAudioIntroError("حدث خطأ في الاتصال")
    }
  }, [sid])

  // --- Audio edit suggestions action ---
  const generateEditSuggestionsAction = useCallback(async () => {
    setEditSuggestionsStatus("generating")
    setEditSuggestionsError("")
    try {
      const res = await fetch(`/api/admin/studio/${sid}/edit-suggestions`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setEditSuggestionsStatus("error")
        setEditSuggestionsError(data.error || "فشل في تحليل المقاطع")
        return
      }
      setEditSuggestions(data.suggestions)
      setEditSuggestionsCutSeconds(data.total_cut_seconds || 0)
      setEditSuggestionsStatus("ready")
    } catch {
      setEditSuggestionsStatus("error")
      setEditSuggestionsError("حدث خطأ في الاتصال")
    }
  }, [sid])

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

        try {
          if (session.source === "audio") {
            // Audio sessions: use Whisper endpoint (server-side)
            const res = await fetch(`/api/admin/studio/${sid}/transcript/whisper`, { method: "POST" })
            const data = await res.json()
            if (!res.ok) {
              throw new Error(data.error || "فشل في تحويل الصوت إلى نص")
            }
            setTranscript(data.transcript)
          } else {
            // YouTube sessions: extract client-side, then save
            const saved = await extractAndSaveTranscript()
            setTranscript(saved)
          }
          setTranscriptStatus("ready")
        } catch (err) {
          setTranscriptStatus("error")
          const msg = err instanceof Error ? err.message : "فشل في جلب النص"
          setTranscriptError(msg)
          setGenerateAllError(msg)
          setGenerateAllRunning(false)
          return
        }
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
        setSelectedQuoteIndices(new Set((p.quotes || []).map((_, i) => i)))
        setSelectedTakeawayIndices(new Set((p.takeaways || []).map((_, i) => i)))
        setWebsitePkgStatus("ready")
      }
      setGenerateAllCompleted(prev => [...prev, "website_package"])
      setGenerateAllCurrentStep(null)
    } catch {
      setGenerateAllError("حدث خطأ غير متوقع")
    } finally {
      setGenerateAllRunning(false)
    }
  }, [sid, session.source, transcriptStatus, extractAndSaveTranscript])

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
    processingStatus, processingError, transcriptArticle, transcriptSummary, transcriptQuotes,
    processTranscript: processTranscriptAction,
    aiOutput, aiStatus, aiError, generateAiOutput, updateAiField,
    chapters, chaptersItems, chaptersStatus, chaptersError, generateChapters, updateChaptersItems, saveChapters,
    clips, clipsItems, clipsStatus, clipsError, generateClips, updateClipsItems, saveClips,
    websitePkg, websitePkgStatus, websitePkgError,
    selectedTitle, heroSummary, fullSummary, takeaways, topics, quotes, resources, timestamps,
    selectedQuoteIndices, selectedTakeawayIndices,
    generateWebsitePackage, updateWebsitePkgField, debouncedSaveWebPkg,
    setSelectedTitle, setHeroSummary, setFullSummary, setTakeaways, setTopics, setQuotes, setResources, setTimestamps,
    setSelectedQuoteIndices, setSelectedTakeawayIndices,
    analyzer, analyzerStatus, analyzerError, generateAnalyzer,
    audioStartSeconds, audioEndSeconds, audioBestIntro,
    audioIntroStatus, audioIntroError,
    setAudioStartSeconds, setAudioEndSeconds,
    saveAudioTimestamps, generateBestIntro,
    editSuggestions, editSuggestionsStatus, editSuggestionsError, editSuggestionsCutSeconds,
    generateEditSuggestions: generateEditSuggestionsAction,
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
