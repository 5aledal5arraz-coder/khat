"use client"

/**
 * «نسخة الضيف» — the guest's journey on one page:
 *   thank-you → 2-screen questionnaire → «وصلتنا» → welcome cards → prep view.
 *
 * Every prop comes from `buildGuestPageProps()` (lib/guest-link/page-props.ts);
 * the prep reaches this file only as the projected `GuestPrepView`.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { KhatLogo } from "@/components/brand/khat-logo"
import { GuestPrepViewPanel } from "@/components/guest-link/guest-prep-view"
import type { GuestLinkClientProps } from "@/lib/guest-link/page-props"
import type { GuestLinkQuestionnaireDraft } from "@/types/database"
import { GUEST_FIELD_MAX, isValidWhatsappNumber } from "@/lib/validation/guest-link"

type Screen = "thanks" | "q" | "sent" | "welcome" | "prep"

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
] as const

/** Which screen each field lives on — to jump to the first server error. */
const FIELD_STEP: Record<string, number> = {
  honorific: 0,
  kunya: 0,
  pronunciation_notes: 0,
  phone_whatsapp: 0,
  social_accounts: 0,
  preferred_drink: 1,
  technical_needs: 1,
  team_notes: 1,
  arrival_confirmation: 1,
  clothing_acknowledgment: 1,
}

/** Khaled's copy (2026-09-27) — two short paragraphs per card. */
const THANKS_PARAGRAPHS = [
  "يسعدنا ويشرّفنا أن تكون ضيفنا في بودكاست خط. اختيارك لم يكن صدفة؛ فنحن نختار ضيوفنا بعناية، لأن لديهم ما يستحق أن يُروى ويبقى.",
  "قبل أن نلتقي، جهّزنا لك هذه المساحة الخاصة: أسئلة قصيرة تساعدنا نستعد لك كما يليق، ثم ملامح حلقتك.",
] as const

const WELCOME_CARDS = [
  {
    title: "مكتبة، لا مجرد حلقات",
    body: [
      "في خط لا نصنع حلقات تُشاهَد وتُنسى، بل نبني مكتبة؛ كل حلقة فيها كتاب مرئي يوثّق تجربة وفكرة، وتزيد قيمته مع الوقت.",
      "لذلك تمرّ كل حلقة بأسابيع من البحث والإعداد والتصوير والمونتاج، ويعمل عليها فريق كامل حتى تخرج بما يليق بضيفها، وبمن سيشاهدها بعد سنوات.",
    ],
  },
  {
    title: "ليش أرسلنا لك الإعداد؟",
    body: [
      "بين يديك ملامح الحلقة وبعض محاورها، أرسلناها لتكون على اطلاع وتطمئن لمسار الحديث، لا لتحضّر إجابات.",
      "الحوار في خط عفوي ومريح، أقرب إلى جلسة بين أصدقاء، لكن خلفه إعداد احترافي دقيق. تعال كما أنت، والباقي علينا.",
    ],
  },
  {
    title: "جلسة تصوير بورتريه",
    body: [
      "على هامش التصوير نخصّك بجلسة «بورتريه»: صور شخصية احترافية بإضاءة وتكوين خاص، تُستخدم في غلاف حلقتك وظهورك على منصات خط.",
      "وإن رغبت أن تظهر في صور البورتريه بالغترة أو الشماغ، أحضرها معك؛ فهي للصور فقط، لا للحلقة.",
    ],
  },
  {
    title: "ليش بدون غترة أو شماغ؟",
    body: [
      "طلبنا مقصود ومن مصلحتك: البودكاست ليس مقابلة تلفزيونية رسمية. جمهور يوتيوب والبودكاست يبحث عن الإنسان قبل المنصب، والحضور البسيط يكسر الحاجز ويجعل الحديث أقرب وأصدق.",
      "والعفوية من أهم أسباب انتشار الحلقات على يوتيوب؛ فظهورك بلا رسمية يساعد حلقتك أن تصل لجمهور أوسع، ويبقى أثرها أطول.",
    ],
  },
] as const

/**
 * Draft autosave. Typing pauses save after AUTOSAVE_DEBOUNCE_MS, and a closing
 * tab flushes what is left — before this, the draft was saved only on a step
 * change, so step-2 text vanished with the tab. The server allows 60 draft
 * writes/hour/IP (GUEST_RATE_LIMITS.draft, shared with step changes and the
 * welcome POST), so autosaves are also spaced AUTOSAVE_MIN_GAP_MS apart and an
 * unchanged draft is never re-sent.
 */
const AUTOSAVE_DEBOUNCE_MS = 1500
const AUTOSAVE_MIN_GAP_MS = 30_000

/** Form state: every field present, strings never null. */
interface Answers {
  honorific: string
  kunya: string
  pronunciation_notes: string
  phone_whatsapp: string
  preferred_drink: string
  technical_needs: string
  social_accounts: Record<string, string | undefined>
  team_notes: string
  arrival_confirmation: boolean
  clothing_acknowledgment: boolean
}

function toFormState(a: GuestLinkQuestionnaireDraft): Answers {
  return {
    honorific: a.honorific ?? "",
    kunya: a.kunya ?? "",
    pronunciation_notes: a.pronunciation_notes ?? "",
    phone_whatsapp: a.phone_whatsapp ?? "",
    preferred_drink: a.preferred_drink ?? "",
    technical_needs: a.technical_needs ?? "",
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
    if (a.honorific.trim().length < 2) e.honorific = "اكتب لقبك أو مسماك"
    if (a.kunya.trim().length < 2) e.kunya = "اكتب الاسم اللي تحب نناديك فيه"
    // Same normaliser as the server: ٩٦٥ / ۹۶۵ / spaces / dashes are all fine.
    if (!isValidWhatsappNumber(a.phone_whatsapp)) e.phone_whatsapp = "اكتب رقم واتساب صحيح"
  }
  if (step === 1) {
    if (!a.preferred_drink.trim()) e.preferred_drink = "قول لنا شنو تحب تشرب"
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

  // What the server last received, so an unchanged draft is never re-sent.
  const lastSavedBody = useRef<string>(
    JSON.stringify({ step: props.initialStep, draft: toFormState(props.initialAnswers) }),
  )
  const lastSavedAt = useRef(0)
  /** Set once a submit starts — no autosave may race it. */
  const submitting = useRef(false)
  const latest = useRef({ step, answers })
  latest.current = { step, answers }

  const saveDraft = useCallback(
    async (nextStep: number, draft: Answers, opts: { keepalive?: boolean } = {}) => {
      if (props.submitted || submitting.current) return
      const body = JSON.stringify({ step: nextStep, draft })
      if (body === lastSavedBody.current) return
      lastSavedBody.current = body
      lastSavedAt.current = Date.now()
      try {
        await fetch(`/api/prepare/${props.token}/draft`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: opts.keepalive,
        })
      } catch {
        // Autosave is best-effort; the submit carries everything anyway.
      }
    },
    [props.submitted, props.token],
  )

  // Debounced autosave while the questionnaire is on screen.
  useEffect(() => {
    if (props.submitted || screen !== "q") return
    const wait = Math.max(AUTOSAVE_DEBOUNCE_MS, lastSavedAt.current + AUTOSAVE_MIN_GAP_MS - Date.now())
    const t = setTimeout(() => void saveDraft(step, answers), wait)
    return () => clearTimeout(t)
  }, [answers, step, screen, props.submitted, saveDraft])

  // A closing/backgrounded tab flushes the pending text (keepalive survives unload).
  useEffect(() => {
    if (props.submitted || screen !== "q") return
    const flush = () => void saveDraft(latest.current.step, latest.current.answers, { keepalive: true })
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush()
    }
    window.addEventListener("pagehide", flush)
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      window.removeEventListener("pagehide", flush)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [props.submitted, screen, saveDraft])

  function goTo(nextStep: number) {
    setStep(nextStep)
    void saveDraft(nextStep, answers)
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
    submitting.current = true
    let submitted = false
    try {
      const res = await fetch(`/api/prepare/${props.token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(answers),
      })
      const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> }
      if (!res.ok) {
        if (data.fields && Object.keys(data.fields).length) {
          setErrors(data.fields)
          const first = Math.min(...Object.keys(data.fields).map((k) => FIELD_STEP[k] ?? STEPS.length - 1))
          setStep(first)
          scrollTop()
        }
        setFormError(data.error ?? "ما قدرنا نرسل، جرّب مرة ثانية")
        return
      }
      submitted = true
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
      if (!submitted) submitting.current = false
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
        <KhatLogo height={40} />
      </header>

      {screen === "thanks" && (
        <div className="space-y-8">
          <div className="space-y-5 rounded-2xl border border-border bg-card p-6 sm:p-8">
            <h1 className="text-subhead font-semibold text-foreground">حيّاك الله {props.greetingName}،</h1>
            {THANKS_PARAGRAPHS.map((p) => (
              <p key={p} className="text-body leading-[1.8] text-foreground/90">{p}</p>
            ))}
          </div>
          <div className="flex justify-center">
            <PrimaryButton onClick={() => { setScreen("q"); scrollTop() }}>يلا نبدأ</PrimaryButton>
          </div>
        </div>
      )}

      {screen === "q" && (
        <div>
          <Progress step={step} />
          <h1 className="mb-6 mt-6 text-subhead font-semibold text-foreground">{STEPS[step].title}</h1>

          <div className="space-y-6">
            {step === 0 && (
              <>
                <Field id="honorific" label="اللقب أو المسمى" required
                  hint="نكتبه تحت اسمك في الحلقة وفي وصفها، مثل: خبير إداري، مدرب معتمد، رئيس تنفيذي" error={errors.honorific}>
                  {(a) => (
                    <input {...a} type="text" autoComplete="organization-title" maxLength={GUEST_FIELD_MAX.honorific}
                      value={answers.honorific} onChange={(e) => set("honorific", e.target.value)} className="form-input" />
                  )}
                </Field>
                <Field id="kunya" label="الكنية" required
                  hint="هذا الاسم اللي بنناديك فيه أغلب الحوار، مثل: بو محمد" error={errors.kunya}>
                  {(a) => (
                    <input {...a} type="text" maxLength={GUEST_FIELD_MAX.kunya}
                      value={answers.kunya} onChange={(e) => set("kunya", e.target.value)} className="form-input" />
                  )}
                </Field>
                <Field id="pronunciation_notes" label="فيه طريقة معيّنة ننطق فيها اسمك؟" hint="اختياري" error={errors.pronunciation_notes}>
                  {(a) => (
                    <input {...a} type="text" maxLength={GUEST_FIELD_MAX.pronunciation_notes}
                      value={answers.pronunciation_notes} onChange={(e) => set("pronunciation_notes", e.target.value)} className="form-input" />
                  )}
                </Field>
                <Field id="phone_whatsapp" label="رقم الواتساب" required error={errors.phone_whatsapp}>
                  {(a) => (
                    <input {...a} type="tel" dir="ltr" inputMode="tel" autoComplete="tel" placeholder="+965 XXXX XXXX"
                      maxLength={GUEST_FIELD_MAX.phone_whatsapp}
                      value={answers.phone_whatsapp} onChange={(e) => set("phone_whatsapp", e.target.value)} className="form-input text-start" />
                  )}
                </Field>
                <SocialsBlock value={answers.social_accounts} onChange={(v) => set("social_accounts", v)} />
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
                <Field id="technical_needs" label="تحتاج شي معيّن يوم التصوير؟" hint="اختياري" error={errors.technical_needs}>
                  {(a) => (
                    <textarea {...a} rows={2} maxLength={GUEST_FIELD_MAX.technical_needs}
                      value={answers.technical_needs} onChange={(e) => set("technical_needs", e.target.value)} className="form-input resize-none" />
                  )}
                </Field>
                <Field id="team_notes" label="كلمة للفريق" hint="أي شي تحب نعرفه — اختياري" error={errors.team_notes}>
                  {(a) => (
                    <textarea {...a} rows={3} maxLength={GUEST_FIELD_MAX.team_notes}
                      value={answers.team_notes} onChange={(e) => set("team_notes", e.target.value)} className="form-input resize-none" />
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
          <h1 className="text-subhead font-semibold text-foreground">وصلتنا إجاباتك، شكراً لك ✓</h1>
          <PrimaryButton onClick={() => { setScreen("welcome"); setCard(0); scrollTop() }}>التالي</PrimaryButton>
        </div>
      )}

      {screen === "welcome" && (
        <div className="space-y-8">
          {/* Every card sits in the same grid cell, so the box is as tall as the
              longest one and the buttons below never jump between cards. */}
          <div className="grid">
            {WELCOME_CARDS.map((c, i) => (
              <div
                key={c.title}
                aria-hidden={i !== card || undefined}
                className={cn(
                  "col-start-1 row-start-1 space-y-4 rounded-2xl border border-border bg-card p-6 sm:p-8",
                  i !== card && "invisible",
                )}
              >
                <h2 className="text-lead font-semibold text-foreground">{c.title}</h2>
                {c.body.map((p) => (
                  <p key={p} className="text-body leading-[1.8] text-foreground/90">{p}</p>
                ))}
              </div>
            ))}
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
