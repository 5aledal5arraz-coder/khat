"use client"

import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import type {
  StudioTranscript, StudioAiOutput, StudioChapters, StudioClips,
  StudioWebsitePackage, StudioAnalyzer, StudioDeepAnalysis, StudioGuestIntelligence,
} from "@/types/database"
import { useSession } from "./session-context"

export interface PreloadedData {
  transcript: StudioTranscript | null
  output: StudioAiOutput | null
  chapters: StudioChapters | null
  clips: StudioClips | null
  package: StudioWebsitePackage | null
  analyzer: StudioAnalyzer | null
  deepAnalysis: StudioDeepAnalysis | null
  guestIntelligence: StudioGuestIntelligence | null
}

interface PreloadContextValue {
  data: PreloadedData | null
  loaded: boolean
}

const PreloadContext = createContext<PreloadContextValue>({ data: null, loaded: false })

export function usePreloadedData() {
  return useContext(PreloadContext)
}

export function PreloadProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useSession()
  const [data, setData] = useState<PreloadedData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    fetch(`/api/admin/studio/${sessionId}/full`)
      .then(res => res.ok ? res.json() : null)
      .then(json => { if (json) setData(json) })
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [sessionId])

  return (
    <PreloadContext.Provider value={{ data, loaded }}>
      {children}
    </PreloadContext.Provider>
  )
}
