"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import type {
  StudioTranscript,
  StudioTranscriptSummary, StudioTranscriptQuote,
} from "@/types/database"
import { useSession } from "./session-context"
import { postGeneration, type GenerationOptions } from "./generation-request"
import { usePreloadedData } from "./preload-context"
import type { StudioStageStatus } from "./stage-status"
import { normalizeStageStatus } from "./stage-status"
import { useJobStatus } from "@/app/admin/components/use-job-status"
import type { JobSnapshot, WorkerSnapshot } from "@/lib/jobs/status-view"
import { studioTranscribeDedupeKey } from "@/lib/jobs/studio-transcribe-jobs"

/** The background `studio.transcribe` job this session is watching, if any. */
export interface TranscriptJobState {
  jobId: string | null
  job: JobSnapshot | null
  worker: WorkerSnapshot | null
  pollError: string | null
}

interface TranscriptContextValue {
  transcript: StudioTranscript | null
  transcriptStatus: StudioStageStatus
  transcriptError: string
  transcriptUploading: boolean
  fetchTranscript: () => Promise<void>
  transcribeAudio: (options?: GenerationOptions) => Promise<void>
  uploadTranscript: (file: File) => Promise<void>

  // Transcript processing
  processingStatus: StudioStageStatus
  processingError: string
  transcriptArticle: string | null
  transcriptSummary: StudioTranscriptSummary | null
  transcriptQuotes: StudioTranscriptQuote[] | null
  processTranscript: (options?: GenerationOptions) => Promise<void>
  regeneratingSection: string | null
  regenerateSectionError: string
  regenerateSection: (section: "quotes" | "key_ideas" | "lessons") => Promise<void>
  setTranscriptQuotes: (quotes: StudioTranscriptQuote[]) => void
  setTranscriptSummary: (summary: StudioTranscriptSummary) => void
  saveTranscriptEdits: () => Promise<void>
  pasteTranscript: (text: string) => Promise<void>
  transcriptPasting: boolean

  // Background transcription (studio.transcribe) — see TranscriptJobState.
  transcriptJob: TranscriptJobState
  /** Start watching a transcription job (e.g. one «توليد الكل» just enqueued). */
  watchTranscriptJob: (jobId: string) => void

  // For publish context
  setTranscriptStatus: (status: StudioStageStatus) => void
  setTranscriptError: (error: string) => void
  reloadTranscript: () => Promise<void>
}

const TranscriptContext = createContext<TranscriptContextValue | null>(null)

export function useTranscript() {
  const ctx = useContext(TranscriptContext)
  if (!ctx) throw new Error("useTranscript must be used within TranscriptProvider")
  return ctx
}

export function TranscriptProvider({ children }: { children: ReactNode }) {
  const { session, sessionId } = useSession()

  const [transcript, setTranscript] = useState<StudioTranscript | null>(null)
  const [transcriptStatus, setTranscriptStatus] = useState<StudioStageStatus>("idle")
  const [transcriptError, setTranscriptError] = useState("")
  const [transcriptUploading, setTranscriptUploading] = useState(false)
  const [transcriptPasting, setTranscriptPasting] = useState(false)

  const [processingStatus, setProcessingStatus] = useState<StudioStageStatus>("idle")
  const [processingError, setProcessingError] = useState("")
  const [transcriptArticle, setTranscriptArticle] = useState<string | null>(null)
  const [transcriptSummary, setTranscriptSummary] = useState<StudioTranscriptSummary | null>(null)
  const [transcriptQuotes, setTranscriptQuotes] = useState<StudioTranscriptQuote[] | null>(null)
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null)
  const [regenerateSectionError, setRegenerateSectionError] = useState("")
  const [transcriptJobId, setTranscriptJobId] = useState<string | null>(null)
  // Only a job we are WATCHING may flip the transcript status when it settles
  // — a failed run from 20 minutes ago found by key must not paint a
  // transcript that was uploaded since as "error".
  const watchingRef = useRef<string | null>(null)
  useEffect(() => {
    watchingRef.current = transcriptJobId
  }, [transcriptJobId])

  const loadTranscript = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/transcript`)
      if (!res.ok) return
      const data = await res.json()
      if (data?.transcript) {
        const t = data.transcript as StudioTranscript
        setTranscript(t)
        setTranscriptStatus(normalizeStageStatus(t.status))
        if (t.error_message) setTranscriptError(t.error_message)
        if (t.processing_status) setProcessingStatus(normalizeStageStatus(t.processing_status))
        if (t.transcript_article) setTranscriptArticle(t.transcript_article)
        if (t.summary) setTranscriptSummary(t.summary)
        if (t.quotes_extracted) setTranscriptQuotes(t.quotes_extracted)
      }
    } catch (err) {
      console.error("[Studio] Failed to load transcript:", err)
    }
  }, [sessionId])

  // Whisper runs in the worker (`studio.transcribe`). Before any click we look
  // the session's in-flight job up by its dedupe key (server-side, via the
  // status route), so a reload mid-transcription re-attaches instead of
  // showing an idle button that would pay for a second run.
  const transcriptJobStatus = useJobStatus({
    jobId: transcriptJobId,
    dedupeKey: transcriptJobId ? null : studioTranscribeDedupeKey(sessionId),
    onSettled: (job) => {
      if (watchingRef.current !== job.id) return
      if (job.status === "succeeded") {
        void loadTranscript()
        return
      }
      setTranscriptStatus("error")
      setTranscriptError(job.error_message || "فشل تحويل الصوت إلى نص")
    },
  })
  const watchedJob = transcriptJobStatus.job
  // A job found by key while nothing is shown yet: adopt it.
  const activeJobId = transcriptJobId ?? (watchedJob && transcriptJobStatus.inFlight ? watchedJob.id : null)
  useEffect(() => {
    if (!transcriptJobId && watchedJob && transcriptJobStatus.inFlight) {
      setTranscriptJobId(watchedJob.id)
      setTranscriptStatus("generating")
    }
  }, [transcriptJobId, watchedJob, transcriptJobStatus.inFlight])

  const watchTranscriptJob = useCallback((jobId: string) => {
    setTranscriptJobId(jobId)
    setTranscriptStatus("generating")
    setTranscriptError("")
  }, [])

  const { data: preloaded, loaded: preloadReady } = usePreloadedData()

  useEffect(() => {
    if (!preloadReady) return
    if (preloaded?.transcript) {
      const t = preloaded.transcript
      setTranscript(t)
      setTranscriptStatus(normalizeStageStatus(t.status))
      if (t.error_message) setTranscriptError(t.error_message)
      if (t.processing_status) setProcessingStatus(normalizeStageStatus(t.processing_status))
      if (t.transcript_article) setTranscriptArticle(t.transcript_article)
      if (t.summary) setTranscriptSummary(t.summary)
      if (t.quotes_extracted) setTranscriptQuotes(t.quotes_extracted)
    }
  }, [preloaded, preloadReady])

  // --- Extract transcript from YouTube with fallback cascade ---
  const extractAndSaveTranscript = useCallback(async (): Promise<StudioTranscript | { jobId: string }> => {
    if (!session.video_id) {
      throw new Error("لا يوجد معرّف فيديو لهذه الجلسة")
    }

    // Step 1: Try server-side caption extraction via yt-dlp (fast, free path)
    const capRes = await fetch(`/api/admin/studio/${sessionId}/transcript/captions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: session.video_id }),
    })
    if (capRes.ok) {
      const capData = await capRes.json()
      if (capData?.transcript) return capData.transcript as StudioTranscript
    }

    // Step 2: No captions — fallback to YouTube audio → Whisper, which runs in
    // the worker: the route answers with a jobId (or a cached transcript).
    const res = await fetch(`/api/admin/studio/${sessionId}/transcript/youtube-audio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: session.video_id }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || "فشل في تحويل صوت يوتيوب إلى نص")
    if (data.jobId) return { jobId: data.jobId as string }
    return data.transcript as StudioTranscript
  }, [sessionId, session.video_id])

  const fetchTranscript = useCallback(async () => {
    setTranscriptStatus("generating")
    setTranscriptError("")
    try {
      const saved = await extractAndSaveTranscript()
      if ("jobId" in saved) {
        watchTranscriptJob(saved.jobId)
        return
      }
      setTranscript(saved)
      setTranscriptStatus("ready")
    } catch (err) {
      setTranscriptStatus("error")
      setTranscriptError(err instanceof Error ? err.message : "حدث خطأ في الاتصال")
    }
  }, [extractAndSaveTranscript, watchTranscriptJob])

  const transcribeAudio = useCallback(async (options?: GenerationOptions) => {
    setTranscriptStatus("generating")
    setTranscriptError("")
    try {
      const res = await postGeneration(`/api/admin/studio/${sessionId}/transcript/whisper`, options)
      const data = await res.json()
      if (!res.ok) {
        setTranscriptStatus("error")
        setTranscriptError(data.error || "فشل في تحويل الصوت إلى نص")
        return
      }
      // 202/200 + jobId: Whisper runs in the worker — watch the job.
      if (data.jobId) {
        watchTranscriptJob(data.jobId)
        return
      }
      setTranscript(data.transcript)
      setTranscriptStatus("ready")
    } catch {
      setTranscriptStatus("error")
      setTranscriptError("حدث خطأ في الاتصال")
    }
  }, [sessionId, watchTranscriptJob])

  const uploadTranscript = useCallback(async (file: File) => {
    setTranscriptUploading(true)
    setTranscriptError("")
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(`/api/admin/studio/${sessionId}/transcript/upload`, { method: "POST", body: formData })
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
  }, [sessionId])

  const pasteTranscript = useCallback(async (text: string) => {
    if (text.trim().length < 50) return
    setTranscriptPasting(true)
    setTranscriptError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw_text: text, language: "ar" }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTranscriptError(data.error || "فشل في حفظ النص")
        setTranscriptStatus("error")
        return
      }
      setTranscript(data.transcript)
      setTranscriptStatus("ready")
    } catch {
      setTranscriptError("حدث خطأ أثناء حفظ النص")
      setTranscriptStatus("error")
    } finally {
      setTranscriptPasting(false)
    }
  }, [sessionId])

  // --- Transcript Processing ---
  const processTranscript = useCallback(async (options?: GenerationOptions) => {
    setProcessingStatus("generating")
    setProcessingError("")
    try {
      const res = await postGeneration(`/api/admin/studio/${sessionId}/transcript/process`, options)
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
  }, [sessionId])

  const regenerateSection = useCallback(async (section: "quotes" | "key_ideas" | "lessons") => {
    setRegeneratingSection(section)
    setRegenerateSectionError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/transcript/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section }),
      })
      const data = await res.json()
      if (!res.ok) {
        setRegenerateSectionError(data.error || "فشل في إعادة التوليد")
        return
      }
      if (section === "quotes") {
        setTranscriptQuotes(data.data)
      } else if (section === "key_ideas") {
        setTranscriptSummary((prev) => prev ? { ...prev, key_ideas: data.data } : null)
      } else if (section === "lessons") {
        setTranscriptSummary((prev) => prev ? { ...prev, lessons: data.data } : null)
      }
    } catch {
      setRegenerateSectionError("حدث خطأ في الاتصال")
    } finally {
      setRegeneratingSection(null)
    }
  }, [sessionId])

  const saveTranscriptEdits = useCallback(async () => {
    if (!transcript) return
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/transcript/save-edits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ summary: transcriptSummary, quotes_extracted: transcriptQuotes }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "فشل حفظ التعديلات" }))
        setRegenerateSectionError(data.error || "فشل حفظ التعديلات")
      }
    } catch (err) {
      console.error("Save edits error:", err)
      setRegenerateSectionError("تعذر الاتصال لحفظ التعديلات")
    }
  }, [sessionId, transcript, transcriptSummary, transcriptQuotes])

  return (
    <TranscriptContext.Provider value={{
      transcript, transcriptStatus, transcriptError, transcriptUploading,
      fetchTranscript, transcribeAudio, uploadTranscript,
      processingStatus, processingError, transcriptArticle, transcriptSummary, transcriptQuotes,
      processTranscript,
      regeneratingSection, regenerateSectionError, regenerateSection,
      setTranscriptQuotes, setTranscriptSummary,
      saveTranscriptEdits,
      pasteTranscript, transcriptPasting,
      setTranscriptStatus, setTranscriptError,
      reloadTranscript: loadTranscript,
      transcriptJob: {
        jobId: activeJobId,
        job: activeJobId ? watchedJob : null,
        worker: transcriptJobStatus.worker,
        pollError: transcriptJobStatus.pollError,
      },
      watchTranscriptJob,
    }}>
      {children}
    </TranscriptContext.Provider>
  )
}
