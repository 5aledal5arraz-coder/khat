"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import type { StudioDeepAnalysis } from "@/types/database"
import { useSession } from "./session-context"
import { usePreloadedData } from "./preload-context"
import type { StudioStageStatus } from "./stage-status"
import { normalizeStageStatus } from "./stage-status"

interface DeepAnalysisContextValue {
  deepAnalysis: StudioDeepAnalysis | null
  deepAnalysisStatus: StudioStageStatus
  deepAnalysisError: string
  generateDeepAnalysis: () => Promise<void>
  setDeepAnalysisStatus: (status: StudioStageStatus) => void
  reloadDeepAnalysis: () => Promise<void>
}

const DeepAnalysisContext = createContext<DeepAnalysisContextValue | null>(null)

export function useDeepAnalysis() {
  const ctx = useContext(DeepAnalysisContext)
  if (!ctx) throw new Error("useDeepAnalysis must be used within DeepAnalysisProvider")
  return ctx
}

export function DeepAnalysisProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useSession()

  const [deepAnalysis, setDeepAnalysis] = useState<StudioDeepAnalysis | null>(null)
  const [deepAnalysisStatus, setDeepAnalysisStatus] = useState<StudioStageStatus>("idle")
  const [deepAnalysisError, setDeepAnalysisError] = useState("")

  const loadDeepAnalysis = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/deep-analysis`)
      if (!res.ok) return
      const json = await res.json()
      if (json?.data) {
        const d = json.data as StudioDeepAnalysis
        setDeepAnalysis(d)
        setDeepAnalysisStatus(normalizeStageStatus(d.status))
        if (d.error_message) setDeepAnalysisError(d.error_message)
      }
    } catch (err) {
      console.error("[Studio] Failed to load deep analysis:", err)
    }
  }, [sessionId])

  const { data: preloaded, loaded: preloadReady } = usePreloadedData()

  // Sync preloaded batch data from parent context into local state — external data hydration, not a derivable value
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!preloadReady) return
    if (preloaded?.deepAnalysis) {
      const d = preloaded.deepAnalysis
      setDeepAnalysis(d)
      setDeepAnalysisStatus(normalizeStageStatus(d.status))
      if (d.error_message) setDeepAnalysisError(d.error_message)
    }
  }, [preloaded, preloadReady])
  /* eslint-enable react-hooks/set-state-in-effect */

  const generateDeepAnalysis = useCallback(async () => {
    setDeepAnalysisStatus("generating")
    setDeepAnalysisError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/deep-analysis`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) {
        setDeepAnalysisStatus("error")
        setDeepAnalysisError(json.error || "فشل في التحليل العميق")
        return
      }
      setDeepAnalysis(json.data)
      setDeepAnalysisStatus("ready")
    } catch {
      setDeepAnalysisStatus("error")
      setDeepAnalysisError("حدث خطأ في الاتصال")
    }
  }, [sessionId])

  return (
    <DeepAnalysisContext.Provider value={{
      deepAnalysis, deepAnalysisStatus, deepAnalysisError,
      generateDeepAnalysis,
      setDeepAnalysisStatus,
      reloadDeepAnalysis: loadDeepAnalysis,
    }}>
      {children}
    </DeepAnalysisContext.Provider>
  )
}
