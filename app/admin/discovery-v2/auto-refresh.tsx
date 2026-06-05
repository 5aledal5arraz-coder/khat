"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

/** Refreshes the server component every `seconds` while a run is in flight. */
export function AutoRefresh({ seconds = 4 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const t = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(t)
  }, [router, seconds])
  return null
}
