"use client"

/**
 * The replies this offer has drawn — newest first.
 *
 * Every submission is its own row, so a company that comes back with a second
 * figure appears twice and the negotiation reads as the sequence it was. That
 * is deliberate: `partnership_offers` keeps no history of its own, so this list
 * is the only place the question "what did they originally ask for?" can be
 * answered six months later.
 *
 * `status` and the internal note are written from here and nowhere else — the
 * public form never sends either.
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Coins, Mail, Check } from "lucide-react"
import { formatArabicDateTime } from "@/lib/shared/formatters"
import type { OfferResponse, OfferResponseStatus } from "@/types/database"

const STATUS_LABEL: Record<OfferResponseStatus, string> = {
  new: "جديد",
  reviewed: "مراجَع",
  accepted: "مقبول",
  declined: "مرفوض",
}

/** Admin is one forced-light surface: coloured text sits at -700 to stay readable. */
const STATUS_STYLE: Record<OfferResponseStatus, string> = {
  new: "bg-primary/10 text-primary",
  reviewed: "bg-muted text-muted-foreground",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
}

const MOVES: OfferResponseStatus[] = ["reviewed", "accepted", "declined"]

export function OfferResponsesPanel({
  offerId,
  responses: initial,
}: {
  offerId: string
  responses: OfferResponse[]
}) {
  const [responses, setResponses] = useState<OfferResponse[]>(initial)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({})

  async function patch(responseId: string, payload: Record<string, unknown>) {
    setBusyId(responseId)
    try {
      const res = await fetch(`/api/admin/offers/${offerId}/responses/${responseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (data.response) {
        setError(null)
        setResponses((prev) => prev.map((r) => (r.id === responseId ? data.response : r)))
        return
      }
      // A FAILED PATCH USED TO SAY NOTHING. `if (data.response)` had no else, so
      // a rejected write re-enabled the button and left the old badge on screen
      // — the operator reads that as "it saved". The state of a negotiation is
      // exactly the thing that must not lie.
      setError(data.error ?? "تعذّر تحديث حالة الرد — لم يُحفظ التغيير")
    } catch {
      setError("تعذّر الاتصال بالخادم — لم يُحفظ التغيير")
    } finally {
      setBusyId(null)
    }
  }

  if (responses.length === 0) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <p className="text-[13px] font-semibold">ردود الشركة</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          لا ردود بعد. تظهر هنا فور أن ترسل الشركة اختيارها من الصفحة العامة.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-border/60 bg-card p-6">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold">ردود الشركة</p>
        <span className="text-[11px] text-muted-foreground">{responses.length} ردّ</span>
      </div>

      {error && (
        <p
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
          data-response-error
        >
          {error}
        </p>
      )}

      {responses.map((r) => {
        const busy = busyId === r.id
        return (
          <div key={r.id} className="space-y-3 rounded-xl border border-border/50 bg-muted/20 p-4">
            {/* Header: package, their figure, status */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-background px-2 py-1 text-[12px] font-semibold ring-1 ring-border/50">
                {r.selected_package}
              </span>
              {r.proposed_amount != null ? (
                <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary">
                  <Coins className="h-3.5 w-3.5" />
                  {r.proposed_amount} {r.proposed_currency === "KWD" ? "د.ك" : r.proposed_currency}
                </span>
              ) : (
                <span className="text-[12px] text-muted-foreground">دون اقتراح سعر</span>
              )}
              <span className={`ms-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[r.status]}`}>
                {STATUS_LABEL[r.status]}
              </span>
            </div>

            {r.notes && <p className="whitespace-pre-wrap text-[12.5px] text-foreground/85">{r.notes}</p>}

            {/* Who sent it, and when */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{r.responder_name}</span>
              {r.responder_job_title && <span>{r.responder_job_title}</span>}
              <a href={`mailto:${r.responder_email}`} className="inline-flex items-center gap-1 hover:text-foreground">
                <Mail className="h-3 w-3" />
                <span dir="ltr">{r.responder_email}</span>
              </a>
              <span>·</span>
              <span>{formatArabicDateTime(r.created_at)}</span>
            </div>

            {/* Khaled's answer */}
            <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
              {MOVES.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={r.status === s ? "default" : "outline"}
                  disabled={busy || r.status === s}
                  onClick={() => patch(r.id, { status: s })}
                >
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : STATUS_LABEL[s]}
                </Button>
              ))}
            </div>

            {/* Internal note — never shown to the company */}
            <div className="space-y-2">
              <Textarea
                value={noteDraft[r.id] ?? r.internal_note ?? ""}
                onChange={(e) => setNoteDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                rows={2}
                placeholder="ملاحظة داخلية — لا تظهر للشركة"
                className="text-[12.5px]"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => patch(r.id, { internal_note: noteDraft[r.id] ?? r.internal_note ?? "" })}
              >
                <Check className="me-1 h-3.5 w-3.5" />
                حفظ الملاحظة
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
