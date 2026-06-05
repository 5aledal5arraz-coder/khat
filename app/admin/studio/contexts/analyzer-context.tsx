"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import type { StudioAnalyzer } from "@/types/database"
import { useSession } from "./session-context"
import { usePreloadedData } from "./preload-context"
import type { StudioStageStatus } from "./stage-status"
import { normalizeStageStatus } from "./stage-status"

interface AnalyzerContextValue {
  analyzer: StudioAnalyzer | null
  analyzerStatus: StudioStageStatus
  analyzerError: string
  generateAnalyzer: () => Promise<void>
}

const AnalyzerContext = createContext<AnalyzerContextValue | null>(null)

export function useAnalyzer() {
  const ctx = useContext(AnalyzerContext)
  if (!ctx) throw new Error("useAnalyzer must be used within AnalyzerProvider")
  return ctx
}

export function AnalyzerProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useSession()

  const [analyzer, setAnalyzer] = useState<StudioAnalyzer | null>(null)
  const [analyzerStatus, setAnalyzerStatus] = useState<StudioStageStatus>("idle")
  const [analyzerError, setAnalyzerError] = useState("")

  const { data: preloaded, loaded: preloadReady } = usePreloadedData()

  // Sync preloaded batch data from parent context into local state — external data hydration, not a derivable value
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!preloadReady) return
    if (preloaded?.analyzer) {
      const a = preloaded.analyzer
      setAnalyzer(a)
      setAnalyzerStatus(normalizeStageStatus(a.status))
      if (a.error_message) setAnalyzerError(a.error_message)
    }
  }, [preloaded, preloadReady])
  /* eslint-enable react-hooks/set-state-in-effect */

  const generateAnalyzer = useCallback(async () => {
    setAnalyzerStatus("generating")
    setAnalyzerError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/analyzer`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) { setAnalyzerStatus("error"); setAnalyzerError(json.error || "فشل"); return }
      setAnalyzer(json.analyzer)
      setAnalyzerStatus("ready")
    } catch {
      setAnalyzerStatus("error")
      setAnalyzerError("حدث خطأ في الاتصال")
    }
  }, [sessionId])

  return (
    <AnalyzerContext.Provider value={{
      analyzer, analyzerStatus, analyzerError, generateAnalyzer,
    }}>
      {children}
    </AnalyzerContext.Provider>
  )
}
