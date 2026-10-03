/**
 * Duration classification (Decision 2 / B1). Pure.
 *
 *   >= 1200 s  → core_longform
 *   480–1199 s → midform_context
 *   < 480 s    → short_clip
 */
import type { PodcastDurationClass } from "@/lib/db/schema/podcast-universe"
import { CORE_LONGFORM_MIN_SECONDS, MIDFORM_MIN_SECONDS } from "./constants"

export function durationClass(seconds: number): PodcastDurationClass {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  if (s >= CORE_LONGFORM_MIN_SECONDS) return "core_longform"
  if (s >= MIDFORM_MIN_SECONDS) return "midform_context"
  return "short_clip"
}

/**
 * ISO-8601 duration as YouTube returns it (`PT1H2M3S`, `P1DT2H`, `P0D` for an
 * upcoming live) → seconds. Returns null for a string it cannot read, so a
 * malformed value is never silently filed as a 0-second clip.
 */
export function parseIsoDuration(iso: string | null | undefined): number | null {
  if (!iso) return null
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso.trim())
  if (!m) return null
  const [, d, h, mi, s] = m
  return (
    Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(mi ?? 0) * 60 + Math.floor(Number(s ?? 0))
  )
}
