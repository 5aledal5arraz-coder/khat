/**
 * Shared constants + time formatting for the V2 recording cockpit.
 *
 * Kept in a leaf module (no React component imports) so both the cockpit
 * (live-v2-client) and the isolated high-frequency RecordingClock can import
 * the same marker styling + clock formatter without a circular dependency.
 */

import {
  Film,
  Quote,
  Star,
  Scissors,
  RotateCcw,
  AlertTriangle,
  Coffee,
  Play,
  Flag,
  Lightbulb,
  type LucideIcon,
} from "lucide-react"
import type { SectionKind } from "@/lib/preparation/v2/types"
import {
  QUICK_MARKER_TYPES,
  QUICK_MARKER_META,
  type QuickMarkerType,
} from "@/lib/recording-v2/marker-types"

export const SECTION_LABEL_AR: Record<SectionKind, string> = {
  opening: "افتتاحية",
  build_up: "بناء التوتر",
  conflict: "المواجهة",
  deep_dive: "الغوص العميق",
  emotional_peak: "الذروة العاطفية",
  resolution: "الخاتمة",
}

export interface MarkerStyle {
  label: string
  icon: LucideIcon
  /** Solid color for the timeline pin (Tailwind bg-*). */
  dot: string
  /** Text/border accent (Tailwind text-*). */
  text: string
  /** Soft background for chips/list rows. */
  soft: string
}

// Icon + colour layer over the canonical taxonomy (marker-types.ts). Keeping
// the strings here means the timeline pins, recent-markers list, quick-tag
// buttons, and director bar all render a given marker identically.
const MARKER_ICON: Record<QuickMarkerType, LucideIcon> = {
  clip: Film,
  quote: Quote,
  highlight: Star,
  cut: Scissors,
  retake: RotateCcw,
  tech_issue: AlertTriangle,
  break_start: Coffee,
  break_end: Play,
  chapter: Flag,
}

const MARKER_COLOR: Record<QuickMarkerType, { dot: string; text: string; soft: string }> = {
  clip: { dot: "bg-sky-500", text: "text-sky-700", soft: "bg-sky-500/10" },
  quote: { dot: "bg-violet-500", text: "text-violet-700", soft: "bg-violet-500/10" },
  highlight: { dot: "bg-amber-500", text: "text-amber-700", soft: "bg-amber-500/10" },
  cut: { dot: "bg-rose-500", text: "text-rose-700", soft: "bg-rose-500/10" },
  retake: { dot: "bg-orange-500", text: "text-orange-700", soft: "bg-orange-500/10" },
  tech_issue: { dot: "bg-red-600", text: "text-red-700", soft: "bg-red-500/10" },
  break_start: { dot: "bg-slate-500", text: "text-slate-700", soft: "bg-slate-500/10" },
  break_end: { dot: "bg-emerald-500", text: "text-emerald-700", soft: "bg-emerald-500/10" },
  chapter: { dot: "bg-indigo-500", text: "text-indigo-700", soft: "bg-indigo-500/10" },
}

/**
 * One visual identity per marker type, reused by the quick-tag buttons, the
 * recent-markers list, the director bar, and the timeline pins so a "quote"
 * looks the same everywhere it appears.
 */
// Cast is safe: every QUICK_MARKER_TYPE has an entry in MARKER_ICON +
// MARKER_COLOR above, and markerStyle() falls back for any unknown/legacy key.
// `insight_used` is a system marker (host deployed a support card live) — it is
// added explicitly so it renders with its own identity on the timeline + chips.
export const MARKER_STYLE: Record<string, MarkerStyle> = {
  ...(Object.fromEntries(
    QUICK_MARKER_TYPES.map((t) => [
      t,
      {
        label: QUICK_MARKER_META[t].label,
        icon: MARKER_ICON[t],
        dot: MARKER_COLOR[t].dot,
        text: MARKER_COLOR[t].text,
        soft: MARKER_COLOR[t].soft,
      } satisfies MarkerStyle,
    ]),
  ) as Record<string, MarkerStyle>),
  insight_used: {
    label: "إسناد",
    icon: Lightbulb,
    dot: "bg-teal-500",
    text: "text-teal-700",
    soft: "bg-teal-500/10",
  },
}

export function markerStyle(type: string): MarkerStyle {
  return (
    MARKER_STYLE[type] ?? {
      label: type,
      icon: Star,
      dot: "bg-muted-foreground",
      text: "text-muted-foreground",
      soft: "bg-muted/30",
    }
  )
}

/**
 * Date.now() wrapped at module scope. Component bodies must stay lint-pure
 * (react-hooks/purity forbids calling Date.now directly during render), so all
 * wall-clock reads for the timer go through these leaf helpers.
 */
export function nowMs(): number {
  return Date.now()
}

/** Current elapsed ms given a banked baseline + the live recording window. */
export function computeElapsedMs(
  baselineMs: number,
  windowStartedAt: number | null,
  live: boolean,
): number {
  if (live && windowStartedAt != null) {
    return baselineMs + Math.max(0, Date.now() - windowStartedAt)
  }
  return baselineMs
}

function pad(n: number): string {
  return n.toString().padStart(2, "0")
}

/** Split an elapsed-ms value into HH:MM:SS and centiseconds (00–99). */
export function clockParts(ms: number): { hms: string; cs: string } {
  const total = Math.max(0, ms)
  const s = Math.floor(total / 1000)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const cs = Math.floor((total % 1000) / 10)
  return { hms: `${pad(hh)}:${pad(mm)}:${pad(ss)}`, cs: pad(cs) }
}

/** "HH:MM:SS" — for compact contexts that don't need sub-second precision. */
export function formatHms(ms: number): string {
  return clockParts(ms).hms
}

/** "HH:MM:SS.cc" — full precision for marker timestamps. */
export function formatPrecise(ms: number): string {
  const { hms, cs } = clockParts(ms)
  return `${hms}.${cs}`
}

const NICE_MINUTES = [1, 2, 3, 5, 7, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300]

/**
 * Round a recorded-span (ms) up to the next "nice" minute mark, so a live
 * timeline scaled to the recording has stable marker positions + a little
 * headroom past the playhead, and only re-flows occasionally.
 */
export function niceScaleMs(recordedMs: number): number {
  const mins = Math.max(0, recordedMs) / 60_000
  for (const m of NICE_MINUTES) if (m > mins) return m * 60_000
  // Beyond the table: next whole hour STRICTLY greater (always leaves headroom,
  // even when the recording lands exactly on an hour boundary).
  return (Math.floor(mins / 60) + 1) * 60 * 60_000
}
