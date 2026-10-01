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
import {
  courseDurationWindow,
  COURSE_DEFAULT_MINUTES,
  effectiveCourseTarget,
  isCourseSlotSequence,
  prepFormatOf,
} from "./format"

export interface ValidationFailure {
  code: ValidationCode
  message: string
  /**
   * Operator-facing Arabic text when it differs from the static label —
   * set only where the rule's numbers depend on the payload (the course
   * duration window). Absent ⇒ PREP_V2_VALIDATION_LABELS_AR[code].
   */
  label_ar?: string
  /**
   * Machine-readable evidence for the failure — what matched, what was
   * missing. Carried into the job result and the stored warning so an
   * operator/dev can see WHY without re-running a paid generation (the
   * ai_runs output snapshot is truncated and cannot answer it).
   */
  detail?: Record<string, unknown>
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
  // Course format:
  | "course_module_incomplete"

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
  course_module_incomplete:
    "course format: every module needs a title and a learning_objective, and every topic module (not the intro or the wrap-up) needs a takeaway_tool.",
}

/**
 * Operator-facing Arabic label per failure code.
 *
 * `PREP_V2_VALIDATION_RULES` above is English and written for a developer
 * reading the guard. It is the wrong text to show an operator — and until
 * now nothing showed them ANY text: the regenerate button said only "فشل
 * التحقق من بنية الإعداد بعد محاولتين", never which check failed, while
 * `result.validation.failures` sat right there in the return value unused.
 *
 * Deliberately short: this is a label rendered inside a toast, not a manual.
 */
export const PREP_V2_VALIDATION_LABELS_AR: Record<ValidationCode, string> = {
  missing_thesis: "لا توجد أطروحة للحلقة",
  weak_thesis: "الأطروحة قصيرة جداً — تبدو نصاً مؤقتاً",
  missing_sections: "لا توجد أقسام للحلقة",
  wrong_section_count: "عدد الأقسام ليس ٦",
  wrong_section_order: "ترتيب الأقسام غير صحيح",
  section_low_question_count: `قسم أو أكثر فيه أقل من ${MIN_SECTION_QUESTIONS} أسئلة`,
  section_only_generic_questions: "أسئلة أحد الأقسام كلها عامة/جاهزة",
  question_count_out_of_range: `مجموع الأسئلة خارج النطاق [${MIN_QUESTIONS}, ${MAX_QUESTIONS}]`,
  must_ask_count_below_minimum: `الأسئلة الأساسية أقل من ${MIN_MUST_ASK}`,
  duration_out_of_range: `مجموع دقائق الحلقة خارج النطاق [${MIN_DURATION}, ${MAX_DURATION}]`,
  missing_host_guidance: "إرشادات المقدّم ناقصة",
  missing_director_guidance: "إرشادات المخرج ناقصة",
  missing_opening_options: "خيارات الافتتاح أقل من خيارين",
  missing_closing_options: "خيارات الختام أقل من خيارين",
  missing_axes_of_tension: `محاور التوتر أقل من ${MIN_AXES}`,
  missing_guest_extraction_strategy: "استراتيجية استخراج الضيف ناقصة",
  vague_emotional_hook: "الذروة العاطفية بلا سؤال عاطفي أو بنيّة ضعيفة",
  missing_sensitive_zones_for_risky_topic:
    "الموضوع حسّاس والمناطق الحسّاسة فارغة",
  unverified_guest_reference: "النص يذكر اسم ضيف غير موثّق",
  course_module_incomplete: "وحدة من وحدات الدورة بلا عنوان أو هدف تعلّم أو أداة عملية",
}

/**
 * Render validation failures as one Arabic clause for a toast/pill.
 *
 * Caps the list so a payload that fails eight checks does not produce an
 * unreadable wall of text; the count of what was cut is still reported, so
 * the operator knows the list is longer than what they see.
 */
export function describeValidationFailuresAr(
  failures: ValidationFailure[],
  max = 3,
): string {
  if (failures.length === 0) return ""
  const shown = failures
    .slice(0, max)
    .map((f) => f.label_ar ?? PREP_V2_VALIDATION_LABELS_AR[f.code] ?? f.code)
  const rest = failures.length - shown.length
  return rest > 0 ? `${shown.join("، ")} (+${rest} أخرى)` : shown.join("، ")
}

/** What the operator should do next — the same closing line in both cases. */
const PREP_V2_RECOVERY_AR =
  "استخدم «إعادة توليد الإعداد» من صفحة الحلقة."

/**
 * Best available text for an unknown throw.
 *
 * Not `String(err)`: a rejected provider SDK call often carries a plain object,
 * and `String({...})` is `"[object Object]"` — a warning that says only that a
 * failure happened is the silent-failure bug wearing a message.
 */
function errorDetail(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try {
    const json = JSON.stringify(error)
    if (json && json !== "{}") return json
  } catch {
    // Circular or non-serialisable — fall through to the generic text.
  }
  return "خطأ غير معروف"
}

/**
 * The operator-facing warning for a conversion whose record WAS created but
 * whose `prep_v2` structure was not.
 *
 * Extracted from `convertEpisodeToPreparation` so it can be asserted without
 * a database: the whole point of the fix is the sentence the operator reads,
 * and that sentence was previously unreachable from any test.
 *
 * Both branches deliberately open by confirming the record exists. The failure
 * here is partial, and a warning that leads with "فشل" makes an operator go
 * looking for a preparation they think was never created.
 */
export function prepV2WarningAr(
  outcome:
    | { kind: "not_ok"; reason?: string; failures: ValidationFailure[] }
    | { kind: "threw"; error: unknown },
): string {
  if (outcome.kind === "threw") {
    // The raw error text is developer English on purpose — it is the only
    // diagnostic available for a throw, and losing it leaves the operator and
    // the team with nothing. It is fenced off after a colon rather than
    // written as though it were Arabic copy.
    return `أُنشئ سجلّ الإعداد، لكن توليد بنيته فشل: ${errorDetail(outcome.error)}. ${PREP_V2_RECOVERY_AR}`
  }
  const why = describeValidationFailuresAr(outcome.failures)
  const reason = outcome.reason ?? "سبب غير معروف"
  return (
    `أُنشئ سجلّ الإعداد، لكن تعذّر توليد بنيته (${reason})` +
    (why ? `: ${why}` : "") +
    `. ${PREP_V2_RECOVERY_AR}`
  )
}

/**
 * Pure: the note for a run that was STORED despite soft validation failures —
 * the operator must learn that the prep exists and what to fix in it.
 */
export function prepV2SoftWarningAr(failures: ValidationFailure[]): string {
  const why = describeValidationFailuresAr(failures)
  return (
    `وُلّد الإعداد وحُفظ، لكن فيه ملاحظات تحقق` +
    (why ? `: ${why}` : "") +
    `. عدّلها من محرّر الإعداد بدل إعادة التوليد.`
  )
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
  /** Operator-authored title + goal: names/brands in it are not hallucinations. */
  knownText?: string | null
}

/**
 * Failures that leave a USABLE prep an operator can fix by hand in the
 * editor (one missing emotional tag, a flagged name, generic wording, one
 * opening line short). Everything else — structure, counts, duration,
 * guidance — is hard: the prep is not fit to record from.
 */
export const SOFT_VALIDATION_CODES: ReadonlySet<ValidationCode> = new Set<ValidationCode>([
  "vague_emotional_hook",
  "unverified_guest_reference",
  "section_only_generic_questions",
  "missing_opening_options",
  "missing_closing_options",
])

/** Opening/closing options are soft only when ONE of the required two exists. */
function isSoftFailure(f: ValidationFailure): boolean {
  if (!SOFT_VALIDATION_CODES.has(f.code)) return false
  if (f.code === "missing_opening_options" || f.code === "missing_closing_options") {
    return f.detail?.count === 1
  }
  return true
}

export function onlySoftFailures(failures: ValidationFailure[]): boolean {
  return failures.length > 0 && failures.every(isSoftFailure)
}

export function validatePrepV2Payload(
  p: PrepV2Payload,
  ctx: ValidationContext = {},
): ValidationResult {
  const failures: ValidationFailure[] = []
  const isCourse = prepFormatOf(p) === "course"

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
    if (isCourse) {
      // A course uses 3–6 slots: opening, the first N middle slots, resolution.
      if (!isCourseSlotSequence(sections.map((s) => s.kind))) {
        failures.push(fail("wrong_section_order"))
      }
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
  // A course only owns the slots it uses; an unused slot is not "starved".
  const sectionKindsInPlay = isCourse ? sections.map((s) => s.kind) : SECTION_KINDS
  for (const k of sectionKindsInPlay) bySection.set(k, [])
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
  //
  // A course has no emotional peak by design — the `emotional_peak` slot, when
  // used, holds a topic module. Its equivalent check is module completeness.
  if (isCourse) {
    const lastIdx = sections.length - 1
    const incomplete = sections.some((s, i) => {
      if ((s.title ?? "").trim().length < 2) return true
      if ((s.learning_objective ?? "").trim().length < 10) return true
      const isTopicModule = i > 0 && i < lastIdx
      return isTopicModule && (s.takeaway_tool ?? "").trim().length < 5
    })
    if (incomplete) failures.push(fail("course_module_incomplete"))
  } else {
    const peak = sections.find((s) => s.kind === "emotional_peak")
    const peakQuestions = questions.filter((q) => q.section === "emotional_peak")
    const peakHasEmotional = peakQuestions.some((q) => q.types?.includes("emotional"))
    const peakIntentLen = (peak?.intent ?? "").trim().length
    if (!peak || !peakHasEmotional || peakIntentLen < 25) {
      failures.push({
        ...fail("vague_emotional_hook"),
        detail: {
          peak_section_present: Boolean(peak),
          peak_intent_length: peakIntentLen,
          peak_question_count: peakQuestions.length,
          peak_question_types: peakQuestions.map((q) => q.types ?? []),
        },
      })
    }
  }

  // Duration — a course is judged against its own target (±20%), not the
  // story's fixed [60, 90].
  // The course target is capped by what its modules can hold (n × 45), so a
  // short course is not failed forever for a length it cannot reach.
  const dur = Number(p.total_estimated_minutes ?? 0)
  if (isCourse) {
    const [minDur, maxDur] = courseDurationWindow(
      effectiveCourseTarget(p.target_minutes ?? COURSE_DEFAULT_MINUTES, sections.length),
    )
    if (dur < minDur || dur > maxDur) {
      // The message feeds the Pass-4 retry hint and the label the operator
      // reads — both must name THIS course's window, not the story's [60, 90].
      failures.push({
        code: "duration_out_of_range",
        message: `total_estimated_minutes must be in [${minDur}, ${maxDur}] (course target).`,
        label_ar: `مجموع دقائق الدورة خارج النطاق [${minDur}, ${maxDur}]`,
      })
    }
  } else if (dur < MIN_DURATION || dur > MAX_DURATION) {
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
  // `count` decides soft vs hard: 1 of 2 is an edit; 0 is a broken payload.
  const openings = (p.opening_options ?? []).length
  const closings = (p.closing_options ?? []).length
  if (openings < 2) failures.push({ ...fail("missing_opening_options"), detail: { count: openings } })
  if (closings < 2) failures.push({ ...fail("missing_closing_options"), detail: { count: closings } })

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
  const unverified = findUnverifiedGuestReferences(p, {
    linkedGuestName: ctx.linkedGuestName ?? null,
    knownText: ctx.knownText ?? null,
  })
  if (unverified.length > 0) {
    failures.push({
      ...fail("unverified_guest_reference"),
      detail: {
        linked_guest_name: ctx.linkedGuestName ?? null,
        references: unverified.slice(0, 5).map(({ field, name, snippet }) => ({
          field,
          name,
          snippet,
        })),
      },
    })
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


// ─── Hallucinated-guest detection (fix sprint #1.4, rewritten 2026-09-30) ──

/**
 * Heuristic Arabic person-reference detector. The codebase has no NER, so it
 * looks for high-signal triggers and then asks whether what FOLLOWS the
 * trigger is shaped like a person's name:
 *
 *   - «ضيفنا X» / «ضيفي X» / «ضيفه X»        — explicit guest naming
 *   - «السيد X» / «الأستاذ X» / «الدكتور X» … — formal-title naming
 *   - «أ. X» / «د. X» / «أ/ X»               — abbreviated honorific
 *
 * Why it was rewritten (incident 2026-09-30, prep c1810682): the old patterns
 * captured ANY 2–40 Arabic characters after the trigger and treated them as a
 * name. «ضيفنا يروي كيف…», «ضيفه صاحب التجربة», «الأستاذ في الإدارة» were all
 * "unverified names"; «المستضيفه» matched because nothing required a word
 * boundary before «ضيف»; and a shadda in «المنّاع» (U+0651, outside the
 * captured letter range) cut the capture mid-word so it could never equal the
 * linked guest's «المناع». Together with a stale-context retry that made the
 * rule fail a founder story twice and discard the run.
 *
 * Now: word boundaries on both sides of the trigger; text and names are
 * normalised (diacritics, shadda, tatweel, alef/yaa/taa-marbuta forms) before
 * matching; the capture is read token by token and must LOOK like a name
 * (not a verb, preposition, pronoun or common noun, first token without the
 * article unless it is a nisba family name); a name is verified when any of
 * its tokens is one of the linked guest's name tokens, or when every token
 * appears in the operator's own title/goal (brands like «مُبخر» / «خليط»).
 */

/** Arabic letters, AFTER normalizeArabic (tatweel and diacritics removed). */
const L = "\\u0621-\\u064A"

const GUEST_TRIGGER = new RegExp(`(?<![${L}])ضيف(?:نا|ي|ه|تنا|تي)(?![${L}])`, "g")
// Feminine forms fold to «…ه» (ة→ه) in normalizeArabic.
const TITLE_TRIGGER = new RegExp(
  `(?<![${L}])(?:السيده?|الاستاذه?|الدكتوره?|المهندسه?|الشيخه?)(?![${L}])`,
  "g",
)
const ABBREV_TRIGGER = new RegExp(`(?<![${L}])(?:ا\\.|د\\.|ا\\/)`, "g")
const NAME_TRIGGERS = [GUEST_TRIGGER, TITLE_TRIGGER, ABBREV_TRIGGER]

/**
 * Up to 6 letter-tokens right after a trigger, separated by plain spaces only.
 * One comma straight after the trigger is allowed («ضيفنا، فهد»).
 */
const FOLLOWING_TOKENS = new RegExp(
  `^[ \\t\\u00A0]*[،,]?[ \\t\\u00A0]*([${L}]+(?:[ \\t\\u00A0]+[${L}]+){0,5})`,
)

/**
 * Remove harakat/shadda/superscript alef/tatweel and fold the letter variants
 * an LLM (or an operator) writes interchangeably. Returns the folded text plus
 * a map from each folded index back to the original index, so a span found in
 * folded text can be replaced in the original without touching anything else.
 */
export function normalizeArabic(input: string): { text: string; map: number[] } {
  let text = ""
  const map: number[] = []
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    const code = ch.charCodeAt(0)
    if ((code >= 0x064b && code <= 0x065f) || code === 0x0670 || code === 0x0640) continue
    let out = ch
    if (ch === "أ" || ch === "إ" || ch === "آ" || ch === "ٱ") out = "ا"
    else if (ch === "ى") out = "ي"
    else if (ch === "ة") out = "ه"
    text += out
    map.push(i)
  }
  return { text, map }
}

function foldToken(t: string): string {
  return normalizeArabic(t).text.trim()
}

/** Tokens after the trigger that are decoration, not the name (skipped). */
const LEADING_FILLERS = new Set(
  ["اليوم", "الليله", "الكريم", "العزيز", "الفاضل", "المميز", "الجديد", "هنا", "معنا"].map(foldToken),
)

/**
 * Frequent non-name words that follow «ضيفنا»/«الأستاذ» in generated copy:
 * particles, prepositions, pronouns, relative/interrogative words, auxiliary
 * verbs, and the common nouns a prep uses to describe a guest's role. The
 * first one ends the name; as the FIRST token it means there is no name.
 */
const NAME_STOPWORDS = new Set(
  [
    // particles / prepositions / conjunctions
    "في", "من", "مع", "عن", "الى", "إلى", "على", "علي", "حول", "بين", "عند", "لدى", "منذ", "حتى",
    "خلال", "بعد", "قبل", "دون", "وراء", "ضد", "نحو", "او", "ثم", "لكن", "بل", "و", "ف",
    "لا", "لم", "لن", "قد", "ما", "ان", "إن", "أن", "كي", "لكي", "اذا", "لو", "حين", "عندما", "بينما",
    "كما", "مثل", "ليس", "ليست", "هل", "كيف", "لماذا", "ماذا", "متى", "اين", "من", "اي", "كل", "بعض",
    "نفسه", "نفسها", "ذاته", "وحده", "ايضا", "فقط", "جدا", "الان", "هنا", "هناك",
    // pronouns / demonstratives / relatives
    "هو", "هي", "هم", "انت", "انا", "نحن", "هذا", "هذه", "ذلك", "تلك", "الذي", "التي", "الذين",
    "وهو", "وهي", "فهو",
    // auxiliaries and common verbs a prep writes after the guest
    "كان", "كانت", "اصبح", "صار", "بات", "ظل", "عاش", "بدا", "بدأ", "قال", "روى", "حكى", "باع",
    "بنى", "اسس", "قرر", "عاد", "جاء", "مر", "خاض", "دخل", "خرج", "ترك", "وجد", "فقد", "صنع",
    "تحدث", "تكلم", "تعلم", "واجه", "عرف", "يعرف", "ليس",
    // role nouns / descriptors
    "صاحب", "صاحبه", "مؤسس", "رائد", "رجل", "امراه", "شاب", "شخص", "انسان", "رجل", "الرجل",
    "رئيس", "مدير", "خبير", "استاذ", "دكتور", "طالب", "معلم", "كاتب", "مؤلف", "ضيف", "زميل",
    "صديق", "ابن", "اخ", "اخت", "والد", "والده", "عائله", "تجربه", "قصه", "رحله",
    "حكايه", "فكره", "مشروع", "شركه", "سوق", "عالم", "مجال", "قطاع", "اداره", "جامعه", "كليه",
    "الذي", "واحد", "احد", "اول", "اخر", "ثاني", "كبير", "صغير", "جديد", "قديم",
  ].map(foldToken),
)

/** Kunya heads: «أبو بكر», «أم خالد», «بو نواف» — a name only with a name after. */
const KUNYA_HEADS = new Set(["ابو", "ام", "بو"])

/**
 * Article-words that describe the titled person rather than name him
 * («الأستاذ المساعد», «المهندس المعماري»). After a TITLE, any other «ال…»
 * word is read as a family name («الشيخ الصباح», «الدكتور الغانم»).
 */
const TITLE_DESCRIPTORS = new Set(
  [
    "المساعد", "المشارك", "المعالج", "المعماري", "المدني", "الجامعي", "الكبير", "الجليل",
    "المؤسس", "الزائر", "الضيف", "الكريم", "الفاضل", "العزيز", "المميز", "الجديد", "القدير",
    "المتخصص", "المختص", "المسؤول", "المحاضر", "الباحث", "الخبير", "الراحل", "السابق",
  ].map(foldToken),
)

/** «ال…ي» words that are adjectives, not nisba family names. */
const NISBA_ADJECTIVES = new Set(
  [
    "الحقيقي", "الاساسي", "الرئيسي", "الكويتي", "الخليجي", "العربي", "السعودي", "الاجتماعي",
    "الشخصي", "الحالي", "الثاني", "التالي", "الماضي", "الذهبي", "الاستثنائي", "الملهمي",
    "النفسي", "المهني", "العملي", "الذي", "التي", "الوحيدي", "الذاتي",
  ].map(foldToken),
)

/** Given names starting with «ي» — so the imperfect-verb heuristic spares them. */
const YAA_NAMES = new Set(
  ["يوسف", "يعقوب", "يزيد", "يحيى", "ياسر", "ياسين", "يونس", "يعرب", "يمان", "يسرى", "يارا", "ياسمين", "يسار", "يامن", "يوسفي"].map(
    foldToken,
  ),
)

/** Names starting with «ت» — spared by the feminine-verb check after a first name. */
const TAA_NAMES = new Set(
  ["تركي", "تامر", "تميم", "توفيق", "تهاني", "تغريد", "تماضر", "توفيقه", "تيسير"].map(foldToken),
)

function looksLikeVerb(tok: string): boolean {
  // Imperfect verbs: يروي، يحكي، يتحدث، يشارك … ; future: سيحكي، ستروي …
  if (tok.startsWith("ي") && tok.length >= 4 && !YAA_NAMES.has(tok)) return true
  if (/^س[يتن]/.test(tok) && tok.length >= 5) return true
  return false
}

function isNameToken(tok: string, first: boolean, afterTitle = false): boolean {
  if (tok.length < 2) return false
  if (NAME_STOPWORDS.has(tok) || LEADING_FILLERS.has(tok)) return false
  if (KUNYA_HEADS.has(tok)) return false // alone («أم لا») it is not a name
  if (looksLikeVerb(tok)) return false
  // After a name has started, «تحكي/تروي/تشرح» is the feminine verb, not a
  // second name — except the few ت-names a guest may carry.
  if (!first && tok.startsWith("ت") && tok.length >= 4 && !TAA_NAMES.has(tok)) return false
  if (first && tok.startsWith("ال")) {
    if (afterTitle) return !TITLE_DESCRIPTORS.has(tok) && !NISBA_ADJECTIVES.has(tok)
    // A bare family name after a title («الدكتور العتيبي») is a nisba ending
    // in «ي» (minus NISBA_ADJECTIVES); any other article-word («المؤسس»،
    // «الكريم») is a description, not a name.
    return tok.endsWith("ي") && !NISBA_ADJECTIVES.has(tok)
  }
  return true
}

export interface GuestReferenceContext {
  linkedGuestName?: string | null
  /**
   * Operator-authored text (episode title + goal). A name every token of which
   * appears here came from the operator, not the model — brands like «مُبخر»,
   * «خليط», «فلاورد» included.
   */
  knownText?: string | null
}

export interface GuestReferenceFinding {
  /** Which payload field it was found in, e.g. `opening_options[0].text`. */
  field: string
  /** The name as written in the original text. */
  name: string
  /** Trigger + name as written, for the operator/dev to read. */
  snippet: string
  /** Original-text span of the NAME (end exclusive) — what sanitize replaces. */
  start: number
  end: number
}

function tokenSet(text: string | null | undefined): Set<string> {
  const out = new Set<string>()
  const toks = normalizeArabic(text ?? "")
    .text.split(new RegExp(`[^${L}]+`))
    .filter((t) => t.length >= 2)
  for (let i = 0; i < toks.length; i++) {
    out.add(toks[i])
    // «عبد الله» written apart in one place and joined in the other.
    if (i + 1 < toks.length) out.add(toks[i] + toks[i + 1])
  }
  return out
}

/** Every trigger+name in one string whose name is not verified. */
function findInText(
  field: string,
  original: string,
  linked: Set<string>,
  known: Set<string>,
): GuestReferenceFinding[] {
  const { text, map } = normalizeArabic(original)
  const found: GuestReferenceFinding[] = []
  for (const re of NAME_TRIGGERS) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const triggerStart = m.index
      const after = m.index + m[0].length
      const follow = FOLLOWING_TOKENS.exec(text.slice(after))
      if (!follow) continue
      // Token offsets inside the folded text.
      const tokens: { t: string; s: number; e: number }[] = []
      const tokRe = new RegExp(`[${L}]+`, "g")
      const base = after + follow[0].length - follow[1].length
      let tm: RegExpExecArray | null
      while ((tm = tokRe.exec(follow[1])) !== null) {
        tokens.push({ t: tm[0], s: base + tm.index, e: base + tm.index + tm[0].length })
      }
      let k = 0
      while (k < tokens.length && LEADING_FILLERS.has(tokens[k].t)) k++
      if (k >= tokens.length) continue
      const afterTitle = re !== GUEST_TRIGGER
      const name: typeof tokens = []
      if (
        KUNYA_HEADS.has(tokens[k].t) &&
        k + 1 < tokens.length &&
        isNameToken(tokens[k + 1].t, false)
      ) {
        name.push(tokens[k]) // «أبو» / «أم» + the name that follows
        k++
      } else if (!isNameToken(tokens[k].t, true, afterTitle)) {
        continue
      }
      name.push(tokens[k])
      const cap = KUNYA_HEADS.has(name[0].t) ? 4 : 3
      for (let j = k + 1; j < tokens.length && name.length < cap; j++) {
        // The article-word is the family name — the name ends there
        // («الشيخ الصباح دعم…», «سارة العلي تروي…»).
        if (name[name.length - 1].t.startsWith("ال")) break
        if (!isNameToken(tokens[j].t, false)) break
        name.push(tokens[j])
      }
      const nameToks = name.map((x) => x.t)
      const pairs = nameToks.slice(0, -1).map((t, i) => t + nameToks[i + 1])
      // «وخليط»: a conjunction proclitic glued to a known word.
      const inSet = (set: Set<string>, t: string) =>
        set.has(t) || (/^[وف]/.test(t) && set.has(t.slice(1)))
      const verified =
        [...nameToks, ...pairs].some((t) => inSet(linked, t)) ||
        nameToks.every((t) => inSet(linked, t) || inSet(known, t))
      if (verified) continue
      const start = map[name[0].s]
      const end = map[name[name.length - 1].e - 1] + 1
      found.push({
        field,
        name: original.slice(start, end),
        snippet: original.slice(map[triggerStart], end),
        start,
        end,
      })
    }
  }
  return found
}

/** The operator-visible copy the detector scans, with a field label each. */
function scannedFields(p: PrepV2Payload): { field: string; text: string }[] {
  const out: { field: string; text: string }[] = []
  ;(p.opening_options ?? []).forEach((o, i) => {
    if (o?.text) out.push({ field: `opening_options[${i}].text`, text: o.text })
  })
  ;(p.closing_options ?? []).forEach((o, i) => {
    if (o?.text) out.push({ field: `closing_options[${i}].text`, text: o.text })
  })
  ;(p.episode_sections ?? []).forEach((s) => {
    if (s?.intent) out.push({ field: `episode_sections.${s.kind}.intent`, text: s.intent })
    if (s?.transition_goal) {
      out.push({ field: `episode_sections.${s.kind}.transition_goal`, text: s.transition_goal })
    }
  })
  if (p.host_guidance?.overall_tone) {
    out.push({ field: "host_guidance.overall_tone", text: p.host_guidance.overall_tone })
  }
  if (p.guest_extraction_strategy) {
    out.push({ field: "guest_extraction_strategy", text: p.guest_extraction_strategy })
  }
  return out
}

export function findUnverifiedGuestReferences(
  p: PrepV2Payload,
  ctx: GuestReferenceContext = {},
): GuestReferenceFinding[] {
  const linked = tokenSet(ctx.linkedGuestName)
  const known = tokenSet(ctx.knownText)
  return scannedFields(p).flatMap(({ field, text }) => findInText(field, text, linked, known))
}

/** Boolean form kept for existing callers (smoke script). */
export function detectUnverifiedGuestReference(
  p: PrepV2Payload,
  linkedGuestName: string | null,
  knownText: string | null = null,
): boolean {
  return findUnverifiedGuestReferences(p, { linkedGuestName, knownText }).length > 0
}

/**
 * Replace every UNVERIFIED name with «[الضيف]» — only the name tokens; the
 * trigger and the rest of the sentence stay. Verified references (the linked
 * guest, operator-named brands) are left alone: the old sanitizer replaced
 * every trigger match, including the real guest's name and up to 40
 * characters of the sentence after it.
 */
export function sanitizeGuestReferences(
  p: PrepV2Payload,
  ctx: GuestReferenceContext = {},
): { payload: PrepV2Payload; replacements: number } {
  const linked = tokenSet(ctx.linkedGuestName)
  const known = tokenSet(ctx.knownText)
  let replacements = 0
  const replace = (s: string): string => {
    if (!s) return s
    const spans = findInText("", s, linked, known)
      .map((f) => [f.start, f.end] as const)
      .sort((a, b) => b[0] - a[0])
    let out = s
    let lastStart = Infinity
    for (const [a, b] of spans) {
      if (b > lastStart) continue // overlapping trigger matches
      out = out.slice(0, a) + "[الضيف]" + out.slice(b)
      lastStart = a
      replacements++
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
