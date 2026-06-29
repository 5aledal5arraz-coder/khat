/**
 * Unified formatting utilities for the entire codebase.
 * Pure functions — safe for both server and client components.
 *
 * All date/time, number, and Arabic-language formatters live here.
 * Other modules re-export from this file for backward compatibility.
 */

// ─── Arabic Plurals ──────────────────────────────────────────────────────────

/**
 * Arabic plural forms: [singular, dual, plural (3-10)]
 * Rules: 0 → plural, 1 → singular + واحد/واحدة, 2 → dual,
 *        3-10 → number + plural, 11+ → number + singular
 */
const ARABIC_PLURALS: Record<string, [string, string, string]> = {
  "حلقة": ["حلقة", "حلقتان", "حلقات"],
  "مقال": ["مقال", "مقالان", "مقالات"],
  "متابع": ["متابع", "متابعان", "متابعين"],
  "دقيقة": ["دقيقة", "دقيقتين", "دقائق"],
  "ساعة": ["ساعة", "ساعتين", "ساعات"],
  "يوم": ["يوم", "يومين", "أيام"],
  "تعليق": ["تعليق", "تعليقان", "تعليقات"],
  "رد": ["رد", "ردّان", "ردود"],
  "اقتباس": ["اقتباس", "اقتباسان", "اقتباسات"],
}

export function formatArabicCount(count: number, singular: string): string {
  const forms = ARABIC_PLURALS[singular]
  if (!forms) return `${count} ${singular}`

  const [sing, dual, plural] = forms
  const isFeminine = sing.endsWith("ة")

  if (count === 0) return `لا ${plural}`
  if (count === 1) return `${sing} واحد${isFeminine ? "ة" : ""}`
  if (count === 2) return dual
  if (count <= 10) return `${count} ${plural}`
  return `${count} ${sing}`
}

// ─── Date Formatting ─────────────────────────────────────────────────────────

/** Format a date as DD/MM/YYYY (local timezone). */
export function formatDate(date: string | Date): string {
  const d = new Date(date)
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

/** Format a date as DD/MM/YYYY in Kuwait timezone. Null-safe — returns "-" for invalid input. */
const kuwaitDateFmt = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Kuwait",
  calendar: "gregory",
})

export function formatDateCompact(date: Date | string | null | undefined): string {
  if (!date) return "-"
  try {
    const d = typeof date === "string" ? new Date(date) : date
    if (isNaN(d.getTime())) return "-"
    return kuwaitDateFmt.format(d)
  } catch {
    return "-"
  }
}

/** Format a date as DD/MM/YYYY HH:MM (local timezone). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

/** Format a date as HH:MM (local timezone). */
export function formatTime(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
}

// ─── Duration / Time Formatting ──────────────────────────────────────────────

/** Format minutes as Arabic duration (e.g., "٤٥ دقيقة" or "1:05"). */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}`
  }
  return formatArabicCount(mins, "دقيقة")
}

/** Format seconds as HH:MM:SS or MM:SS. */
export function formatTimeSeconds(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(safeSeconds / 3600)
  const mins = Math.floor((safeSeconds % 3600) / 60)
  const secs = safeSeconds % 60

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// ─── Relative Time ───────────────────────────────────────────────────────────

/** Arabic relative time string (e.g. "قبل ٣ ساعات", "أمس"). */
export function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffMins < 1) return "الآن"
  if (diffMins < 60) return `قبل ${diffMins} دقيقة`
  if (diffHours < 24) return `قبل ${diffHours} ساعة`
  if (diffDays === 1) return "أمس"
  if (diffDays < 7) return `قبل ${diffDays} أيام`
  if (diffWeeks === 1) return "قبل أسبوع"
  if (diffWeeks < 5) return `قبل ${diffWeeks} أسابيع`
  if (diffMonths === 1) return "قبل شهر"
  return `قبل ${diffMonths} أشهر`
}

// ─── Greeting ────────────────────────────────────────────────────────────────

/** Arabic greeting based on time of day (Kuwait timezone). */
export function getKuwaitGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "صباح الخير"
  return "مساء الخير"
}

// ─── Misc ────────────────────────────────────────────────────────────────────

/** Format a fraction as a percentage string (e.g. "42%"). */
export function pct(n: number, total: number): string {
  if (total === 0) return "0%"
  return `${Math.round((n / total) * 100)}%`
}

/**
 * Compact number formatting: 1.2M / 12K / 1,234. Pass `{ plus: true }` for the
 * marketing "rounded-up +" style used on the partner/media-kit pages
 * (1.2M+ / 12K+ / 1234+). The single source for compact counts — components
 * must import this rather than re-implementing it.
 */
export function formatCompactNumber(n: number, opts?: { plus?: boolean }): string {
  if (opts?.plus) {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M+`
    if (n >= 1_000) return `${Math.floor(n / 1_000)}K+`
    return `${n}+`
  }
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
  return n.toLocaleString()
}

/** Arabic month names. */
export const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const
