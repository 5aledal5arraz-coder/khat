"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import type { StudioClips, StudioClipItem } from "@/types/database"
import { useSession } from "./session-context"
import { usePreloadedData } from "./preload-context"
import type { StudioStageStatus } from "./stage-status"
import { normalizeStageStatus } from "./stage-status"

interface ClipsContextValue {
  clips: StudioClips | null
  clipsItems: StudioClipItem[]
  clipsStatus: StudioStageStatus
  clipsError: string
  generateClips: () => Promise<void>
  updateClipsItems: (items: StudioClipItem[]) => void
  saveClips: (items: StudioClipItem[]) => Promise<void>
  setClipsStatus: (status: StudioStageStatus) => void
  setClipsError: (error: string) => void
  reloadClips: () => Promise<void>
}

const ClipsContext = createContext<ClipsContextValue | null>(null)

export function useClips() {
  const ctx = useContext(ClipsContext)
  if (!ctx) throw new Error("useClips must be used within ClipsProvider")
  return ctx
}

export function ClipsProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useSession()

  const [clips, setClips] = useState<StudioClips | null>(null)
  const [clipsItems, setClipsItems] = useState<StudioClipItem[]>([])
  const [clipsStatus, setClipsStatus] = useState<StudioStageStatus>("idle")
  const [clipsError, setClipsError] = useState("")
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [])

  const loadClips = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/clips`)
      if (!res.ok) return
      const data = await res.json()
      if (data?.clips) {
        const c = data.clips as StudioClips
        setClips(c)
        setClipsItems(c.clips || [])
        setClipsStatus(c.clips?.length ? "ready" : normalizeStageStatus(c.status))
        if (c.error_message) setClipsError(c.error_message)
      }
    } catch (err) {
      console.error("[Studio] Failed to load clips:", err)
    }
  }, [sessionId])

  const { data: preloaded, loaded: preloadReady } = usePreloadedData()

  // Sync preloaded batch data from parent context into local state — external data hydration, not a derivable value
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!preloadReady) return
    if (preloaded?.clips) {
      const c = preloaded.clips
      setClips(c)
      setClipsItems(c.clips || [])
      setClipsStatus(c.clips?.length ? "ready" : normalizeStageStatus(c.status))
      if (c.error_message) setClipsError(c.error_message)
    }
  }, [preloaded, preloadReady])
  /* eslint-enable react-hooks/set-state-in-effect */

  const generateClips = useCallback(async () => {
    setClipsStatus("generating")
    setClipsError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/clips`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) { setClipsStatus("error"); setClipsError(json.error || "فشل"); return }
      setClips(json.clips)
      setClipsItems(json.clips.clips || [])
      setClipsStatus("ready")
    } catch {
      setClipsStatus("error")
      setClipsError("حدث خطأ في الاتصال")
    }
  }, [sessionId])

  const saveClips = useCallback(async (items: StudioClipItem[]) => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/clips`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clips: items }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "فشل في حفظ المقاطع" }))
        setClipsError(data.error || "فشل في حفظ المقاطع")
      }
    } catch (err) {
      console.error("[Studio] saveClips error:", err)
      setClipsError("تعذر الاتصال لحفظ المقاطع")
    }
  }, [sessionId])

  const updateClipsItems = useCallback((items: StudioClipItem[]) => {
    setClipsItems(items)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => saveClips(items), 1000)
  }, [saveClips])

  return (
    <ClipsContext.Provider value={{
      clips, clipsItems, clipsStatus, clipsError,
      generateClips, updateClipsItems, saveClips,
      setClipsStatus, setClipsError,
      reloadClips: loadClips,
    }}>
      {children}
    </ClipsContext.Provider>
  )
}
