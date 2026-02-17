"use client"

import { useState } from "react"
import { RotateCcw, Loader2 } from "lucide-react"

export function ResetPersonalizationButton() {
  const [loading, setLoading] = useState(false)

  async function handleReset() {
    setLoading(true)
    try {
      await fetch("/api/personalization/reset", {
        method: "POST",
        headers: { "x-requested-with": "khat" },
        credentials: "include",
      })
      window.location.reload()
    } catch {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleReset}
      disabled={loading}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <RotateCcw className="h-3 w-3" />
      )}
      إعادة تعيين التخصيص
    </button>
  )
}
