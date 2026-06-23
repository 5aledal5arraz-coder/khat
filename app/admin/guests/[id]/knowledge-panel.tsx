"use client"

import { useState } from "react"
import { Loader2, Sparkles, RefreshCw } from "lucide-react"
import type { GuestPublicKnowledge } from "@/lib/db/schema/guest-identity"

export function GuestKnowledgePanel({
  guestId,
  initial,
}: {
  guestId: string
  initial: GuestPublicKnowledge | null
}) {
  const [knowledge, setKnowledge] = useState<GuestPublicKnowledge | null>(initial)
  const [status, setStatus] = useState<"idle" | "running" | "error">("idle")
  const [error, setError] = useState("")

  const generate = async () => {
    setStatus("running")
    setError("")
    try {
      const res = await fetch(`/api/admin/guests/${guestId}/knowledge`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) {
        setStatus("error")
        setError(json.error || "فشل التوليد")
        return
      }
      setKnowledge(json.data)
      setStatus("idle")
    } catch {
      setStatus("error")
      setError("حدث خطأ في الاتصال")
    }
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          معرفة الضيف العامة (صفحة الموقع)
        </h2>
        <button
          onClick={generate}
          disabled={status === "running"}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-background/40 px-2.5 py-1 text-[11px] text-foreground hover:bg-muted/40 disabled:opacity-60"
        >
          {status === "running" ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> جارٍ التوليد…</>
          ) : (
            <><RefreshCw className="h-3 w-3" /> {knowledge ? "إعادة التوليد" : "توليد المعرفة"}</>
          )}
        </button>
      </div>

      {status === "error" && (
        <p className="mb-2 rounded-md border border-red-500/20 bg-red-500/5 p-2 text-[11px] text-red-700">{error}</p>
      )}

      {!knowledge ? (
        <p className="text-[12px] text-muted-foreground">
          لم تُولَّد بعد. توليد المعرفة يُركّب نبذة وموضوعات واقتباسات الضيف عبر حلقاته في صفحته العامة.
        </p>
      ) : (
        <div className="space-y-3 rounded-xl border border-border/30 bg-card/40 p-4">
          {knowledge.headline && <p className="text-[13px] font-medium text-foreground">{knowledge.headline}</p>}
          {knowledge.bio && <p className="text-[12.5px] leading-relaxed text-foreground/80">{knowledge.bio}</p>}
          {knowledge.arc && <p className="text-[12px] italic text-muted-foreground">{knowledge.arc}</p>}
          {knowledge.signature_topics && knowledge.signature_topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {knowledge.signature_topics.map((t) => (
                <span key={t} className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] text-primary">{t}</span>
              ))}
            </div>
          )}
          {knowledge.notable_quotes && knowledge.notable_quotes.length > 0 && (
            <ul className="space-y-1.5">
              {knowledge.notable_quotes.map((q, i) => (
                <li key={i} className="text-[12px] text-muted-foreground">&ldquo;{q.text}&rdquo;</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
