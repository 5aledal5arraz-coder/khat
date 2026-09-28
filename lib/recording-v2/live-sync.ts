/**
 * Pure derivations for the host's on-air cockpit.
 *
 * Everything here is a function of data the room already has — no React, no
 * clock of its own (`now`/elapsed are passed in), no DB — so each rule the
 * cockpit depends on is unit-testable without a browser. The cockpit
 * (live-v2-client.tsx / onair-view.tsx) only wires these to state.
 */

import type { PrepV2Question, PrepV2Section, SectionKind } from "@/lib/preparation/v2/types"

// ─── Transport state from the room row ────────────────────────────────

export type RoomStatus = "waiting" | "live" | "paused" | "ended"

export interface TransportState {
  status: RoomStatus
  /** Banked NET ms (pauses excluded) up to the start of the current window. */
  elapsedMsAtBaseline: number
  /** Wall-clock ms the current live window opened, or null when not live. */
  windowStartedAt: number | null
}

/**
 * The host's clock, derived from the SHARED room row.
 *
 * The host used to keep this purely local and only ever read `energy_level`
 * off the room broadcast. So when the director started the take from his
 * checklist, the host's screen stayed on «قبل البدء»; and when the host then
 * pressed start himself, the server answered `already_started` while his
 * cockpit set its clock to 0 — a clock minutes behind everyone else's. The
 * same gap left a second device of the host's permanently out of step.
 *
 * Same formula as the director's clock and the server's own `pauseTimer`, so
 * every screen reads one number.
 */
export function transportFromRoom(room: {
  status: string
  recording_elapsed_ms: number | null | undefined
  recording_started_at: string | null | undefined
  recording_paused_at: string | null | undefined
}): TransportState {
  const status: RoomStatus =
    room.status === "live" || room.status === "paused" || room.status === "ended"
      ? room.status
      : "waiting"
  const started = room.recording_started_at ? Date.parse(room.recording_started_at) : NaN
  const windowStartedAt =
    status === "live" && !room.recording_paused_at && Number.isFinite(started) ? started : null
  return {
    status,
    elapsedMsAtBaseline: Math.max(0, room.recording_elapsed_ms ?? 0),
    windowStartedAt,
  }
}

/**
 * Should an incoming room row replace local state?
 *
 * Optimistic local state wins only while one of the host's own requests is
 * still in flight; after that the server row is the truth. A row OLDER than
 * the last one applied is ignored, so a late SSE event cannot rewind a fresher
 * action result.
 */
export function shouldApplyRoomRow(opts: {
  pendingOps: number
  incomingUpdatedAt: string | null | undefined
  lastAppliedUpdatedAt: string | null
}): boolean {
  if (opts.pendingOps > 0) return false
  if (!opts.incomingUpdatedAt || !opts.lastAppliedUpdatedAt) return true
  return Date.parse(opts.incomingUpdatedAt) >= Date.parse(opts.lastAppliedUpdatedAt)
}

/**
 * What the transport should read once a host action has answered.
 *
 *   • failed (threw, or returned `ok: false`) → the state from BEFORE the
 *     optimistic flip. Pause and end used to flip the screen and never look
 *     back, so a pause the server rejected left the host's clock frozen on a
 *     take that was still running;
 *   • succeeded with the broadcast row → that row, the same one every other
 *     screen just received;
 *   • succeeded without a row → keep the optimistic state (`state: null`).
 */
export function transportAfterAction(
  before: TransportState,
  result: { ok: boolean; room?: Parameters<typeof transportFromRoom>[0] | null } | null,
): { failed: boolean; state: TransportState | null } {
  if (!result || !result.ok) return { failed: true, state: before }
  if (result.room) return { failed: false, state: transportFromRoom(result.room) }
  return { failed: false, state: null }
}

// ─── Section identity ─────────────────────────────────────────────────

/**
 * Where a section KEY sits in the (possibly just-edited) section list.
 *
 * The cockpit used to track the current section by INDEX only. A live prep
 * edit that reordered or removed a section therefore silently moved the host
 * into a different section. The key is the identity; the index is derived, and
 * only if the key vanished do we fall back to the clamped index.
 */
export function sectionIndexFor(
  sections: ReadonlyArray<Pick<PrepV2Section, "kind">> | null,
  key: SectionKind | string | null,
  fallbackIndex: number,
): number {
  if (!sections || sections.length === 0) return 0
  const byKey = key ? sections.findIndex((s) => s.kind === key) : -1
  if (byKey >= 0) return byKey
  return Math.max(0, Math.min(sections.length - 1, fallbackIndex))
}

// ─── Must-ask coverage ────────────────────────────────────────────────

/** «أساسي» questions of a section that have not been marked asked. */
export function unaskedMustAsk<Q extends Pick<PrepV2Question, "id" | "section" | "priority">>(
  questions: Q[],
  section: SectionKind | string | null,
  completed: Set<string>,
): Q[] {
  if (!section) return []
  return questions.filter(
    (q) => q.section === section && q.priority === "must_ask" && !completed.has(q.id),
  )
}

// ─── Time in section ──────────────────────────────────────────────────

export interface SectionTime {
  /** Whole seconds spent in the section. */
  elapsedSec: number
  /** Planned length, whole minutes (null when the prep carries none). */
  plannedMin: number | null
  /** At or past 100% of the plan. */
  over: boolean
  /** Whole minutes past the plan (0 when not over). */
  overMin: number
}

export function sectionTime(elapsedMs: number, estimatedMinutes: number | null | undefined): SectionTime {
  const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000))
  const plannedMin =
    typeof estimatedMinutes === "number" && estimatedMinutes > 0 ? Math.round(estimatedMinutes) : null
  const over = plannedMin != null && elapsedSec >= plannedMin * 60
  const overMin = over && plannedMin != null ? Math.floor((elapsedSec - plannedMin * 60) / 60) : 0
  return { elapsedSec, plannedMin, over, overMin }
}

/** "m:ss" for a section timer (no hours: a section is minutes long). */
export function formatMinSec(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

// ─── Sensitive zone for a sensitive question ──────────────────────────

const ARABIC_STOPWORDS = new Set([
  "في", "من", "على", "عن", "الى", "إلى", "مع", "هل", "ما", "وش", "لا", "هذا", "هذه", "اللي",
  "كان", "كيف", "ليش", "لماذا", "أو", "او", "ثم", "قبل", "بعد", "عند", "كل",
])

/**
 * Rough Arabic stem for word overlap: unify hamza seats and tā' marbūṭa, drop
 * one leading particle/article and one trailing possessive, so «شركاؤك» and
 * «الشركاء» meet at «شركاء». Deliberately crude — it only has to pick which
 * of a handful of zone lines to show.
 */
function stem(w: string): string {
  let x = w
    .replace(/[أإآ]/g, "ا")
    .replace(/[ؤئ]/g, "ء")
    .replace(/ة$/, "ه")
    .replace(/^(وال|فال|بال|لل|ال|و|ف|ب|ل)(?=.{3,})/, "")
  if (x.length >= 5) x = x.replace(/(هم|ها|نا|كم|ك|ه|ي)$/, "")
  return x
}

function words(s: string): string[] {
  return s
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => !ARABIC_STOPWORDS.has(w))
    .map(stem)
    .filter((w) => w.length >= 3)
}

/**
 * The ONE sensitive-zone line worth showing beside a question marked حسّاس.
 *
 * Prefers a zone that shares a word with the question (after stripping the
 * common one-letter prefixes and «ال»); otherwise the first zone — for a
 * question already flagged high-risk, a general reminder beats silence.
 */
export function relevantSensitiveZone(questionText: string, zones: string[] | null | undefined): string | null {
  const list = (zones ?? []).map((z) => z.trim()).filter(Boolean)
  if (list.length === 0) return null
  const q = new Set(words(questionText))
  const hit = list.find((z) => words(z).some((w) => q.has(w)))
  return hit ?? list[0]
}

// ─── Hero pin ─────────────────────────────────────────────────────────

/**
 * Was the pinned question's text changed under the host (a live prep edit)?
 *
 * The pin keeps the SAME question on screen across a re-rank; what it cannot
 * do is stop the question's wording from being edited from the prep page. That
 * change used to swap silently in front of a host reading it aloud — now it is
 * named with a quiet chip.
 */
export function pinnedQuestionEdited(
  pin: { id: string; text: string } | null,
  displayed: { id: string; text: string } | null,
): boolean {
  return !!pin && !!displayed && pin.id === displayed.id && pin.text !== displayed.text
}

// ─── Keyboard shortcuts (Bluetooth keyboard / clicker) ────────────────

export type ShortcutAction = "asked" | "flag" | "transport" | "next" | "prev" | "legend"

/**
 * Key → cockpit action. There is DELIBERATELY no key for «إنهاء»: ending a take
 * is irreversible and must stay a two-step touch.
 */
export function shortcutFor(key: string): ShortcutAction | null {
  switch (key) {
    case " ":
    case "Spacebar":
      return "asked"
    case "m":
    case "M":
    case "ة": // same physical key on an Arabic layout
      return "flag"
    case "p":
    case "P":
    case "ح":
      return "transport"
    case "n":
    case "N":
    case "ى":
      return "next"
    case "b":
    case "B":
    case "لا":
      return "prev"
    case "?":
    case "؟":
      return "legend"
    default:
      return null
  }
}

/** True when a keystroke belongs to a text field, not to the cockpit. */
export function isTypingTarget(el: unknown): boolean {
  if (!el || typeof el !== "object") return false
  const e = el as { tagName?: string; isContentEditable?: boolean; type?: string }
  const tag = (e.tagName ?? "").toUpperCase()
  if (e.isContentEditable) return true
  if (tag === "TEXTAREA" || tag === "SELECT") return true
  if (tag === "INPUT") {
    const t = (e.type ?? "text").toLowerCase()
    return !["button", "checkbox", "radio", "submit", "reset", "range"].includes(t)
  }
  return false
}
