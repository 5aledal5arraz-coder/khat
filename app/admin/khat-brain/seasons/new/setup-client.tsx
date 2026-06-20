"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Compass,
  ShieldCheck,
  Sparkles,
  Hand,
  ArrowLeft,
  Loader2,
  SlidersHorizontal,
} from "lucide-react"
import type {
  KhatMapV2Mode,
  KhatMapEditorialControls,
  KhatMapGuestGenderFilter,
  KhatMapGuestNationalityFilter,
} from "@/types/khat-map"
import { KHAT_EDITORIAL_CONTROLS_DEFAULTS } from "@/types/khat-map"
import { createV2SeasonAction } from "../actions"
import { EditorialControlsForm } from "./editorial-controls-form"

const GENDER_OPTIONS: Array<{ key: KhatMapGuestGenderFilter; label: string }> = [
  { key: "male", label: "ذكر" },
  { key: "female", label: "أنثى" },
  { key: "all", label: "كلاهما" },
]

const NATIONALITY_OPTIONS: Array<{
  key: KhatMapGuestNationalityFilter
  label: string
}> = [
  { key: "kuwaiti", label: "كويتي" },
  { key: "non_kuwaiti", label: "غير كويتي" },
  { key: "any", label: "الكل" },
]

interface ModeOption {
  key: KhatMapV2Mode
  label: string
  description: string
  icon: typeof Compass
  recommended?: boolean
}

const MODES: ModeOption[] = [
  {
    key: "guided",
    label: "موجّه",
    description: "مزيج ذكي: ٧٠٪ زوايا مختارة + ٢٠٪ ذكاء اصطناعي + ١٠٪ يدوي.",
    icon: Compass,
    recommended: true,
  },
  {
    key: "strict",
    label: "صارم",
    description: "مواضيع من بنك الزوايا المعتمد فقط — بلا ابتكار.",
    icon: ShieldCheck,
  },
  {
    key: "open_ai",
    label: "استكشاف",
    description: "ذكاء اصطناعي حرّ بلا قيود — مواضيع جديدة كلّياً.",
    icon: Sparkles,
  },
  {
    key: "manual",
    label: "يدوي",
    description: "أنت تقود كل حلقة — النظام يساعدك عند الطلب فقط.",
    icon: Hand,
  },
]

export function SetupClient() {
  const router = useRouter()
  const [mode, setMode] = useState<KhatMapV2Mode>("guided")
  const [count, setCount] = useState<number>(10)
  const [controls, setControls] = useState<KhatMapEditorialControls>(
    KHAT_EDITORIAL_CONTROLS_DEFAULTS,
  )
  const [showControls, setShowControls] = useState(false)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleStart = () => {
    setError(null)
    // Gender + nationality each accept a single category OR "both"
    // (all / any = no restriction). All combinations are valid, so there's
    // nothing to gate here — the engine applies a filter only when a
    // specific category is chosen.
    start(async () => {
      const res = await createV2SeasonAction({
        mode,
        episode_count: count,
        editorial_controls: controls,
      })
      if (res.success) {
        router.push(`/admin/khat-brain/seasons/${res.data.seasonId}`)
      } else {
        setError(res.error)
      }
    })
  }

  const controlsActiveCount = countActiveControls(controls)

  return (
    <div className="space-y-8">
      {/* Mode grid */}
      <div>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          طريقة التوليد
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {MODES.map((m) => {
            const Icon = m.icon
            const active = mode === m.key
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                className={
                  "group relative rounded-2xl border p-4 text-right transition-all " +
                  (active
                    ? "border-primary bg-primary/5 shadow-sm"
                    : "border-border/60 bg-card/30 hover:border-border hover:bg-card/50")
                }
              >
                {m.recommended && (
                  <span className="absolute -top-2 right-3 rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground">
                    موصى به
                  </span>
                )}
                <div className="flex items-start gap-3">
                  <div
                    className={
                      "rounded-lg p-2 transition-colors " +
                      (active
                        ? "bg-primary/10 text-primary"
                        : "bg-muted/40 text-muted-foreground group-hover:text-foreground")
                    }
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">{m.label}</div>
                    <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                      {m.description}
                    </p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Episode count slider */}
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            عدد الحلقات
          </div>
          <div className="text-2xl font-bold tabular-nums">{count}</div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/30 p-4">
          <input
            type="range"
            min={6}
            max={20}
            step={1}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="w-full cursor-pointer accent-primary"
            dir="ltr"
          />
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground/60">
            <span>٦</span>
            <span>٢٠</span>
          </div>
        </div>
      </div>

      {/* Guest filters — gender + nationality. Top-level because they
          become constraints throughout topic generation, Phase A → Phase B
          handoff, and per-episode discovery. Choose a single category or
          "both" (no restriction). */}
      <div>
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
          فلاتر الضيوف
        </div>
        <div className="rounded-2xl border border-border/60 bg-card/30 p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FilterChipsRow
              label="الجنس"
              options={GENDER_OPTIONS}
              active={controls.guest_filters.gender}
              onSelect={(g) =>
                setControls({
                  ...controls,
                  guest_filters: { ...controls.guest_filters, gender: g },
                })
              }
            />
            <FilterChipsRow
              label="الجنسية"
              options={NATIONALITY_OPTIONS}
              active={controls.guest_filters.nationality}
              onSelect={(n) =>
                setControls({
                  ...controls,
                  guest_filters: { ...controls.guest_filters, nationality: n },
                })
              }
            />
          </div>
          <p className="mt-3 text-[10.5px] leading-relaxed text-muted-foreground/70">
            اختر «كلاهما / الكل» لعدم التقييد، أو حدّد فئة بعينها لتُطبَّق
            بصرامة على كل اقتراح ضيف. الضيوف الذين لا يمكن التحقّق من الفئة
            المطلوبة يُستبعدون.
          </p>
        </div>
      </div>

      {/* Editorial controls — collapsed by default to keep setup quick */}
      <div>
        <button
          type="button"
          onClick={() => setShowControls((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-border/60 bg-card/30 p-4 text-right transition-colors hover:bg-card/50"
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-muted/40 p-2 text-muted-foreground">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <div className="text-[13.5px] font-semibold">التحكم التحريري</div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                فلاتر ضيوف، أوزان مجالات، هوية الموسم، ممنوعات صارمة — اختياري
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {controlsActiveCount > 0 && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {controlsActiveCount} نشط
              </span>
            )}
            <span className="text-[11px] text-muted-foreground">
              {showControls ? "إخفاء" : "إظهار"}
            </span>
          </div>
        </button>
        {showControls && (
          <div className="mt-3">
            <EditorialControlsForm value={controls} onChange={setControls} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-[12px] text-rose-400">
          {error}
        </div>
      )}

      {/* CTA */}
      <button
        type="button"
        onClick={handleStart}
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-foreground px-6 py-3.5 text-[14px] font-bold text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            نُنشئ الموسم…
          </>
        ) : (
          <>
            ابدأ
            <ArrowLeft className="h-4 w-4" />
          </>
        )}
      </button>
    </div>
  )
}

/**
 * Single-select chip row for a guest filter (gender / nationality). Each
 * row offers the specific categories plus a "both / all" choice that means
 * no restriction. Mirrors the EditorialControlsForm chip styling so the
 * visual language is consistent.
 */
function FilterChipsRow<T extends string>({
  label,
  options,
  active,
  onSelect,
}: {
  label: string
  options: Array<{ key: T; label: string }>
  active: T
  onSelect: (key: T) => void
}) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const a = active === o.key
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onSelect(o.key)}
              className={
                "rounded-lg border px-3 py-1.5 text-[12px] transition-colors " +
                (a
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground")
              }
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Count how many editorial-control knobs the admin has actually moved
 * away from defaults — used to show an "N active" badge on the
 * collapsed section header. Excludes gender + nationality (they live
 * top-level now and have their own UI).
 */
function countActiveControls(c: KhatMapEditorialControls): number {
  let n = 0
  n += Object.keys(c.domain_weights).length
  n += c.identity_override.priorities.length
  if (c.identity_override.identity_description) n++
  n += Object.keys(c.identity_override.tone_emphasis).length
  n += c.hard_avoid.banned_topics.length
  n += c.hard_avoid.banned_guests.length
  n += c.hard_avoid.repeated_topics_to_avoid.length
  return n
}
