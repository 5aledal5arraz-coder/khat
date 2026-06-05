"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import type { StudioChapters, StudioChapterItem } from "@/types/database"
import { useSession } from "./session-context"
import { usePreloadedData } from "./preload-context"
import type { StudioStageStatus } from "./stage-status"
import { normalizeStageStatus } from "./stage-status"

interface ChaptersContextValue {
  chapters: StudioChapters | null
  chaptersItems: StudioChapterItem[]
  chaptersStatus: StudioStageStatus
  chaptersError: string
  generateChapters: () => Promise<void>
  updateChaptersItems: (items: StudioChapterItem[]) => void
  saveChapters: (items: StudioChapterItem[]) => Promise<void>
  setChaptersStatus: (status: StudioStageStatus) => void
  setChaptersError: (error: string) => void
  reloadChapters: () => Promise<void>
}

const ChaptersContext = createContext<ChaptersContextValue | null>(null)

export function useChapters() {
  const ctx = useContext(ChaptersContext)
  if (!ctx) throw new Error("useChapters must be used within ChaptersProvider")
  return ctx
}

export function ChaptersProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useSession()

  const [chapters, setChapters] = useState<StudioChapters | null>(null)
  const [chaptersItems, setChaptersItems] = useState<StudioChapterItem[]>([])
  const [chaptersStatus, setChaptersStatus] = useState<StudioStageStatus>("idle")
  const [chaptersError, setChaptersError] = useState("")
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  const loadChapters = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/chapters`)
      if (!res.ok) return
      const data = await res.json()
      if (data?.chapters) {
        const c = data.chapters as StudioChapters
        setChapters(c)
        setChaptersItems(c.chapters || [])
        setChaptersStatus(c.chapters?.length ? "ready" : normalizeStageStatus(c.status))
        if (c.error_message) setChaptersError(c.error_message)
      }
    } catch (err) {
      console.error("[Studio] Failed to load chapters:", err)
    }
  }, [sessionId])

  const { data: preloaded, loaded: preloadReady } = usePreloadedData()

  // Sync preloaded batch data from parent context into local state — external data hydration, not a derivable value
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!preloadReady) return
    if (preloaded?.chapters) {
      const c = preloaded.chapters
      setChapters(c)
      setChaptersItems(c.chapters || [])
      setChaptersStatus(c.chapters?.length ? "ready" : normalizeStageStatus(c.status))
      if (c.error_message) setChaptersError(c.error_message)
    }
  }, [preloaded, preloadReady])
  /* eslint-enable react-hooks/set-state-in-effect */

  const generateChapters = useCallback(async () => {
    setChaptersStatus("generating")
    setChaptersError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/chapters`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) { setChaptersStatus("error"); setChaptersError(json.error || "فشل"); return }
      setChapters(json.chapters)
      setChaptersItems(json.chapters.chapters || [])
      setChaptersStatus("ready")
    } catch {
      setChaptersStatus("error")
      setChaptersError("حدث خطأ في الاتصال")
    }
  }, [sessionId])

  const saveChapters = useCallback(async (items: StudioChapterItem[]) => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/chapters`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chapters: items }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "فشل في حفظ الفصول" }))
        setChaptersError(data.error || "فشل في حفظ الفصول")
      }
    } catch (err) {
      console.error("[Studio] saveChapters error:", err)
      setChaptersError("تعذر الاتصال لحفظ الفصول")
    }
  }, [sessionId])

  const updateChaptersItems = useCallback((items: StudioChapterItem[]) => {
    setChaptersItems(items)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveChapters(items), 1000)
  }, [saveChapters])

  return (
    <ChaptersContext.Provider value={{
      chapters, chaptersItems, chaptersStatus, chaptersError,
      generateChapters, updateChaptersItems, saveChapters,
      setChaptersStatus, setChaptersError,
      reloadChapters: loadChapters,
    }}>
      {children}
    </ChaptersContext.Provider>
  )
}
