/**
 * Phase X Step 4 — Preparation V2 validation guard.
 *
 * Runs after every pass (defensively) and especially after Pass 4 before
 * persistence. Failure paths return human-readable reasons so the
 * pipeline can decide whether to retry critique once or surface a
 * clear error to the caller.
 */

import {
  PREP_V2_VERSION,
  SECTION_KINDS,
  QUESTION_TYPES,
  type PrepV2Payload,
  type PrepV2Question,
  type PrepV2Section,
  type SectionKind,
} from "./types"

export interface ValidationFailure {
  code: ValidationCode
  message: string
}

export type ValidationCode =
  | "missing_thesis"
  | "weak_thesis"
  | "missing_sections"
  | "wrong_section_count"
  | "wrong_section_order"
  | "section_low_question_count"
  | "section_only_generic_questions"
  | "question_count_out_of_range"
  | "must_ask_count_below_minimum"
  | "duration_out_of_range"
  | "missing_host_guidance"
  | "missing_director_guidance"
  | "missing_opening_options"
  | "missing_closing_options"
  | "missing_axes_of_tension"
  | "missing_guest_extraction_strategy"
  | "vague_emotional_hook"
  // Production-readiness fix sprint additions:
  | "missing_sensitive_zones_for_risky_topic"
  | "unverified_guest_reference"

export interface ValidationResult {
  ok: boolean
  failures: ValidationFailure[]
}

const MIN_QUESTIONS = 24
const MAX_QUESTIONS = 40
const MIN_MUST_ASK = 12
const MIN_DURATION = 60
const MAX_DURATION = 90
const MIN_SECTION_QUESTIONS = 3
const MIN_AXES = 6

export const PREP_V2_VALIDATION_RULES: Record<ValidationCode, string> = {
  missing_thesis: "thesis is empty or whitespace-only.",
  weak_thesis:
    "thesis is shorter than 30 characters — likely a placeholder, not a real argument.",
  missing_sections: "episode_sections array is missing or empty.",
  wrong_section_count: "exactly 6 sections required (opening → resolution).",
  wrong_section_order:
    "sections must appear in canonical order: opening, build_up, conflict, deep_dive, emotional_peak, resolution.",
  section_low_question_count: `each section needs at least ${MIN_SECTION_QUESTIONS} questions.`,
  section_only_generic_questions:
    "section's questions all match generic templates (single-type-only, weak text, or filler purposes).",
  question_count_out_of_range: `total questions must be in [${MIN_QUESTIONS}, ${MAX_QUESTIONS}].`,
  must_ask_count_below_minimum: `at least ${MIN_MUST_ASK} questions must be priority="must_ask".`,
  duration_out_of_range: `total_estimated_minutes must be in [${MIN_DURATION}, ${MAX_DURATION}].`,
  missing_host_guidance:
    "host_guidance must include overall_tone, do_list (≥1), dont_list (≥1), energy_curve.",
  missing_director_guidance:
    "director_guidance must include shot_priorities (≥1), silence_moments (≥1), cut_warnings (≥0 but field present).",
  missing_opening_options: "at least 2 opening_options required.",
  missing_closing_options: "at least 2 closing_options required.",
  missing_axes_of_tension: `axes_of_tension array must contain at least ${MIN_AXES} non-empty items.`,
  missing_guest_extraction_strategy:
    "guest_extraction_strategy must be a non-trivial paragraph (≥80 chars).",
  vague_emotional_hook:
    "the emotional_peak section is missing, has no question tagged type='emotional', or has an intent shorter than 25 chars.",
  missing_sensitive_zones_for_risky_topic:
    "topic falls in a risk-prone domain (religion, identity_masculinity, social_issues, kuwait_gulf, family, trauma) but sensitive_zones is empty.",
  unverified_guest_reference:
    "prep_v2 mentions a guest name that is not present in the linked guest_candidate or canonical guests table — refusing to ship a hallucinated name.",
}

/**
 * Risk-prone topic domains. When a prep payload targets one of these
 * AND its sensitive_zones array is empty, validation fails — host walks
 * into a recording without flagged subjects to handle carefully.
 */
const RISKY_DOMAINS_FOR_SENSITIVITY: ReadonlySet<string> = new Set([
  "religion",
  "identity_masculinity",
  "social_issues",
  "kuwait_gulf",
  "politics",
  "family",
  "trauma",
  "power_manipulation",
])

const GENERIC_QUESTION_HINTS = [
  /^tell me about yourself/i,
  /^what do you do/i,
  /^how was your day/i,
  /^any final thoughts/i,
  /^احكِ لنا عن نفسك/,
  /^كيف يومك\??/,
  /^هل لديك كلمة أخيرة/,
]

/**
 * Production-readiness fix sprint — extended validation context.
 *
 * The original `validatePrepV2Payload` checked structure only. The fix
 * sprint adds two content-aware rules that need outside data:
 *   - `topic_domain` to decide whether sensitive_zones is mandatory.
 *   - `linkedGuestName` to decide whether a name in opening / closing /
 *     section copy is legitimate or hallucinated.
 *
 * Both are optional so the existing call sites keep working.
 */
export interface ValidationContext {
  topic_domain?: string | null
  linkedGuestName?: string | null
}

export function validatePrepV2Payload(
  p: PrepV2Payload,
  ctx: ValidationContext = {},
): ValidationResult {
  const failures: ValidationFailure[] = []

  // Thesis
  const thesis = (p.thesis ?? "").trim()
  if (thesis.length === 0) failures.push(fail("missing_thesis"))
  else if (thesis.length < 30) failures.push(fail("weak_thesis"))

  // Axes of tension
  const axes = (p.axes_of_tension ?? []).filter(
    (a) => typeof a === "string" && a.trim().length > 5,
  )
  if (axes.length < MIN_AXES) failures.push(fail("missing_axes_of_tension"))

  // Guest extraction strategy
  if ((p.guest_extraction_strategy ?? "").trim().length < 80) {
    failures.push(fail("missing_guest_extraction_strategy"))
  }

  // Sections
  const sections = p.episode_sections ?? []
  if (sections.length === 0) {
    failures.push(fail("missing_sections"))
  } else {
    if (sections.length !== SECTION_KINDS.length) {
      failures.push(fail("wrong_section_count"))
    }
    const kinds = sections.map((s) => s.kind)
    const expected = [...SECTION_KINDS]
    if (
      kinds.length !== expected.length ||
      kinds.some((k, i) => k !== expected[i])
    ) {
      failures.push(fail("wrong_section_order"))
    }
  }

  // Questions: total + per-section + must_ask
  const questions = p.question_bank ?? []
  if (questions.length < MIN_QUESTIONS || questions.length > MAX_QUESTIONS) {
    failures.push(fail("question_count_out_of_range"))
  }
  const mustAsk = questions.filter((q) => q.priority === "must_ask").length
  if (mustAsk < MIN_MUST_ASK) failures.push(fail("must_ask_count_below_minimum"))

  // Per-section depth.
  const bySection = new Map<SectionKind, PrepV2Question[]>()
  for (const k of SECTION_KINDS) bySection.set(k, [])
  for (const q of questions) {
    if (bySection.has(q.section)) bySection.get(q.section)!.push(q)
  }
  let lowSectionFailureRecorded = false
  let genericSectionFailureRecorded = false
  for (const [, qs] of bySection) {
    if (qs.length < MIN_SECTION_QUESTIONS && !lowSectionFailureRecorded) {
      failures.push(fail("section_low_question_count"))
      lowSectionFailureRecorded = true
    }
    if (qs.length > 0 && qs.every(isGenericQuestion) && !genericSectionFailureRecorded) {
      failures.push(fail("section_only_generic_questions"))
      genericSectionFailureRecorded = true
    }
  }

  // Emotional hook check — only the emotional_peak section must carry
  // emotional-typed questions and a substantive intent. The rest of the
  // sections can use other question types appropriate to their role
  // (philosophical, confrontational, factual, etc.).
  const peak = sections.find((s) => s.kind === "emotional_peak")
  const peakQuestions = questions.filter((q) => q.section === "emotional_peak")
  const peakHasEmotional = peakQuestions.some((q) => q.types?.includes("emotional"))
  const peakIntentLen = (peak?.intent ?? "").trim().length
  if (!peak || !peakHasEmotional || peakIntentLen < 25) {
    failures.push(fail("vague_emotional_hook"))
  }

  // Duration
  const dur = Number(p.total_estimated_minutes ?? 0)
  if (dur < MIN_DURATION || dur > MAX_DURATION) {
    failures.push(fail("duration_out_of_range"))
  }

  // Host + director + openings + closings
  const hg = p.host_guidance
  if (
    !hg ||
    !hg.overall_tone?.trim() ||
    !(hg.do_list?.length >= 1) ||
    !(hg.dont_list?.length >= 1) ||
    !hg.energy_curve?.trim()
  ) {
    failures.push(fail("missing_host_guidance"))
  }
  const dg = p.director_guidance
  if (
    !dg ||
    !(dg.shot_priorities?.length >= 1) ||
    !(dg.silence_moments?.length >= 1) ||
    !Array.isArray(dg.cut_warnings)
  ) {
    failures.push(fail("missing_director_guidance"))
  }
  if ((p.opening_options ?? []).length < 2) failures.push(fail("missing_opening_options"))
  if ((p.closing_options ?? []).length < 2) failures.push(fail("missing_closing_options"))

  // ── Sensitive zones for risky topics — fix sprint #2.7 ────────────
  // When the topic falls in a risk-prone domain, sensitive_zones MUST
  // contain at least one entry. Without this guard the AI emits an
  // empty array on identity / religion / politics topics and the host
  // walks into a recording with no flagged subjects.
  if (
    ctx.topic_domain &&
    RISKY_DOMAINS_FOR_SENSITIVITY.has(ctx.topic_domain) &&
    (p.sensitive_zones ?? []).filter(
      (z) => typeof z === "string" && z.trim().length > 5,
    ).length === 0
  ) {
    failures.push(fail("missing_sensitive_zones_for_risky_topic"))
  }

  // ── Unverified guest references — fix sprint #1.4 ────────────────
  // Scan the operator-visible copy for guest references. If a person
  // name appears AND it doesn't match the linked guest_candidate's
  // name, flag it. The pipeline's regenerate-or-sanitize step decides
  // what to do with the failure.
  if (detectUnverifiedGuestReference(p, ctx.linkedGuestName ?? null)) {
    failures.push(fail("unverified_guest_reference"))
  }

  return { ok: failures.length === 0, failures }
}

export function expectedSectionsInOrder(
  sections: PrepV2Section[],
): boolean {
  if (sections.length !== SECTION_KINDS.length) return false
  return sections.every((s, i) => s.kind === SECTION_KINDS[i])
}

export function questionTypeIsValid(t: string): boolean {
  return (QUESTION_TYPES as readonly string[]).includes(t)
}

export function expectedVersion(): string {
  return PREP_V2_VERSION
}

function isGenericQuestion(q: PrepV2Question): boolean {
  const text = (q.text ?? "").trim()
  if (text.length < 15) return true
  if (GENERIC_QUESTION_HINTS.some((re) => re.test(text))) return true
  // Single-type "factual" with empty purpose is filler.
  const purpose = (q.purpose ?? "").trim()
  if (q.types?.length === 1 && q.types[0] === "factual" && purpose.length < 15) {
    return true
  }
  return false
}

function fail(code: ValidationCode): ValidationFailure {
  return { code, message: PREP_V2_VALIDATION_RULES[code] }
}

// ─── Hallucinated-guest detection (fix sprint #1.4) ──────────────────

/**
 * Heuristic Arabic person-reference detector. The codebase has no NER,
 * so we look for high-signal patterns:
 *
 *   - "ضيفنا X"   / "ضيفي X"        — explicit guest naming
 *   - "السيد X"   / "الدكتور X"     — formal-title naming
 *   - "أ. X" / "أ/ X"               — abbreviated honorific
 *
 * X is captured as 1–4 Arabic words. Stop-words (المميز / الكريم / etc.)
 * are stripped. If at least one detected name does not appear in the
 * linked guest's name, we flag the payload as containing an unverified
 * reference.
 *
 * False positives are acceptable here — the pipeline reacts by either
 * regenerating the pass or sanitizing the strings to "[الضيف]". Better
 * to over-flag than to ship a hallucinated name into prep.
 */
const ARABIC_NAME_PATTERNS = [
  /ضيف(?:نا|ي|ه|نا اليوم)\s+([\u0621-\u064A][\u0621-\u064A\s]{2,40})/g,
  /(?:السيد|الأستاذ|الدكتور|المهندس|الشيخ)\s+([\u0621-\u064A][\u0621-\u064A\s]{2,40})/g,
  /(?:أ\.|د\.|أ\/)\s*([\u0621-\u064A][\u0621-\u064A\s]{2,40})/g,
]

const ARABIC_NAME_STOPWORDS = new Set([
  "المميز",
  "الكريم",
  "العزيز",
  "الجديد",
  "الفاضل",
  "اليوم",
  "في",
  "من",
  "مع",
  "عن",
  "إلى",
  "هو",
  "هي",
])

export function detectUnverifiedGuestReference(
  p: PrepV2Payload,
  linkedGuestName: string | null,
): boolean {
  const linked = (linkedGuestName ?? "").trim()
  const linkedTokens = linked
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2)

  const candidates: string[] = []
  for (const opt of p.opening_options ?? []) {
    if (opt.text) candidates.push(opt.text)
  }
  for (const opt of p.closing_options ?? []) {
    if (opt.text) candidates.push(opt.text)
  }
  for (const sec of p.episode_sections ?? []) {
    if (sec.intent) candidates.push(sec.intent)
    if (sec.transition_goal) candidates.push(sec.transition_goal)
  }
  if (p.host_guidance?.overall_tone) candidates.push(p.host_guidance.overall_tone)
  if (p.guest_extraction_strategy) candidates.push(p.guest_extraction_strategy)

  for (const text of candidates) {
    for (const re of ARABIC_NAME_PATTERNS) {
      // Reset lastIndex; the regex flag is global.
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(text)) !== null) {
        const captured = (m[1] ?? "").trim()
        if (!captured) continue
        const tokens = captured
          .split(/\s+/)
          .filter((t) => t.length >= 2 && !ARABIC_NAME_STOPWORDS.has(t))
        if (tokens.length === 0) continue
        // If linkedGuestName has any token in common with the captured
        // tokens, we treat the reference as verified.
        if (
          linkedTokens.length > 0 &&
          tokens.some((t) => linkedTokens.includes(t))
        ) {
          continue
        }
        // Otherwise this is an unverified name reference.
        return true
      }
    }
  }
  return false
}

/**
 * Sanitize unverified guest references in-place — used by the
 * pipeline when it decides to ship a payload despite an unverified
 * reference (e.g. to avoid blocking a full regeneration on quota
 * pressure). Replaces detected names with "[الضيف]" so the host sees a
 * neutral placeholder instead of a phantom name.
 */
export function sanitizeGuestReferences(p: PrepV2Payload): {
  payload: PrepV2Payload
  replacements: number
} {
  let replacements = 0
  const replace = (s: string): string => {
    let out = s
    for (const re of ARABIC_NAME_PATTERNS) {
      re.lastIndex = 0
      out = out.replace(re, (_full, _name) => {
        replacements++
        return "[الضيف]"
      })
    }
    return out
  }
  const next: PrepV2Payload = JSON.parse(JSON.stringify(p))
  next.opening_options = (next.opening_options ?? []).map((opt) => ({
    ...opt,
    text: replace(opt.text),
  }))
  next.closing_options = (next.closing_options ?? []).map((opt) => ({
    ...opt,
    text: replace(opt.text),
  }))
  next.episode_sections = (next.episode_sections ?? []).map((sec) => ({
    ...sec,
    intent: replace(sec.intent),
    transition_goal: replace(sec.transition_goal),
  }))
  if (next.host_guidance?.overall_tone) {
    next.host_guidance.overall_tone = replace(next.host_guidance.overall_tone)
  }
  if (next.guest_extraction_strategy) {
    next.guest_extraction_strategy = replace(next.guest_extraction_strategy)
  }
  return { payload: next, replacements }
}
