"use client"

import { useState } from "react"
import { ChevronDown, Plus, X } from "lucide-react"
import type {
  KhatMapEditorialControls,
  KhatMapTopicDomain,
  KhatMapDomainWeight,
} from "@/types/khat-map"
import { KHAT_TOPIC_DOMAIN_LABEL } from "@/types/khat-map"

/**
 * Per-season OPTIONAL editorial controls form. Reads + writes a single
 * KhatMapEditorialControls object via the parent's controlled state.
 *
 * NOTE: gender + nationality filters are NOT in this form. They're
 * required, surfaced at the top level of `SetupClient`, and the
 * server-side `createV2SeasonAction` rejects creation when either is
 * still at its neutral default.
 *
 * Sections (all collapsible, all default-open):
 *   1. أوزان المجالات      (per-domain weight 0-3)
 *   2. هوية الموسم         (priorities + tone + identity description)
 *   3. الممنوعات الصارمة   (banned topics / guests / repeated)
 *
 * The component is "uncontrolled-ish" — it owns the working state but
 * lifts every change up via `onChange` so the parent can submit a fully-
 * resolved object.
 */
export function EditorialControlsForm({
  value,
  onChange,
}: {
  value: KhatMapEditorialControls
  onChange: (next: KhatMapEditorialControls) => void
}) {
  return (
    <div className="space-y-3">
      <Section
        title="أوزان المجالات"
        subtitle="عطّل أو رجّح المجالات حسب أولويات الموسم"
        defaultOpen={false}
      >
        <DomainWeightsGrid value={value} onChange={onChange} />
      </Section>

      <Section
        title="هوية الموسم"
        subtitle="أضف أولويات أو وصفًا خاصًا بهذا الموسم — لا يُغيّر دستور خط العام"
        defaultOpen={false}
      >
        <IdentityOverrideEditor value={value} onChange={onChange} />
      </Section>

      <Section
        title="الممنوعات الصارمة"
        subtitle="مواضيع وضيوف لن يُقترحوا أبدًا في هذا الموسم"
        defaultOpen={false}
      >
        <HardAvoidEditor value={value} onChange={onChange} />
      </Section>
    </div>
  )
}

// ─── Section wrapper ────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  defaultOpen,
  children,
}: {
  title: string
  subtitle: string
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-2xl border border-border/60 bg-card/30 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-right transition-colors hover:bg-card/50"
      >
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold">{title}</div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <ChevronDown
          className={
            "h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform " +
            (open ? "rotate-180" : "rotate-0")
          }
        />
      </button>
      {open && <div className="border-t border-border/40 p-4">{children}</div>}
    </div>
  )
}

// ─── 1. Domain weights ──────────────────────────────────────────────────────

const WEIGHT_OPTIONS: Array<{ value: KhatMapDomainWeight; label: string }> = [
  { value: 0, label: "معطّل" },
  { value: 1, label: "منخفض" },
  { value: 2, label: "عادي" },
  { value: 3, label: "مرتفع" },
]

const VISIBLE_DOMAINS: KhatMapTopicDomain[] = [
  "philosophy",
  "psychology",
  "relationships",
  "religion",
  "identity_masculinity",
  "money_career",
  "technology_ai",
  "internet_culture",
  "crime_mystery",
  "hidden_history",
  "power_manipulation",
  "parenting",
  "kuwait_gulf",
  "historical",
  "social_issues",
  "modern_society",
  "emotions_inner_life",
]

function DomainWeightsGrid({
  value,
  onChange,
}: {
  value: KhatMapEditorialControls
  onChange: (next: KhatMapEditorialControls) => void
}) {
  const setWeight = (domain: KhatMapTopicDomain, w: KhatMapDomainWeight) => {
    const next = { ...value.domain_weights }
    if (w === 2) {
      delete next[domain] // neutral = absent (sparse map)
    } else {
      next[domain] = w
    }
    onChange({ ...value, domain_weights: next })
  }
  return (
    <div className="space-y-2">
      <p className="text-[10.5px] text-muted-foreground/80">
        الافتراضي «عادي» لجميع المجالات. اختر «معطّل» لاستبعاد المجال
        كلّيًا، «مرتفع» لترجيحه، أو «منخفض» لتقليله.
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {VISIBLE_DOMAINS.map((d) => {
          const current = value.domain_weights[d] ?? 2
          const label = KHAT_TOPIC_DOMAIN_LABEL[d]
          return (
            <div
              key={d}
              className="flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/30 px-2 py-1.5"
            >
              <span
                className={
                  "shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium " +
                  label.bg +
                  " " +
                  label.text
                }
              >
                {label.label}
              </span>
              <div className="flex gap-0.5">
                {WEIGHT_OPTIONS.map((w) => {
                  const active = current === w.value
                  return (
                    <button
                      key={w.value}
                      type="button"
                      onClick={() => setWeight(d, w.value)}
                      className={
                        "rounded-md px-1.5 py-0.5 text-[10px] transition-colors " +
                        (active
                          ? w.value === 0
                            ? "bg-rose-500/20 text-rose-400 font-semibold"
                            : w.value === 3
                              ? "bg-emerald-500/20 text-emerald-400 font-semibold"
                              : "bg-foreground/10 text-foreground font-semibold"
                          : "text-muted-foreground hover:text-foreground")
                      }
                    >
                      {w.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 3. Identity override ───────────────────────────────────────────────────

function IdentityOverrideEditor({
  value,
  onChange,
}: {
  value: KhatMapEditorialControls
  onChange: (next: KhatMapEditorialControls) => void
}) {
  const setIdentity = (
    next: Partial<KhatMapEditorialControls["identity_override"]>,
  ) => {
    onChange({
      ...value,
      identity_override: { ...value.identity_override, ...next },
    })
  }
  const setTone = (
    axis: "depth" | "controversy" | "emotional",
    raw: number | null,
  ) => {
    const tone = { ...value.identity_override.tone_emphasis }
    if (raw === null) delete tone[axis]
    else tone[axis] = raw
    setIdentity({ tone_emphasis: tone })
  }
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">
          إضافة على الهوية (اختياري)
        </label>
        <textarea
          value={value.identity_override.identity_description ?? ""}
          onChange={(e) =>
            setIdentity({ identity_description: e.target.value || null })
          }
          rows={2}
          placeholder="مثال: «هذا الموسم يميل إلى المواضيع الفلسفية الكويتية الحديثة»"
          className="w-full resize-y rounded-lg border border-input bg-background p-2.5 text-[12.5px] focus:border-primary focus:outline-none"
        />
      </div>

      <ChipList
        label="أولويات إضافية لهذا الموسم"
        placeholder="مثال: «تجنّب الضيوف المشهورين على حساب العمق»"
        values={value.identity_override.priorities}
        onChange={(priorities) => setIdentity({ priorities })}
      />

      <div>
        <div className="mb-2 text-[11px] font-semibold text-muted-foreground">
          نبرة الموسم
        </div>
        <div className="space-y-2">
          <ToneSlider
            label="العمق"
            value={value.identity_override.tone_emphasis.depth}
            onChange={(v) => setTone("depth", v)}
          />
          <ToneSlider
            label="الجرأة"
            value={value.identity_override.tone_emphasis.controversy}
            onChange={(v) => setTone("controversy", v)}
          />
          <ToneSlider
            label="الإحساس العاطفي"
            value={value.identity_override.tone_emphasis.emotional}
            onChange={(v) => setTone("emotional", v)}
          />
        </div>
      </div>
    </div>
  )
}

function ToneSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | null) => void
}) {
  const isOverridden = typeof value === "number"
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/40 bg-background/30 p-2.5">
      <span className="w-32 shrink-0 text-[11.5px]">{label}</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        disabled={!isOverridden}
        value={isOverridden ? value : 0.5}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
        dir="ltr"
      />
      <span className="w-10 shrink-0 text-center text-[10.5px] tabular-nums text-muted-foreground">
        {isOverridden ? value!.toFixed(2) : "—"}
      </span>
      <button
        type="button"
        onClick={() => onChange(isOverridden ? null : 0.5)}
        className={
          "rounded-md px-2 py-1 text-[10px] " +
          (isOverridden
            ? "border border-border/60 text-muted-foreground hover:text-foreground"
            : "border border-primary/30 bg-primary/5 text-primary")
        }
      >
        {isOverridden ? "افتراضي" : "تجاوز"}
      </button>
    </div>
  )
}

// ─── 4. Hard-avoid lists ────────────────────────────────────────────────────

function HardAvoidEditor({
  value,
  onChange,
}: {
  value: KhatMapEditorialControls
  onChange: (next: KhatMapEditorialControls) => void
}) {
  const setHardAvoid = (
    next: Partial<KhatMapEditorialControls["hard_avoid"]>,
  ) => {
    onChange({ ...value, hard_avoid: { ...value.hard_avoid, ...next } })
  }
  return (
    <div className="space-y-4">
      <ChipList
        label="مواضيع ممنوعة"
        placeholder="مثال: «انتخابات»، «أزمة سياسية محلية»"
        values={value.hard_avoid.banned_topics}
        onChange={(banned_topics) => setHardAvoid({ banned_topics })}
      />
      <ChipList
        label="ضيوف ممنوعون"
        placeholder="اكتب الاسم كما يظهر — مثال: «فلان الفلاني»"
        values={value.hard_avoid.banned_guests}
        onChange={(banned_guests) => setHardAvoid({ banned_guests })}
      />
      <ChipList
        label="مواضيع كرّرناها سابقًا"
        placeholder="موضوع تكرّر كثيرًا في المواسم الماضية"
        values={value.hard_avoid.repeated_topics_to_avoid}
        onChange={(repeated_topics_to_avoid) =>
          setHardAvoid({ repeated_topics_to_avoid })
        }
      />
    </div>
  )
}

// ─── Reusable chip list ─────────────────────────────────────────────────────

function ChipList({
  label,
  placeholder,
  values,
  onChange,
}: {
  label: string
  placeholder: string
  values: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState("")
  const add = () => {
    const v = draft.trim()
    if (!v || values.includes(v)) return
    onChange([...values, v])
    setDraft("")
  }
  const remove = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx))
  }
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">
        {label}
      </label>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              add()
            }
          }}
          placeholder={placeholder}
          className="h-9 flex-1 rounded-lg border border-input bg-background px-3 text-[12px] focus:border-primary focus:outline-none"
        />
        <button
          type="button"
          onClick={add}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1 rounded-lg border border-border/60 bg-background/40 px-2.5 text-[11.5px] text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          إضافة
        </button>
      </div>
      {values.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {values.map((v, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background/40 px-2 py-0.5 text-[11px]"
            >
              {v}
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-muted-foreground hover:text-rose-400"
                aria-label="إزالة"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
