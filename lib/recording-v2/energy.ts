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

/**
 * 0–2 = low, 3 = medium, 4–5 = high.
 *
 * The THREE GRADES the room speaks in (هادئ · متوسط · حادّ) are derived here,
 * on purpose: the stored value stays 0–5 because every historical
 * `energy_change` marker holds a 0–5 number in `note`, and re-scaling the
 * column would silently change what those rows mean.
 */
export function energyBand(n: number): EnergyBand {
  if (n <= 2) return "low"
  if (n === 3) return "medium"
  return "high"
}

/** The three grades, as they are named on screen. */
export const ENERGY_BAND_LABEL_AR: Record<EnergyBand, string> = {
  low: "هادئ",
  medium: "متوسط",
  high: "حادّ",
}

/** How the badge on a floated question reads — one label per band. */
export const ENERGY_FIT_LABEL_AR: Record<EnergyBand, string> = {
  low: "يرفع الحدّة",
  medium: "يدفع للأمام",
  high: "يهدّئ الإيقاع",
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
 * Risk weighted 0/1/2 instead of the old ±1 flag.
 *
 * The flag only ever recognised the extreme (`high` when pushing, `low` when
 * calming), so a `medium`-risk question was scored identically to a `low`-risk
 * one — half the bank sat on the same rung and the sort fell through to input
 * order. Two ordered scales, one per direction, keep every question separable.
 */
const RISK_RAISE: Record<PrepV2Question["risk_level"], number> = { low: 0, medium: 1, high: 2 }
const RISK_CALM: Record<PrepV2Question["risk_level"], number> = { low: 2, medium: 1, high: 0 }

function hasHighType(q: PrepV2Question): boolean {
  return (q.types ?? []).some((t) => HIGH_TYPES.includes(t))
}
function hasLowType(q: PrepV2Question): boolean {
  return (q.types ?? []).some((t) => LOW_TYPES.includes(t))
}

/** How strongly this question RAISES the tension in the room. */
function raiseScore(q: PrepV2Question): number {
  return (hasHighType(q) ? 2 : 0) - (hasLowType(q) ? 1 : 0) + RISK_RAISE[q.risk_level]
}

/** How strongly this question COOLS the room down. */
function calmScore(q: PrepV2Question): number {
  return (hasLowType(q) ? 2 : 0) - (hasHighType(q) ? 1 : 0) + RISK_CALM[q.risk_level]
}

/**
 * Score a question against the current energy band. Higher = better "ask this
 * now". Never removes anything — used to sort + flag.
 *
 * CORRECTIVE, not matching. A flat room floats the question that PUSHES; a hot
 * room floats the one that lets everyone breathe after the peak. This is the
 * direction `coachHint` below has always spoken in ("ارفع الحدّة — الطاقة
 * منخفضة") while the sort did the exact opposite, so the cockpit contradicted
 * itself: the whisper said push and the list handed over a reflective question.
 *
 * The `medium` branch is not decoration — 3 is the DEFAULT stored energy, and
 * with no branch for it every question scored 0, which made the whole ranking a
 * no-op and meant the "fits the energy" badge never rendered in the state the
 * room is in most of the time. At medium there is nothing to correct, so only
 * the direction of the arc applies, at half strength, with risk deliberately
 * left out: a calm-but-healthy room is not a reason to reach for the most
 * sensitive question in the bank.
 */
export function scoreQuestionByEnergy(q: PrepV2Question, band: EnergyBand): number {
  if (band === "low") return raiseScore(q)
  if (band === "high") return calmScore(q)
  return (hasHighType(q) ? 1 : 0) - (hasLowType(q) ? 1 : 0)
}

/** True when a question clearly fits the band (drives the subtle highlight). */
export function matchesEnergy(q: PrepV2Question, band: EnergyBand): boolean {
  return scoreQuestionByEnergy(q, band) > 0
}

/**
 * Rank a section's questions for the live panel: must_ask first, then by
 * energy fit, with done questions sinking to the bottom. Stable + non-mutating
 * — the host still sees every question; the best one just floats up.
 *
 * `must_ask` STAYS above energy, deliberately. Letting energy outrank it sorts
 * harder (measured), but it floats "إن سمح الوقت" questions above the essential
 * ones — and Khaled approved the prep with its priorities, not just its text.
 *
 * The set of ids and their text are never touched here. Ordering only.
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
 * Does the dial actually reorder THIS section?
 *
 * Measured on the real prep (28 questions), four of the six sections contain no
 * sharp question at all — and that is an editorial choice, not a generation bug
 * ("لا أحتاج في كل قسم خيار حاد" — Khaled). No signal, however precise, can
 * surface an intensity that is not in the bank.
 *
 * So the screen must stop pretending. This answers the exact promise the
 * indicator makes — "moving me re-ranks your questions" — by ranking the
 * section's open questions at all three grades and checking whether ANY of the
 * three orders differ. Homogeneous section → the host is told, quietly, instead
 * of moving the dial and watching nothing happen. Which is precisely the
 * experience behind "the indicator has no effect on the episode".
 *
 * Derived from the questions in hand, never from a hardcoded list of sections,
 * so it stays true for every prep that comes after this one.
 */
export function sectionRespondsToEnergy(
  questions: PrepV2Question[],
  isDone?: (id: string) => boolean,
): boolean {
  const open = questions.filter((q) => !isDone?.(q.id))
  if (open.length < 2) return false
  const orders = (["low", "medium", "high"] as const).map((band) =>
    rankQuestionsByEnergy(open, band)
      .map((q) => q.id)
      .join("|"),
  )
  return new Set(orders).size > 1
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
