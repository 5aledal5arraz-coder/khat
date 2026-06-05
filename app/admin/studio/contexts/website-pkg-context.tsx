"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import type { StudioWebsitePackage, WebsiteQuoteItem, WebsiteResourceItem, WebsiteTimestampItem } from "@/types/database"
import { useSession } from "./session-context"
import { usePreloadedData } from "./preload-context"
import type { StudioStageStatus } from "./stage-status"
import { normalizeStageStatus } from "./stage-status"

interface WebsitePkgContextValue {
  websitePkg: StudioWebsitePackage | null
  websitePkgStatus: StudioStageStatus
  websitePkgError: string
  selectedTitle: string
  heroSummary: string
  fullSummary: string
  takeaways: string[]
  quotes: WebsiteQuoteItem[]
  resources: WebsiteResourceItem[]
  timestamps: WebsiteTimestampItem[]
  selectedQuoteIndices: Set<number>
  selectedTakeawayIndices: Set<number>
  generateWebsitePackage: () => Promise<void>
  updateWebsitePkgField: (updates: Record<string, unknown>) => void
  debouncedSaveWebPkg: (updates: Record<string, unknown>) => void
  setSelectedTitle: (v: string) => void
  setHeroSummary: (v: string) => void
  setFullSummary: (v: string) => void
  setTakeaways: (v: string[]) => void
  setQuotes: (v: WebsiteQuoteItem[]) => void
  setResources: (v: WebsiteResourceItem[]) => void
  setTimestamps: (v: WebsiteTimestampItem[]) => void
  setSelectedQuoteIndices: (v: Set<number>) => void
  setSelectedTakeawayIndices: (v: Set<number>) => void
  setWebsitePkgStatus: (status: StudioStageStatus) => void
  setWebsitePkgError: (error: string) => void
  reloadWebsitePkg: () => Promise<void>
  // Guest data extracted from website package (for GuestProvider)
  _guestDataFromPkg: {
    guestName: string
    guestBio: string
    guestPhotoUrl: string
    guestExternalLinks: Record<string, string>
  } | null
}

const WebsitePkgContext = createContext<WebsitePkgContextValue | null>(null)

export function useWebsitePkg() {
  const ctx = useContext(WebsitePkgContext)
  if (!ctx) throw new Error("useWebsitePkg must be used within WebsitePkgProvider")
  return ctx
}

function extractGuestFromPkg(p: StudioWebsitePackage) {
  if (p.guest_package) {
    return {
      guestName: p.guest_package.guest_name || "",
      guestBio: p.guest_package.guest_bio || "",
      guestPhotoUrl: p.guest_package.guest_photo_url || "",
      guestExternalLinks: p.guest_package.guest_external_links || {},
    }
  }
  if (p.raw_openai_response) {
    return {
      guestName: (p.raw_openai_response.guest_name as string) || "",
      guestBio: (p.raw_openai_response.guest_bio as string) || "",
      guestPhotoUrl: "",
      guestExternalLinks: {},
    }
  }
  return null
}

export function WebsitePkgProvider({ children }: { children: ReactNode }) {
  const { session, sessionId } = useSession()

  const [websitePkg, setWebsitePkg] = useState<StudioWebsitePackage | null>(null)
  const [websitePkgStatus, setWebsitePkgStatus] = useState<StudioStageStatus>("idle")
  const [websitePkgError, setWebsitePkgError] = useState("")
  const [selectedTitle, setSelectedTitle] = useState(session.video_title || "")
  const [heroSummary, setHeroSummary] = useState("")
  const [fullSummary, setFullSummary] = useState("")
  const [takeaways, setTakeaways] = useState<string[]>([])
  const [quotes, setQuotes] = useState<WebsiteQuoteItem[]>([])
  const [resources, setResources] = useState<WebsiteResourceItem[]>([])
  const [timestamps, setTimestamps] = useState<WebsiteTimestampItem[]>([])
  const [selectedQuoteIndices, setSelectedQuoteIndices] = useState<Set<number>>(new Set())
  const [selectedTakeawayIndices, setSelectedTakeawayIndices] = useState<Set<number>>(new Set())
  const [guestDataFromPkg, setGuestDataFromPkg] = useState<WebsitePkgContextValue["_guestDataFromPkg"]>(null)

  const webPkgSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (webPkgSaveTimerRef.current) clearTimeout(webPkgSaveTimerRef.current) }
  }, [])

  const applyPkg = useCallback((p: StudioWebsitePackage) => {
    setWebsitePkg(p)
    if (p.custom_title) setSelectedTitle(p.custom_title)
    setHeroSummary(p.hero_summary || "")
    setFullSummary(p.full_summary || "")
    setTakeaways(p.takeaways || [])
    setQuotes(p.quotes || [])
    setResources(p.resources || [])
    setTimestamps(p.timestamps || [])
    if (p.selected_quote_indices) {
      setSelectedQuoteIndices(new Set(p.selected_quote_indices))
    } else if (p.quotes?.length) {
      setSelectedQuoteIndices(new Set(p.quotes.map((_, i) => i)))
    }
    if (p.selected_takeaway_indices) {
      setSelectedTakeawayIndices(new Set(p.selected_takeaway_indices))
    } else if (p.takeaways?.length) {
      setSelectedTakeawayIndices(new Set(p.takeaways.map((_, i) => i)))
    }
    setWebsitePkgStatus(normalizeStageStatus(p.status))
    if (p.error_message) setWebsitePkgError(p.error_message)

    const guest = extractGuestFromPkg(p)
    setGuestDataFromPkg(guest)
  }, [])

  const loadWebsitePkg = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/website-package`)
      if (!res.ok) return
      const data = await res.json()
      if (data?.package) {
        applyPkg(data.package as StudioWebsitePackage)
      }
    } catch (err) {
      console.error("[Studio] Failed to load website package:", err)
    }
  }, [sessionId, applyPkg])

  const { data: preloaded, loaded: preloadReady } = usePreloadedData()

  // Sync preloaded batch data from parent context into local state — external data hydration, not a derivable value
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!preloadReady) return
    if (preloaded?.package) {
      applyPkg(preloaded.package as StudioWebsitePackage)
    }
  }, [preloaded, preloadReady, applyPkg])
  /* eslint-enable react-hooks/set-state-in-effect */

  const generateWebsitePackage = useCallback(async () => {
    setWebsitePkgStatus("generating")
    setWebsitePkgError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/website-package`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) { setWebsitePkgStatus("error"); setWebsitePkgError(json.error || "فشل"); return }
      const p = json.package as StudioWebsitePackage
      applyPkg(p)
      // Select all on fresh generation
      setSelectedQuoteIndices(new Set((p.quotes || []).map((_, i) => i)))
      setSelectedTakeawayIndices(new Set((p.takeaways || []).map((_, i) => i)))
    } catch {
      setWebsitePkgStatus("error")
      setWebsitePkgError("حدث خطأ في الاتصال")
    }
  }, [sessionId, applyPkg])

  const autoSaveWebPkg = useCallback(async (updates: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/website-package`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "فشل في حفظ التعديلات" }))
        setWebsitePkgError(data.error || "فشل في حفظ التعديلات")
      }
    } catch (err) {
      console.error("[Studio] autoSaveWebPkg error:", err)
      setWebsitePkgError("تعذر الاتصال لحفظ التعديلات")
    }
  }, [sessionId])

  const debouncedSaveWebPkg = useCallback((updates: Record<string, unknown>) => {
    if (webPkgSaveTimerRef.current) clearTimeout(webPkgSaveTimerRef.current)
    webPkgSaveTimerRef.current = setTimeout(() => autoSaveWebPkg(updates), 1000)
  }, [autoSaveWebPkg])

  const updateWebsitePkgField = useCallback((updates: Record<string, unknown>) => {
    debouncedSaveWebPkg(updates)
  }, [debouncedSaveWebPkg])

  return (
    <WebsitePkgContext.Provider value={{
      websitePkg, websitePkgStatus, websitePkgError,
      selectedTitle, heroSummary, fullSummary, takeaways, quotes, resources, timestamps,
      selectedQuoteIndices, selectedTakeawayIndices,
      generateWebsitePackage, updateWebsitePkgField, debouncedSaveWebPkg,
      setSelectedTitle, setHeroSummary, setFullSummary, setTakeaways, setQuotes, setResources, setTimestamps,
      setSelectedQuoteIndices, setSelectedTakeawayIndices,
      setWebsitePkgStatus, setWebsitePkgError,
      reloadWebsitePkg: loadWebsitePkg,
      _guestDataFromPkg: guestDataFromPkg,
    }}>
      {children}
    </WebsitePkgContext.Provider>
  )
}
