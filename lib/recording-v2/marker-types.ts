/**
 * Canonical quick-marker taxonomy for the live recording workflow.
 *
 * ONE vocabulary shared by every role:
 *   - hosts tag clip/quote/highlight moments while recording,
 *   - directors flag breaks / retakes / tech issues live,
 *   - editors mine the timeline in post (cut, chapter, clip, …).
 *
 * Pure data (no React / no lucide) so it is import-safe from server routes,
 * shared types, and client UI alike. The visual identity (icons + colours)
 * is layered on top in recording-shared.ts.
 */

export const QUICK_MARKER_TYPES = [
  // ── Publishable content — what editors mine for clips / social / notes ──
  "clip",
  "quote",
  "highlight",
  // ── Editing notes — what to fix or remove in post ──
  "cut",
  "retake",
  "tech_issue",
  // ── Flow & structure — recording breaks + chapter boundaries ──
  "break_start",
  "break_end",
  "chapter",
  // ── The closing halves that were missing ──────────────────────────────
  // Khaled, 2026-08-05: «بالدقيقه ٥ وضعت علامه خلل وفي الدقيقه ٦ انتهى الخلل
  // شنو اسوي؟ اضغط خلل مره ثانيه؟»
  //
  // He had found a real hole. A break already had TWO markers — break_start
  // and break_end — because a break is a STRETCH of the recording, not an
  // instant. A technical fault is exactly the same shape and had only one, so
  // the editor inherited a timestamp saying "something went wrong here" with
  // no way to know whether it cost two seconds or two minutes.
  //
  // `retake` gets the same treatment: "we are redoing this" runs from the
  // moment it is called until the good take begins.
  "tech_issue_end",
  "retake_end",
] as const

export type QuickMarkerType = (typeof QUICK_MARKER_TYPES)[number]

/**
 * System markers are recorded automatically (not from the quick-tag UI) and
 * rendered specially.
 *   - `energy_change`    records every energy-dial change.
 *   - `insight_used`     records when the host deploys a question's support card
 *     (Insight Card) live, with the card's type + claim in `note`.
 *   - `episode_started`  records WHO pressed "ابدأ التسجيل" for this take. Both
 *     the host and the director can start a take, so "who started" stopped being
 *     inferable; it rides on the marker's `author_id` — no column, no migration.
 *     The value is an old one the DB CHECK in scripts/post-schema.sql already
 *     accepts (it is listed there among the legacy values), which is exactly why
 *     it was chosen over a new name.
 * All three flow into the timeline ribbon + CSV export + post analytics.
 */
export const SYSTEM_MARKER_TYPES = [
  "energy_change",
  "insight_used",
  "episode_started",
] as const
export type SystemMarkerType = (typeof SYSTEM_MARKER_TYPES)[number]

/** Any value the marker_type column may hold (quick + system). */
export type StoredMarkerType = QuickMarkerType | SystemMarkerType

export type QuickMarkerGroup = "content" | "editing" | "flow"

export interface QuickMarkerMeta {
  type: QuickMarkerType
  /** Arabic label shown on the button + tooltips. */
  label: string
  /** One-line hint: when to use it (button title). */
  hint: string
  group: QuickMarkerGroup
  /** Stable English label stored on the marker for downstream tools/exports. */
  defaultLabel: string
}

export const QUICK_MARKER_META: Record<QuickMarkerType, QuickMarkerMeta> = {
  clip: {
    type: "clip",
    label: "مقطع قصير",
    hint: "لحظة صالحة لمقطع قصير / ريل",
    group: "content",
    defaultLabel: "short clip",
  },
  quote: {
    type: "quote",
    label: "اقتباس",
    hint: "جملة قابلة للاقتباس (لبطاقة أو منشور)",
    group: "content",
    defaultLabel: "quote",
  },
  highlight: {
    type: "highlight",
    label: "إبراز",
    hint: "لحظة مميّزة تستحق الإبراز",
    group: "content",
    defaultLabel: "highlight",
  },
  cut: {
    type: "cut",
    label: "حذف",
    hint: "احذف هذا في المونتاج (زلّة / استطراد / صمت)",
    group: "editing",
    defaultLabel: "cut",
  },
  retake: {
    type: "retake",
    label: "إعادة",
    hint: "أُعيد المقطع — احذف المحاولة الأولى",
    group: "editing",
    defaultLabel: "retake",
  },
  tech_issue: {
    type: "tech_issue",
    label: "مشكلة تقنية",
    hint: "خلل صوت / صورة / إضاءة للمراجعة",
    group: "editing",
    defaultLabel: "tech issue",
  },
  break_start: {
    type: "break_start",
    label: "بداية استراحة",
    hint: "بدء استراحة — احذف ما بينها وبين نهايتها",
    group: "flow",
    defaultLabel: "break start",
  },
  break_end: {
    type: "break_end",
    label: "نهاية استراحة",
    hint: "العودة من الاستراحة",
    group: "flow",
    defaultLabel: "break end",
  },
  chapter: {
    type: "chapter",
    label: "فصل جديد",
    hint: "بداية محور / فصل جديد في الحلقة",
    group: "flow",
    defaultLabel: "chapter",
  },
  tech_issue_end: {
    type: "tech_issue_end",
    label: "انتهت المشكلة",
    hint: "نهاية المشكلة التقنية — المونتير يحذف ما بينها وبين بدايتها",
    group: "editing",
    defaultLabel: "tech issue end",
  },
  retake_end: {
    type: "retake_end",
    label: "انتهت الإعادة",
    hint: "نهاية الإعادة — اللقطة الجيدة تبدأ من هنا",
    group: "editing",
    defaultLabel: "retake end",
  },
}

/**
 * ── INTERVAL MARKERS: THE ONES THAT NEED CLOSING ───────────────────────────
 *
 * Khaled asked the question that exposed this: «بالدقيقه ٥ وضعت علامه خلل وفي
 * الدقيقه ٦ انتهى الخلل شنو اسوي؟ اضغط خلل مره ثانيه؟» — and his instinct was
 * right. Pressing it again IS the answer; what was missing is that the second
 * press had nowhere to go, so it wrote a second identical marker and nothing
 * downstream could tell which was the start.
 *
 * A marker is one of two shapes and the codebase only ever admitted one:
 *
 *   INSTANT  — clip, quote, highlight, cut, chapter.
 *              A point. One press is the whole fact.
 *   INTERVAL — break, tech_issue, retake.
 *              A stretch. Meaningless without both ends: an editor who knows a
 *              fault happened but not how long it lasted cannot cut it.
 *
 * `break` was already an interval, with two separate buttons for its two ends.
 * That works but asks the operator to remember which half to press. Keying the
 * pair here lets ONE button do both, and lets the UI show that the interval is
 * still open — which is the part that stops a double press from being
 * ambiguous.
 */
export const INTERVAL_MARKERS: Record<string, QuickMarkerType> = {
  tech_issue: "tech_issue_end",
  retake: "retake_end",
  break_start: "break_end",
}

/** The opening half of every interval pair. */
export const INTERVAL_OPENERS = Object.keys(INTERVAL_MARKERS) as QuickMarkerType[]

/** The closing half of every interval pair. */
export const INTERVAL_CLOSERS = Object.values(INTERVAL_MARKERS)

export function isIntervalOpener(t: string): boolean {
  return t in INTERVAL_MARKERS
}

export function isIntervalCloser(t: string): boolean {
  return (INTERVAL_CLOSERS as string[]).includes(t)
}

/** The closer that shuts a given opener, or null if the type is an instant. */
export function closerFor(t: string): QuickMarkerType | null {
  return INTERVAL_MARKERS[t] ?? null
}

/**
 * Which intervals are still OPEN, given the markers recorded so far.
 *
 * Pairs by walking the list in time order: an opener pushes, its closer pops.
 * Returns the still-unclosed opener for each type, so the UI can show the
 * button as live and count how long it has been running.
 *
 * NESTING IS NOT SUPPORTED, DELIBERATELY. Two overlapping tech faults is not a
 * thing anyone can act on in an edit, and allowing it would mean a second press
 * ambiguously closing either one. A second opener while one is open is treated
 * as "still the same problem" and ignored by the pairing.
 */
export function openIntervals(
  markers: { marker_type: string; net_recording_ms: number }[],
): Record<string, number> {
  const open: Record<string, number> = {}
  const ordered = [...markers].sort((a, b) => a.net_recording_ms - b.net_recording_ms)
  for (const m of ordered) {
    if (isIntervalOpener(m.marker_type)) {
      if (!(m.marker_type in open)) open[m.marker_type] = m.net_recording_ms
      continue
    }
    if (isIntervalCloser(m.marker_type)) {
      const opener = INTERVAL_OPENERS.find((o) => INTERVAL_MARKERS[o] === m.marker_type)
      if (opener) delete open[opener]
    }
  }
  return open
}

export const QUICK_MARKER_GROUPS: {
  key: QuickMarkerGroup
  label: string
  types: QuickMarkerType[]
}[] = [
  { key: "content", label: "محتوى للنشر", types: ["clip", "quote", "highlight"] },
  { key: "editing", label: "ملاحظات المونتاج", types: ["cut", "retake", "tech_issue"] },
  { key: "flow", label: "التدفّق والبنية", types: ["break_start", "break_end", "chapter"] },
]

/**
 * Director-facing subset for the live director marker bar — the operational +
 * clip flags a director calls during a take. Hosts get the full set; editors
 * read everything off the timeline in post.
 */
export const DIRECTOR_MARKER_TYPES: QuickMarkerType[] = [
  "break_start",
  "break_end",
  "retake",
  "cut",
  "tech_issue",
  "clip",
]

/** Membership test that accepts arbitrary strings (e.g. legacy DB rows). */
export function isQuickMarkerType(value: string): value is QuickMarkerType {
  return (QUICK_MARKER_TYPES as readonly string[]).includes(value)
}
