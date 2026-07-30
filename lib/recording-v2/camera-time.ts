/**
 * Camera time — deriving editor-facing timestamps from marker wall clocks.
 *
 * The recording room tracks TWO different clocks, and conflating them is the
 * bug this module exists to close:
 *
 *   • NET recording time (`room_session_markers.net_recording_ms`)
 *     Accumulated time the app spent `live`, EXCLUDING paused stretches. This
 *     is what the cockpit shows: the big timer, the timeline playhead, the pin
 *     positions. Correct for "how much episode do we have so far?".
 *
 *   • CAMERA time (derived here)
 *     Time elapsed on the wall clock since the take's first "ابدأ التسجيل".
 *     The camera keeps rolling through a pause, so THIS is the number that
 *     lines up with the camera file — and the only one an editor may be given.
 *
 * They agree until the first break, then diverge by the total paused duration,
 * and the gap only grows. A 3-break shoot exported on net time hands the editor
 * timestamps that are minutes off, silently.
 *
 * Pure functions only — no DB, no I/O, no React (same contract as
 * `lib/studio/project-stepper.ts`), so the arithmetic is unit-tested in
 * isolation and the callers stay thin.
 */

/** The per-take anchor row (`room_takes`), narrowed to what the math needs. */
export interface TakeAnchor {
  take_number: number
  /** Wall clock of the take's FIRST start. Never overwritten by pause/resume. */
  anchor_at: Date | string
  /** Manual sync correction; positive = camera rolled before we pressed start. */
  camera_offset_ms: number
}

/** A marker, narrowed to what the math needs. */
export interface MarkerWallClock {
  take_number: number
  wall_time: Date | string
}

function toMs(value: Date | string): number {
  return value instanceof Date ? value.getTime() : Date.parse(value)
}

/**
 * Index takes by `take_number` so a marker list can be mapped in one pass
 * instead of a linear scan per marker.
 */
export function buildTakeIndex(
  takes: readonly TakeAnchor[],
): Map<number, TakeAnchor> {
  const out = new Map<number, TakeAnchor>()
  for (const t of takes) out.set(t.take_number, t)
  return out
}

/**
 * Camera-time offset in ms for one marker, or `null` when it cannot be derived.
 *
 *   camera_ms = (wall_time − anchor_at) + camera_offset_ms
 *
 * Returns `null` — never a guessed 0 — when the take has no anchor row or
 * either timestamp is unparseable. A missing anchor is a real gap (e.g. a
 * marker written before this feature existed), and silently reporting it as
 * 00:00:00 would put a false cut at the head of the editor's timeline. Callers
 * must render the gap, not paper over it.
 *
 * The result may be NEGATIVE if a marker was somehow flagged before the take
 * started. That is not clamped here: clamping would hide a broken anchor behind
 * plausible-looking output. Export formatters are responsible for refusing to
 * emit a negative timecode.
 */
export function cameraMsForMarker(
  marker: MarkerWallClock,
  takes: Map<number, TakeAnchor>,
): number | null {
  const take = takes.get(marker.take_number)
  if (!take) return null

  const wall = toMs(marker.wall_time)
  const anchor = toMs(take.anchor_at)
  if (!Number.isFinite(wall) || !Number.isFinite(anchor)) return null

  return wall - anchor + take.camera_offset_ms
}

/**
 * Convenience: attach `camera_ms` to every marker in one pass. Keeps the
 * `buildTakeIndex` + per-marker lookup pairing in one place so no caller
 * reimplements it (and forgets the `null` case).
 */
export function withCameraMs<T extends MarkerWallClock>(
  markers: readonly T[],
  takes: readonly TakeAnchor[],
): (T & { camera_ms: number | null })[] {
  const index = buildTakeIndex(takes)
  return markers.map((m) => ({ ...m, camera_ms: cameraMsForMarker(m, index) }))
}
