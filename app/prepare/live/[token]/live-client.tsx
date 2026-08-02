"use client"

/**
 * Live recording control panel — mobile-first, dark, distraction-free.
 * This is what the host opens on their phone while recording the episode.
 *
 * Features:
 *   - Phase navigator (opening → trust_building → ... → resolution)
 *   - Question cards grouped by section + bucket filter
 *   - Tap to mark question "used" (persists via PATCH /api/prepare/live/[token])
 *   - Energy meter (0–5) with live sync
 *   - Quick notes field (debounced save)
 *   - Shows the next-recommended question prominently
 *
 * TYPE SCALE — PARTIALLY ADOPTED ON PURPOSE (wave 2-b, 2026-08-02).
 * The sizes that already equalled a scale step were switched to the token, so
 * they follow a font change: text-[12px]/text-xs → text-micro, text-[14px]/
 * text-sm → text-caption, text-[16px] → text-body. Fourteen occurrences, all
 * a measured 0px delta IN FONT-SIZE.
 *
 * LEADING PINS — the other half of "0px delta" (wave 2-c, 2026-08-02).
 * The `0px` claim above was measured on ONE axis and was therefore wrong.
 * Every step in the scale carries a paired `--text-<step>--line-height`
 * (app/globals.css), so switching the SIZE token drags the LEADING with it.
 * Seven of the fourteen carried no explicit `leading-*` and moved — measured
 * at 375, root 16px:
 *
 *   header <h1>          text-sm     20   → text-caption 24.5   +4.5
 *   «استخدمت» button      text-[12px] 18   → text-micro   19.8   +1.8
 *   «الدعم» button        text-[12px] 18   → text-micro   19.8   +1.8
 *   empty-bucket state   text-xs     16   → text-micro   19.8   +3.8
 *   «لحظات قابلة» <h3>    text-xs     16   → text-micro   19.8   +3.8
 *   Drawer label <span>  text-xs     16   → text-micro   19.8   +3.8
 *   Instruction <p>      text-[12px] 19.5 → text-micro   19.8   +0.3
 *
 * The Instruction row is the one worth reading twice. It has no `leading-*`
 * of its own, but it renders inside the instructions drawer, whose container
 * carries `leading-relaxed` — so its "before" was the INHERITED 1.625
 * (19.5px), not the document's 1.5 (18px). Predicting it from the class
 * alone gives +1.8; measuring it in place gives +0.3. Leading is inherited,
 * so it can only be measured in situ, never derived from the class string.
 *
 * Each of the seven now pins the leading it had before the switch, so the
 * panel's vertical rhythm is byte-identical to the pre-wave layout while the
 * SIZE still follows the scale. These pins deliberately use Tailwind's own
 * `leading-*` (not a brand token): their job is to FREEZE this console's
 * rhythm, not to track the scale. `leading-5`/`leading-4` are rem, and the
 * step sizes are rem, so the ratio holds at any root size; `leading-normal`
 * (1.5) and `leading-relaxed` (1.625) are unitless and hold by construction.
 *
 * LEADING IS OWNED AT THE ROOT — the actual fix (wave 2-d, 2026-08-02).
 * Pinning the fourteen was necessary and insufficient, and the reason is the
 * mistake worth remembering: we assumed "we did not touch it" implied "it did
 * not move". Leading is INHERITED, so an ancestor we DID touch moves it.
 * `/prepare/live` is a public route with no layout of its own, so it renders
 * inside the public wrapper in app/layout.tsx — and wave 2 gave that wrapper
 * `text-body`, i.e. `line-height: 1.85`. The panel had never declared a
 * line-height, so every element here without an explicit `leading-*` silently
 * went from the document's 1.5 to 1.85. Measured at 375 on the composed panel
 * against a pre-wave-1 baseline server: 33 of 70 rendered text nodes moved,
 * font-size delta 0 on every one of them, line-height +3.15 to +3.85px — the
 * mid-recording reflow the fourteen pins existed to prevent, arriving through
 * the one path the pins could not see.
 *
 * So the root <div> now carries `leading-normal`. That is not a per-element
 * patch — it is the panel declaring its own vertical rhythm, which is the
 * correct relationship for a console that must not move when the SITE's
 * typography changes. Nothing inherits leading across the panel boundary any
 * more, so the twenty-four raw-px labels below are once again genuinely
 * frozen rather than accidentally stable. A guard in
 * tests/type-scale-guards.test.ts asserts the root keeps that pin.
 *
 * REM vs PX, decided 2026-08-02: the fourteen stay on the rem-based scale.
 * Zero-delta is exact only at a 16px root — at a larger browser font these
 * fourteen grow and the twenty-five raw-px labels below do not. That mix is
 * the honest cost of a half-migrated panel, and it is the RIGHT half to have
 * migrated: reverting to px would make this the only public route that
 * ignores the reader's font-size preference, and 12px Arabic is already at
 * the legibility floor. The mix only misorders anything below a 16px root,
 * where the lone `text-[13px]` notes textarea would outgrow the body
 * step — a textarea that shares a line with nothing. The reflow risk Khalid
 * cares about is mid-recording movement; browser font-size is set before the
 * session, not during it. End state is all-rem, via the deferred pass below.
 *
 * DELIBERATELY LEFT RAW: 4x text-[9px], 11x text-[10px] and 9x text-[11px] —
 * twenty-four labels that sit BELOW the scale's 12px floor. Moving them onto
 * the scale grows them 1–3px each, and they are the phase strip, bucket
 * chips, drawer headers and micro-labels of a console the director reads at
 * arm's length DURING a live recording, where a reflow is not a cosmetic
 * risk. That is a layout change, not a typography change, so it was stopped
 * and referred rather than pushed through. It needs its own pass with a
 * rehearsal on the real device — and note this panel is also the only one of
 * the four token routes with no layout of its own.
 *
 * THE NOTES TEXTAREA IS NO LONGER ONE OF THEM (wave 2-d). It was listed above
 * as a twenty-fifth deferred label at `text-[13px]`, which was a
 * miscategorisation: it is not a label, it is the one FOCUSABLE FIELD on a
 * public route, so under 16px iOS Safari zooms the whole viewport when the
 * director taps it — mid-recording, on the screen that must not move. It now
 * reads `text-field md:text-control` like every other public field. That is a
 * deliberate, measured 13px→16px growth (line box 21.13→26px); it is the only
 * row in this panel that does NOT return to its pre-wave value, and it is a
 * fix, not drift.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  Lightbulb,
  Mic,
  StickyNote,
  Zap,
} from "lucide-react"
import type {
  EpisodePreparationLiveView,
  PreparationQuestion,
  PreparationQuestionBucket,
  PreparationQuestionSupport,
  PreparationEpisodeFlowPhaseKey,
  PreparationLiveState,
} from "@/types/preparation"

const BUCKET_COLORS: Record<PreparationQuestionBucket, string> = {
  opening: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  deep: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
  escalation: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  surprise: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30",
  backup: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30",
  recovery: "bg-amber-500/15 text-amber-300 border-amber-500/30",
}

const BUCKET_LABELS: Record<PreparationQuestionBucket, string> = {
  opening: "افتتاح",
  deep: "عميق",
  escalation: "تصعيد",
  surprise: "مفاجأة",
  backup: "احتياطي",
  recovery: "إنقاذ",
}

const PHASE_LABELS: Record<PreparationEpisodeFlowPhaseKey, string> = {
  opening: "الافتتاح",
  trust_building: "بناء الثقة",
  deep_exploration: "الاستكشاف العميق",
  turning_point: "نقطة التحول",
  peak: "الذروة",
  resolution: "الخاتمة",
}

// ─── Phase + Energy guidance maps ──────────────────────────────────────────
// These turn the passive indicators into an active co-host assistant:
// each phase and energy band carries a guidance message and a set of
// preferred buckets that drive the question priority scoring below.

interface PhaseGuidance {
  message: string
  preferredBuckets: PreparationQuestionBucket[]
  avoidBuckets?: PreparationQuestionBucket[]
}

const PHASE_GUIDANCE: Record<PreparationEpisodeFlowPhaseKey, PhaseGuidance> = {
  opening: {
    message: "أنت في الافتتاح — ابدأ بسلاسة، اكسر الحاجز",
    preferredBuckets: ["opening"],
    avoidBuckets: ["escalation"],
  },
  trust_building: {
    message: "أنت في بناء الثقة — تجنّب التصعيد العدواني",
    preferredBuckets: ["opening", "deep"],
    avoidBuckets: ["escalation"],
  },
  deep_exploration: {
    message: "أنت في الاستكشاف العميق — وسّع الزوايا الحقيقية",
    preferredBuckets: ["deep", "surprise"],
  },
  turning_point: {
    message: "أنت في نقطة التحول — ادفع نحو موقف واضح",
    preferredBuckets: ["deep", "escalation"],
  },
  peak: {
    message: "أنت في الذروة — هذه لحظة الدفع العميق",
    preferredBuckets: ["escalation", "surprise", "deep"],
  },
  resolution: {
    message: "أنت في الخاتمة — اجمع الخيوط بهدوء",
    preferredBuckets: ["deep", "backup"],
    avoidBuckets: ["escalation"],
  },
}

type EnergyBand = "low" | "medium" | "high"

function energyBand(n: number): EnergyBand {
  if (n <= 2) return "low"
  if (n === 3) return "medium"
  return "high"
}

interface EnergyGuidance {
  message: string
  preferredBuckets: PreparationQuestionBucket[]
}

const ENERGY_GUIDANCE: Record<EnergyBand, EnergyGuidance> = {
  low: {
    message: "الطاقة منخفضة — ابدأ بسؤال ناعم أو أعد بناء الألفة",
    preferredBuckets: ["opening", "backup", "recovery"],
  },
  medium: {
    message: "توازن جيد — واصل الإيقاع الحالي",
    preferredBuckets: [],
  },
  high: {
    message: "الطاقة عالية — لحظة مناسبة لسؤال قوي",
    preferredBuckets: ["escalation", "deep", "surprise"],
  },
}

/**
 * Cross-signal dynamic hint — fires only when phase + energy are in tension.
 * This is what makes the system feel like a co-host whispering in your ear.
 */
function computeDynamicHint(
  phase: PreparationEpisodeFlowPhaseKey | null,
  energy: number,
): string | null {
  const band = energyBand(energy)
  if (!phase) {
    if (band === "low") return "ارفع الحدّة — الطاقة منخفضة"
    if (band === "high") return "لحظة جيدة لسؤال قوي"
    return null
  }
  // Phase-energy mismatches
  if (phase === "peak" && band === "low") return "ارفع الحدّة — نحن في الذروة"
  if (phase === "turning_point" && band === "low") return "ادفع قليلاً — نقطة التحول تحتاج طاقة"
  if (phase === "trust_building" && band === "high") return "أبطئ قليلاً — الضيف يحتاج مساحة"
  if (phase === "opening" && band === "high") return "ابدأ بهدوء — لا تستفزّ مبكراً"
  if (phase === "resolution" && band === "high") return "اهدأ — نحن نقترب من الخاتمة"
  // Phase-energy alignment (encourage)
  if (phase === "peak" && band === "high") return "لحظة مثالية — اضرب بقوة"
  if (phase === "deep_exploration" && band === "high") return "لحظة ممتازة لسؤال عميق"
  if (phase === "opening" && band === "low") return "طبيعي — خذ وقتك في الكسر"
  return null
}

/**
 * Score a question by how well it fits the current phase + energy context.
 * Higher = more relevant. Used to sort the visible list without removing
 * anything — the host can always tap any question manually.
 *
 *   +3  question's own section_id matches current phase key
 *   +2  question bucket is in phase.preferredBuckets
 *   +1  question bucket is in energy.preferredBuckets
 *   -2  question bucket is in phase.avoidBuckets
 *   -10 already used (pushed to the bottom but still visible)
 */
function scoreQuestion(
  q: PreparationQuestion,
  sectionId: string,
  phase: PreparationEpisodeFlowPhaseKey | null,
  energy: number,
  used: boolean,
): number {
  let score = 0
  if (phase) {
    const pg = PHASE_GUIDANCE[phase]
    if (sectionId === phase) score += 3
    if (pg.preferredBuckets.includes(q.bucket)) score += 2
    if (pg.avoidBuckets?.includes(q.bucket)) score -= 2
  }
  const eg = ENERGY_GUIDANCE[energyBand(energy)]
  if (eg.preferredBuckets.includes(q.bucket)) score += 1
  if (used) score -= 10
  return score
}

interface Props {
  token: string
  initial: EpisodePreparationLiveView
}

export function LiveModeClient({ token, initial }: Props) {
  const [state, setState] = useState<PreparationLiveState>(
    initial.live_state ?? {
      started_at: null,
      current_phase: null,
      used_question_ids: [],
      energy_level: 3,
      notes: "",
      updated_at: new Date().toISOString(),
    },
  )
  const [bucketFilter, setBucketFilter] = useState<PreparationQuestionBucket | "all">("all")
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    initial.question_system?.sections[0]?.section_id ?? null,
  )
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null)
  const [showNotes, setShowNotes] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const patch = useCallback(
    async (body: Partial<PreparationLiveState>) => {
      try {
        const res = await fetch(`/api/prepare/live/${token}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (res.ok) {
          const data = await res.json()
          setState(data.live_state)
        }
      } catch {
        // swallow — live mode should stay usable even when offline
      }
    },
    [token],
  )

  // Mark session as started on first interaction
  useEffect(() => {
    if (!state.started_at) {
      void patch({ started_at: new Date().toISOString() })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleQuestionUsed = useCallback(
    (id: string) => {
      const next = state.used_question_ids.includes(id)
        ? state.used_question_ids.filter((q) => q !== id)
        : [...state.used_question_ids, id]
      setState((s) => ({ ...s, used_question_ids: next }))
      void patch({ used_question_ids: next })
    },
    [state.used_question_ids, patch],
  )

  const setEnergy = useCallback(
    (n: number) => {
      setState((s) => ({ ...s, energy_level: n }))
      void patch({ energy_level: n })
    },
    [patch],
  )

  const setPhase = useCallback(
    (p: PreparationEpisodeFlowPhaseKey | null) => {
      setState((s) => ({ ...s, current_phase: p }))
      void patch({ current_phase: p })
      // Auto-switch the active section to one whose section_id matches the
      // newly-selected phase key, if such a section exists. This makes phase
      // selection an active driver of the question list.
      if (p && initial.question_system) {
        const match = initial.question_system.sections.find((s) => s.section_id === p)
        if (match) setActiveSectionId(match.section_id)
      }
    },
    [patch, initial.question_system],
  )

  const onNotesChange = useCallback(
    (v: string) => {
      setState((s) => ({ ...s, notes: v }))
      if (notesTimer.current) clearTimeout(notesTimer.current)
      notesTimer.current = setTimeout(() => {
        void patch({ notes: v })
      }, 1200)
    },
    [patch],
  )

  const activeSection = useMemo(() => {
    if (!initial.question_system) return null
    return (
      initial.question_system.sections.find((s) => s.section_id === activeSectionId) ??
      initial.question_system.sections[0] ??
      null
    )
  }, [initial.question_system, activeSectionId])

  // Priority-sorted questions for the active section based on phase+energy.
  // When the user picks an explicit bucket filter we bypass prioritization
  // entirely — that's the "manual override" rule.
  const visibleQuestions = useMemo(() => {
    if (!activeSection) return [] as PreparationQuestion[]
    const usedSet = new Set(state.used_question_ids)
    const sectionId = activeSection.section_id
    const scored = activeSection.questions.map((q, idx) => ({
      q,
      idx,
      score: scoreQuestion(q, sectionId, state.current_phase, state.energy_level, usedSet.has(q.id)),
    }))
    scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    const sorted = scored.map((x) => x.q)
    if (bucketFilter === "all") return sorted
    return sorted.filter((q) => q.bucket === bucketFilter)
  }, [activeSection, bucketFilter, state.current_phase, state.energy_level, state.used_question_ids])

  // Per-question score map — used by the card renderer to visually dim
  // questions that don't fit the current context without removing them.
  const scoreMap = useMemo(() => {
    const m = new Map<string, number>()
    if (!activeSection) return m
    const usedSet = new Set(state.used_question_ids)
    const sectionId = activeSection.section_id
    for (const q of activeSection.questions) {
      m.set(q.id, scoreQuestion(q, sectionId, state.current_phase, state.energy_level, usedSet.has(q.id)))
    }
    return m
  }, [activeSection, state.current_phase, state.energy_level, state.used_question_ids])

  // Next recommended: highest-scoring unused question in current section.
  // Falls back to first unused if no phase/energy is set.
  const nextQuestion = useMemo(() => {
    if (!activeSection) return null
    const usedSet = new Set(state.used_question_ids)
    const unused = activeSection.questions.filter((q) => !usedSet.has(q.id))
    if (unused.length === 0) return null
    const sectionId = activeSection.section_id
    let best = unused[0]
    let bestScore = scoreQuestion(best, sectionId, state.current_phase, state.energy_level, false)
    for (const q of unused) {
      const s = scoreQuestion(q, sectionId, state.current_phase, state.energy_level, false)
      if (s > bestScore) {
        bestScore = s
        best = q
      }
    }
    return best
  }, [activeSection, state.current_phase, state.energy_level, state.used_question_ids])

  // Guidance banner content — phase message + energy message + dynamic hint.
  const guidance = useMemo(() => {
    const phaseMsg = state.current_phase
      ? PHASE_GUIDANCE[state.current_phase].message
      : null
    const band = energyBand(state.energy_level)
    const energyMsg = ENERGY_GUIDANCE[band].message
    const dynamicHint = computeDynamicHint(state.current_phase, state.energy_level)
    return { phaseMsg, energyMsg, dynamicHint, band }
  }, [state.current_phase, state.energy_level])

  const usedCount = state.used_question_ids.length
  const totalQuestions = useMemo(() => {
    if (!initial.question_system) return 0
    return initial.question_system.sections.reduce((n, s) => n + s.questions.length, 0)
  }, [initial.question_system])

  return (
    // `leading-normal` (1.5) is THIS PANEL'S OWN vertical rhythm, declared at
    // its root so no line-height inheritance can cross into it — see
    // "LEADING IS OWNED AT THE ROOT" in the file header.
    <div className="min-h-screen bg-neutral-950 text-neutral-100 leading-normal" dir="rtl">
      {/* Sticky top bar */}
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/90 backdrop-blur-md">
        <div className="mx-auto max-w-xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                جلسة نشطة
              </div>
              {/* leading-5 pins the pre-switch 20px — see LEADING PINS above. */}
              <h1 className="mt-0.5 truncate text-caption leading-5 font-bold">{initial.title}</h1>
              {initial.guest_name && (
                <p className="truncate text-[11px] text-neutral-400">مع {initial.guest_name}</p>
              )}
            </div>
            <div className="text-end text-[11px] text-neutral-400">
              {usedCount}/{totalQuestions} سؤال
            </div>
          </div>

          {/* Progress bar */}
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-gradient-to-l from-violet-500 to-fuchsia-500 transition-all"
              style={{ width: `${totalQuestions ? (usedCount / totalQuestions) * 100 : 0}%` }}
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-4 py-4">
        {/* Phase selector */}
        {initial.episode_flow && (
          <PhaseStrip
            phases={initial.episode_flow.phases.map((p) => p.key)}
            current={state.current_phase}
            onPick={setPhase}
          />
        )}

        {/* Active co-host guidance — phase + energy + dynamic hint */}
        <GuidanceBanner
          phaseMsg={guidance.phaseMsg}
          energyMsg={guidance.energyMsg}
          dynamicHint={guidance.dynamicHint}
          energyBand={guidance.band}
        />

        {/* Next recommended question — BIG */}
        {nextQuestion && (
          <div className="rounded-2xl border border-violet-500/30 bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-full bg-violet-500/20 px-2 py-0.5 text-[10px] text-violet-300">
                التالي
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] ${
                  BUCKET_COLORS[nextQuestion.bucket]
                }`}
              >
                {BUCKET_LABELS[nextQuestion.bucket]}
              </span>
            </div>
            <p className="text-body font-semibold leading-relaxed">{nextQuestion.text}</p>
            {nextQuestion.intent && (
              <p className="mt-2 text-[11px] text-neutral-400">{nextQuestion.intent}</p>
            )}
            {nextQuestion.support?.context && (
              <p className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2 text-[11px] leading-relaxed text-amber-100">
                <Lightbulb className="me-1 inline h-3 w-3 text-amber-400" />
                {nextQuestion.support.context}
              </p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleQuestionUsed(nextQuestion.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/20 px-3 py-1.5 text-micro leading-normal font-semibold text-violet-200 active:scale-95"
              >
                <Check className="h-3.5 w-3.5" />
                استخدمت
              </button>
              {nextQuestion.support && (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedQuestionId(
                      expandedQuestionId === nextQuestion.id ? null : nextQuestion.id,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-micro leading-normal text-neutral-300 active:scale-95"
                >
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                  الدعم
                </button>
              )}
            </div>
          </div>
        )}

        {/* Energy meter */}
        <EnergyMeter level={state.energy_level} onChange={setEnergy} />

        {/* Section navigator */}
        {initial.question_system && (
          <div className="-mx-4 overflow-x-auto px-4">
            <div className="flex gap-1.5">
              {initial.question_system.sections.map((s) => {
                const active = s.section_id === activeSection?.section_id
                return (
                  <button
                    key={s.section_id}
                    type="button"
                    onClick={() => setActiveSectionId(s.section_id)}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                      active
                        ? "border-violet-500 bg-violet-500/15 text-violet-200"
                        : "border-neutral-800 bg-neutral-900 text-neutral-400"
                    }`}
                  >
                    {s.section_label}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Bucket filter */}
        <div className="-mx-4 overflow-x-auto px-4">
          <div className="flex gap-1.5">
            <BucketChip
              active={bucketFilter === "all"}
              onClick={() => setBucketFilter("all")}
              label="الكل"
            />
            {(Object.keys(BUCKET_LABELS) as PreparationQuestionBucket[]).map((b) => (
              <BucketChip
                key={b}
                active={bucketFilter === b}
                onClick={() => setBucketFilter(b)}
                label={BUCKET_LABELS[b]}
                colorClass={BUCKET_COLORS[b]}
              />
            ))}
          </div>
        </div>

        {/* Question cards */}
        <div className="space-y-2">
          {visibleQuestions.map((q) => {
            const used = state.used_question_ids.includes(q.id)
            const expanded = expandedQuestionId === q.id
            const hasSupport = !!q.support
            // Context fit: score 3+ = highlighted, score 1–2 = default,
            // score <=0 (and not used) = dimmed. Users can still tap.
            const rawScore = scoreMap.get(q.id) ?? 0
            const contextActive = state.current_phase !== null || guidance.band !== "medium"
            const highlighted = !used && contextActive && rawScore >= 3
            const dimmed = !used && contextActive && rawScore <= 0
            return (
              <div
                key={q.id}
                className={`w-full rounded-2xl border transition-all ${
                  used
                    ? "border-neutral-800 bg-neutral-900/40 opacity-50"
                    : highlighted
                      ? "border-violet-500/50 bg-gradient-to-br from-violet-500/10 to-neutral-900 ring-1 ring-violet-500/20"
                      : dimmed
                        ? "border-neutral-900 bg-neutral-900/40 opacity-40"
                        : "border-neutral-800 bg-neutral-900"
                }`}
              >
                <div className="p-4">
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${BUCKET_COLORS[q.bucket]}`}>
                        {BUCKET_LABELS[q.bucket]}
                      </span>
                      {q.weak_support && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          دعم ضعيف
                        </span>
                      )}
                    </div>
                    {used && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                        <Check className="h-3 w-3" />
                        استُخدم
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleQuestionUsed(q.id)}
                    className="block w-full text-start active:scale-[0.99]"
                  >
                    <p className={`text-caption leading-relaxed ${used ? "line-through" : ""}`}>
                      {q.text}
                    </p>
                  </button>
                  {hasSupport && (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedQuestionId(expanded ? null : q.id)
                      }
                      className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-[10px] text-neutral-400 active:scale-95"
                    >
                      <Lightbulb className="h-3 w-3 text-amber-400" />
                      {expanded ? "إخفاء الدعم" : "عرض الدعم"}
                      {expanded ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
                {expanded && q.support && (
                  <QuestionSupportPanel support={q.support} />
                )}
              </div>
            )
          })}
          {visibleQuestions.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-800 p-6 text-center text-micro leading-4 text-neutral-500">
              لا أسئلة في هذا التصنيف لهذا القسم
            </div>
          )}
        </div>

        {/* Host instructions drawer */}
        {initial.host_instructions && (
          <Drawer
            icon={Mic}
            label="تعليمات المخرج"
            open={showInstructions}
            onToggle={() => setShowInstructions(!showInstructions)}
          >
            <div className="space-y-3 text-micro leading-relaxed">
              <Instruction label="التوجيه العام" text={initial.host_instructions.overall_directive} />
              <Instruction label="إدارة الطاقة" text={initial.host_instructions.energy_management} />
              <Bullets label="ابقَ هادئاً عندما" items={initial.host_instructions.stay_calm_when} />
              <Bullets label="ادفع عندما" items={initial.host_instructions.push_when} />
              <Bullets label="قاطع عندما" items={initial.host_instructions.interrupt_when} />
              <Bullets label="اترك الصمت عندما" items={initial.host_instructions.allow_silence_when} />
              <Bullets label="إذا راوغ الضيف" items={initial.host_instructions.if_guest_avoids} />
            </div>
          </Drawer>
        )}

        {/* Notes drawer */}
        <Drawer
          icon={StickyNote}
          label="ملاحظات سريعة"
          open={showNotes}
          onToggle={() => setShowNotes(!showNotes)}
        >
          <textarea
            value={state.notes}
            onChange={(e) => onNotesChange(e.target.value)}
            rows={6}
            placeholder="اكتب أي ملاحظة سريعة أثناء التسجيل..."
            // `text-field md:text-control` is the house pairing for a public
            // focusable field (globals.css, --ui-field): 16px on a phone so
            // iOS Safari does not zoom the viewport MID-RECORDING, 14px from
            // md up where there is no phone to zoom. It replaces a raw
            // text-[13px] that was documented as a deliberate exception —
            // wrongly, because the exception was written for the sub-12px
            // LABEL pass and this is a field on the public surface.
            className="w-full rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-field leading-relaxed outline-none focus:border-violet-500 md:text-control"
          />
        </Drawer>

        {/* Viral moments hint */}
        {initial.viral_moments && initial.viral_moments.moments.length > 0 && (
          <div className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <Flame className="h-3.5 w-3.5 text-fuchsia-400" />
              <h3 className="text-micro leading-4 font-bold text-fuchsia-300">لحظات قابلة للانتشار</h3>
            </div>
            <ul className="space-y-2">
              {initial.viral_moments.moments.map((m) => (
                <li key={m.id} className="text-[11px] leading-relaxed">
                  <strong className="text-fuchsia-200">{m.label}</strong>{" "}
                  <span className="text-neutral-400">— {m.expected_timing}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <footer className="pb-12 pt-4 text-center text-[10px] text-neutral-600">
          خط بودكاست — وضع التسجيل المباشر
        </footer>
      </main>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────

function PhaseStrip({
  phases,
  current,
  onPick,
}: {
  phases: PreparationEpisodeFlowPhaseKey[]
  current: PreparationEpisodeFlowPhaseKey | null
  onPick: (p: PreparationEpisodeFlowPhaseKey | null) => void
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <div className="flex gap-1.5">
        {phases.map((p) => {
          const active = current === p
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPick(active ? null : p)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[10px] transition-colors ${
                active
                  ? "border-emerald-500 bg-emerald-500/15 text-emerald-200"
                  : "border-neutral-800 bg-neutral-900 text-neutral-500"
              }`}
            >
              {PHASE_LABELS[p]}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function GuidanceBanner({
  phaseMsg,
  energyMsg,
  dynamicHint,
  energyBand,
}: {
  phaseMsg: string | null
  energyMsg: string
  dynamicHint: string | null
  energyBand: EnergyBand
}) {
  // Don't render if nothing to say — i.e. no phase picked and energy is medium.
  if (!phaseMsg && !dynamicHint && energyBand === "medium") return null

  const energyTone =
    energyBand === "low"
      ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
      : energyBand === "high"
        ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
        : "border-neutral-800 bg-neutral-900 text-neutral-300"

  return (
    <div className="space-y-2">
      {phaseMsg && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
          <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
          <p className="text-micro font-medium leading-relaxed text-emerald-100">
            {phaseMsg}
          </p>
        </div>
      )}
      {energyBand !== "medium" && (
        <div className={`flex items-start gap-2 rounded-xl border p-3 ${energyTone}`}>
          <Zap
            className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
              energyBand === "high" ? "text-rose-300" : "text-sky-300"
            }`}
          />
          <p className="text-micro font-medium leading-relaxed">{energyMsg}</p>
        </div>
      )}
      {dynamicHint && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-gradient-to-l from-amber-500/15 to-amber-500/5 p-3">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          <p className="text-micro font-semibold leading-relaxed text-amber-100">
            {dynamicHint}
          </p>
        </div>
      )}
    </div>
  )
}

function BucketChip({
  active,
  onClick,
  label,
  colorClass,
}: {
  active: boolean
  onClick: () => void
  label: string
  colorClass?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`whitespace-nowrap rounded-full border px-3 py-1 text-[10px] transition-all ${
        active
          ? colorClass || "border-violet-500 bg-violet-500/15 text-violet-200"
          : "border-neutral-800 bg-neutral-900 text-neutral-500"
      }`}
    >
      {label}
    </button>
  )
}

function EnergyMeter({ level, onChange }: { level: number; onChange: (n: number) => void }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-neutral-300">
          <Zap className="h-3 w-3 text-amber-400" />
          مستوى الطاقة
        </div>
        <span className="text-[10px] text-neutral-500">{level}/5</span>
      </div>
      <div className="flex items-center gap-1.5">
        {[0, 1, 2, 3, 4, 5].map((n) => {
          const active = n <= level
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`h-8 flex-1 rounded-md transition-all active:scale-95 ${
                active
                  ? "bg-gradient-to-l from-amber-500 to-rose-500"
                  : "bg-neutral-800"
              }`}
              aria-label={`طاقة ${n}`}
            />
          )
        })}
      </div>
    </div>
  )
}

function Drawer({
  icon: Icon,
  label,
  open,
  onToggle,
  children,
}: {
  icon: React.ElementType
  label: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 p-4 text-start"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-neutral-400" />
          <span className="text-micro leading-4 font-semibold">{label}</span>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 text-neutral-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-neutral-500" />
        )}
      </button>
      {open && <div className="border-t border-neutral-800 p-4">{children}</div>}
    </div>
  )
}

function Instruction({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-semibold uppercase text-neutral-500">{label}</div>
      <p className="text-micro leading-relaxed text-neutral-300">{text}</p>
    </div>
  )
}

function QuestionSupportPanel({ support }: { support: PreparationQuestionSupport }) {
  return (
    <div className="space-y-3 border-t border-neutral-800 bg-neutral-950/50 p-4">
      {support.context && (
        <div>
          <div className="mb-1 text-[9px] font-semibold uppercase text-amber-400">
            السياق
          </div>
          <p className="text-micro leading-relaxed text-neutral-300">
            {support.context}
          </p>
        </div>
      )}
      {support.talking_points && support.talking_points.length > 0 && (
        <SupportList
          label="نقاط الحوار"
          items={support.talking_points}
          dotClass="bg-violet-400"
        />
      )}
      {support.follow_up_angles && support.follow_up_angles.length > 0 && (
        <SupportList
          label="زوايا المتابعة"
          items={support.follow_up_angles}
          dotClass="bg-sky-400"
        />
      )}
      {support.pressure_points && support.pressure_points.length > 0 && (
        <SupportList
          label="نقاط ضغط"
          items={support.pressure_points}
          dotClass="bg-rose-400"
        />
      )}
      {support.memory_triggers && support.memory_triggers.length > 0 && (
        <SupportList
          label="محفزات الذاكرة"
          items={support.memory_triggers}
          dotClass="bg-fuchsia-400"
        />
      )}
    </div>
  )
}

function SupportList({
  label,
  items,
  dotClass,
}: {
  label: string
  items: string[]
  dotClass: string
}) {
  return (
    <div>
      <div className="mb-1 text-[9px] font-semibold uppercase text-neutral-500">
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-start gap-1.5 text-[11px] leading-relaxed text-neutral-300"
          >
            <span className={`mt-1.5 h-1 w-1 shrink-0 rounded-full ${dotClass}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Bullets({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <div className="mb-1 text-[9px] font-semibold uppercase text-neutral-500">{label}</div>
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] text-neutral-400">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-violet-500" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
