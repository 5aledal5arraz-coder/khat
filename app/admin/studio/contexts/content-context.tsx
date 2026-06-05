"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import type { StudioAiOutput } from "@/types/database"
import { useSession } from "./session-context"
import { usePreloadedData } from "./preload-context"
import type { StudioStageStatus } from "./stage-status"
import { normalizeStageStatus } from "./stage-status"

interface ContentContextValue {
  aiOutput: StudioAiOutput | null
  aiStatus: StudioStageStatus
  aiError: string
  generateAiOutput: () => Promise<void>
  updateAiField: (field: string, value: unknown) => Promise<void>
  setAiStatus: (status: StudioStageStatus) => void
  setAiError: (error: string) => void
  reloadContent: () => Promise<void>
}

const ContentContext = createContext<ContentContextValue | null>(null)

export function useContent() {
  const ctx = useContext(ContentContext)
  if (!ctx) throw new Error("useContent must be used within ContentProvider")
  return ctx
}

export function ContentProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useSession()

  const [aiOutput, setAiOutput] = useState<StudioAiOutput | null>(null)
  const [aiStatus, setAiStatus] = useState<StudioStageStatus>("idle")
  const [aiError, setAiError] = useState("")

  const loadContent = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/generate`)
      if (!res.ok) return
      const data = await res.json()
      if (data?.output) {
        const o = data.output as StudioAiOutput
        setAiOutput(o)
        setAiStatus(normalizeStageStatus(o.status))
        if (o.error_message) setAiError(o.error_message)
      }
    } catch (err) {
      console.error("[Studio] Failed to load AI output:", err)
    }
  }, [sessionId])

  const { data: preloaded, loaded: preloadReady } = usePreloadedData()

  // Sync preloaded batch data from parent context into local state — external data hydration, not a derivable value
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!preloadReady) return
    if (preloaded?.output) {
      const o = preloaded.output
      setAiOutput(o)
      setAiStatus(normalizeStageStatus(o.status))
      if (o.error_message) setAiError(o.error_message)
    }
  }, [preloaded, preloadReady])
  /* eslint-enable react-hooks/set-state-in-effect */

  const generateAiOutput = useCallback(async () => {
    setAiStatus("generating")
    setAiError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/generate`, { method: "POST" })
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
  }, [sessionId])

  const updateAiField = useCallback(async (field: string, value: unknown) => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/ai-output`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "فشل في حفظ التعديل" }))
        setAiError(data.error || "فشل في حفظ التعديل")
        return
      }
      if (aiOutput) {
        setAiOutput({ ...aiOutput, [field]: value })
      }
    } catch (err) {
      console.error("[Studio] updateAiField error:", err)
      setAiError("تعذر الاتصال لحفظ التعديل")
    }
  }, [sessionId, aiOutput])

  return (
    <ContentContext.Provider value={{
      aiOutput, aiStatus, aiError,
      generateAiOutput, updateAiField,
      setAiStatus, setAiError,
      reloadContent: loadContent,
    }}>
      {children}
    </ContentContext.Provider>
  )
}
