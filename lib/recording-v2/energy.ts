/**
 * Energy "brain" for the live recording room.
 *
 * Turns the 0–5 energy dial into something the cockpit can act on:
 *   - the planned energy arc per section,
 *   - scoring/ranking the section's questions by how well they fit the
 *     current energy band,
 *   - one-line coaching hints when the live energy is in tension with the
 *     section's intended arc.
 *
 * Pure (no React / no DB) so it's unit-testable and import-safe anywhere.
 * Adapted from the proven guest-prep "co-host" logic (app/prepare/live)
 * onto the prep_v2 model (question types + risk_level, section kinds).
 */

import type {
  PrepV2Question,
  QuestionType,
  SectionKind,
} from "@/lib/preparation/v2/types"

export type EnergyBand = "low" | "medium" | "high"

/** 0–2 = low, 3 = medium, 4–5 = high. */
export function energyBand(n: number): EnergyBand {
  if (n <= 2) return "low"
  if (n === 3) return "medium"
  return "high"
}

/** Each section's place in the planned arc → its intended energy band. */
export const SECTION_TARGET_BAND: Record<SectionKind, EnergyBand> = {
  opening: "low",
  build_up: "medium",
  conflict: "high",
  deep_dive: "high",
  emotional_peak: "high",
  resolution: "low",
}

/** Numeric target per section (0–5) — for planned-vs-actual + the ribbon baseline. */
export const SECTION_TARGET_LEVEL: Record<SectionKind, number> = {
  opening: 2,
  build_up: 3,
  conflict: 5,
  deep_dive: 4,
  emotional_peak: 5,
  resolution: 2,
}

// Which question types lean which way on the intensity spectrum.
const HIGH_TYPES: readonly QuestionType[] = ["confrontational", "emotional"]
const LOW_TYPES: readonly QuestionType[] = ["reflective", "factual"]
// philosophical / personal are neutral (no energy bias).

/**
 * Score how well a question fits the current energy band. Higher = better
 * "ask this now". 0 = neutral. Never removes anything — used to sort + flag.
 */
export function scoreQuestionByEnergy(q: PrepV2Question, band: EnergyBand): number {
  const types = q.types ?? []
  let score = 0
  if (band === "high") {
    if (types.some((t) => HIGH_TYPES.includes(t))) score += 2
    if (q.risk_level === "high") score += 1
    if (types.some((t) => LOW_TYPES.includes(t))) score -= 1
  } else if (band === "low") {
    if (types.some((t) => LOW_TYPES.includes(t))) score += 2
    if (q.risk_level === "low") score += 1
    if (types.some((t) => HIGH_TYPES.includes(t))) score -= 1
  }
  return score
}

/** True when a question clearly fits the band (drives the subtle highlight). */
export function matchesEnergy(q: PrepV2Question, band: EnergyBand): boolean {
  return scoreQuestionByEnergy(q, band) > 0
}

/**
 * Rank a section's questions for the live panel: must_ask first, then by
 * energy fit, with done questions sinking to the bottom. Stable + non-mutating
 * — the host still sees every question; the best one just floats up.
 */
export function rankQuestionsByEnergy(
  questions: PrepV2Question[],
  band: EnergyBand,
  isDone?: (id: string) => boolean,
): PrepV2Question[] {
  return questions
    .map((q, i) => ({ q, i }))
    .sort((a, b) => {
      const ad = isDone?.(a.q.id) ? 1 : 0
      const bd = isDone?.(b.q.id) ? 1 : 0
      if (ad !== bd) return ad - bd // done sink to the bottom
      const ap = a.q.priority === "must_ask" ? 0 : 1
      const bp = b.q.priority === "must_ask" ? 0 : 1
      if (ap !== bp) return ap - bp // must_ask before if_time
      const diff = scoreQuestionByEnergy(b.q, band) - scoreQuestionByEnergy(a.q, band)
      if (diff !== 0) return diff // energy fit
      return a.i - b.i // stable
    })
    .map((x) => x.q)
}

/**
 * One-line Arabic coaching whisper — fires ONLY when the live energy is in
 * tension with the current section's intended arc (or, at the peak, to cheer
 * an aligned moment). Returns null when there's nothing useful to say, so it
 * never nags. This is what makes the dial feel like a co-host.
 */
export function coachHint(section: SectionKind | null, energy: number): string | null {
  const band = energyBand(energy)
  if (!section) {
    if (band === "low") return "ارفع الحدّة قليلاً — الطاقة منخفضة"
    if (band === "high") return "لحظة جيدة لسؤال قوي"
    return null
  }
  const target = SECTION_TARGET_BAND[section]

  // Tension: the section wants intensity but the room is flat.
  if (target === "high" && band === "low") {
    if (section === "conflict") return "ادفع أكثر — نحن في قسم المواجهة"
    if (section === "emotional_peak") return "ارفع الحدّة — هذه الذروة العاطفية"
    return "ارفع الطاقة — هذا قسم يحتاج حدّة"
  }
  // Tension: the section wants calm but the room is hot.
  if (target === "low" && band === "high") {
    if (section === "opening") return "ابدأ بهدوء — لا تستفزّ مبكراً"
    if (section === "resolution") return "اهدأ — نقترب من الخاتمة"
    return "خفّض الإيقاع — هذا قسم هادئ"
  }
  // Alignment cheer — only at the peaks, where matching energy is the win.
  if (
    target === "high" &&
    band === "high" &&
    (section === "conflict" || section === "emotional_peak")
  ) {
    return "لحظة مثالية — اضغط الآن"
  }
  return null
}
