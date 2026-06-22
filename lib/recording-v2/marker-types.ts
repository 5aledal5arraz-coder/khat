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
] as const

export type QuickMarkerType = (typeof QUICK_MARKER_TYPES)[number]

/**
 * System markers are recorded automatically (not from the quick-tag UI) and
 * rendered specially. `energy_change` records every energy-dial change for the
 * timeline ribbon + CSV export + post analytics.
 */
export const SYSTEM_MARKER_TYPES = ["energy_change"] as const
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
