/**
 * UX-3a — Episode Workspace tab definitions.
 *
 * Pure data: keys, labels, phase-availability rules, default-by-phase
 * mapping, and "is implemented yet?" flags. The page imports this so
 * tab-state logic stays out of the JSX.
 */

import type { EpisodePhase } from "@/lib/db/schema/eir"
import { studioDeepLink } from "./studio-href"

/**
 * UX-7 Phase E — IA reorganization.
 *
 * The future canonical 8-phase order is:
 *   intelligence · preparation · recording · transcript · chapters
 *     · clips · publish · performance
 *
 * Migration is incremental — `intelligence` aggregates the existing
 * overview/topic/guest content; `transcript` ships fully implemented
 * in UX-7; `chapters` and `clips` are placeholders that scaffold the
 * routing structure for UX-8/UX-9. The legacy `overview`, `topic`,
 * `guest`, and `studio` keys are retained so deep-linked URLs keep
 * resolving — the rendered nav order below puts the new IA up front
 * with the legacy keys behind a separator.
 */
export const TAB_KEYS = [
  "intelligence",
  "preparation",
  "recording",
  "transcript",
  "chapters",
  "clips",
  "publish",
  "performance",
  // Legacy keys preserved for deep-link safety + power-user access:
  "overview",
  "topic",
  "guest",
  "studio",
] as const
export type TabKey = (typeof TAB_KEYS)[number]

/**
 * Phase 6 — workflow phase groups. Reorganizes the 12-tab strip into
 * three operator-facing phases:
 *   • before  → قبل التسجيل   (overview, topic, guest, preparation, intelligence)
 *   • during  → أثناء التسجيل  (recording)
 *   • after   → بعد التسجيل والنشر  (studio, transcript, chapters, clips, publish, performance)
 *
 * Tabs keep their existing keys and deep-link URLs (`?tab=…`). Only the
 * visible grouping in the nav changes — operators get a 3-phase header
 * with sub-tabs underneath.
 */
export type PhaseGroup = "before" | "during" | "after"

export const PHASE_GROUP_LABEL: Record<PhaseGroup, string> = {
  before: "قبل التسجيل",
  during: "أثناء التسجيل",
  after: "بعد التسجيل والنشر",
}

export const PHASE_GROUP_ORDER: readonly PhaseGroup[] = [
  "before",
  "during",
  "after",
] as const

export interface TabDef {
  key: TabKey
  label_ar: string
  /** Lowest EIR phase at which the tab becomes "available" (not greyed out). */
  available_from: EpisodePhase
  /** UX-3a ships overview/topic/guest only. The rest are placeholders. */
  implemented: boolean
  /** Phase 6 — which of the three workflow phases this tab belongs to. */
  phase_group: PhaseGroup
  /**
   * If unimplemented, an optional legacy URL to send the operator to so
   * they don't get stuck. UX-3b replaces these with embedded surfaces.
   */
  legacy_fallback_href?: (eirId: string, links: {
    preparation_id: string | null
    studio_session_id: string | null
    studio_video_id: string | null
    episode_id: string | null
  }) => string | null
}

export const TABS: Record<TabKey, TabDef> = {
  intelligence: {
    key: "intelligence",
    label_ar: "الاستخبارات",
    available_from: "idea",
    phase_group: "before",
    // UX-7 ships as placeholder — nav element exists, rendering still
    // routes operators to the legacy overview/topic/guest tabs while
    // the merged surface is built.
    implemented: false,
    legacy_fallback_href: (eirId) =>
      `/admin/khat-brain/episodes/${eirId}?tab=overview`,
  },
  transcript: {
    key: "transcript",
    label_ar: "النصّ",
    available_from: "recorded",
    phase_group: "after",
    implemented: true,
    legacy_fallback_href: (_eirId, links) =>
      links.studio_session_id
        ? studioDeepLink(links.studio_video_id)
        : null,
  },
  chapters: {
    key: "chapters",
    label_ar: "الفصول",
    available_from: "recorded",
    phase_group: "after",
    implemented: true,
    legacy_fallback_href: (_eirId, links) =>
      links.studio_session_id
        ? studioDeepLink(links.studio_video_id)
        : null,
  },
  clips: {
    key: "clips",
    label_ar: "المقاطع",
    available_from: "recorded",
    phase_group: "after",
    implemented: true,
    legacy_fallback_href: (_eirId, links) =>
      links.studio_session_id
        ? studioDeepLink(links.studio_video_id)
        : null,
  },
  overview: {
    key: "overview",
    label_ar: "نظرة عامة",
    available_from: "idea",
    phase_group: "before",
    implemented: true,
  },
  topic: {
    key: "topic",
    label_ar: "الموضوع",
    available_from: "idea",
    phase_group: "before",
    implemented: true,
  },
  guest: {
    key: "guest",
    label_ar: "الضيف",
    available_from: "guest_discovery",
    phase_group: "before",
    implemented: true,
  },
  preparation: {
    key: "preparation",
    label_ar: "الإعداد",
    available_from: "approved",
    phase_group: "before",
    implemented: true,
    // Kept for the rare in-tab fallback (e.g. when prep_v2 is missing).
    legacy_fallback_href: (_eirId, links) =>
      links.preparation_id
        ? `/admin/preparation/${links.preparation_id}?legacy=1`
        : null,
  },
  recording: {
    key: "recording",
    label_ar: "التسجيل",
    available_from: "ready_to_record",
    phase_group: "during",
    implemented: true,
    legacy_fallback_href: (_eirId, links) =>
      links.preparation_id
        ? `/admin/preparation/${links.preparation_id}?legacy=1`
        : null,
  },
  studio: {
    key: "studio",
    label_ar: "الاستوديو",
    available_from: "recorded",
    phase_group: "after",
    implemented: true,
    legacy_fallback_href: (_eirId, links) =>
      links.studio_session_id
        ? studioDeepLink(links.studio_video_id)
        : null,
  },
  publish: {
    key: "publish",
    label_ar: "النشر",
    available_from: "ready_to_publish",
    phase_group: "after",
    implemented: true,
    legacy_fallback_href: (_eirId, links) =>
      links.episode_id ? `/admin/episodes/${links.episode_id}` : null,
  },
  performance: {
    key: "performance",
    label_ar: "الأداء",
    available_from: "published",
    phase_group: "after",
    implemented: true,
    legacy_fallback_href: () => "/admin/analytics",
  },
}

/**
 * Phase 6 — derives which workflow phase group (before / during / after)
 * the EIR is currently in. Used to highlight the right phase header in
 * the workspace nav.
 */
export function currentPhaseGroup(phase: EpisodePhase): PhaseGroup {
  switch (phase) {
    case "idea":
    case "guest_discovery":
    case "guest_assigned":
    case "approved":
    case "researching":
    case "prepared":
      return "before"
    case "ready_to_record":
    case "recording":
      return "during"
    case "recorded":
    case "producing":
    case "ready_to_publish":
    case "published":
    case "analyzing":
    case "learned":
    case "archived":
    default:
      return "after"
  }
}

const PHASE_ORDER: EpisodePhase[] = [
  "idea",
  "guest_discovery",
  "guest_assigned",
  "approved",
  "researching",
  "prepared",
  "ready_to_record",
  "recording",
  "recorded",
  "producing",
  "ready_to_publish",
  "published",
  "analyzing",
  "learned",
  "archived",
]

function phaseAtLeast(actual: EpisodePhase, threshold: EpisodePhase): boolean {
  return PHASE_ORDER.indexOf(actual) >= PHASE_ORDER.indexOf(threshold)
}

export type TabStatus = "available" | "current" | "upcoming" | "unavailable"

/**
 * Compute the UI state for every tab given the current EIR phase + the
 * URL's selected tab. "available" means past the threshold; "current"
 * is the active selection; "upcoming" is past the threshold but not the
 * default; "unavailable" is below the threshold (greyed out).
 */
export function computeTabStates(
  phase: EpisodePhase,
  selected: TabKey,
): Record<TabKey, TabStatus> {
  const out = {} as Record<TabKey, TabStatus>
  for (const key of TAB_KEYS) {
    const def = TABS[key]
    const reached = phaseAtLeast(phase, def.available_from)
    if (key === selected) {
      out[key] = "current"
    } else if (reached) {
      out[key] = "available"
    } else {
      out[key] = "unavailable"
    }
  }
  return out
}

/**
 * The default tab when the URL doesn't carry one. UX-3b widens the
 * mapping so every phase lands on the right tab.
 */
export function defaultTabForPhase(phase: EpisodePhase): TabKey {
  switch (phase) {
    case "idea":
      return "topic"
    case "guest_discovery":
      return "guest"
    case "guest_assigned":
    case "approved":
    case "researching":
    case "prepared":
      return "preparation"
    case "ready_to_record":
    case "recording":
      return "recording"
    case "recorded":
    case "producing":
      return "studio"
    case "ready_to_publish":
      return "publish"
    case "published":
    case "analyzing":
    case "learned":
      return "performance"
    case "archived":
    default:
      return "overview"
  }
}

export function parseTabKey(value: unknown): TabKey | null {
  return typeof value === "string" && (TAB_KEYS as readonly string[]).includes(value)
    ? (value as TabKey)
    : null
}
