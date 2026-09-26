"use client"

/**
 * «نسخة الضيف» — the guest's journey on one page:
 *   thank-you → 4-screen questionnaire → «وصلتنا» → welcome cards → prep view.
 *
 * Every prop comes from `buildGuestPageProps()` (lib/guest-link/page-props.ts);
 * the prep reaches this file only as the projected `GuestPrepView`.
 */

import { useCallback, useId, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { KhatLogo } from "@/components/brand/khat-logo"
import { GuestPrepViewPanel } from "@/components/guest-link/guest-prep-view"
import type { GuestLinkClientProps } from "@/lib/guest-link/page-props"
import type { GuestLinkQuestionnaireDraft } from "@/types/database"
import { GUEST_FIELD_MAX } from "@/lib/validation/guest-link"

type Screen = "thanks" | "q" | "sent" | "welcome" | "prep"

const DAYS = [
  { value: "sunday", label: "الأحد" },
  { value: "monday", label: "الاثنين" },
  { value: "tuesday", label: "الثلاثاء" },
  { value: "wednesday", label: "الأربعاء" },
  { value: "thursday", label: "الخميس" },
  { value: "saturday", label: "السبت" },
] as const

const TIMES = [
  { value: "morning", label: "الصبح (9–12)" },
  { value: "afternoon", label: "الظهر (12–4)" },
  { value: "evening", label: "العصر والمغرب (4–8)" },
] as const

const SOCIALS = [
  { key: "instagram", label: "Instagram", placeholder: "@username" },
  { key: "twitter", label: "X", placeholder: "@username" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://…" },
  { key: "youtube", label: "YouTube", placeholder: "https://…" },
  { key: "tiktok", label: "TikTok", placeholder: "@username" },
  { key: "website", label: "موقع شخصي", placeholder: "https://…" },
] as const

const STEPS = [
  { title: "عرّفنا عليك" },
  { title: "راحتك يوم التصوير" },
  { title: "عن الحوار" },
  { title: "لمسات أخيرة" },
] as const

/** Which screen each field lives on — to jump to the first server error. */
const FIELD_STEP: Record<string, number> = {
  full_name: 0,
  honorific: 0,
  kunya: 0,
  pronunciation_notes: 0,
  phone_whatsapp: 0,
  preferred_drink: 1,
  preferred_filming_days: 1,
  preferred_filming_time: 1,
  scheduling_restrictions: 1,
  technical_needs: 1,
  topics_excited_about: 2,
  sensitivities_to_avoid: 2,
  social_accounts: 3,
  team_notes: 3,
  arrival_confirmation: 3,
  clothing_acknowledgment: 3,
}

const WELCOME_CARDS = [
  {
    title: "عن خط",
    body: "في خط نختار ضيوفنا بعناية، ونهتم بأدق التفاصيل، لأن كل حلقة عندنا تُصنع لتبقى.",
  },
  {
    title: "ليش أرسلنا لك الإعداد",
    body: "أرسلنا لك ملامح الحلقة للاطلاع فقط. الحوار في خط عفوي وبسيط بروح احترافية، ولا يحتاج منك تحضير إجابات.",
  },
  {
    title: "جلسة بورتريه",
    body: "على هامش التصوير، نخصّك بجلسة تصوير بورتريه احترافية.",
  },
  {
    title: "عن الغترة",
    body: "نفضّل الحضور دون غترة أو شماغ. هذا اختيار مقصود يعكس روح خط: عفوية بلا تكلّف.",
  },
] as const

/** Form state: every field present, strings never null. */
interface Answers {
  full_name: string
  honorific: string
  kunya: string
  pronunciation_notes: string
  phone_whatsapp: string
  preferred_drink: string
  preferred_filming_days: string[]
  preferred_filming_time: string
  scheduling_restrictions: string
  technical_needs: string
  topics_excited_about: string
  sensitivities_to_avoid: string
  social_accounts: Record<string, string | undefined>
  team_notes: string
  arrival_confirmation: boolean
  clothing_acknowledgment: boolean
}

function toFormState(a: GuestLinkQuestionnaireDraft): Answers {
  return {
    full_name: a.full_name ?? "",
    honorific: a.honorific ?? "",
    kunya: a.kunya ?? "",
    pronunciation_notes: a.pronunciation_notes ?? "",
    phone_whatsapp: a.phone_whatsapp ?? "",
    preferred_drink: a.preferred_drink ?? "",
    preferred_filming_days: a.preferred_filming_days ?? [],
    preferred_filming_time: a.preferred_filming_time ?? "",
    scheduling_restrictions: a.scheduling_restrictions ?? "",
    technical_needs: a.technical_needs ?? "",
    topics_excited_about: a.topics_excited_about ?? "",
    sensitivities_to_avoid: a.sensitivities_to_avoid ?? "",
    social_accounts: a.social_accounts ?? {},
    team_notes: a.team_notes ?? "",
    arrival_confirmation: a.arrival_confirmation ?? false,
    clothing_acknowledgment: a.clothing_acknowledgment ?? false,
  }
}

/** Client-side required checks per screen — the server re-validates everything. */
function stepErrors(step: number, a: Answers): Record<string, string> {
  const e: Record<string, string> = {}
  if (step === 0) {
    if (a.full_name.trim().length < 2) e.full_name = "اكتب اسمك الكامل"
    if (!/^[+\d][\d\s()-]{5,30}$/.test(a.phone_whatsapp.trim())) e.phone_whatsapp = "اكتب رقم واتساب صحيح"
  }
  if (step === 1) {
    if (!a.preferred_drink.trim()) e.preferred_drink = "قول لنا شنو تحب تشرب"
    if (a.preferred_filming_days.length === 0) e.preferred_filming_days = "اختر يوماً واحداً على الأقل"
    if (!a.preferred_filming_time) e.preferred_filming_time = "اختر الوقت اللي يناسبك"
  }
  if (step === 2) {
    if (a.topics_excited_about.trim().length < 2) e.topics_excited_about = "قول لنا شنو يحمّسك نتكلم فيه"
  }
  if (step === 3) {
    if (!a.arrival_confirmation) e.arrival_confirmation = "أكّد لنا الحضور قبل الموعد"
  }
  return e
}

function hasAnyAnswer(a: GuestLinkQuestionnaireDraft): boolean {
  return Object.values(a).some((v) =>
    Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : Boolean(v),
  )
}

export function GuestLinkClient(props: GuestLinkClientProps) {
  const router = useRouter()
  const initialScreen: Screen =
    props.stage === "prep"
      ? "prep"
      : props.stage === "welcome"
        ? "welcome"
        : hasAnyAnswer(props.initialAnswers)
          ? "q"
          : "thanks"

  const [screen, setScreen] = useState<Screen>(initialScreen)
  const [step, setStep] = useState(props.initialStep)
  const [answers, setAnswers] = useState<Answers>(() => toFormState(props.initialAnswers))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const [card, setCard] = useState(0)
  const [replay, setReplay] = useState(false)
  const topRef = useRef<HTMLDivElement>(null)

  const set = useCallback(<K extends keyof Answers>(k: K, v: Answers[K]) => {
    setAnswers((prev) => ({ ...prev, [k]: v }))
    setErrors((prev) => {
      if (!prev[k as string]) return prev
      const next = { ...prev }
      delete next[k as string]
      return next
    })
  }, [])

  const scrollTop = () => topRef.current?.scrollIntoView({ block: "start" })

  const payload = useMemo(
    () => ({
      ...answers,
      preferred_filming_time: answers.preferred_filming_time || null,
    }),
    [answers],
  )

  async function saveDraft(nextStep: number) {
    if (props.submitted) return
    try {
      await fetch(`/api/prepare/${props.token}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step: nextStep, draft: payload }),
      })
    } catch {
      // Autosave is best-effort; the submit carries everything anyway.
    }
  }

  function goTo(nextStep: number) {
    setStep(nextStep)
    void saveDraft(nextStep)
    scrollTop()
  }

  function next() {
    const e = stepErrors(step, answers)
    setErrors(e)
    if (Object.keys(e).length) return
    goTo(step + 1)
  }

  async function submit() {
    const e = stepErrors(step, answers)
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    setFormError(null)
    try {
      const res = await fetch(`/api/prepare/${props.token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          honorific: answers.honorific || null,
          kunya: answers.kunya || null,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> }
      if (!res.ok) {
        if (data.fields && Object.keys(data.fields).length) {
          setErrors(data.fields)
          const first = Math.min(...Object.keys(data.fields).map((k) => FIELD_STEP[k] ?? 3))
          setStep(first)
          scrollTop()
        }
        setFormError(data.error ?? "ما قدرنا نرسل، جرّب مرة ثانية")
        return
      }
      if (editing) {
        setEditing(false)
        setScreen("prep")
      } else {
        setScreen("sent")
      }
      scrollTop()
      router.refresh()
    } catch {
      setFormError("ما قدرنا نرسل، تأكد من الاتصال وجرّب مرة ثانية")
    } finally {
      setBusy(false)
    }
  }

  async function finishWelcome() {
    if (!replay) {
      try {
        await fetch(`/api/prepare/${props.token}/welcome`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      } catch {
        // Not critical: the worst case is seeing the cards once more.
      }
    }
    setReplay(false)
    setCard(0)
    setScreen("prep")
    scrollTop()
    router.refresh()
  }

  return (
    <div ref={topRef} className="mx-auto min-h-screen w-full max-w-xl px-4 py-8 sm:py-12">
      <header className="mb-8 flex justify-center">
        <KhatLogo height={28} />
      </header>

      {screen === "thanks" && (
        <div className="space-y-8 text-center">
          <p className="text-lead leading-relaxed text-foreground">
            حيّاك الله {props.greetingName}. شكراً لتلبيتك دعوة بودكاست خط، وحضورك يشرّفنا.
          </p>
          <p className="text-caption text-muted-foreground">
            عندنا لك أسئلة قصيرة على أربع صفحات، تساعدنا نجهّز كل شي على راحتك.
          </p>
          <PrimaryButton onClick={() => { setScreen("q"); scrollTop() }}>يلا نبدأ</PrimaryButton>
        </div>
      )}

      {screen === "q" && (
        <div>
          <Progress step={step} />
          <h1 className="mb-6 mt-6 text-subhead font-semibold text-foreground">{STEPS[step].title}</h1>

          <div className="space-y-6">
            {step === 0 && (
              <>
                <Field id="full_name" label="اسمك الكامل" required error={errors.full_name}>
                  {(a) => (
                    <input {...a} type="text" autoComplete="name" maxLength={GUEST_FIELD_MAX.full_name}
                      value={answers.full_name} onChange={(e) => set("full_name", e.target.value)} className="form-input" />
                  )}
                </Field>
                <Field id="honorific" label="المسمى" hint="مثل: د. أو م. أو أستاذ — اختياري" error={errors.honorific}>
                  {(a) => (
                    <input {...a} type="text" maxLength={GUEST_FIELD_MAX.honorific}
                      value={answers.honorific ?? ""} onChange={(e) => set("honorific", e.target.value)} className="form-input" />
                  )}
                </Field>
                <Field id="kunya" label="الكنية" hint="مثل: بو محمد — نستخدمها بالحوار" error={errors.kunya}>
                  {(a) => (
                    <input {...a} type="text" maxLength={GUEST_FIELD_MAX.kunya}
                      value={answers.kunya ?? ""} onChange={(e) => set("kunya", e.target.value)} className="form-input" />
                  )}
                </Field>
                <Field id="pronunciation_notes" label="فيه طريقة معيّنة ننطق فيها اسمك؟" hint="اختياري" error={errors.pronunciation_notes}>
                  {(a) => (
                    <input {...a} type="text" maxLength={GUEST_FIELD_MAX.pronunciation_notes}
                      value={answers.pronunciation_notes ?? ""} onChange={(e) => set("pronunciation_notes", e.target.value)} className="form-input" />
                  )}
                </Field>
                <Field id="phone_whatsapp" label="رقم الواتساب" required error={errors.phone_whatsapp}>
                  {(a) => (
                    <input {...a} type="tel" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="+965 XXXX XXXX"
                      maxLength={GUEST_FIELD_MAX.phone_whatsapp}
                      value={answers.phone_whatsapp} onChange={(e) => set("phone_whatsapp", e.target.value)} className="form-input text-start" />
                  )}
                </Field>
              </>
            )}

            {step === 1 && (
              <>
                <Field id="preferred_drink" label="شنو تحب تشرب وقت التصوير؟" required error={errors.preferred_drink}>
                  {(a) => (
                    <input {...a} type="text" placeholder="قهوة، شاي، ماي…" maxLength={GUEST_FIELD_MAX.preferred_drink}
                      value={answers.preferred_drink} onChange={(e) => set("preferred_drink", e.target.value)} className="form-input" />
                  )}
                </Field>
                <ChipGroup
                  id="preferred_filming_days"
                  label="الأيام اللي تناسبك"
                  multi
                  options={DAYS}
                  selected={answers.preferred_filming_days}
                  onToggle={(v) =>
                    set(
                      "preferred_filming_days",
                      answers.preferred_filming_days.includes(v)
                        ? answers.preferred_filming_days.filter((d) => d !== v)
                        : [...answers.preferred_filming_days, v],
                    )
                  }
                  error={errors.preferred_filming_days}
                />
                <ChipGroup
                  id="preferred_filming_time"
                  label="الوقت اللي يناسبك"
                  options={TIMES}
                  selected={answers.preferred_filming_time ? [answers.preferred_filming_time] : []}
                  onToggle={(v) => set("preferred_filming_time", v)}
                  error={errors.preferred_filming_time}
                />
                <Field id="scheduling_restrictions" label="فيه مواعيد ما تناسبك؟" hint="سفر أو التزامات — اختياري" error={errors.scheduling_restrictions}>
                  {(a) => (
                    <textarea {...a} rows={2} maxLength={GUEST_FIELD_MAX.scheduling_restrictions}
                      value={answers.scheduling_restrictions ?? ""} onChange={(e) => set("scheduling_restrictions", e.target.value)} className="form-input resize-none" />
                  )}
                </Field>
                <Field id="technical_needs" label="تحتاج شي معيّن يوم التصوير؟" hint="اختياري" error={errors.technical_needs}>
                  {(a) => (
                    <textarea {...a} rows={2} maxLength={GUEST_FIELD_MAX.technical_needs}
                      value={answers.technical_needs ?? ""} onChange={(e) => set("technical_needs", e.target.value)} className="form-input resize-none" />
                  )}
                </Field>
              </>
            )}

            {step === 2 && (
              <>
                <Field id="topics_excited_about" label="شنو الأشياء اللي تتحمس تتكلم عنها؟" required
                  hint="أفكار، تجارب، أو زوايا تهمك — مو لازم مواضيع محددة" error={errors.topics_excited_about}>
                  {(a) => (
                    <textarea {...a} rows={4} maxLength={GUEST_FIELD_MAX.topics_excited_about}
                      value={answers.topics_excited_about} onChange={(e) => set("topics_excited_about", e.target.value)} className="form-input resize-none" />
                  )}
                </Field>
                <Field id="sensitivities_to_avoid" label="فيه أمور تفضّل ما نتطرق لها؟"
                  hint="تبقى عند الفريق فقط، وما بنسأل عنها — اختياري" error={errors.sensitivities_to_avoid}>
                  {(a) => (
                    <textarea {...a} rows={3} maxLength={GUEST_FIELD_MAX.sensitivities_to_avoid}
                      value={answers.sensitivities_to_avoid ?? ""} onChange={(e) => set("sensitivities_to_avoid", e.target.value)} className="form-input resize-none" />
                  )}
                </Field>
              </>
            )}

            {step === 3 && (
              <>
                <SocialsBlock value={answers.social_accounts} onChange={(v) => set("social_accounts", v)} />
                <Field id="team_notes" label="كلمة للفريق" hint="أي شي تحب نعرفه — اختياري" error={errors.team_notes}>
                  {(a) => (
                    <textarea {...a} rows={3} maxLength={GUEST_FIELD_MAX.team_notes}
                      value={answers.team_notes ?? ""} onChange={(e) => set("team_notes", e.target.value)} className="form-input resize-none" />
                  )}
                </Field>
                <CheckRow
                  id="arrival_confirmation"
                  checked={answers.arrival_confirmation}
                  onChange={(v) => set("arrival_confirmation", v)}
                  label="تمام، بكون موجود قبل الموعد بنص ساعة"
                  error={errors.arrival_confirmation}
                />
                <CheckRow
                  id="clothing_acknowledgment"
                  checked={answers.clothing_acknowledgment}
                  onChange={(v) => set("clothing_acknowledgment", v)}
                  label="تمام، بلبس ألوان هادئة بدون خطوط أو نقوش دقيقة"
                />
              </>
            )}
          </div>

          {formError && (
            <p className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-caption text-destructive" role="alert">
              {formError}
            </p>
          )}

          <div className="mt-8 flex items-center justify-between gap-3 pb-8">
            {step > 0 ? (
              <button type="button" onClick={() => goTo(step - 1)}
                className="min-h-11 rounded-xl border border-border px-5 text-caption text-foreground hover:bg-muted">
                رجوع
              </button>
            ) : editing ? (
              <button type="button" onClick={() => { setEditing(false); setScreen("prep") }}
                className="min-h-11 rounded-xl border border-border px-5 text-caption text-foreground hover:bg-muted">
                إلغاء
              </button>
            ) : <span />}
            {step < STEPS.length - 1 ? (
              <PrimaryButton onClick={next}>التالي</PrimaryButton>
            ) : (
              <PrimaryButton onClick={submit} disabled={busy}>
                {busy ? "جاري الإرسال…" : editing ? "حفظ التعديلات" : "إرسال"}
              </PrimaryButton>
            )}
          </div>
        </div>
      )}

      {screen === "sent" && (
        <div className="space-y-8 text-center">
          <h1 className="text-subhead font-semibold text-foreground">وصلتنا، شكراً ✓</h1>
          <PrimaryButton onClick={() => { setScreen("welcome"); setCard(0); scrollTop() }}>التالي</PrimaryButton>
        </div>
      )}

      {screen === "welcome" && (
        <div className="space-y-8">
          <div className="min-h-48 rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-3 text-lead font-semibold text-foreground">{WELCOME_CARDS[card].title}</h2>
            <p className="text-body leading-relaxed text-foreground/90">{WELCOME_CARDS[card].body}</p>
          </div>
          <div className="flex justify-center gap-2" role="img" aria-label={`البطاقة ${card + 1} من ${WELCOME_CARDS.length}`}>
            {WELCOME_CARDS.map((_, i) => (
              <span key={i} className={cn("h-2 w-2 rounded-full", i === card ? "bg-primary" : "bg-border")} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            {card > 0 ? (
              <button type="button" onClick={() => setCard(card - 1)}
                className="min-h-11 rounded-xl border border-border px-5 text-caption text-foreground hover:bg-muted">
                رجوع
              </button>
            ) : <span />}
            {card < WELCOME_CARDS.length - 1 ? (
              <PrimaryButton onClick={() => setCard(card + 1)}>التالي</PrimaryButton>
            ) : (
              <PrimaryButton onClick={finishWelcome}>اطّلع على الحلقة</PrimaryButton>
            )}
          </div>
        </div>
      )}

      {screen === "prep" && (
        <GuestPrepViewPanel
          view={props.view}
          identity={props.identity}
          greetingName={props.greetingName}
          suggestions={props.suggestions}
          updatedSinceLastVisit={props.updatedSinceLastVisit}
          token={props.token}
          housePhotoSrc={`/api/prepare/${props.token}/house-photo`}
          calendarHref={`/api/prepare/${props.token}/calendar`}
          onEditAnswers={() => {
            setEditing(true)
            setStep(0)
            setErrors({})
            setScreen("q")
            scrollTop()
          }}
          onReplayWelcome={() => {
            setReplay(true)
            setCard(0)
            setScreen("welcome")
            scrollTop()
          }}
        />
      )}
    </div>
  )
}

// ── Pieces ────────────────────────────────────────────────────────────────

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="min-h-11 rounded-xl bg-primary px-6 text-caption font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
    >
      {children}
    </button>
  )
}

function Progress({ step }: { step: number }) {
  const total = STEPS.length
  const current = step + 1
  return (
    <div>
      <div className="mb-2 text-caption text-muted-foreground">{`${current} من ${total}`}</div>
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`${current} من ${total}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        {/* A block child in an RTL flow starts at the right edge — the bar fills from the right. */}
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(current / total) * 100}%` }} />
      </div>
    </div>
  )
}

interface A11yProps {
  id: string
  "aria-invalid": boolean
  "aria-describedby": string | undefined
  "aria-required": boolean | undefined
}

function Field({
  id,
  label,
  hint,
  required,
  error,
  children,
}: {
  id: string
  label: string
  hint?: string
  required?: boolean
  error?: string
  children: (a: A11yProps) => React.ReactNode
}) {
  const base = useId()
  const fieldId = `${base}-${id}`
  const hintId = hint ? `${fieldId}-hint` : null
  const errId = error ? `${fieldId}-err` : null
  const describedBy = [hintId, errId].filter(Boolean).join(" ") || undefined
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1.5 block text-caption font-medium text-foreground">
        {label}
        {required && <span className="ms-1 text-destructive" aria-hidden>*</span>}
      </label>
      {hint && (
        <p id={hintId!} className="mb-2 text-micro text-muted-foreground">
          {hint}
        </p>
      )}
      {children({ id: fieldId, "aria-invalid": Boolean(error), "aria-describedby": describedBy, "aria-required": required || undefined })}
      {error && (
        <p id={errId!} className="mt-1.5 text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function ChipGroup({
  id,
  label,
  options,
  selected,
  onToggle,
  multi,
  error,
}: {
  id: string
  label: string
  options: ReadonlyArray<{ value: string; label: string }>
  selected: readonly string[]
  onToggle: (v: string) => void
  multi?: boolean
  error?: string
}) {
  const base = useId()
  const labelId = `${base}-${id}`
  const errId = error ? `${labelId}-err` : undefined
  return (
    <div>
      <p id={labelId} className="mb-2 text-caption font-medium text-foreground">
        {label}
        <span className="ms-1 text-destructive" aria-hidden>*</span>
      </p>
      <div
        role={multi ? "group" : "radiogroup"}
        aria-labelledby={labelId}
        aria-describedby={errId}
        className="flex flex-wrap gap-2"
      >
        {options.map((o) => {
          const on = selected.includes(o.value)
          return (
            <button
              key={o.value}
              type="button"
              role={multi ? "checkbox" : "radio"}
              aria-checked={on}
              onClick={() => onToggle(o.value)}
              className={cn(
                "min-h-11 rounded-xl border px-4 text-caption transition-colors",
                on ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:bg-muted",
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
      {error && (
        <p id={errId} className="mt-1.5 text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function CheckRow({
  id,
  checked,
  onChange,
  label,
  error,
}: {
  id: string
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  error?: string
}) {
  const base = useId()
  const fieldId = `${base}-${id}`
  const errId = error ? `${fieldId}-err` : undefined
  return (
    <div>
      <label htmlFor={fieldId} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-muted/50">
        <input
          id={fieldId}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={Boolean(error)}
          aria-describedby={errId}
          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
        />
        <span className="text-caption text-foreground">{label}</span>
      </label>
      {error && (
        <p id={errId} className="mt-1.5 text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function SocialsBlock({
  value,
  onChange,
}: {
  value: Answers["social_accounts"]
  onChange: (v: Answers["social_accounts"]) => void
}) {
  const [open, setOpen] = useState(() => Object.values(value).some((v) => v && v.trim()))
  const base = useId()
  const panelId = `${base}-socials`
  return (
    <div className="rounded-xl border border-border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-start text-caption text-foreground"
      >
        <span>
          حساباتك في التواصل الاجتماعي <span className="text-muted-foreground">(اختياري)</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div id={panelId} className="grid gap-3 border-t border-border p-4 sm:grid-cols-2">
          {SOCIALS.map(({ key, label, placeholder }) => {
            const id = `${base}-${key}`
            return (
              <div key={key}>
                <label htmlFor={id} className="mb-1 block text-micro text-muted-foreground">{label}</label>
                <input
                  id={id}
                  type="text"
                  dir="ltr"
                  maxLength={GUEST_FIELD_MAX.social}
                  placeholder={placeholder}
                  value={value[key] ?? ""}
                  onChange={(e) => onChange({ ...value, [key]: e.target.value })}
                  className="form-input text-start"
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
