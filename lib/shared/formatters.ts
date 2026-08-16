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
  // The archive's clips lane counts CLIPS, not episodes: `/episodes?lane=clips`
  // tells the visitor «مو حلقات كاملة» and then had to print «6 حلقات» right
  // under it. See `laneUnitNoun()` in lib/episodes/programs.ts.
  "مقطع": ["مقطع", "مقطعان", "مقاطع"],
  // The archive's search summary. It was `${n} نتيجة` written inline in
  // app/episodes/page.tsx — «4 نتيجة» — one line above a branch that asked the
  // very same question through this map and got it right.
  "نتيجة": ["نتيجة", "نتيجتان", "نتائج"],
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

/*
 * `guestInitials` USED TO LIVE HERE. It is gone, and it is not coming back —
 * the mechanism does not work in Arabic, which is the language of every name on
 * this site.
 *
 * Two initials means "first letter of the given name, first letter of the
 * family name". Arabic family names begin with the definite article «ال», so
 * the second letter is «ا» for most of them. Measured on our seven real guest
 * names, five came out with «ا» in the second slot:
 *
 *   الملازم عبدالله البطي  → «عا»      الأستاذ علي دريساوي  → «عد»
 *   الدكتور الحارث المزيدي → «اا»      باسم اللوغاني        → «با»
 *   فيصل الفرحان           → «فا»
 *
 * «اا» was live on khatpodcast.com. An earlier fix stripped honorifics
 * (الدكتور/الملازم/…) and made the collisions rarer without touching this, the
 * larger fault — it treated a bad output as a formatting problem.
 *
 * The replacement is `components/media/khat-mark-panel.tsx`: one identical
 * quiet panel for every subject, which says «no image yet» instead of asserting
 * a wrong identity.
 */

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

// ─── Money ───────────────────────────────────────────────────────────────────

/**
 * A dinar figure with its unit — «2,750 د.ك», «1,500.750 د.ك».
 *
 * Three decimals is the dinar's precision and `numeric(10,3)`'s, but trailing
 * zeros are dropped: a negotiation screen printing «2,750.000 د.ك» beside
 * «2,000.000 د.ك» is three digits of noise on the two numbers the whole page
 * exists to compare.
 *
 * Pass `{ signed: true }` for a difference, where «+250» and «−250» mean
 * opposite things and an unsigned 250 means neither. The minus is U+2212, not
 * a hyphen — a hyphen is a neutral character that UAX#9 resolves against the
 * surrounding RTL run and paints on the wrong end of the number.
 *
 * Any non-KWD code is printed as-is rather than translated: inventing an
 * Arabic abbreviation for a currency we do not price in would be a guess.
 */
export function formatKwd(
  amount: number,
  currency = "KWD",
  opts?: { signed?: boolean },
): string {
  const sign = opts?.signed ? (amount < 0 ? "−" : "+") : ""
  const digits = Math.abs(amount)
    .toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 })
  return `${sign}${digits} ${currency === "KWD" ? "د.ك" : currency}`
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

/**
 * Minutes as one Arabic duration label — «2 س 15 د» / «18 دقيقة».
 *
 * ONE FORM, and it is unit-bearing at both ends. The site used to show three:
 * this function returned a bare `2:15` above the hour and «18 دقيقة» below it
 * (inconsistent with ITSELF, and `2:15` reads as a clock time, not a length),
 * while `episodeDurationLabel` — a second copy living in
 * `components/episodes/episode-poster-card.tsx` — returned «2 س 15 د» on the
 * cards. Same episode, three renderings depending on the surface.
 *
 * The `س`/`د` shape is the one kept: it is the only one that says what the
 * numbers ARE. Below the hour it goes through `formatArabicCount` so the
 * plural is right («5 دقائق», not «5 دقيقة»).
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours > 0) {
    // «2 س», not «2 س 0 د» — a whole number of hours is real in this archive
    // (one episode measures exactly 120 minutes).
    return mins > 0 ? `${hours} س ${mins} د` : `${hours} س`
  }
  return formatArabicCount(mins, "دقيقة")
}

/**
 * The same label, for surfaces that omit the field entirely when the duration
 * is missing or zero rather than printing a placeholder. The formatting itself
 * is `formatDuration`'s — this only decides "show nothing".
 */
export function episodeDurationLabel(min?: number | null): string | null {
  if (!min || min <= 0) return null
  return formatDuration(min)
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
 * Truncate to at most `max` characters WITHOUT cutting a word in half.
 *
 * ص-٨ — the episode hero used a bare `summary.slice(0, 150)`, which on the
 * reference episode ended "…مشاعر الخوف والقلق التي ا…". Backing up to the
 * last space keeps the ellipsis meaningful. Returns undefined for empty
 * input so callers can pass it straight to an optional prop.
 *
 * If the first `max` characters contain no space at all (one very long
 * token), the hard cut is kept — better a clipped word than a blank slot.
 */
export function truncateOnWord(
  text: string | null | undefined,
  max: number,
): string | undefined {
  const t = (text ?? "").trim()
  if (!t) return undefined
  if (t.length <= max) return t
  const head = t.slice(0, max)
  const lastSpace = head.lastIndexOf(" ")
  const cut = lastSpace > 0 ? head.slice(0, lastSpace) : head
  return `${cut.replace(/[،,.\s]+$/, "")}…`
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
 * A publication date, written the way an Arabic reader says it: «26 سبتمبر 2025».
 *
 * Takes the DATE-ONLY branch seriously. `episodes.release_date` is a bare
 * `YYYY-MM-DD` string, and `new Date("2025-09-26")` is parsed as UTC midnight —
 * so in any timezone behind UTC `.getDate()` returns 25 and the whole archive
 * reads one day early. Splitting the string ourselves keeps the stored day the
 * displayed day. A full timestamp still goes through `Date` as before.
 *
 * Invalid input returns "—", never "NaN يناير".
 */
export function formatArabicDate(date: string | Date | null | undefined): string {
  if (date == null) return "—"

  const dateOnly = typeof date === "string" ? date.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/) : null
  if (dateOnly) {
    const month = AR_MONTHS[Number(dateOnly[2]) - 1]
    if (!month) return "—"
    return `${Number(dateOnly[3])} ${month} ${dateOnly[1]}`
  }

  const d = typeof date === "string" ? new Date(date) : date
  if (!(d instanceof Date) || isNaN(d.getTime())) return "—"
  return `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

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

// ─── Episode titles ──────────────────────────────────────────────────────────

/**
 * Every published episode title carries a trailing brand/series stamp that was
 * written for YouTube, where a title appears alone in a feed next to a thousand
 * other channels. Measured on the 42 published rows in this database, 41 of
 * them end in one of:
 *
 *     «… | 019 بودكاست خط»      «… |001 بودكاست خط»    «… | 006 - بودكاست خط»
 *     «… جاسم عباس- 003 بودكاست خط»                     «… مقاطع من بودكاست خط»
 *     «… | سالفة 06»            «… | 03»                «… بودكاست خط»
 *
 * On khatpodcast.com's own archive that stamp is pure repetition: the reader
 * already knows whose site they are on, so the same three or four words print
 * 41 times down one grid and the eye stops reading titles. It also costs
 * roughly 40% of the visible characters, which is what pushed clamped card
 * titles from 9 to 16 out of 42 when the type scale grew the step to 18px.
 *
 * DISPLAY ONLY. This never touches stored data. The full title stays canonical
 * everywhere it leaves the site or identifies the work:
 *
 *   · `searchEpisodes` (lib/search.ts) matches `episode.title`, so a reader can
 *     still find an episode by a word that only exists in the stamp.
 *   · `<title>`, `og:title` and the JSON-LD `PodcastEpisode.name` keep the full
 *     string — off-site the brand is doing its job, not repeating itself, and
 *     the JSON-LD name must match the title published to the directories.
 *
 * WHAT IT WILL NOT DO:
 *   · never returns an empty string — if stripping would empty the title, the
 *     original is returned untouched;
 *   · only removes a NUMBER when a separator or the brand marks it as a stamp
 *     («… | 03»), never a number that is part of the sentence («… عام 2024»);
 *   · leaves a guest name that happens to sit in the tail alone
 *     («… | جاسم العبوة - 002 بودكاست خط» → «… | جاسم العبوة»), because on most
 *     rows no guest is linked and the name is the only place it appears.
 */
const AR_DIGITS = "[0-9\\u0660-\\u0669]"
const TITLE_DASH = "[|\\-\\u2013\\u2014]"
const KHAT_BRAND = "\\u0628\\u0648\\u062f\\u0643\\u0627\\u0633\\u062a\\s+\\u062e\\u0637" // بودكاست خط
const SALFA = "\\u0633\\u0627\\u0644\\u0641\\u0629" // سالفة
const CLIPS = "\\u0645\\u0642\\u0627\\u0637\\u0639" // مقاطع
const FROM = "\\u0645\\u0646" // من

/** «… | 019 بودكاست خط» · «… مقاطع من بودكاست خط» · «… | سالفة 06» */
const TITLE_STAMP = new RegExp(
  `(?:\\s*(?:${TITLE_DASH}|\\.{2,})\\s*|\\s+)` +
    `(?:${CLIPS}(?:\\s+${FROM})?\\s+)?` +
    `(?:` +
    `${SALFA}\\s*${AR_DIGITS}{1,3}` +
    `|${AR_DIGITS}{1,3}\\s*${TITLE_DASH}?\\s*${KHAT_BRAND}` +
    `|${KHAT_BRAND}` +
    `)\\s*$`,
)

/**
 * A bare series number, and ONLY behind a pipe: «… | 03».
 * The pipe is what makes it a stamp rather than content — a hyphen would also
 * match «كوفيد - 19», which is part of the sentence.
 */
const TITLE_BARE_NUMBER = new RegExp(`\\s*\\|\\s*${AR_DIGITS}{1,3}\\s*$`)

/** A separator left dangling once the stamp behind it is gone. */
const TITLE_TRAILING_SEP = new RegExp(`\\s*${TITLE_DASH}\\s*$`)

/**
 * The episode title as it should READ on this site — the stored title with its
 * trailing brand/series stamp removed. Use for card titles and page headings;
 * use `episode.title` itself for metadata, structured data and search.
 */
export function displayEpisodeTitle(title: string | null | undefined): string {
  const original = (title ?? "").trim()
  if (!original) return ""

  let out = original
  // Peel until stable, bounded at four. Measured on the 42 stored titles
  // (2026-08-02): 11 need no pass and 31 need exactly one — NO real title has
  // ever needed a second. The bound is headroom for a COMPOUND stamp
  // («… مقاطع من بودكاست خط | 019 بودكاست خط», which needs two), and four is
  // where it stops: a fifth repetition survives by design rather than
  // spinning. Tests pin passes 2 and 4 and the ceiling at 5, so this number
  // cannot be lowered silently.
  for (let i = 0; i < 4; i++) {
    const next = out.replace(TITLE_STAMP, "").trim()
    if (next === out) break
    out = next
  }
  const withoutNumber = out.replace(TITLE_BARE_NUMBER, "").trim()
  if (withoutNumber) out = withoutNumber

  const tidied = out.replace(TITLE_TRAILING_SEP, "").trim()
  if (tidied) out = tidied

  return out || original
}

/**
 * The one-paragraph blurb a card should print under an episode title.
 *
 * WHY THIS EXISTS. The homepage's «الحلقة الأحدث» card read `episode.summary`
 * and nothing else, and `summary` is NULL on every published episode in this
 * database (measured 2026-08-02: 0 of 41 populated). So the card's paragraph
 * was unreachable code and the card rendered a title with ~200px of empty
 * column under it. The prose is in `description`, which the archive cards
 * already fall back to (`components/episodes/episode-card.tsx`).
 *
 * Falling back NAIVELY is what stopped anyone doing it here: `description` is
 * the raw YouTube description, 405–602 characters on the three newest rows,
 * and after its first blank line it carries bit.ly links («حساب الضيف على
 * الإنستغرام : https://…») and hashtag blocks. Pasting that onto the homepage
 * trades empty space for spam.
 *
 * So: prefer `summary`; otherwise take the FIRST paragraph of `description`
 * and drop any line inside it that is a link or a hashtag run. Returns null —
 * not "" — when nothing readable survives, so the caller omits the paragraph
 * instead of rendering an empty one that still takes vertical space.
 */
/**
 * The episode's PROSE, with the YouTube channel boilerplate taken out.
 *
 * `episodeBlurb` below keeps only the first paragraph, which is right for a
 * card and wrong for the episode page — that page wants the whole write-up.
 * But `description` is pasted straight from YouTube, so the whole write-up
 * arrives with a tail nobody wrote for a website. Measured on صلاح الغزالي's
 * live page, under «ملخص الحلقة»:
 *
 *   · «الجزء الرابع: https://bit.ly/3LQXvNK» and seven more bit.ly lines
 *   · «بودكاست خط على سناب شات: …» — a channel roster
 *   · a «الهاشتاقات» heading followed by eleven #tags on their own lines
 *   · on other episodes, a «الفقرات الزمنية:» block — the chapter list, in
 *     plain text, directly above the interactive index that already renders it
 *
 * Khaled asked for it cleaned. The rule is deliberately conservative: a line
 * goes ONLY if it is unambiguously furniture — a URL, a hashtag run, a
 * timestamp row, or a labelled heading for one of those blocks. Prose is never
 * summarised or rewritten here; shortening the text is an editorial act and
 * belongs to `hero_summary`, not to a formatter.
 */
/*
 * Two episodes label the same block differently and put the clock on opposite
 * ends of the line — «الفقرات الزمنية:» + `00:00 المقدمة` on حسام مطر,
 * «محاور الحلقة:» + `المقدمة 00:00` on صلاح الغزالي. A rule built from one of
 * them silently does nothing on the other, which is exactly what shipped.
 */
const BOILERPLATE_HEADING =
  /^(الهاشتاقات|هاشتاقات|الفقرات الزمنية|الفواصل الزمنية|محاور الحلقة|التوقيتات|روابط|برعاية|حساب(ات)? |شكرا)/
/** A chapter row — the clock leads («00:00 المقدمة») or trails («المقدمة 00:00»). */
const TIMESTAMP_ROW = /(^[•\-*\s]*\d{1,2}:\d{2}(:\d{2})?\s)|(\d{1,2}:\d{2}(:\d{2})?\s*$)/
/** «… الإلكترونية :» — a lead-in whose payload is the link block beneath it. */
const DANGLING_LEAD_IN = /[:：]\s*$/

/**
 * The chapters THE PRODUCER WROTE, read back out of the YouTube description.
 *
 * WHY THIS EXISTS — and it is the sharpest thing found in this whole pass.
 * `episode_enrichments.timestamps` is AI-generated, and on صلاح الغزالي it is
 * fiction: ten rows at 0, 2, 5, 10, 15, 20, 25, 30, 35 and 40 minutes — every
 * one a round multiple of five — ending on «الخاتمة» at 40:00. **The episode is
 * 3 hours 18 minutes.** The index was telling a reader the conversation ends
 * four fifths of an hour in, and every click landed in the wrong place.
 *
 * The real chapters were sitting in the description the whole time, written by
 * hand with real times: «المقدمة 00:00 … أول يوم من الحرية 2:56:35 … الخاتمة
 * 3:16:24». Fourteen of them, spanning the episode.
 *
 * Two shapes on this channel, both handled: the clock LEADS on حسام مطر
 * («00:00 حوار جانبي») and TRAILS on صلاح الغزالي («المقدمة 00:00»).
 *
 * Returns [] rather than a guess when nothing parses — a wrong index is worse
 * than none, which is the entire point of this function.
 */
export function parseDescriptionChapters(
  description: string | null | undefined,
): { title: string; seconds: number }[] {
  if (!description) return []
  const out: { title: string; seconds: number }[] = []

  for (const raw of description.split("\n")) {
    const line = raw.trim()
    if (!line || /https?:\/\//i.test(line)) continue

    // `H:MM:SS` or `M:SS`, at either end of the line.
    // «• 00:00 المقدمة» — 017 bullets its list; «…التسويق34:00» — 005 glues the
    // clock to the title with no space. Both are chapter rows.
    const bare = line.replace(/^[•\-*\u2022]\s*/, "").trim()
    const lead = bare.match(/^(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/)
    const trail = bare.match(/^(.+?)\s*(\d{1,2}:\d{2}(?::\d{2})?)$/)
    const [clock, title] = lead
      ? [lead[1], lead[2]]
      : trail
        ? [trail[2], trail[1]]
        : [null, null]
    if (!clock || !title) continue

    const parts = clock.split(":").map(Number)
    if (parts.some((n) => !Number.isFinite(n))) continue
    const seconds =
      parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1]

    const clean = title.replace(/[:：]\s*$/, "").trim()
    if (!clean || clean.startsWith("#")) continue
    out.push({ title: clean, seconds })
  }

  // A single stray «2:30» inside a sentence is not a chapter list. Three rows
  // is the floor for believing the block was one.
  if (out.length < 3) return []

  // Must run forward. A list that jumps backwards was mis-parsed, and shipping
  // it would repeat the fault this function exists to fix.
  for (let i = 1; i < out.length; i++) {
    if (out[i].seconds < out[i - 1].seconds) return []
  }
  return out
}

export function episodeDescriptionProse(episode: {
  summary?: string | null
  description?: string | null
}): string | null {
  /*
   * CLEAN WHATEVER WE END UP SHOWING — the first version returned `summary`
   * untouched and only scrubbed `description`, which passed locally and failed
   * in production within minutes of deploying. Locally `summary` holds the
   * enrichment's written prose; in production it is a PRE-OVERRIDE COPY OF
   * `description` (see the note on `episodes.summary`), so the raw YouTube tail
   * came straight back through the early return. Same code, same episode, two
   * databases, opposite results.
   *
   * The source decides precedence, never whether the scrub runs.
   */
  const source = episode.summary?.trim() || episode.description?.trim()
  if (!source) return null
  const description = source

  // Blocks, so a whole boilerplate section disappears with its heading rather
  // than leaving «الهاشتاقات» sitting alone above nothing.
  const blocks = description.split(/\n\s*\n/)
  const kept: string[] = []

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) continue
    // A block whose FIRST line announces a boilerplate section is furniture
    // entire — links, tags and timestamps all arrive under a label.
    if (BOILERPLATE_HEADING.test(lines[0])) continue

    const prose = lines.filter(
      (l) =>
        !l.startsWith("#") &&
        !/https?:\/\//i.test(l) &&
        !TIMESTAMP_ROW.test(l) &&
        // ALSO drop a label wherever it sits, not only when it opens a block.
        // On 001 «الفواصل الزمنية» is the last line of the prose block — no
        // blank line before its rows — so the block-level check never saw it
        // and the bare heading shipped under «ملخص الحلقة».
        !BOILERPLATE_HEADING.test(l),
    )
    // Every line was furniture ⇒ drop the block, don't leave a gap.
    if (prose.length === 0) continue

    // A block that ENDS on a colon is introducing whatever came next, and what
    // came next was furniture — «من موسوعته سور الكويت الرابع :» sits directly
    // above four bit.ly lines. Keeping it leaves a sentence pointing at nothing.
    if (DANGLING_LEAD_IN.test(prose[prose.length - 1])) {
      prose.pop()
      // Drop the whole lead-in, however many lines it ran to: «شكراً للأستاذ …»
      // is only there to introduce the links.
      while (prose.length > 0 && !/[.!؟]\s*$/.test(prose[prose.length - 1])) prose.pop()
      if (prose.length === 0) continue
    }

    kept.push(prose.join("\n"))
  }

  const out = kept.join("\n\n").trim()
  return out || null
}

export function episodeBlurb(episode: {
  summary?: string | null
  description?: string | null
}): string | null {
  const summary = episode.summary?.trim()
  if (summary) return summary

  const description = episode.description?.trim()
  if (!description) return null

  // First paragraph = everything up to the first BLANK line. A single newline
  // inside a paragraph is a wrap in this data, not a paragraph break.
  const [firstBlock = ""] = description.split(/\n\s*\n/)

  const prose = firstBlock
    .split("\n")
    .map((line) => line.trim())
    // A line carrying a URL, or opening on a hashtag, is channel boilerplate
    // rather than prose — true for every such line in the stored descriptions.
    .filter((line) => line && !line.startsWith("#") && !/https?:\/\//i.test(line))
    .join(" ")
    .trim()

  return prose || null
}

/**
 * True when a string that is being presented as a GUEST NAME is really the
 * podcast's own brand stamp — «019 بودكاست خط», «سالفة 06», «04».
 *
 * WHY THIS EXISTS. `extractGuestName` in `lib/youtube/queries.ts` derives a
 * guest from the video title by taking everything after the last `|`. On this
 * channel everything after the last `|` IS the stamp, so the archive rendered
 * 35 guest badges of which exactly ONE («الأستاذ علي دريساوي») was a person.
 * The rest printed the same four words the title already ended with — the
 * "tail twice on one card" Khaled reported. None of it is stored: the `guests`
 * table holds three rows; these names are synthesised per request.
 *
 * The predicate matches the WHOLE string, never a substring, so a real guest
 * whose name merely contains a digit is never suppressed. It cannot catch a
 * derived name that is ordinary Arabic prose — «العملاء في البنك», sliced out
 * of «سالفة فيصل مع العملاء في البنك» by the `مع …` pattern, still gets
 * through, because nothing in the string distinguishes it from a person's
 * name. That one needs the title fixed, not a cleverer regex.
 */
const BRAND_STAMP_NAME = new RegExp(
  `^\\s*(?:` +
    // «019 بودكاست خط», «006 - بودكاست خط», «مقاطع من بودكاست خط», «بودكاست خط»
    `(?:${CLIPS}(?:\\s+${FROM})?\\s+)?(?:${AR_DIGITS}{1,3}\\s*${TITLE_DASH}?\\s*)?${KHAT_BRAND}` +
    // «بودكاست خط 003» — the same stamp with the number on the other side.
    // Real, and only visible after the first fix removed the louder shapes.
    `(?:\\s*${TITLE_DASH}?\\s*${AR_DIGITS}{1,3})?` +
    `|${SALFA}\\s*${AR_DIGITS}{1,3}` +
    `|${AR_DIGITS}{1,3}` +
  `)\\s*$`,
)

export function isBrandStampName(name: string | null | undefined): boolean {
  const value = (name ?? "").trim()
  if (!value) return true
  return BRAND_STAMP_NAME.test(value)
}
