"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { runAction } from "@/app/admin/components/run-action"
import { reviewNationalityAction } from "../../actions"

type Decision = "kuwaiti" | "not_kuwaiti" | "unsure"

export function ReviewButtons({ personId, name }: { personId: string; name: string }) {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const decide = (decision: Decision) => {
    const prompt =
      decision === "kuwaiti"
        ? `تأكيد: ${name} كويتي؟ (قرار تحريري يُسجَّل باسمك) — اكتب المصدر أو السبب إن وُجد:`
        : decision === "not_kuwaiti"
          ? `${name} غير كويتي؟ اكتب السبب إن وُجد:`
          : `غير متأكد من ${name} — ملاحظة (اختياري):`
    const note = window.prompt(prompt, "")
    if (note === null) return
    start(async () => {
      const outcome = await runAction(() => reviewNationalityAction(personId, decision, note))
      if (!outcome.ok) return setMsg({ ok: false, text: outcome.message })
      const r = outcome.data
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error })
    })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("kuwaiti")}>
          كويتي
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("not_kuwaiti")}>
          غير كويتي
        </Button>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide("unsure")}>
          غير متأكد
        </Button>
      </div>
      {msg ? (
        <p role="status" className={cn("mt-1 text-[11.5px]", msg.ok ? "text-emerald-700" : "text-destructive")}>
          {msg.text}
        </p>
      ) : null}
    </div>
  )
}
