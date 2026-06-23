"use client"

import { useEffect, useState } from "react"
import { Loader2, Globe, EyeOff, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Publish gate control (P6) for an episode's enriched website content.
 * Toggles episode_enrichments.publish_status between 'published' (live) and
 * 'draft' (hidden from the public episode page). Inert-first: existing content
 * is 'published' by default, so this only ever HIDES content the operator
 * explicitly drafts.
 */
export function WebsitePublishControl({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState<string | null>(null)
  const [linked, setLinked] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/studio/${sessionId}/website-publish`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return
        if (!j?.data) { setLinked(false); return }
        setStatus(j.data.publish_status ?? "published")
      })
      .catch(() => {})
    return () => { alive = false }
  }, [sessionId])

  const setPublish = async (next: string) => {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/studio/${sessionId}/website-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const j = await res.json()
      if (res.ok) setStatus(j.data.publish_status)
    } finally {
      setBusy(false)
    }
  }

  if (!linked) return null

  const isPublished = (status ?? "published") === "published"

  return (
    <div className="flex items-center justify-between rounded-lg border border-border/30 bg-background/40 px-3 py-2">
      <div className="flex items-center gap-2 text-[12px]">
        {isPublished ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
        ) : (
          <EyeOff className="h-3.5 w-3.5 text-amber-700" />
        )}
        <span className="text-muted-foreground">حالة المحتوى على الموقع:</span>
        <span className={cn("font-medium", isPublished ? "text-emerald-700" : "text-amber-700")}>
          {status === null ? "…" : isPublished ? "منشور" : "مسودة (مخفي)"}
        </span>
      </div>
      <button
        onClick={() => setPublish(isPublished ? "draft" : "published")}
        disabled={busy || status === null}
        className="inline-flex items-center gap-1.5 rounded-md border border-border/40 px-2.5 py-1 text-[11px] hover:bg-muted/40 disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
        {isPublished ? "تحويل إلى مسودة" : "نشر على الموقع"}
      </button>
    </div>
  )
}
