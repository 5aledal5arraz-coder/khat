/**
 * Prep V2 — episode FORMAT.
 *
 *   story  — the original emotional arc (opening → build_up → conflict →
 *            deep_dive → emotional_peak → resolution). The default, and the
 *            only thing a payload without a `format` field can be.
 *   course — «دورة مصغّرة / جلسة تدريبية» for an expert guest. The episode is
 *            a sequence of MODULES that follow the order the episode goal
 *            lists them in; the questions extract method and tools, not
 *            confession or tension.
 *
 * WHY the course mode reuses the six SectionKind values instead of adding its
 * own: the recording room (energy dial, section clock, markers' section_key),
 * the interview cards and Pass 5 all key on `SectionKind`. A course module is
 * stored as a section whose `kind` is just a SLOT id and whose human identity
 * lives in `title` + the course fields. Modules occupy the slots in canonical
 * order — module 0 is always `opening`, the wrap-up is always `resolution`,
 * the goal's topics take the middle slots in order — so every existing
 * consumer keeps working, and a course may use 3–6 of the six slots.
 *
 * Pure module: no DB, no React, safe to import from server and client.
 */

import type { PrepV2Payload, PrepV2Section, SectionKind } from "./types"

export const PREP_FORMATS = ["story", "course"] as const
export type PrepFormat = (typeof PREP_FORMATS)[number]
export const DEFAULT_PREP_FORMAT: PrepFormat = "story"

export const PREP_FORMAT_LABEL_AR: Record<PrepFormat, string> = {
  story: "قصة",
  course: "دورة مصغّرة / جلسة تدريبية",
}

export const PREP_FORMAT_HINT_AR: Record<PrepFormat, string> = {
  story: "قوس سردي: افتتاح، توتر، مواجهة، غوص، ذروة عاطفية، خاتمة.",
  course: "وحدات بترتيب هدف الحلقة: تعريف بالضيف ثم محور لكل موضوع، أسئلة منهج وأدوات عملية.",
}

export function coercePrepFormat(v: unknown): PrepFormat {
  return v === "course" ? "course" : "story"
}

/** A payload with no `format` field predates this feature ⇒ story. */
export function prepFormatOf(
  p: Pick<PrepV2Payload, "format"> | null | undefined,
): PrepFormat {
  return coercePrepFormat(p?.format)
}

/** The canonical story-arc labels (one source for new call sites). */
export const STORY_SECTION_LABEL_AR: Record<SectionKind, string> = {
  opening: "افتتاحية",
  build_up: "بناء التوتر",
  conflict: "المواجهة",
  deep_dive: "الغوص العميق",
  emotional_peak: "الذروة العاطفية",
  resolution: "الخاتمة",
}

/**
 * Display label for a section. A course module carries its own `title`
 * (e.g. «أول 100 يوم»); a story section has none and falls back to the arc
 * label — so story output renders exactly as before.
 */
export function sectionLabelAr(
  kind: SectionKind | string,
  sections?: ReadonlyArray<Pick<PrepV2Section, "kind" | "title">> | null,
): string {
  const title = sections?.find((s) => s.kind === kind)?.title?.trim()
  if (title) return title
  return STORY_SECTION_LABEL_AR[kind as SectionKind] ?? String(kind)
}

// ─── Course slot assignment ───────────────────────────────────────────

/** Middle slots a course's goal topics occupy, in order. */
export const COURSE_MIDDLE_SLOTS: readonly SectionKind[] = [
  "build_up",
  "conflict",
  "deep_dive",
  "emotional_peak",
]
export const COURSE_MIN_MODULES = 3
export const COURSE_MAX_MODULES = 2 + COURSE_MIDDLE_SLOTS.length // 6

/**
 * The slot sequence for a course of `moduleCount` modules:
 *   opening, <first N middle slots>, resolution.
 */
export function courseSlotsFor(moduleCount: number): SectionKind[] {
  const n = Math.max(
    COURSE_MIN_MODULES,
    Math.min(COURSE_MAX_MODULES, Math.floor(moduleCount)),
  )
  return ["opening", ...COURSE_MIDDLE_SLOTS.slice(0, n - 2), "resolution"]
}

export interface CourseModuleDraft {
  title: string
  intent: string
  learning_objective: string
  key_concepts: string[]
  takeaway_tool: string
  guest_experience_fit: string
  target_emotion: string
  estimated_minutes: number
  transition_goal: string
}

/**
 * Pin a list of modules (in goal order) onto slot kinds. Deterministic — the
 * model never chooses a kind. More middle modules than slots are MERGED into
 * the last middle slot (titles joined, lists concatenated) rather than
 * dropped, so no topic from the goal silently disappears. Returns null when
 * there are fewer than 3 modules (intro + ≥1 topic + wrap-up).
 */
export function assignCourseSlots(
  modules: CourseModuleDraft[],
): PrepV2Section[] | null {
  if (modules.length < COURSE_MIN_MODULES) return null
  const first = modules[0]
  const last = modules[modules.length - 1]
  let middle = modules.slice(1, -1)
  if (middle.length > COURSE_MIDDLE_SLOTS.length) {
    const keep = middle.slice(0, COURSE_MIDDLE_SLOTS.length - 1)
    const overflow = middle.slice(COURSE_MIDDLE_SLOTS.length - 1)
    middle = [...keep, mergeModules(overflow)]
  }
  const ordered = [first, ...middle, last]
  const slots = courseSlotsFor(ordered.length)
  return ordered.map((m, i) => ({
    kind: slots[i],
    title: m.title,
    intent: m.intent,
    target_emotion: m.target_emotion,
    estimated_minutes: m.estimated_minutes,
    transition_goal: m.transition_goal,
    learning_objective: m.learning_objective,
    key_concepts: m.key_concepts,
    takeaway_tool: m.takeaway_tool,
    guest_experience_fit: m.guest_experience_fit,
  }))
}

function mergeModules(ms: CourseModuleDraft[]): CourseModuleDraft {
  const join = (f: (m: CourseModuleDraft) => string) =>
    ms.map(f).filter(Boolean).join(" · ")
  return {
    title: ms.map((m) => m.title).join(" + "),
    intent: join((m) => m.intent),
    learning_objective: join((m) => m.learning_objective),
    key_concepts: ms.flatMap((m) => m.key_concepts),
    takeaway_tool: join((m) => m.takeaway_tool),
    guest_experience_fit: join((m) => m.guest_experience_fit),
    target_emotion: ms[0].target_emotion,
    estimated_minutes: ms.reduce((a, m) => a + m.estimated_minutes, 0),
    transition_goal: ms[ms.length - 1].transition_goal,
  }
}

/** True when `kinds` is a legal course slot sequence (3–6 slots). */
export function isCourseSlotSequence(kinds: readonly string[]): boolean {
  if (kinds.length < COURSE_MIN_MODULES || kinds.length > COURSE_MAX_MODULES) {
    return false
  }
  const expected = courseSlotsFor(kinds.length)
  return kinds.every((k, i) => k === expected[i])
}

// ─── Question types ───────────────────────────────────────────────────

/**
 * A course bans the arc's pressure types. If the model emits them anyway,
 * remap to `reflective` (the lesson-drawing type) instead of dropping the
 * question — the energy dial treats confrontational/emotional as "raise the
 * heat", which is the wrong cue in a training session.
 */
export function courseSafeTypes<T extends string>(types: readonly T[]): T[] {
  const out: T[] = []
  for (const t of types) {
    const mapped = (t === "confrontational" || t === "emotional" ? "reflective" : t) as T
    if (!out.includes(mapped)) out.push(mapped)
  }
  return out
}

/** ai_runs prompt_version for the course-format passes 3–4 (question bank, critique). */
export const COURSE_PROMPT_VERSION = "prep_v2.course.v1"

/**
 * Passes 1–2 (research synthesis, structure) open with «دستور خط» (compact)
 * since 2026-09-28, so they carry their own versions — the question-bank and
 * critique prompts did not change and keep theirs.
 */
export const PREP_BACKBONE_PROMPT_VERSION = {
  story: "prep_v2.story.backbone.v2-constitution",
  course: "prep_v2.course.backbone.v2-constitution",
} as const

// ─── Target duration ──────────────────────────────────────────────────

/** A course with no duration anywhere is planned as a two-hour session. */
export const COURSE_DEFAULT_MINUTES = 120
const COURSE_MINUTES_FLOOR = 45
const COURSE_MINUTES_CEIL = 180

/** Per-module minute caps. A course module can run longer than an arc beat. */
export const COURSE_MODULE_MIN_MINUTES = 3
export const COURSE_MODULE_MAX_MINUTES = 45

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩"
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹"
function normaliseDigits(s: string): string {
  return s
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(PERSIAN.indexOf(d)))
    .replace(/(\d)٫(\d)/g, "$1.$2") // Arabic decimal separator: ١٫٥ → 1.5
}

/**
 * Hour/minute phrases, most specific first. Each returns minutes. Order
 * matters: «ساعتين إلا ربع» must be consumed before «ساعتين», and «ساعة ونص»
 * before the bare «ساعة».
 */
const HOUR_PHRASES: Array<[RegExp, (m: RegExpExecArray) => number]> = [
  [/ساعتين\s+إلا\s+ربع/g, () => 105],
  [/ساعة\s+إلا\s+ربع/g, () => 45],
  [/ساعتين\s+ونص(?:ف)?/g, () => 150],
  [/ساعتين\s+وربع/g, () => 135],
  [/ساعة\s+ونص(?:ف)?/g, () => 90],
  [/ساعة\s+وربع/g, () => 75],
  [/ساعتين|ساعتان/g, () => 120],
  [/(?:ثلاث|ثلاثة)\s+ساعات/g, () => 180],
  [/(\d+(?:\.\d+)?)\s*(?:ساعة|ساعات|hours?|hrs?)/gi, (m) => Number(m[1]) * 60],
  [/(\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?\s*(?:دقيقة|دقائق|min(?:utes)?)/gi, (m) => Number(m[2] ?? m[1])],
  [/(?<![ء-ي])ساعة(?:\s+واحدة)?(?![ء-ي])/g, () => 60],
]

interface DurationHit {
  minutes: number
  start: number
  end: number
}

/** Every duration phrase in `text`, non-overlapping, in text order. */
function findDurations(text: string): DurationHit[] {
  let masked = text
  const hits: DurationHit[] = []
  for (const [re, value] of HOUR_PHRASES) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(masked)) !== null) {
      hits.push({ minutes: value(m), start: m.index, end: m.index + m[0].length })
      // Mask the span so a less specific phrase cannot re-match inside it.
      masked =
        masked.slice(0, m.index) + " ".repeat(m[0].length) + masked.slice(m.index + m[0].length)
    }
  }
  return hits.sort((a, b) => a.start - b.start)
}

/** Approximation words that may sit DIRECTLY next to a length. */
const APPROX = "(?:قرابة|حوالي|حوالى|نحو|تقريباً|تقريبا|about|approx(?:imately)?|around)"
const APPROX_BEFORE = new RegExp(`${APPROX}\\s*$`, "i")
const APPROX_AFTER = new RegExp(`^\\s*(?:تقريباً|تقريبا)`)
const APPROX_PREFIX_ONLY = new RegExp(`^\\s*(?:${APPROX}\\s*)?$`, "i")
/** «مدة الحلقة» / «طول الحلقة» / «(حلقة) مدتها» (colon allowed) immediately before the length. */
const EPISODE_LENGTH_LABEL = new RegExp(
  `(?:(?:مدة|طول)\\s+الحلقة|(?:حلقة\\s+)?مدتها)\\s*[:：]?\\s*(?:${APPROX}\\s*)?$`,
  "i",
)
/** A rate, not a length: «حوالي 90 دقيقة يومياً». */
const FREQUENCY_AFTER =
  /^\s*(?:يومياً|يوميا|يومي|أسبوعياً|أسبوعيا|شهرياً|شهريا|سنوياً|سنويا|في\s+اليوم|كل\s+يوم|في\s+الأسبوع|daily|a\s+day|per\s+day)/i

/** End of the goal's first sentence (a "." inside «1.5» does not end it). */
function firstSentenceEnd(text: string): number {
  const m = text.match(/[.؟?!\n](?!\d)/)
  return m?.index ?? text.length
}

/** Is [start, end) inside an open parenthesis? */
function insideParen(text: string, start: number, end: number): boolean {
  const open = text.lastIndexOf("(", start)
  if (open < 0 || text.lastIndexOf(")", start) > open) return false
  const close = text.indexOf(")", end)
  return close >= 0 && (text.indexOf("(", end) < 0 || text.indexOf("(", end) > close)
}

/**
 * A STRICT episode-length phrase — the only kind of total trusted, and only
 * when the goal has fewer than 2 module durations:
 *   - «مدة الحلقة» / «طول الحلقة» immediately before the length; or
 *   - «قرابة/حوالي/نحو/تقريباً» directly adjacent to the length, and the
 *     phrase sits inside a parenthesis or in the goal's first sentence.
 * Bare «الحلقة/حلقة/مدة» are NOT anchors: «الحلقة الأولى استمرت ساعة»,
 * «مدة الاجتماع ساعة واحدة» and «حلقة من 60 دقيقة على قناته» are content.
 */
function isStrictLengthPhrase(text: string, hit: DurationHit): boolean {
  const before = text.slice(0, hit.start)
  const after = text.slice(hit.end)
  if (FREQUENCY_AFTER.test(after)) return false
  if (EPISODE_LENGTH_LABEL.test(before)) return true
  const adjacent = APPROX_BEFORE.test(before) || APPROX_AFTER.test(after)
  if (!adjacent) return false
  return insideParen(text, hit.start, hit.end) || hit.end <= firstSentenceEnd(text)
}

/**
 * A MODULE duration in a parenthesis: the content opens with the duration
 * (an approximation word may precede it) and may continue with other words —
 * «(15–20 دقيقة)», «(15 دقيقة، مع قصة البداية)». «(اجتماع 10 دقائق يومياً)»
 * does not open with a duration and is content.
 *
 * `beforeList` excludes an approximate total that precedes every list item —
 * «حلقة … (قرابة ساعتين) … 1) … (15–20 دقيقة)» — from the module sum.
 */
function parenModuleDuration(content: string, beforeList: boolean): number | null {
  const hits = findDurations(content)
  if (hits.length === 0) return null
  const lead = content.slice(0, hits[0].start)
  if (!APPROX_PREFIX_ONLY.test(lead)) return null
  if (beforeList && lead.trim().length > 0) return null
  if (hits[0].minutes > COURSE_MINUTES_CEIL) return null
  return hits[0].minutes
}

/** Numbered («1)», «2.», «٣-») or bulleted list items at line/segment start. */
const LIST_ITEM = /(?:^|\s)(\d{1,2})\s?[)\-–.]\s|(?:^|\n)\s*[-•*]\s/g

function countListItems(text: string): number {
  const numbers = new Set<string>()
  let bullets = 0
  for (const m of text.matchAll(LIST_ITEM)) {
    if (m[1]) numbers.add(m[1])
    else bullets++
  }
  return numbers.size + bullets
}

/** The duration a text segment carries as a MODULE time, or null. */
function segmentModuleDuration(segment: string, beforeList: boolean): number | null {
  for (const m of segment.matchAll(/\(([^()]{1,80})\)/g)) {
    const v = parenModuleDuration(m[1], beforeList)
    if (v !== null) return v
  }
  if (beforeList) return null
  // «2) التشخيص: 30 دقيقة» — a duration closing the item.
  const tail = segment
    .trim()
    .match(/[:–—-]\s*(\d{1,3})(?:\s*[–—-]\s*(\d{1,3}))?\s*(?:دقيقة|دقائق)\s*[.،]?$/)
  return tail ? Number(tail[2] ?? tail[1]) : null
}

/** The goal cut into list items (text from one marker to the next). */
function listItemSegments(text: string): string[] {
  const starts: number[] = []
  const re = new RegExp(LIST_ITEM.source, "g")
  for (const m of text.matchAll(re)) starts.push(m.index ?? 0)
  return starts.map((st, i) => text.slice(st, starts[i + 1] ?? text.length))
}

/** Every module parenthesis in free text with no list (round-4 behaviour). */
function unlistedModuleDurations(text: string): number[] {
  const out: number[] = []
  for (const m of text.matchAll(/\(([^()]{1,80})\)/g)) {
    const v = parenModuleDuration(m[1], true)
    if (v !== null) out.push(v)
  }
  return out
}

/**
 * Read the episode's total length from the goal text. Free text can never be
 * parsed airtight — the operator's explicit choice in the regenerate control
 * outranks this (see `courseTargetMinutes`). Order:
 *   1. a list where EVERY item carries a duration ⇒ the module sum;
 *   2. otherwise a STRICT length phrase (isStrictLengthPhrase), ≥ 45 min;
 *   3. otherwise, if only SOME items are timed ⇒ null. A partial sum is not
 *      the length — «مدة الحلقة ساعتين» with 2 of 4 items timed once became 45;
 *   4. no list: ≥2 module parentheses ⇒ their sum;
 *   5. «N دقيقة لكل محور» × the number of listed topics;
 *   6. otherwise null (the caller applies the default).
 */
export function extractTargetMinutes(goal: string | null | undefined): number | null {
  if (!goal) return null
  const g = normaliseDigits(goal)
  const clamp = (n: number) =>
    Math.max(COURSE_MINUTES_FLOOR, Math.min(COURSE_MINUTES_CEIL, Math.round(n)))

  const items = listItemSegments(g)
  const timed = items
    .map((seg) => segmentModuleDuration(seg, false))
    .filter((v): v is number => v !== null)

  // 1. Fully timed list.
  if (items.length >= 2 && timed.length === items.length) {
    return clamp(timed.reduce((a, v) => a + v, 0))
  }

  // 2. Strict episode-length phrase.
  for (const hit of findDurations(g)) {
    if (hit.minutes < COURSE_MINUTES_FLOOR) continue
    if (isStrictLengthPhrase(g, hit)) return clamp(hit.minutes)
  }

  // 3. Partially timed list — no trustworthy total.
  if (items.length >= 2 && timed.length > 0) return null

  // 4. No list: module parentheses in free text.
  if (items.length < 2) {
    const loose = unlistedModuleDurations(g)
    if (loose.length >= 2) return clamp(loose.reduce((a, v) => a + v, 0))
  }

  // 5. A per-topic rate × the listed topics.
  const rate = g.match(
    /(\d{1,3})\s*(?:دقيقة|دقائق)\s*(?:لكل|في\s+كل|عن\s+كل)\s*(?:محور|وحدة|موضوع|قسم)/,
  )
  const topics = countListItems(g)
  if (rate && topics >= 2) return clamp(Number(rate[1]) * topics)

  return null
}

/** Lengths the operator can pick in the regenerate control (minutes). */
export const COURSE_TARGET_CHOICES = [60, 90, 120, 150, 180] as const

/** Server-side guard: only an allowed choice survives; anything else ⇒ null. */
export function coerceCourseTargetChoice(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v
  return typeof n === "number" && (COURSE_TARGET_CHOICES as readonly number[]).includes(n)
    ? n
    : null
}

/**
 * The course's planned length, by precedence:
 *   the operator's explicit choice (regenerate control)
 *   > the prep's `expected_duration_min` (studio)
 *   > the goal parser
 *   > COURSE_DEFAULT_MINUTES.
 */
export function courseTargetMinutes(
  goal: string | null | undefined,
  expectedDurationMin?: number | null,
  explicitChoice?: number | null,
): number {
  const choice = coerceCourseTargetChoice(explicitChoice)
  if (choice !== null) return choice
  return autoCourseTargetMinutes(goal, expectedDurationMin) ?? COURSE_DEFAULT_MINUTES
}

/**
 * What «تلقائي» resolves to — `expected_duration_min`, else the goal parser —
 * or null when neither says anything (the default then applies). Computed on
 * the server and shown in the picker, so the operator sees what "auto" means
 * BEFORE spending a generation on it.
 */
export function autoCourseTargetMinutes(
  goal: string | null | undefined,
  expectedDurationMin?: number | null,
): number | null {
  if (expectedDurationMin && expectedDurationMin > 0) {
    return Math.max(
      COURSE_MINUTES_FLOOR,
      Math.min(COURSE_MINUTES_CEIL, Math.round(expectedDurationMin)),
    )
  }
  return extractTargetMinutes(goal)
}

/**
 * The picker's «تلقائي» option label: «تلقائي من الهدف (≈ N دقيقة)», or the
 * default spelled out — «تلقائي (١٢٠ افتراضي)» — when nothing was read.
 * Digits are mapped by hand, not via toLocaleString, so server and client
 * render the identical string.
 */
export function autoOptionLabel(auto: number | null): string {
  if (auto !== null) return `تلقائي من الهدف (≈ ${auto} دقيقة)`
  const ar = String(COURSE_DEFAULT_MINUTES).replace(/\d/g, (d) => ARABIC_INDIC[Number(d)])
  return `تلقائي (${ar} افتراضي)`
}

/**
 * The target a course of `moduleCount` modules can actually reach under the
 * per-module caps. A 3-module course cannot fill 180 minutes at 45 each; the
 * window is judged against what is reachable instead of failing forever.
 */
export function effectiveCourseTarget(target: number, moduleCount: number): number {
  if (moduleCount <= 0) return target
  return Math.max(
    moduleCount * COURSE_MODULE_MIN_MINUTES,
    Math.min(target, moduleCount * COURSE_MODULE_MAX_MINUTES),
  )
}

/** Accepted total-duration window for a course of `target` minutes (±20%). */
export function courseDurationWindow(target: number): [number, number] {
  return [Math.round(target * 0.8), Math.round(target * 1.2)]
}
