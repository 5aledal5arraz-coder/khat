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
/**
 * Canonical tab list. Membership drives validation (`parseTabKey`) and the
 * per-tab state map; ORDER drives the nav strip, which renders
 * `TAB_KEYS.filter(phase_group === g)` group by group.
 *
 * The order below is workflow order, and it now matches the phase-group
 * comment further down that always claimed to describe it. Previously the
 * "legacy" keys were parked at the end of the array, so the قبل-التسجيل group
 * rendered «الإعداد» and «الذكاء» BEFORE «نظرة عامة / الموضوع / الضيف» — the
 * operator was offered the preparation tab before the screens that produce
 * what the preparation is built from.
 */
export const TAB_KEYS = [
  // before — قبل التسجيل
  "overview",
  "topic",
  "guest",
  "preparation",
  "intelligence",
  // during — أثناء التسجيل
  "recording",
  // after — بعد التسجيل والنشر
  "studio",
  "transcript",
  "chapters",
  "clips",
  "publish",
  "performance",
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

/**
 * Has this EIR reached the phase at which `key` becomes available?
 *
 * Exported because the phase gate has to be enforced in TWO places and both
 * must agree: `computeTabStates` greys the tab out in the nav, and the page
 * refuses to render its body. Deriving both from this one predicate is what
 * keeps them from drifting apart.
 */
export function isTabReached(phase: EpisodePhase, key: TabKey): boolean {
  return phaseAtLeast(phase, TABS[key].available_from)
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
    // Phase availability is checked FIRST and wins. The previous order tested
    // `key === selected` first, which meant a deep link to a tab the EIR had
    // not reached (`?tab=publish` on an `idea` EIR) relabelled that tab
    // "current" — the gate opened for whichever tab the URL asked for, which
    // is the exact input an unauthorised operator controls.
    if (!isTabReached(phase, key)) {
      out[key] = "unavailable"
    } else if (key === selected) {
      out[key] = "current"
    } else {
      out[key] = "available"
    }
  }
  return out
}

/**
 * Resolve the tab to actually render from the URL's `?tab=` value.
 *
 * `computeTabStates` only governs how the nav LOOKS. The page body is
 * switched on the resolved key alone, so without this clamp a request for an
 * unreached tab still rendered that tab's full editor — greyed out in the nav
 * and fully interactive underneath it. An unreached request falls back to
 * `defaultTabForPhase`, which is guaranteed reached (asserted in
 * `tests/khat-brain/tab-phase-gate.test.ts`).
 */
export function resolveSelectedTab(
  phase: EpisodePhase,
  rawTab: unknown,
): TabKey {
  const requested = parseTabKey(rawTab)
  if (requested && isTabReached(phase, requested)) return requested
  return defaultTabForPhase(phase)
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
    // `guest_assigned` used to land on `preparation`, but preparation is gated
    // at `approved` — so the default sent the operator to a tab the same file
    // declares unreached. Harmless while the gate was cosmetic; once the gate
    // is enforced it means landing on a tab the nav greys out. The guest tab
    // is both reached and the obviously right screen for "a guest was just
    // assigned". `defaultTabForPhase` must return a reached tab for EVERY
    // phase — that invariant is asserted in tab-phase-gate.test.ts.
    case "guest_assigned":
      return "guest"
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
