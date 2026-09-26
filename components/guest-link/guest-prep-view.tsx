"use client"

/**
 * «نسخة الضيف» — the prep view exactly as the guest reads it.
 *
 * Rendered by the guest page AND by the admin preview (preview mode disables
 * the suggestion forms), so "preview" is literally the same component on the
 * same projected data — never a second rendering that could drift.
 *
 * Input is a `GuestPrepView` (lib/guest-link/view.ts) — the allowlist
 * projection. This component must never receive a prep payload.
 */

import { useId, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarPlus, ChevronDown, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatKuwaitAppointment } from "@/lib/shared/formatters"
import { GUEST_SUGGESTION_LIMITS } from "@/lib/validation/guest-link"
import type { GuestOwnSuggestion, GuestPrepView } from "@/types/database"
import type { GuestIdentity } from "@/lib/guest-link/page-props"

export const REASSURANCE_LINE =
  "هذي مجرد أمثلة، والحوار بيمشي على راحتك، وأي شي ما تحب تتكلم فيه قوله لنا"

export interface GuestPrepViewPanelProps {
  view: GuestPrepView | null
  identity: GuestIdentity | null
  greetingName: string
  suggestions: GuestOwnSuggestion[]
  updatedSinceLastVisit?: boolean
  /** null ⇒ preview mode: nothing is sent anywhere. */
  token: string | null
  housePhotoSrc: string | null
  calendarHref: string | null
  onEditAnswers?: () => void
  onReplayWelcome?: () => void
}

export function GuestPrepViewPanel(props: GuestPrepViewPanelProps) {
  const { view, identity, greetingName, suggestions, token } = props
  const preview = token === null

  if (!view) {
    return (
      <div className="space-y-6">
        <p className="text-body text-foreground">حيّاك الله {greetingName}.</p>
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="text-body font-semibold text-foreground">نثبّت التفاصيل ونرسل لك</h2>
          <p className="mt-2 text-caption leading-relaxed text-muted-foreground">
            وصلتنا إجاباتك، والفريق يجهّز ملامح الحلقة والموعد. أول ما تكون جاهزة بتلقاها هني
            في نفس الرابط.
          </p>
        </section>
        <FooterLinks {...props} />
      </div>
    )
  }

  const appt = formatKuwaitAppointment(view.schedule_at)
  const loc = view.location

  return (
    <div className="space-y-8">
      <div>
        <p className="text-body text-foreground">حيّاك الله {greetingName}.</p>
        {props.updatedSinceLastVisit && (
          <p className="mt-2 rounded-xl bg-primary/5 px-3 py-2 text-caption text-primary" role="status">
            تم تحديث تفاصيل الحلقة من آخر زيارة لك.
          </p>
        )}
      </div>

      {(appt || loc) && (
        <section aria-labelledby="gl-appt" className="space-y-4">
          <h2 id="gl-appt" className="text-lead font-semibold text-foreground">موعدنا</h2>
          <div className="rounded-2xl border border-border bg-card p-5">
            {appt && (
              <p className="text-body font-medium text-foreground">
                {appt.day} {appt.date} · {appt.time}
                <span className="ms-2 text-caption font-normal text-muted-foreground">بتوقيت الكويت</span>
              </p>
            )}
            {loc?.label && <p className="mt-3 text-caption font-medium text-foreground">{loc.label}</p>}
            {loc?.address && (
              <p className="mt-1 whitespace-pre-line text-caption leading-relaxed text-muted-foreground">
                {loc.address}
              </p>
            )}
            {loc?.has_photo && props.housePhotoSrc && (
              // eslint-disable-next-line @next/next/no-img-element -- token-gated private photo; next/image would copy it into the shared optimizer cache
              <img
                src={props.housePhotoSrc}
                alt="صورة مكان التصوير"
                className="mt-4 aspect-[4/3] w-full rounded-xl object-cover"
                loading="lazy"
              />
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              {loc?.map_url && (
                <a
                  href={preview ? undefined : loc.map_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-caption font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <MapPin className="h-4 w-4" aria-hidden />
                  افتح الخريطة
                </a>
              )}
              {appt && props.calendarHref && (
                <a
                  href={preview ? undefined : props.calendarHref}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border px-4 text-caption font-medium text-foreground hover:bg-muted"
                >
                  <CalendarPlus className="h-4 w-4" aria-hidden />
                  أضف للتقويم
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      {view.axes.length > 0 && (
        <section aria-labelledby="gl-axes" className="space-y-4">
          <h2 id="gl-axes" className="text-lead font-semibold text-foreground">وين ممكن ياخذنا الحوار</h2>
          <p className="text-caption leading-relaxed text-muted-foreground">{REASSURANCE_LINE}</p>
          <div className="space-y-3">
            {view.axes.map((axis) => (
              <AxisCard key={axis.ref} axis={axis} token={token} />
            ))}
          </div>
        </section>
      )}

      {identity && (
        <section aria-labelledby="gl-me" className="space-y-4">
          <h2 id="gl-me" className="text-lead font-semibold text-foreground">بياناتك</h2>
          <dl className="space-y-3 rounded-2xl border border-border bg-card p-5 text-caption">
            <Row
              label="اسمك مثل ما بنقوله"
              value={[identity.honorific, identity.full_name].filter(Boolean).join(" ") || null}
            />
            <Row label="الكنية" value={identity.kunya} />
            <Row label="طريقة النطق" value={identity.pronunciation_notes} />
          </dl>
        </section>
      )}

      <section aria-labelledby="gl-add" className="space-y-4">
        <h2 id="gl-add" className="text-lead font-semibold text-foreground">عندك إضافة؟</h2>
        <SuggestionForm token={token} targetRef={null} />
        {suggestions.length > 0 && (
          <ul className="space-y-2">
            {suggestions.map((s) => (
              <li key={s.id} className="rounded-xl border border-border bg-card p-3 text-caption">
                {s.target_label && <p className="mb-1 text-micro text-muted-foreground">{s.target_label}</p>}
                <p className="whitespace-pre-line text-foreground">{s.body}</p>
                {s.tag === "received" && <p className="mt-1 text-micro text-muted-foreground">وصلنا اقتراحك</p>}
                {s.tag === "taken" && <p className="mt-1 text-micro font-medium text-primary">تم الأخذ باقتراحك</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <FooterLinks {...props} />
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground">{value ?? "—"}</dd>
    </div>
  )
}

function FooterLinks({ onEditAnswers, onReplayWelcome }: GuestPrepViewPanelProps) {
  if (!onEditAnswers && !onReplayWelcome) return null
  return (
    <div className="flex flex-wrap justify-center gap-2 border-t border-border pt-6">
      {onEditAnswers && (
        <button
          type="button"
          onClick={onEditAnswers}
          className="min-h-11 rounded-xl px-4 text-caption text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          تعديل إجاباتي
        </button>
      )}
      {onReplayWelcome && (
        <button
          type="button"
          onClick={onReplayWelcome}
          className="min-h-11 rounded-xl px-4 text-caption text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          اقرأ الترحيب مرة ثانية
        </button>
      )}
    </div>
  )
}

function AxisCard({ axis, token }: { axis: GuestPrepView["axes"][number]; token: string | null }) {
  const [open, setOpen] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const panelId = useId()
  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-5 py-4 text-start"
      >
        <span className="text-body font-medium text-foreground">{axis.label}</span>
        <ChevronDown
          className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div id={panelId} className="space-y-3 border-t border-border px-5 pb-5 pt-4">
          {axis.samples.length > 0 && (
            <>
              <p className="text-micro font-medium text-muted-foreground">أمثلة على اللي ممكن نسأله</p>
              <ul className="space-y-2">
                {axis.samples.map((s) => (
                  <li key={s.ref} className="flex gap-2 text-caption leading-relaxed text-foreground">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    <span>{s.text}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {suggesting ? (
            <SuggestionForm token={token} targetRef={axis.ref} onDone={() => setSuggesting(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setSuggesting(true)}
              className="min-h-11 rounded-xl border border-border px-4 text-caption text-foreground hover:bg-muted"
            >
              اقترح تعديل
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function SuggestionForm({
  token,
  targetRef,
  onDone,
}: {
  token: string | null
  targetRef: string | null
  onDone?: () => void
}) {
  const router = useRouter()
  const [body, setBody] = useState("")
  const [kind, setKind] = useState<"comment" | "new_question">("comment")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const fieldId = useId()
  const errId = `${fieldId}-err`
  const preview = token === null

  async function send() {
    if (preview) return
    const text = body.trim()
    if (!text) {
      setError("اكتب اقتراحك")
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/prepare/${token}/suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target_kind: targetRef ? "axis" : "general",
          target_ref: targetRef,
          suggestion_type: targetRef ? "edit" : kind,
          body: text,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> }
      if (!res.ok) {
        setError(data.fields?.body ?? data.error ?? "ما قدرنا نرسل، جرّب مرة ثانية")
        return
      }
      setBody("")
      setSent(true)
      router.refresh()
      onDone?.()
    } catch {
      setError("ما قدرنا نرسل، تأكد من الاتصال وجرّب مرة ثانية")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      {!targetRef && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="نوع الإضافة">
          {(
            [
              ["comment", "ملاحظة"],
              ["new_question", "سؤال تحب نسألك إياه"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              onClick={() => setKind(value)}
              className={cn(
                "min-h-11 rounded-xl border px-4 text-caption",
                kind === value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <label htmlFor={fieldId} className="sr-only">
        {targetRef ? "اقتراحك على هذا المحور" : "إضافتك"}
      </label>
      <textarea
        id={fieldId}
        value={body}
        onChange={(e) => {
          setBody(e.target.value)
          setSent(false)
        }}
        maxLength={GUEST_SUGGESTION_LIMITS.MAX_CHARS}
        rows={3}
        disabled={preview}
        placeholder={targetRef ? "شنو تحب نعدّل أو نضيف هني؟" : "أي شي تحب يوصل للفريق…"}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errId : undefined}
        className="form-input resize-none"
      />
      {error && (
        <p id={errId} className="text-caption text-destructive">
          {error}
        </p>
      )}
      {sent && !error && (
        <p className="text-caption text-primary" role="status">
          وصلنا، شكراً ✓
        </p>
      )}
      <button
        type="button"
        onClick={send}
        disabled={busy || preview}
        className="min-h-11 rounded-xl bg-primary px-5 text-caption font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
      >
        {busy ? "جاري الإرسال…" : "أرسل"}
      </button>
    </div>
  )
}
