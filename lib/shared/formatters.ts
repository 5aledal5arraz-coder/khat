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
 *
 * A key may be a single noun («حلقة») or a whole NOUN PHRASE («مهمة متعثّرة»).
 * The phrase form exists because an Arabic adjective agrees with its noun in
 * number too: «مهمة متعثّرة» / «مهمتان متعثّرتان» / «3 مهام متعثّرة». Splitting
 * that into a noun lookup plus a hard-coded adjective is how «1 مهام متعثّرة»
 * gets shipped, so the adjective travels with the noun in the same table.
 * Keep a phrase key ending at the ADJECTIVE — `formatArabicCount` appends
 * «واحد/واحدة» after the whole key at count 1, so any trailing adverb or
 * prepositional phrase belongs at the call site, not in the key.
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
  "سؤال": ["سؤال", "سؤالان", "أسئلة"],
  // Used by the admin home's computed day summary («3 طلبات بانتظارك»). Added
  // here rather than as a local table in `lib/ops/day-summary.ts` — a second
  // plural implementation is exactly what this map exists to prevent.
  "طلب": ["طلب", "طلبان", "طلبات"],
  // Was reaching the (now removed) silent fallback from
  // `app/admin/guests/guests-list.tsx` — it printed «2 ضيف محدّد».
  "ضيف": ["ضيف", "ضيفان", "ضيوف"],
  // ── The admin home's status band + KPI hints (lib/ops/home-metrics.ts) ──
  "مهمة": ["مهمة", "مهمتان", "مهام"],
  "مهمة متعثّرة": ["مهمة متعثّرة", "مهمتان متعثّرتان", "مهام متعثّرة"],
  "مهمة مجدولة": ["مهمة مجدولة", "مهمتان مجدولتان", "مهام مجدولة"],
  "استدعاء": ["استدعاء", "استدعاءان", "استدعاءات"],
  "استدعاء فاشل": ["استدعاء فاشل", "استدعاءان فاشلان", "استدعاءات فاشلة"],
  // No «استدعاء ناجح» entry: the only phrase that inflected it was the AI-calls
  // tile's sub-line, deleted with the tile. The band reports failures, not
  // successes — a success count is not a thing anyone acts on.
  // Dual is the iḍāfa form («استدعاءا ذكاء») — the nūn drops before the
  // second term, so this is NOT «استدعاءان ذكاء اصطناعي».
  "استدعاء ذكاء اصطناعي": [
    "استدعاء ذكاء اصطناعي",
    "استدعاءا ذكاء اصطناعي",
    "استدعاءات ذكاء اصطناعي",
  ],
  "سجل": ["سجل", "سجلان", "سجلات"],
  // The grounded-retrieval alert («البحث المؤرَّض ما اشتغل في 4 عمليات
  // استرجاع من 8 عمليات»). Both terms are needed: the phrase carries its own
  // plural («عمليات استرجاع» is an iḍāfa, so the second term never inflects).
  "عملية": ["عملية", "عمليتان", "عمليات"],
  "عملية استرجاع": ["عملية استرجاع", "عمليتا استرجاع", "عمليات استرجاع"],
}

/**
 * Look a noun up, and FAIL LOUDLY when it isn't registered.
 *
 * The old behaviour was `return \`${count} ${singular}\`` — a silent fallback
 * to the single form that is wrong for 1, 2 and 3–10 («1 مهام متعثّرة»,
 * «3 سؤال»). Because it never threw and never logged, an unregistered noun
 * shipped and read as a deliberate choice. Non-production throws so the gap
 * surfaces in dev and in `npm run test`; production logs and degrades, because
 * a missing plural must not blank an operator's page.
 */
function lookupPlural(singular: string): [string, string, string] | null {
  const forms = ARABIC_PLURALS[singular]
  if (forms) return forms
  const message =
    `[formatters] «${singular}» غير مسجّل في ARABIC_PLURALS — ` +
    `أضِف [مفرد, مثنّى, جمع] في lib/shared/formatters.ts`
  if (process.env.NODE_ENV !== "production") throw new Error(message)
  console.error(message)
  return null
}

export function formatArabicCount(count: number, singular: string): string {
  const forms = lookupPlural(singular)
  if (!forms) return `${count} ${singular}`

  const [sing, dual, plural] = forms
  const isFeminine = sing.endsWith("ة")

  if (count === 0) return `لا ${plural}`
  if (count === 1) return `${sing} واحد${isFeminine ? "ة" : ""}`
  if (count === 2) return dual
  if (count <= 10) return `${count} ${plural}`
  return `${count} ${sing}`
}

/**
 * The NOUN alone, agreeing with `count` — for layouts that already render the
 * numeral as its own visual element (a headline counter tile, where
 * `formatArabicCount` would print the digit twice).
 *
 * Reads the same `ARABIC_PLURALS` table as `formatArabicCount`, so the plural
 * of a word is still defined in exactly one place.
 *
 * Unlike `formatArabicCount` this one does NOT throw on an unregistered noun:
 * its fallback returns the word unchanged, which is under-specified but never
 * grammatically wrong (it is the correct form at 1 and 11+). Callers that pass
 * a genuinely invariant word — a product name like «تيزر» — rely on that.
 */
export function arabicPluralNoun(count: number, singular: string): string {
  const forms = ARABIC_PLURALS[singular]
  if (!forms) return singular

  const [sing, dual, plural] = forms
  if (count === 1) return sing
  if (count === 2) return dual
  if (count >= 3 && count <= 10) return plural
  // 0 → plural («لا أسئلة»), 11+ → singular tamyiz («15 سؤال»).
  return count === 0 ? plural : sing
}

/**
 * Honorifics that precede a name. Counting them as name words made distinct
 * guests collide on the same avatar — «الأستاذ علي دريساوي» and «الملازم
 * عبدالله البطي» both rendered «اع». Compared after `normalizeNameToken`, so
 * hamza spellings and the ة/ه ending don't each need their own entry.
 */
const NAME_HONORIFICS = new Set([
  "الاستاذ", "الاستاذه", "استاذ", "استاذه",
  "الدكتور", "الدكتوره", "دكتور", "دكتوره", "د",
  "المهندس", "المهندسه", "مهندس", "مهندسه",
  "الشيخ", "الشيخه", "شيخ", "شيخه",
  "السيد", "السيده", "سيد", "سيده",
  "الملازم", "النقيب", "الرائد", "المقدم", "العقيد", "العميد", "اللواء", "الفريق",
  "الكابتن", "كابتن", "القائد",
  "dr", "mr", "mrs", "ms", "prof",
])

/** Fold a name word to the form `NAME_HONORIFICS` is written in. */
function normalizeNameToken(word: string): string {
  return word
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "") // diacritics + tatweel
    .replace(/[أإآ]/g, "ا") // أ إ آ → ا
    .replace(/ة$/, "ه") // trailing ة → ه
    .replace(/[.,،]$/, "") // «د.» → «د»
}

/**
 * Avatar initials for a person's name: first letter of up to two words.
 * Words that begin with an actual letter are preferred, so imported /
 * placeholder names like "019 بودكاست خط" render clean initials ("بخ")
 * instead of a stray leading digit ("0ب"). Honorifics are skipped so the
 * title doesn't eat one of the two slots. Both filters fall back to the
 * unfiltered list rather than returning nothing (a name that is *only* a
 * title still gets an initial). Returns "•" for empty names.
 * Single source — components must import this rather than re-implementing.
 */
export function guestInitials(name: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean)
  const letterWords = words.filter((w) => /^\p{L}/u.test(w))
  const source = letterWords.length > 0 ? letterWords : words
  const named = source.filter((w) => !NAME_HONORIFICS.has(normalizeNameToken(w)))
  const picked = named.length > 0 ? named : source
  return picked.map((w) => w.charAt(0)).slice(0, 2).join("") || "•"
}

// ─── Bidi ────────────────────────────────────────────────────────────────────

/**
 * Wrap an LTR run (a date, a model id, a version) in Unicode isolate marks so
 * it renders correctly INSIDE an Arabic sentence.
 *
 * `dir="ltr"` is the right tool when the run has its own element. It is not
 * available when the run is interpolated into a plain string that a caller
 * renders as one text node — e.g. the model-EOL alert label in
 * `lib/ops/home-metrics.ts`, where «gpt-5.6-luna انتهى عمره (2026-10-16)»
 * had UAX#9 resolve the neutral parentheses and hyphens to the surrounding
 * RTL run and paint the date reversed and the brackets swapped.
 *
 * U+2066 LEFT-TO-RIGHT ISOLATE … U+2069 POP DIRECTIONAL ISOLATE: unlike the
 * deprecated embedding marks, an isolate also keeps the run from affecting the
 * ordering of the Arabic text around it. Zero-width — no visual change beyond
 * the ordering fix. Returns "" for empty input so it never emits bare controls.
 */
export function ltrIsolate(text: string | null | undefined): string {
  const s = (text ?? "").toString()
  return s === "" ? "" : `\u2066${s}\u2069`
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

/**
 * Approximate remaining-time label for a live countdown, e.g. "~6 دقائق" /
 * "~دقيقتين" / "أقل من دقيقة". The leading ~ keeps the estimate honestly fuzzy.
 * Reuses the Arabic plural engine (single source), dropping the "واحدة" for the
 * 1-minute case since ~ already signals approximation. Used by the Studio
 * transcription progress bar.
 */
export function formatEtaApprox(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 45) return "أقل من دقيقة"
  const mins = Math.round(seconds / 60)
  return mins === 1 ? "~دقيقة" : `~${formatArabicCount(mins, "دقيقة")}`
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

// ─── Grounded research sources ───────────────────────────────────────────────

/**
 * Primary, human-readable label for a grounded research-source row/chip.
 * The stored `title` is a raw grounded snippet (markdown `**`, `…` truncation,
 * mid-word cuts like "ع*") — unfit as a headline. The domain (or publisher) is
 * the essential, scannable identifier a reviewer needs BEFORE clicking, so it
 * leads. Pure/display-only — never mutates stored source data. Single source;
 * components must import this rather than re-implementing it.
 */
export function researchSourceLabel(source: {
  domain?: string | null
  publisher?: string | null
  url: string
}): string {
  const domain = source.domain?.trim()
  if (domain) return domain
  const publisher = source.publisher?.trim()
  if (publisher) return publisher
  try {
    return new URL(source.url).hostname.replace(/^www\./, "")
  } catch {
    return source.url
  }
}

/**
 * Strip the inline markdown a grounded snippet can carry — bold/italic `**`/`*`,
 * inline `` `code` ``, leading list/heading/quote markers, and `[label](url)`
 * links (kept as `label`) — then collapse whitespace. Pure; returns "" for
 * empty input. Single source: used both to CLEAN grounded snippets before they
 * are stored in a display column that must not render markup (the web_grounded
 * market adapter) and to render `researchSourceSnippet` for already-stored rows.
 */
export function stripInlineMarkdown(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [label](url) → label
    .replace(/^\s*(?:[*+\-•>]+|#{1,6}|\d+[.)])\s+/gm, "") // leading list/heading/quote markers
    .replace(/[*`]+/g, "") // bold / italic / inline-code markers
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Secondary description for a grounded source — the stored `title` holds the
 * raw grounded snippet. Strip markdown and collapse whitespace so it reads
 * cleanly as a muted sub-line / tooltip. Display-only; returns "" when there's
 * nothing useful beyond the label.
 */
export function researchSourceSnippet(source: { title?: string | null }): string {
  return stripInlineMarkdown(source.title)
}

/** Arabic month names. */
export const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
] as const

/**
 * A dated commitment, written the way an Arabic reader says it:
 * «26 يوليو · 14:30». Western digits, per the admin's stated convention
 * (`lib/ops/format.ts` §11) — the month NAME is what makes a date scannable,
 * not the numeral system.
 *
 * Local timezone, matching `formatDate`/`formatDateTime` above rather than
 * introducing a second clock into the same screen.
 * Invalid input returns "—", never "NaN يناير".
 */
export function formatArabicDateTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date
  if (!(d instanceof Date) || isNaN(d.getTime())) return "—"
  const day = d.getDate()
  const month = AR_MONTHS[d.getMonth()]
  const hh = String(d.getHours()).padStart(2, "0")
  const mm = String(d.getMinutes()).padStart(2, "0")
  return `${day} ${month} · ${hh}:${mm}`
}
