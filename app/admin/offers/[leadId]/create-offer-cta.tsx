"use client"

import { useState, useTransition } from "react"
import { Loader2, FileText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { createOfferForLeadAction } from "./actions"

/**
 * Empty-state CTA shown when a lead has no offer yet. Creation is an explicit,
 * role-gated action (EDITOR+) — the page itself only reads, so opening it never
 * mints an offer row + share token.
 */
export function CreateOfferCTA({ leadId }: { leadId: string }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function create() {
    setError(null)
    startTransition(async () => {
      const r = await createOfferForLeadAction(leadId)
      // On success the action revalidates this path and the page re-renders with
      // the editor. On failure (e.g. a VIEWER without permission) surface why.
      if (!r.success) setError(r.error ?? "فشل إنشاء العرض")
    })
  }

  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center">
      <FileText className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <h2 className="text-[15px] font-semibold text-foreground">لا يوجد عرض بعد</h2>
      <p className="mx-auto mt-1 max-w-md text-[13px] text-muted-foreground">
        أنشئ عرض الشراكة من اقتراح الذكاء الاصطناعي الجاهز لهذا الطلب، ثم عدّله
        وانشره.
      </p>
      <Button onClick={create} disabled={pending} className="mt-4">
        {pending ? (
          <>
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
            جاري الإنشاء…
          </>
        ) : (
          "إنشاء العرض"
        )}
      </Button>
      {error && <p className="mt-3 text-[12.5px] text-destructive">{error}</p>}
    </div>
  )
}
