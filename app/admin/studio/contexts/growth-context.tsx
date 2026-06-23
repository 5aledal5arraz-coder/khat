"use client"

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react"
import type { GrowthPackage } from "@/lib/ai/growth/types"
import { useSession } from "./session-context"
import { usePreloadedData } from "./preload-context"
import type { StudioStageStatus } from "./stage-status"
import { normalizeStageStatus } from "./stage-status"

interface GrowthContextValue {
  growth: GrowthPackage | null
  growthStatus: StudioStageStatus
  growthError: string
  generateGrowth: () => Promise<void>
  setGrowthStatus: (status: StudioStageStatus) => void
  reloadGrowth: () => Promise<void>
}

const GrowthContext = createContext<GrowthContextValue | null>(null)

export function useGrowth() {
  const ctx = useContext(GrowthContext)
  if (!ctx) throw new Error("useGrowth must be used within GrowthProvider")
  return ctx
}

export function GrowthProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useSession()

  const [growth, setGrowth] = useState<GrowthPackage | null>(null)
  const [growthStatus, setGrowthStatus] = useState<StudioStageStatus>("idle")
  const [growthError, setGrowthError] = useState("")

  const loadGrowth = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/growth-package`)
      if (!res.ok) return
      const json = await res.json()
      if (json?.data) {
        setGrowth((json.data.data ?? null) as GrowthPackage | null)
        setGrowthStatus(normalizeStageStatus(json.data.status))
        if (json.data.error_message) setGrowthError(json.data.error_message)
      }
    } catch (err) {
      console.error("[Studio] Failed to load growth package:", err)
    }
  }, [sessionId])

  const { data: preloaded, loaded: preloadReady } = usePreloadedData()

  // Hydrate from the batched preload — external data, not derivable state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!preloadReady) return
    if (preloaded?.growth) {
      setGrowth((preloaded.growth.data ?? null) as GrowthPackage | null)
      setGrowthStatus(normalizeStageStatus(preloaded.growth.status))
      if (preloaded.growth.error_message) setGrowthError(preloaded.growth.error_message)
    }
  }, [preloaded, preloadReady])
  /* eslint-enable react-hooks/set-state-in-effect */

  const generateGrowth = useCallback(async () => {
    setGrowthStatus("generating")
    setGrowthError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/growth-package`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) {
        setGrowthStatus("error")
        setGrowthError(json.error || "فشل في توليد حزمة النمو")
        return
      }
      setGrowth((json.data?.data ?? null) as GrowthPackage | null)
      setGrowthStatus(normalizeStageStatus(json.data?.status) || "ready")
    } catch {
      setGrowthStatus("error")
      setGrowthError("حدث خطأ في الاتصال")
    }
  }, [sessionId])

  return (
    <GrowthContext.Provider value={{
      growth, growthStatus, growthError,
      generateGrowth,
      setGrowthStatus,
      reloadGrowth: loadGrowth,
    }}>
      {children}
    </GrowthContext.Provider>
  )
}
