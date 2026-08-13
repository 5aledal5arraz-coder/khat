"use client"

/**
 * شاشة التفاوض — what this screen is for once a reply has arrived.
 *
 * ── THE PROBLEM IT REPLACES ────────────────────────────────────────────────
 * Before this, the reply landed at the bottom of the full offer editor: title,
 * intro, body, packages, validity, contact email, publish, password, send. Ten
 * fields to change one number. But by the time a company has replied, the
 * content is AGREED — the thing still open is the price and the package, and
 * nothing else on that form is a question anybody is still asking.
 *
 * So the editor does not disappear; it stops being the default. It is folded
 * behind «تعديل العرض كاملاً» in the parent, and this is what opens instead.
 *
 * ── WHAT IS DELIBERATELY NOT HERE ──────────────────────────────────────────
 * No deliverables, no body text, no publish switch. The negotiation is over
 * price and package; letting the outputs be edited from a screen framed as
 * "reply to them" is how an offer quietly changes shape mid-conversation.
 *
 * ── THE TWO NOTES ARE NOT THE SAME NOTE ────────────────────────────────────
 * «ردّ خط» is rendered on `/offer/<token>` the moment it is saved. The internal
 * note never leaves the admin. They are different tables, different endpoints,
 * and on this screen deliberately different colours with the audience printed
 * on each — because the failure mode is not a bug, it is a person typing the
 * wrong thing in the right-looking box.
 */

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Loader2,
  Check,
  Mail,
  Eye,
  Send,
  Lock,
  Globe,
  AlertCircle,
  ArrowLeftRight,
} from "lucide-react"
import { formatArabicDateTime, formatRelativeTime, formatKwd } from "@/lib/shared/formatters"
import { comparePrice, type PriceComparison } from "@/lib/partnerships/price-compare"
import type {
  OfferCounter,
  OfferResponse,
  OfferResponseStatus,
  PartnershipOffer,
} from "@/types/database"

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

const BASIS_LABEL = { per_episode: "للحلقة", total: "إجمالي" } as const

export function NegotiationPanel({
  offer,
  responses: initialResponses,
  counters: initialCounters,
}: {
  offer: PartnershipOffer
  responses: OfferResponse[]
  counters: OfferCounter[]
}) {
  const [responses, setResponses] = useState(initialResponses)
  const [counters, setCounters] = useState(initialCounters)

  const latest = responses[0]

  return (
    <div className="space-y-4">
      {/* ── 1. Where things stand ── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border/60 bg-card px-5 py-4 text-[12.5px]">
        <span className="inline-flex items-center gap-1.5">
          <Send className="h-3.5 w-3.5 text-muted-foreground" />
          {offer.sent_at ? (
            <>أُرسل <span className="font-semibold">{formatRelativeTime(offer.sent_at)}</span></>
          ) : (
            <span className="text-muted-foreground">لم يُرسل بالبريد</span>
          )}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5 text-muted-foreground" />
          شوهد <span className="font-semibold">{offer.view_count}</span> مرة
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
          آخر ردّ <span className="font-semibold">{latest ? formatRelativeTime(latest.created_at) : "—"}</span>
        </span>
        <span className="ms-auto text-[11px] text-muted-foreground">
          {responses.length} ردّ
        </span>
      </div>

      {/* ── 2..5. One card per round, newest first ── */}
      {responses.map((response) => (
        <RoundCard
          key={response.id}
          offer={offer}
          response={response}
          counters={counters.filter((c) => c.response_id === response.id)}
          onResponseChange={(next) =>
            setResponses((prev) => prev.map((r) => (r.id === next.id ? next : r)))
          }
          onCounterAdded={(counter) => setCounters((prev) => [...prev, counter])}
        />
      ))}
    </div>
  )
}

function RoundCard({
  offer,
  response,
  counters,
  onResponseChange,
  onCounterAdded,
}: {
  offer: PartnershipOffer
  response: OfferResponse
  counters: OfferCounter[]
  onResponseChange: (next: OfferResponse) => void
  onCounterAdded: (counter: OfferCounter) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [note, setNote] = useState(response.internal_note ?? "")
  const [noteSaved, setNoteSaved] = useState(false)

  const [message, setMessage] = useState("")
  const [counterAmount, setCounterAmount] = useState("")

  // The package as it stands on the offer TODAY. It can be missing: the reply
  // stores the name it was shown, and the offer may have been edited since.
  // That is a real state, and printing a comparison against a package that no
  // longer exists would be worse than saying so.
  const pkg = offer.packages.find((p) => p.name === response.selected_package) ?? null
  const comparison = comparePrice(pkg?.price_range, response.proposed_amount)

  async function patch(payload: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/offers/${offer.id}/responses/${response.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (data.response) {
        onResponseChange(data.response)
        return true
      }
      // A failed write must never look like a saved one — see the note this
      // pattern came from in the old responses panel.
      setError(data.error ?? "تعذّر حفظ التغيير")
      return false
    } catch {
      setError("تعذّر الاتصال بالخادم — لم يُحفظ التغيير")
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveNote() {
    setNoteSaved(false)
    if (await patch({ internal_note: note })) {
      setNoteSaved(true)
      setTimeout(() => setNoteSaved(false), 2500)
    }
  }

  /**
   * Send our reply. Confirmed, because it is published the instant it is saved
   * and there is no delete — the partner may have the page open.
   */
  async function sendCounter() {
    if (!message.trim()) return
    const priceLine = counterAmount.trim() ? ` بسعر مقابل ${counterAmount.trim()} د.ك` : ""
    if (!confirm(`سيظهر هذا الردّ${priceLine} للشركة على صفحة العرض فوراً، ولا يمكن حذفه. متابعة؟`)) return

    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/admin/offers/${offer.id}/responses/${response.id}/counter`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-requested-with": "khat" },
          body: JSON.stringify({ message, counter_amount: counterAmount }),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (data.counter) {
        onCounterAdded(data.counter)
        setMessage("")
        setCounterAmount("")
        return
      }
      setError(data.error ?? "تعذّر إرسال الردّ")
    } catch {
      setError("تعذّر الاتصال بالخادم — لم يُرسل الردّ")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-card p-5" data-round={response.id}>
      {/* Package + status */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg bg-muted/50 px-2.5 py-1 text-[12.5px] font-semibold ring-1 ring-border/50">
          {response.selected_package}
        </span>
        <span
          className={`ms-auto rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLE[response.status]}`}
        >
          {STATUS_LABEL[response.status]}
        </span>
      </div>

      <PriceCompare comparison={comparison} response={response} packageMissing={!pkg} />

      {/* Their notes */}
      {response.notes && (
        <p className="whitespace-pre-wrap rounded-xl bg-muted/25 px-3.5 py-3 text-[12.5px] leading-relaxed text-foreground/85">
          {response.notes}
        </p>
      )}

      {/* Who sent it, and when */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{response.responder_name}</span>
        {response.responder_job_title && <span>{response.responder_job_title}</span>}
        <a
          href={`mailto:${response.responder_email}`}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <Mail className="h-3 w-3" />
          <span dir="ltr">{response.responder_email}</span>
        </a>
        <span>·</span>
        <span>{formatArabicDateTime(response.created_at)}</span>
      </div>

      {error && (
        <p
          role="alert"
          data-round-error
          className="flex items-start gap-1.5 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      {/* ── Your decision on this round ── */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/40 pt-4">
        {MOVES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={response.status === s ? "default" : "outline"}
            disabled={busy || response.status === s}
            onClick={() => patch({ status: s })}
          >
            {STATUS_LABEL[s]}
          </Button>
        ))}
      </div>

      {/* ── «ردّ خط» — PUBLIC ── */}
      <section
        data-public-reply
        className="space-y-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-4"
      >
        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-primary">
          <Globe className="h-3.5 w-3.5" />
          ردّ خط
          <span className="font-normal text-[11px] text-primary/80">
            — يظهر للشركة على صفحة العرض تحت اقتراحها
          </span>
        </p>

        {counters.length > 0 && (
          <ul className="space-y-2">
            {counters.map((c) => (
              <li key={c.id} className="rounded-lg bg-background px-3 py-2.5 ring-1 ring-primary/15">
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed">{c.message}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
                  {c.counter_amount != null && (
                    <span className="font-semibold text-primary">
                      {formatKwd(c.counter_amount, c.counter_currency)}
                    </span>
                  )}
                  {c.author_name && <span>{c.author_name}</span>}
                  <span>{formatArabicDateTime(c.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="ردّك على اقتراحهم — تقرأه الشركة كما هو."
          className="bg-background text-[12.5px]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <Input
              value={counterAmount}
              onChange={(e) => setCounterAmount(e.target.value)}
              inputMode="decimal"
              dir="ltr"
              placeholder="سعر مقابل (اختياري)"
              className="w-48 bg-background text-[12.5px]"
            />
            <span className="text-[11px] text-muted-foreground">د.ك</span>
          </div>
          <Button size="sm" disabled={busy || !message.trim()} onClick={sendCounter} className="ms-auto">
            {busy ? <Loader2 className="me-1 h-3.5 w-3.5 animate-spin" /> : <Send className="me-1 h-3.5 w-3.5" />}
            أرسل الردّ
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          السعر المقابل رسالة وليس تعديلاً — باقات العرض المنشور تبقى كما هي حتى تعدّلها بنفسك.
        </p>
      </section>

      {/* ── Internal note — PRIVATE ── */}
      <section
        data-internal-note
        className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-4"
      >
        <p className="flex flex-wrap items-center gap-1.5 text-[12.5px] font-semibold text-amber-700">
          <Lock className="h-3.5 w-3.5" />
          ملاحظتك الداخلية
          <span className="text-[11px] font-normal text-amber-700/80">— لا تظهر للشركة أبداً</span>
        </p>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="لنفسك فقط — سقف السعر، الانطباع، ما لا يُقال لهم."
          className="bg-background text-[12.5px]"
        />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={saveNote}>
            <Check className="me-1 h-3.5 w-3.5" />
            حفظ الملاحظة
          </Button>
          {noteSaved && <span className="text-[11.5px] text-green-700">تم الحفظ</span>}
        </div>
      </section>
    </div>
  )
}

/**
 * «سعرنا مقابل اقتراحهم».
 *
 * Every branch that cannot produce an honest number SAYS SO rather than
 * printing a blank or a zero — a negotiation screen that shows «0 د.ك» because
 * it failed to read «٢٧٥ د.ك للحلقة» is worse than one that shows nothing.
 */
function PriceCompare({
  comparison,
  response,
  packageMissing,
}: {
  comparison: PriceComparison
  response: OfferResponse
  packageMissing: boolean
}) {
  const { our, delta, deltaPct, ourPerEpisode, theirPerEpisode } = comparison
  const theirs = response.proposed_amount

  const ourLabel =
    our.kind === "single" && our.amount != null
      ? formatKwd(our.amount)
      : our.kind === "range" && our.min != null && our.max != null
        ? `${formatKwd(our.min)} – ${formatKwd(our.max)}`
        : our.raw || "—"

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <Figure label="سعرنا" value={ourLabel} sub={ourPerEpisode != null ? `${formatKwd(ourPerEpisode)} للحلقة` : null} />
        <Figure
          label="اقتراحهم"
          value={theirs != null ? formatKwd(theirs, response.proposed_currency) : "دون اقتراح سعر"}
          sub={theirs != null && theirPerEpisode != null ? `${formatKwd(theirPerEpisode)} للحلقة` : null}
          muted={theirs == null}
        />
        <Figure
          label="الفرق"
          icon
          value={delta != null ? formatKwd(delta, "KWD", { signed: true }) : "—"}
          sub={deltaPct != null ? `${deltaPct > 0 ? "+" : deltaPct < 0 ? "−" : ""}${Math.abs(deltaPct)}%` : null}
          tone={delta == null ? "neutral" : delta < 0 ? "down" : delta > 0 ? "up" : "neutral"}
        />
      </div>

      {/* The assumption, printed. It IS an assumption — see comparePrice(). */}
      {delta != null && (
        <p className="text-[11px] text-muted-foreground">
          المقارنة على أساس السعر المعروض: {BASIS_LABEL[our.basis]}
          {our.episodes ? ` · ${our.episodes} حلقات` : ""}
        </p>
      )}

      {packageMissing && (
        <p className="text-[11px] text-amber-700">
          الباقة «{response.selected_package}» لم تعد موجودة في العرض — تغيّرت الباقات بعد ردّهم.
        </p>
      )}
      {!packageMissing && our.kind !== "single" && theirs != null && (
        <p className="text-[11px] text-amber-700">
          {our.kind === "range"
            ? "سعرنا مكتوب كنطاق — لا فرق واحد يمكن حسابه، قارن يدوياً."
            : `تعذّر اشتقاق سعرنا من «${our.raw || "—"}» — قارن يدوياً.`}
        </p>
      )}
    </div>
  )
}

function Figure({
  label,
  value,
  sub,
  muted,
  icon,
  tone = "neutral",
}: {
  label: string
  value: string
  sub?: string | null
  muted?: boolean
  icon?: boolean
  tone?: "neutral" | "up" | "down"
}) {
  const toneClass =
    tone === "down" ? "text-red-700" : tone === "up" ? "text-green-700" : "text-foreground"
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 px-3.5 py-2.5">
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
        {icon && <ArrowLeftRight className="h-3 w-3" />}
        {label}
      </p>
      <p className={`mt-0.5 text-[14px] font-bold ${muted ? "text-muted-foreground" : toneClass}`}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}
