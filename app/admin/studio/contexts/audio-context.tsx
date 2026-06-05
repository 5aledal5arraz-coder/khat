"use client"

import { createContext, useContext, useState, useCallback, type ReactNode } from "react"
import type { AudioEditSuggestion } from "@/types/database"
import { useSession } from "./session-context"
import { formatTimeSeconds } from "@/lib/utils"
import type { StudioStageStatus } from "./stage-status"

interface AudioContextValue {
  audioStartSeconds: number | null
  audioEndSeconds: number | null
  audioBestIntro: string | null
  audioIntroStatus: StudioStageStatus
  audioIntroError: string
  audioTimestampsError: string
  setAudioStartSeconds: (v: number | null) => void
  setAudioEndSeconds: (v: number | null) => void
  saveAudioTimestamps: (start: number | null, end: number | null) => Promise<void>
  generateBestIntro: () => Promise<void>

  // Edit suggestions
  editSuggestions: AudioEditSuggestion[] | null
  editSuggestionsStatus: StudioStageStatus
  editSuggestionsError: string
  editSuggestionsCutSeconds: number
  generateEditSuggestions: () => Promise<void>
}

const AudioContext = createContext<AudioContextValue | null>(null)

export function useAudio() {
  const ctx = useContext(AudioContext)
  if (!ctx) throw new Error("useAudio must be used within AudioProvider")
  return ctx
}

export function AudioProvider({ children }: { children: ReactNode }) {
  const { session, sessionId } = useSession()

  const [audioStartSeconds, setAudioStartSeconds] = useState<number | null>(session.audio_start_seconds ?? null)
  const [audioEndSeconds, setAudioEndSeconds] = useState<number | null>(session.audio_end_seconds ?? null)
  const [audioBestIntro, setAudioBestIntro] = useState<string | null>(session.audio_best_intro ?? null)
  const [audioIntroStatus, setAudioIntroStatus] = useState<StudioStageStatus>(
    session.audio_best_intro ? "ready" : "idle"
  )
  const [audioIntroError, setAudioIntroError] = useState("")
  const [audioTimestampsError, setAudioTimestampsError] = useState("")

  const [editSuggestions, setEditSuggestions] = useState<AudioEditSuggestion[] | null>(
    session.audio_edit_suggestions ?? null
  )
  const [editSuggestionsStatus, setEditSuggestionsStatus] = useState<StudioStageStatus>(
    session.audio_edit_suggestions ? "ready" : "idle"
  )
  const [editSuggestionsError, setEditSuggestionsError] = useState("")
  const [editSuggestionsCutSeconds, setEditSuggestionsCutSeconds] = useState(
    session.audio_edit_suggestions
      ? session.audio_edit_suggestions.reduce((sum, s) => sum + (s.end_seconds - s.start_seconds), 0)
      : 0
  )

  const saveAudioTimestamps = useCallback(async (start: number | null, end: number | null) => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio_start_seconds: start, audio_end_seconds: end }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "فشل في حفظ نقاط القص" }))
        setAudioTimestampsError(data.error || "فشل في حفظ نقاط القص")
        return
      }
      setAudioTimestampsError("")
    } catch (err) {
      console.error("[Studio] saveAudioTimestamps error:", err)
      setAudioTimestampsError("تعذر الاتصال لحفظ نقاط القص")
    }
  }, [sessionId])

  const generateBestIntro = useCallback(async () => {
    setAudioIntroStatus("generating")
    setAudioIntroError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/audio-intro`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setAudioIntroStatus("error")
        setAudioIntroError(data.error || "فشل في تحليل الافتتاحية")
        return
      }
      const intro = data.intro as { start_seconds: number; end_seconds: number; reason: string; transcript_excerpt: string }
      const introText = `${formatTimeSeconds(intro.start_seconds)} → ${formatTimeSeconds(intro.end_seconds)}\n${intro.reason}\n\n${intro.transcript_excerpt}`
      setAudioBestIntro(introText)
      setAudioStartSeconds(intro.start_seconds)
      setAudioEndSeconds(intro.end_seconds)
      setAudioIntroStatus("ready")
    } catch {
      setAudioIntroStatus("error")
      setAudioIntroError("حدث خطأ في الاتصال")
    }
  }, [sessionId])

  const generateEditSuggestions = useCallback(async () => {
    setEditSuggestionsStatus("generating")
    setEditSuggestionsError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/edit-suggestions`, { method: "POST" })
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
  }, [sessionId])

  return (
    <AudioContext.Provider value={{
      audioStartSeconds, audioEndSeconds, audioBestIntro,
      audioIntroStatus, audioIntroError, audioTimestampsError,
      setAudioStartSeconds, setAudioEndSeconds,
      saveAudioTimestamps, generateBestIntro,
      editSuggestions, editSuggestionsStatus, editSuggestionsError, editSuggestionsCutSeconds,
      generateEditSuggestions,
    }}>
      {children}
    </AudioContext.Provider>
  )
}
