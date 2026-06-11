/**
 * Phase 2.5 (P2.5.b) — pure display formatters for the ops dashboard.
 *
 * No I/O. No React. Easy to unit-test. Used exclusively by the
 * server components under `app/admin/ops/`.
 *
 * Per operator decision §11 of the P2.5.b plan:
 *   • Western digits (not Arabic-Indic) for technical readability.
 *   • Hybrid time: absolute UTC for snapshot timestamps, relative
 *     Arabic age labels for record ages.
 */

// ─── Timestamp formatting ────────────────────────────────────────────

/**
 * Format a Date as a fixed UTC string the operator can paste-and-share
 * unambiguously. No locale conversion, no DST surprises.
 *
 * Example: 2026-05-26T14:23:45.000Z → "2026-05-26 14:23:45Z"
 */
export function formatUtc(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—"
  const iso = d.toISOString()
  // "2026-05-26T14:23:45.000Z" → "2026-05-26 14:23:45Z"
  return iso.slice(0, 10) + " " + iso.slice(11, 19) + "Z"
}

// ─── Age humanization (Arabic) ───────────────────────────────────────

const AR_LESS_THAN_SECOND = "أقل من ثانية"
const AR_FUTURE = "في المستقبل"

/**
 * Arabic-pluralized age. Examples:
 *   500    → "أقل من ثانية"
 *   1_000  → "منذ ثانية واحدة"
 *   2_000  → "منذ ثانيتين"
 *   12_000 → "منذ 12 ثانية"
 *   60_000 → "منذ دقيقة واحدة"
 *   90_000 → "منذ دقيقة واحدة"   (rounded down to 1m)
 *   12 * 60_000 → "منذ 12 دقيقة"
 *   3600_000    → "منذ ساعة واحدة"
 *   2 * 3600_000 → "منذ ساعتين"
 *   86_400_000   → "منذ يوم واحد"
 *   2 * 86_400_000 → "منذ يومين"
 *   5 * 86_400_000 → "منذ 5 أيام"
 *
 * Negative durations (future timestamps) return a placeholder rather
 * than nonsense — should be rare but handles clock-skew gracefully.
 */
export function humanizeAge(ms: number): string {
  if (!Number.isFinite(ms)) return "—"
  if (ms < 0) return AR_FUTURE
  if (ms < 1000) return AR_LESS_THAN_SECOND
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60)
    return arabicAge(seconds, "ثانية واحدة", "ثانيتين", "ثانية", "ثوانٍ")
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)
    return arabicAge(minutes, "دقيقة واحدة", "دقيقتين", "دقيقة", "دقائق")
  const hours = Math.floor(minutes / 60)
  if (hours < 24)
    return arabicAge(hours, "ساعة واحدة", "ساعتين", "ساعة", "ساعات")
  const days = Math.floor(hours / 24)
  return arabicAge(days, "يوم واحد", "يومين", "يوم", "أيام")
}

/**
 * Apply Arabic dual + plural rules to a count + unit. Arabic has
 * distinct singular/dual/plural forms; this helper covers the four
 * units we use (second/minute/hour/day) without bringing in a full
 * intl library.
 *
 *   1 → "منذ <singularPhrase>"     e.g. "منذ ثانية واحدة" (f) / "منذ يوم واحد" (m)
 *   2 → "منذ <dual>"               e.g. "منذ ثانيتين"
 *   3-10 → "منذ N <plural>"        e.g. "منذ 5 ثوانٍ"
 *   11+  → "منذ N <fewSingular>"   e.g. "منذ 12 ثانية"
 *
 * NOTE: the "واحدة"/"واحد" agreement word is bundled into
 * `singularPhrase` because Arabic gender agreement depends on the
 * noun: feminine units (ثانية, دقيقة, ساعة) take "واحدة"; masculine
 * units (يوم) take "واحد". Threading it through the parameter avoids
 * baking the wrong agreement into the helper itself.
 */
function arabicAge(
  n: number,
  singularPhrase: string,
  dual: string,
  fewSingular: string,
  plural: string,
): string {
  if (n === 1) return `منذ ${singularPhrase}`
  if (n === 2) return `منذ ${dual}`
  if (n >= 3 && n <= 10) return `منذ ${n} ${plural}`
  return `منذ ${n} ${fewSingular}`
}

// ─── Severity → Tailwind class ───────────────────────────────────────

/**
 * Returns the Tailwind class string for a severity badge. Stable
 * mapping — info/warn/error always have the same visual identity
 * across the dashboard.
 *
 * Uses tinted-translucent backgrounds (`/10`) + theme-aware text so
 * the badges read correctly in BOTH the light and dark KHAT themes.
 * The earlier solid-light palette (`bg-red-50`, `bg-gray-100`, …)
 * washed out to near-invisible on the dark museum background.
 */
export function severityClass(s: "info" | "warn" | "error" | string): string {
  switch (s) {
    case "warn":
      return "border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
    case "error":
      return "border border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400"
    case "info":
    default:
      return "border border-border bg-muted/60 text-muted-foreground"
  }
}

// ─── Truncate ────────────────────────────────────────────────────────

/**
 * Trim a string with an ellipsis if longer than maxChars. Null-safe.
 * Returns "—" for null/undefined input so callers can render it
 * directly without guards.
 */
export function truncate(s: string | null | undefined, maxChars: number): string {
  if (s === null || s === undefined) return "—"
  if (s.length <= maxChars) return s
  return s.slice(0, maxChars) + "…"
}
