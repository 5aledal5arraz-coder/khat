"use client"

import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import type { TabStatus } from "../components/shared"
import { useSession } from "./session-context"
import { useWebsitePkg } from "./website-pkg-context"

interface GuestContextValue {
  guestName: string
  guestBio: string
  guestPhotoUrl: string
  guestExternalLinks: Record<string, string>
  guestPackageStatus: TabStatus
  guestAiGenerating: boolean
  guestAiError: string
  generateGuestAI: () => Promise<void>
  setGuestName: (v: string) => void
  setGuestBio: (v: string) => void
  setGuestPhotoUrl: (v: string) => void
  setGuestExternalLinks: (v: Record<string, string>) => void
}

const GuestContext = createContext<GuestContextValue | null>(null)

export function useGuest() {
  const ctx = useContext(GuestContext)
  if (!ctx) throw new Error("useGuest must be used within GuestProvider")
  return ctx
}

export function GuestProvider({ children }: { children: ReactNode }) {
  const { sessionId } = useSession()
  const { _guestDataFromPkg, websitePkgStatus } = useWebsitePkg()

  const [guestName, setGuestName] = useState("")
  const [guestBio, setGuestBio] = useState("")
  const [guestPhotoUrl, setGuestPhotoUrl] = useState("")
  const [guestExternalLinks, setGuestExternalLinks] = useState<Record<string, string>>({})
  const [guestAiGenerating, setGuestAiGenerating] = useState(false)
  const [guestAiError, setGuestAiError] = useState("")

  // Track which package data we've applied to avoid re-applying on every render
  const appliedPkgRef = useRef<string | null>(null)

  useEffect(() => {
    if (!_guestDataFromPkg) return
    // Create a fingerprint to detect changes
    const fingerprint = JSON.stringify(_guestDataFromPkg)
    if (appliedPkgRef.current === fingerprint) return
    appliedPkgRef.current = fingerprint

    setGuestName(_guestDataFromPkg.guestName)
    setGuestBio(_guestDataFromPkg.guestBio)
    setGuestPhotoUrl(_guestDataFromPkg.guestPhotoUrl)
    setGuestExternalLinks(_guestDataFromPkg.guestExternalLinks)
  }, [_guestDataFromPkg])

  const guestPackageStatus: TabStatus = (() => {
    if (guestAiGenerating) return "generating"
    if (guestName.trim()) return "ready"
    if (websitePkgStatus === "generating") return "generating"
    return "idle"
  })()

  const generateGuestAI = useCallback(async () => {
    setGuestAiGenerating(true)
    setGuestAiError("")
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/guest-ai`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) {
        setGuestAiError(data.error || "فشل في توليد بيانات الضيف")
        return
      }
      if (data.guest_package) {
        setGuestName(data.guest_package.guest_name || "")
        setGuestBio(data.guest_package.guest_bio || "")
        setGuestPhotoUrl(data.guest_package.guest_photo_url || "")
        setGuestExternalLinks(data.guest_package.guest_external_links || {})
      }
    } catch (err) {
      console.error("[Studio] generateGuestAI error:", err)
      setGuestAiError("تعذر الاتصال لتوليد بيانات الضيف")
    } finally {
      setGuestAiGenerating(false)
    }
  }, [sessionId])

  return (
    <GuestContext.Provider value={{
      guestName, guestBio, guestPhotoUrl, guestExternalLinks,
      guestPackageStatus, guestAiGenerating, guestAiError,
      generateGuestAI,
      setGuestName, setGuestBio, setGuestPhotoUrl, setGuestExternalLinks,
    }}>
      {children}
    </GuestContext.Provider>
  )
}
