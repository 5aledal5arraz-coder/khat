/**
 * Marker export formatting — CMX3600 EDL for DaVinci Resolve.
 *
 * Pure functions only (no DB, no I/O), same contract as `camera-time.ts`, so
 * every rule below is unit-tested without a database.
 *
 * ─── Why TWO export formats, not one ──────────────────────────────────────
 *
 * **Resolve does not support UTF-8 in EDL files.** Non-Latin marker text is
 * dropped on import, and the failure is SILENT: the markers land at the right
 * timecodes with empty labels. Verified 2026-07-30 against HDHEAD's Avid→Resolve
 * converter notes (hdhead.com/?p=866: "Resolve does not support UTF-8 encoding in
 * EDL files. Any Unicode characters in the original marker file are lost on
 * import.") and corroborated by the Blackmagic forum thread "[Solved] Import
 * Markers from EDL i18n" (f=21&t=157213).
 *
 * Every note our team writes is Arabic. So the two formats split the job instead
 * of competing:
 *
 *   • EDL → POSITION + English marker type + colour. Import puts the flags on
 *     the timeline where they belong.
 *   • CSV → the same timings PLUS the full Arabic notes, which CSV handles fine.
 *
 * Each EDL marker carries an index (`quote 7`) matching the «رقم العلامة» column
 * in the CSV, so the editor jumps from a flag on the timeline to its row.
 *
 * ─── Format rules, all source-verified 2026-07-30 ─────────────────────────
 *
 * Shape (from real Resolve exports, e.g. diecknet/DavinciTimestamp
 * tests/Testdata/Timeline.edl and chrisspiegl/chaptered):
 *
 *     TITLE: <ascii title>
 *     FCM: NON-DROP FRAME
 *
 *     001  001      V     C        01:00:00:00 01:00:00:01 01:00:00:00 01:00:00:01
 *      |C:ResolveColorBlue |M:Intro |D:1
 *
 *   - Four timecodes: src-in, src-out, rec-in, rec-out. For a point marker all
 *     four are the same in/out pair, out = in + 1 frame.
 *   - Text BEFORE `|C:` becomes the marker's NOTE; the tokens then follow in the
 *     order `|C:` `|M:` `|D:`. All three appear in every real file observed, so
 *     we always emit all three.
 *   - `|D:1` = a one-frame point marker.
 *
 * THE ONE-HOUR OFFSET IS NOT COSMETIC: Resolve's default timeline start timecode
 * is 01:00:00:00. A marker written at 00:00:xx:xx lands an hour before the
 * timeline starts and silently does not show up. Our offsets are relative to
 * zero, so every timecode is shifted by +1h.
 */

import { QUICK_MARKER_META } from "./marker-types"

// ─── Frame rate ─────────────────────────────────────────────────────────────

/**
 * Frames per second used to build EDL timecode. 24 non-drop — the rate خط
 * shoots at. It is a required input, not a preference: `HH:MM:SS:FF` cannot be
 * computed from milliseconds without it, and a mismatch against the Resolve
 * project's rate skews every marker progressively.
 */
export const EDL_FPS = 24

/** Resolve's default timeline start (1 hour) in ms. See the module header. */
export const EDL_TIMELINE_START_MS = 3_600_000

// ─── Colours ────────────────────────────────────────────────────────────────

/**
 * Resolve's complete marker-colour vocabulary — exactly 16 names, TitleCase,
 * concatenated onto `ResolveColor` with no separator.
 *
 * Verified 2026-07-30 across three independent generators that Resolve accepts
 * (suroh1994/twitch-marker-to-edl `edl.go`, AlexDeveloperUwU/clipperino
 * `js/edlExporter.js`, X-Raym's REAPER→Resolve exporter) and cross-checked
 * against real `.edl` files in the wild.
 *
 * ⚠️ Blackmagic documents NONE of this — not the token, not the list. And no
 * source establishes what Resolve does with an unrecognised colour name (silent
 * drop? default? skip the whole event?). So this list is a closed allowlist: we
 * never emit a name that is not in it, and `resolveColorFor` is exhaustive by
 * construction rather than falling back to an unverified string.
 */
export const RESOLVE_MARKER_COLORS = [
  "Blue",
  "Cyan",
  "Green",
  "Yellow",
  "Red",
  "Pink",
  "Purple",
  "Fuchsia",
  "Rose",
  "Lavender",
  "Sky",
  "Mint",
  "Lemon",
  "Sand",
  "Cocoa",
  "Cream",
] as const

export type ResolveMarkerColor = (typeof RESOLVE_MARKER_COLORS)[number]

/**
 * Our marker taxonomy → the nearest VALID Resolve colour.
 *
 * The cockpit palette (`MARKER_COLOR` in recording-shared.ts) is Tailwind, whose
 * names only partly overlap Resolve's 16. Each mismatch is resolved explicitly
 * below — no silent nearest-match, because a wrong name may fail the line.
 *
 *   clip        sky     → Sky      exact
 *   quote       violet  → Purple   Resolve has no "Violet"; Purple is the closest hue
 *   highlight   amber   → Yellow   no "Amber"; Yellow is the nearest warm bright
 *   cut         rose    → Rose     exact
 *   retake      orange  → Sand     no "Orange"; Sand is the nearest warm tone that
 *                                  stays distinct from cut(Rose) + tech_issue(Red)
 *   tech_issue  red     → Red      exact
 *   break_start slate   → Cocoa    no neutral grey exists; Cocoa is the muted
 *                                  option and pairs visually with break_end
 *   break_end   emerald → Green    emerald ≈ Green
 *   chapter     indigo  → Blue     no "Indigo"; Blue is the nearest
 *   energy_change       → Lavender system marker, kept off the content hues
 *   insight_used teal   → Cyan     teal ≈ Cyan
 */
const MARKER_TYPE_COLOR: Record<string, ResolveMarkerColor> = {
  clip: "Sky",
  quote: "Purple",
  highlight: "Yellow",
  cut: "Rose",
  retake: "Sand",
  tech_issue: "Red",
  break_start: "Cocoa",
  break_end: "Green",
  chapter: "Blue",
  energy_change: "Lavender",
  insight_used: "Cyan",
  episode_started: "Mint",
}

/**
 * Colour for a marker type. Unknown/legacy values get `Cream` — a real name from
 * the verified list, deliberately unused by any mapping above, so a legacy row
 * still imports AND stands out as "unclassified" rather than masquerading as a
 * content flag.
 */
export function resolveColorFor(markerType: string): ResolveMarkerColor {
  return MARKER_TYPE_COLOR[markerType] ?? "Cream"
}

// ─── Timecode ───────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return n.toString().padStart(2, "0")
}

/** ms → whole frames at `fps`, rounded to the nearest frame. */
export function msToFrames(ms: number, fps: number = EDL_FPS): number {
  return Math.round((ms / 1000) * fps)
}

/**
 * Frames → `HH:MM:SS:FF` non-drop. Hours wrap at 24 (a timecode has no field
 * for days, and 24h of footage is not a case worth inventing syntax for).
 */
export function framesToTimecode(frames: number, fps: number = EDL_FPS): string {
  const total = Math.max(0, Math.round(frames))
  const ff = total % fps
  const totalSeconds = Math.floor(total / fps)
  const ss = totalSeconds % 60
  const mm = Math.floor(totalSeconds / 60) % 60
  const hh = Math.floor(totalSeconds / 3600) % 24
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}:${pad2(ff)}`
}

/** ms offset → EDL timecode, including Resolve's 1-hour timeline start. */
export function msToEdlTimecode(
  ms: number,
  fps: number = EDL_FPS,
  timelineStartMs: number = EDL_TIMELINE_START_MS,
): string {
  return framesToTimecode(msToFrames(ms + timelineStartMs, fps), fps)
}

// ─── Sanitising ─────────────────────────────────────────────────────────────

/**
 * Make a value safe to place inside an EDL comment line.
 *
 * **EDL has no quoting mechanism at all.** Unlike CSV — where `csvCell()` can
 * wrap and escape — there is nowhere to hide a newline. So this does not quote;
 * it REMOVES. Specifically:
 *
 *   1. `[\r\n]+` → a single space. A raw newline in a note would end the comment
 *      line and let the rest of the note be parsed as EDL: an attacker (or an
 *      operator pasting multi-line text) could inject a fake `002  001  V  C …`
 *      event or a `* FROM CLIP NAME:` directive that Resolve reads as genuine.
 *   2. `|` stripped — it is the token delimiter, so a `|` inside a note could
 *      fabricate a `|C:`/`|M:`/`|D:` token.
 *   3. A leading `*` or digit is prefixed with `-`. A line starting with `*` is
 *      an EDL comment directive and a line starting with an event number is an
 *      event; either can distort the timeline. (The note text sits at the START
 *      of the comment line, which is what makes this reachable.)
 *   4. Non-ASCII dropped. Resolve loses it anyway (see module header) — dropping
 *      it here keeps the file honestly ASCII instead of shipping bytes that
 *      silently vanish. The Arabic lives in the CSV.
 *   5. Collapse runs of whitespace and truncate. EDL lines are historically
 *      width-limited and an unbounded note has no business in a cut list.
 */
export function sanitizeEdlField(value: unknown, maxLength = 64): string {
  if (value == null) return ""
  let s = String(value)
  s = s.replace(/[\r\n]+/g, " ") // (1) never let a note break the line
  s = s.replace(/\|/g, "") // (2) never let a note forge a token
  s = s.replace(/[^\x20-\x7E]/g, "") // (4) ASCII printable only
  s = s.replace(/\s+/g, " ").trim() // (5) collapse
  if (/^[*\d]/.test(s)) s = "-" + s // (3) never let a note look structural
  if (s.length > maxLength) s = s.slice(0, maxLength).trimEnd()
  return s
}

// ─── EDL build ──────────────────────────────────────────────────────────────

export interface EdlMarkerInput {
  /** Camera-time offset in ms from the take anchor. Null = not derivable. */
  camera_ms: number | null
  marker_type: string
  /** 1-based index shared with the CSV's «رقم العلامة» column. */
  index: number
  section_key?: string | null
}

export interface BuildEdlOptions {
  title: string
  markers: readonly EdlMarkerInput[]
  fps?: number
  timelineStartMs?: number
}

export interface BuildEdlResult {
  edl: string
  /** Events actually written. */
  written: number
  /**
   * Markers deliberately left OUT, with why. Never silently dropped: the caller
   * surfaces these so the editor knows the EDL is not the whole story.
   *   - "no_camera_time": the take has no anchor, so there is no timeline position.
   *   - "before_timeline_start": camera time is negative (broken anchor); such a
   *     marker would land before 01:00:00:00 and vanish without a trace.
   */
  skipped: { index: number; reason: "no_camera_time" | "before_timeline_start" }[]
}

/**
 * Build a CMX3600 EDL of point markers for Resolve.
 *
 * Deliberately NOT a general EDL writer — this emits marker events only, which
 * is the one thing Resolve's "Import > Timeline Markers from EDL" reads.
 */
export function buildResolveMarkerEdl(opts: BuildEdlOptions): BuildEdlResult {
  const fps = opts.fps ?? EDL_FPS
  const timelineStartMs = opts.timelineStartMs ?? EDL_TIMELINE_START_MS

  const title = sanitizeEdlField(opts.title, 64) || "KHAT markers"
  const out: string[] = [`TITLE: ${title}`, "FCM: NON-DROP FRAME", ""]
  const skipped: BuildEdlResult["skipped"] = []
  let event = 0

  for (const m of opts.markers) {
    if (m.camera_ms == null) {
      skipped.push({ index: m.index, reason: "no_camera_time" })
      continue
    }
    if (m.camera_ms < 0) {
      skipped.push({ index: m.index, reason: "before_timeline_start" })
      continue
    }

    event += 1
    const inFrames = msToFrames(m.camera_ms + timelineStartMs, fps)
    const tcIn = framesToTimecode(inFrames, fps)
    const tcOut = framesToTimecode(inFrames + 1, fps)
    const num = String(event).padStart(3, "0")

    // The `|M:` name: English type key + the CSV row index. Only characters
    // verified safe in real Resolve imports (letters, digits, spaces, `_`).
    // NOT `#` — no source confirms Resolve accepts it in this field, and an
    // unverified character here fails silently, so the label just reads
    // "quote 7" against the CSV's «رقم العلامة» = 7.
    const typeKey = sanitizeEdlField(m.marker_type, 24) || "marker"
    const name = `${typeKey} ${m.index}`

    // Note field (before `|C:`) — the section, so the editor gets structural
    // context on the timeline itself. Arabic notes stay in the CSV.
    const section = sanitizeEdlField(m.section_key, 24)
    const note = section ? `${section} - see CSV ${m.index}` : `see CSV ${m.index}`

    out.push(`${num}  001      V     C        ${tcIn} ${tcOut} ${tcIn} ${tcOut}`)
    out.push(` ${note} |C:ResolveColor${resolveColorFor(m.marker_type)} |M:${name} |D:1`)
    out.push("")
  }

  return { edl: out.join("\r\n"), written: event, skipped }
}

/** Arabic label for a marker type, shared by both exports. */
export function markerTypeLabelAr(markerType: string): string {
  if (markerType === "energy_change") return "تغيّر الطاقة"
  if (markerType === "insight_used") return "إسناد مُستخدم"
  if (markerType === "episode_started") return "بدء التسجيل"
  const meta = QUICK_MARKER_META[markerType as keyof typeof QUICK_MARKER_META] as
    | (typeof QUICK_MARKER_META)[keyof typeof QUICK_MARKER_META]
    | undefined
  return meta?.label ?? markerType
}
