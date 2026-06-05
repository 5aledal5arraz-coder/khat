"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import type { StudioGuestIntelligence } from "@/types/database"
import { useSession } from "./session-context"
import { usePreloadedData } from "./preload-context"
import type { StudioStageStatus } from "./stage-status"
import { normalizeStageStatus } from "./stage-status"

interface GuestIntelligenceContextValue {
  guestIntelligence: StudioGuestIntelligence | null
  guestIntelligenceStatus: StudioStageStatus
  guestIntelligenceError: string
  generateGuestIntelligence: () => Promise<void>
  setGuestIntelligenceStatus: (status: StudioStageStatus) => void
  reloadGuestIntelligence: () => Promise<void>
}

const GuestIntelligenceContext = createContext<GuestIntelligenceContextValue | null>(null)

export function useGuestIntelligence() {
  const ctx = useContext(GuestIntelligenceContext)
  if (!ctx) throw new Error("useGuestIntelligence must be used within GuestIntelligenceProvider")
  return ctx
}

export function GuestIntelligenceProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useSession()

  const [guestIntelligence, setGuestIntelligence] = useState<StudioGuestIntelligence | null>(null)
  const [guestIntelligenceStatus, setGuestIntelligenceStatus] = useState<StudioStageStatus>("idle")
  const [guestIntelligenceError, setGuestIntelligenceError] = useState("")

  const loadGuestIntelligence = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/guest-intelligence`)
      if (!res.ok) return
      const json = await res.json()
      if (json?.data) {
        const d = json.data as StudioGuestIntelligence
        setGuestIntelligence(d)
        setGuestIntelligenceStatus(normalizeStageStatus(d.status))
        if (d.error_message) setGuestIntelligenceError(d.error_message)
      }
    } catch (err) {
      console.error("[Studio] Failed to load guest intelligence:", err)
    }
  }, [sessionId])

  const { data: preloaded, loaded: preloadReady } = usePreloadedData()

  // Sync preloaded batch data from parent context into local state — external data hydration, not a derivable value
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!preloadReady) return
    if (preloaded?.guestIntelligence) {
      const d = preloaded.guestIntelligence
      setGuestIntelligence(d)
      setGuestIntelligenceStatus(normalizeStageStatus(d.status))
      if (d.error_message) setGuestIntelligenceError(d.error_message)
    }
  }, [preloaded, preloadReady])
  /* eslint-enable react-hooks/set-state-in-effect */

  const generateGuestIntelligence = useCallback(async () => {
    setGuestIntelligenceStatus("generating")
    setGuestIntelligenceError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/guest-intelligence`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) {
        setGuestIntelligenceStatus("error")
        setGuestIntelligenceError(json.error || "فشل في تحليل الضيف")
        return
      }
      setGuestIntelligence(json.data)
      setGuestIntelligenceStatus("ready")
    } catch {
      setGuestIntelligenceStatus("error")
      setGuestIntelligenceError("حدث خطأ في الاتصال")
    }
  }, [sessionId])

  return (
    <GuestIntelligenceContext.Provider value={{
      guestIntelligence, guestIntelligenceStatus, guestIntelligenceError,
      generateGuestIntelligence,
      setGuestIntelligenceStatus,
      reloadGuestIntelligence: loadGuestIntelligence,
    }}>
      {children}
    </GuestIntelligenceContext.Provider>
  )
}
