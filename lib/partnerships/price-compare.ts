/**
 * «سعرنا مقابل اقتراحهم» — reading OUR figure back out of the package text.
 *
 * ── THE PROBLEM ────────────────────────────────────────────────────────────
 * The company's counter-offer is a `numeric` column: one unambiguous number.
 * Our price is not. `packages[].price_range` is FREE TEXT that Khaled types —
 * «٢٧٥ د.ك للحلقة», «1,500 د.ك», «1,000 – 1,500 د.ك», «2,750 د.ك للموسم (10
 * حلقات)». So a side-by-side comparison has to derive a number from prose, and
 * a derivation from prose is a place where a screen can quietly start lying.
 *
 * ── THE RULE THIS MODULE FOLLOWS ───────────────────────────────────────────
 * It never guesses. Every return value carries the BASIS it was read on, and
 * anything ambiguous comes back as `kind: "unparsed"` or `kind: "range"` so the
 * UI can say «تعذّر اشتقاق سعرنا — قارن يدوياً» instead of printing a confident
 * −45% that nobody can check. A missing comparison is a small annoyance; a
 * wrong one is a decision made on a false number.
 *
 * Specifically NOT done here:
 *  - No currency conversion. Both sides are assumed to be the currency printed
 *    on the offer; the reply form only ever collects KWD.
 *  - No picking one end of a range to compare against. Two numbers are two
 *    numbers.
 *  - No inventing an episode count. Per-episode figures appear only when the
 *    text either says «للحلقة» or names a count we can divide by.
 */

/** Arabic-Indic ٠-٩ (U+0660) and Extended/Persian ۰-۹ (U+06F0) → ASCII. */
function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0)
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660
    return String(code - base)
  })
}

/**
 * Normalise the separators before any number is read.
 *
 * Order matters: the Arabic decimal separator (U+066B) becomes "." and the
 * Arabic thousands separator (U+066C) is dropped, but a Latin comma is only
 * dropped BETWEEN DIGITS — «1,500» is one number, while «250, 300» is two and
 * must stay two.
 */
function normalise(input: string): string {
  return toLatinDigits(input)
    .replace(/٫/g, ".")
    .replace(/٬/g, "")
    .replace(/(\d),(?=\d{3}\b)/g, "$1")
}

/** Matches «10 حلقات» / «١٠ حلقة» / «10حلقات» — the count, not the price. */
const EPISODE_COUNT = /(\d+(?:\.\d+)?)\s*حلق(?:ة|ات|تين)/g

/** «للحلقة» · «لكل حلقة» · «/ حلقة» · «في الحلقة» · «للحلقة الواحدة». */
const PER_EPISODE_MARKER = /(?:للحلقة|لكل\s*حلقة|في\s*الحلقة|\/\s*حلقة|per\s*episode)/i

/** A range joiner sitting between the two numbers: - – — ~ «إلى» «الى». */
const RANGE_JOINER = /^\s*(?:[-–—~]|إلى|الى|to)\s*$/

/**
 * What the price basis is — i.e. what the printed number actually counts.
 * `per_episode`: the text says so. `total`: it does not, and `episodes` (when
 * present) is the count we may divide by. `unknown`: no count to divide by.
 */
export type PriceBasis = "per_episode" | "total"

export interface ParsedPrice {
  /** The text exactly as it was typed — always echoed so the UI can show it. */
  raw: string
  kind: "single" | "range" | "unparsed"
  /** Set only when `kind === "single"`. */
  amount: number | null
  /** Set only when `kind === "range"`. */
  min: number | null
  max: number | null
  basis: PriceBasis
  /** Episode count named in the text, when one was. Never invented. */
  episodes: number | null
}

const UNPARSED = (raw: string, basis: PriceBasis, episodes: number | null): ParsedPrice => ({
  raw,
  kind: "unparsed",
  amount: null,
  min: null,
  max: null,
  basis,
  episodes,
})

/**
 * Read a figure out of one `price_range` string.
 *
 * The episode count is extracted and REMOVED before the price is looked for —
 * otherwise «2,750 د.ك للموسم (10 حلقات)» reads as two candidate prices and
 * the comparison silently anchors on 10.
 */
export function parsePackagePrice(priceRange: string | null | undefined): ParsedPrice {
  const raw = (priceRange ?? "").trim()
  if (!raw) return UNPARSED(raw, "total", null)

  const text = normalise(raw)

  // Episode count first, so its digits cannot be mistaken for money.
  let episodes: number | null = null
  let stripped = text
  EPISODE_COUNT.lastIndex = 0
  for (const m of text.matchAll(EPISODE_COUNT)) {
    const n = Number(m[1])
    // «حلقة واحدة» carries no digit and «1 حلقة» divides by one — neither is a
    // count worth dividing by, and treating them as one would print a
    // "per-episode" figure identical to the total, implying a derivation that
    // never happened.
    if (Number.isFinite(n) && n > 1 && episodes === null) episodes = n
    stripped = stripped.replace(m[0], " ")
  }

  const basis: PriceBasis = PER_EPISODE_MARKER.test(text) ? "per_episode" : "total"

  // Every remaining number, with where it sat, so a range joiner can be checked.
  const found: { value: number; start: number; end: number }[] = []
  for (const m of stripped.matchAll(/\d+(?:\.\d+)?/g)) {
    const value = Number(m[0])
    if (Number.isFinite(value) && value > 0) {
      found.push({ value, start: m.index!, end: m.index! + m[0].length })
    }
  }

  if (found.length === 0) return UNPARSED(raw, basis, episodes)

  if (found.length === 1) {
    return { raw, kind: "single", amount: found[0].value, min: null, max: null, basis, episodes }
  }

  if (found.length === 2 && RANGE_JOINER.test(stripped.slice(found[0].end, found[1].start))) {
    const [a, b] = [found[0].value, found[1].value].sort((x, y) => x - y)
    return { raw, kind: "range", amount: null, min: a, max: b, basis, episodes }
  }

  // Three numbers, or two with prose between them. Refusing to choose IS the
  // correct answer — see the header.
  return UNPARSED(raw, basis, episodes)
}

/**
 * Per-episode value of a figure quoted on this basis, or null when the text
 * gives us nothing to divide by.
 */
export function perEpisode(amount: number, parsed: ParsedPrice): number | null {
  if (parsed.basis === "per_episode") return amount
  if (parsed.episodes && parsed.episodes > 1) return round3(amount / parsed.episodes)
  return null
}

/** Three decimals — the dinar's precision, and `numeric(10,3)`'s. */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}

export interface PriceComparison {
  our: ParsedPrice
  /** Their figure, or null when they replied without naming one. */
  their: number | null
  /** their − ours. Negative = they are asking for a discount. Null when either side is not a single figure. */
  delta: number | null
  /** The same difference as a percentage of OUR price. Null on the same conditions. */
  deltaPct: number | null
  /** Both sides restated per episode, when the basis allows it. */
  ourPerEpisode: number | null
  theirPerEpisode: number | null
}

/**
 * Compare their counter-offer against our printed price.
 *
 * Their figure is taken to be on the SAME BASIS as the price they were looking
 * at when they typed it — the form shows them our package and asks for their
 * number beside it, so a per-episode offer draws a per-episode counter. That
 * assumption is why the basis is surfaced in the return value and printed on
 * the screen: it is an assumption, and the operator has to be able to see it.
 */
export function comparePrice(
  priceRange: string | null | undefined,
  theirAmount: number | null,
): PriceComparison {
  const our = parsePackagePrice(priceRange)
  const comparable = our.kind === "single" && our.amount != null && theirAmount != null

  return {
    our,
    their: theirAmount,
    delta: comparable ? round3(theirAmount! - our.amount!) : null,
    deltaPct: comparable ? Math.round(((theirAmount! - our.amount!) / our.amount!) * 100) : null,
    ourPerEpisode: our.kind === "single" && our.amount != null ? perEpisode(our.amount, our) : null,
    theirPerEpisode: theirAmount != null ? perEpisode(theirAmount, our) : null,
  }
}
