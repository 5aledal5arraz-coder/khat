/**
 * The quote-spelling guard must see in BOTH directions, and the folded
 * verbatim check must stay what it is (spelling-blind on purpose).
 *
 * Fixtures are the real 0_mxyqK3sDk quote files — current (proofread) and
 * quotes-preproofread/ — rendered into the same markup as
 * components/episodes/episode-story-quotes.tsx (React SSR splits «{text}» into
 * text nodes separated by `<!-- -->`).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  correctionPairs,
  renderedQuotes,
  checkQuoteSpelling,
  type LocalQuote,
} from "@/lib/stories/quote-live-check"

const DIR = join(process.cwd(), "content", "stories")
const current = JSON.parse(readFileSync(join(DIR, "0_mxyqK3sDk.quotes.json"), "utf8")).quotes as LocalQuote[]
const pre = JSON.parse(
  readFileSync(join(DIR, "quotes-preproofread", "0_mxyqK3sDk.quotes.json"), "utf8"),
).quotes as LocalQuote[]

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;")

/** Mirror of the component's markup. */
function page(quotes: LocalQuote[], transcript = ""): string {
  const cards = quotes
    .map(
      (q) =>
        `<button type="button" class="group flex"><p class="text-pretty text-body leading-prose text-foreground">«<!-- -->${esc(q.text)}<!-- -->»</p><span>0:00</span></button>`,
    )
    .join("")
  return `<html><body><section id="sec-story-quotes" class="scroll-mt-24"><div class="mb-4"><h2>من الحلقة، بصوته</h2></div><div class="grid">${cards}</div></section><section id="sec-transcript"><p>${esc(transcript)}</p></section></body></html>`
}

const pairs = correctionPairs(current, pre)
// Indices with a correction record — shown on the fixture page.
const correctedIdx = current.map((q, i) => (q.text !== pre[i].text ? i : -1)).filter((i) => i >= 0).slice(0, 3)
const plainIdx = current.map((q, i) => (q.text === pre[i].text ? i : -1)).filter((i) => i >= 0).slice(0, 3)

describe("correctionPairs", () => {
  it("finds the proofread changes in the real file", () => {
    expect(pairs.length).toBe(11)
    expect(correctedIdx).toHaveLength(3)
  })
  it("no preproofread file ⇒ no corrections", () => {
    expect(correctionPairs(current, null)).toEqual([])
  })
})

describe("renderedQuotes", () => {
  it("extracts exactly the displayed quotes (positive control)", () => {
    const shown = [...correctedIdx, ...plainIdx].map((i) => current[i])
    expect(renderedQuotes(page(shown))).toEqual(shown.map((q) => q.text.normalize("NFC")))
  })
  it("null when the quote block is absent — cannot see ≠ zero stale", () => {
    expect(renderedQuotes("<html><body>no quotes</body></html>")).toBeNull()
  })
})

describe("checkQuoteSpelling — both directions", () => {
  it("page shows the CORRECTED spelling ⇒ 0 stale, all corrected live", () => {
    const shown = [...correctedIdx, ...plainIdx].map((i) => current[i])
    const r = checkQuoteSpelling(renderedQuotes(page(shown))!, current, pairs)
    expect(r.shown).toBe(6)
    expect(r.notVerbatim).toEqual([])
    expect(r.correctedShown).toBe(3)
    expect(r.correctedLive).toBe(3)
    expect(r.stale).toEqual([])
    expect(r.correctedNotShown).toBe(pairs.length - 3)
  })

  it("page shows the PRE-PROOFREAD spelling ⇒ raw mode reports every stale one", () => {
    const shown = [...correctedIdx.map((i) => pre[i]), ...plainIdx.map((i) => current[i])]
    // The transcript on the page carries the ASR spelling, as in production.
    const html = page(shown, correctedIdx.map((i) => pre[i].text).join(" "))
    const r = checkQuoteSpelling(renderedQuotes(html)!, current, pairs)
    expect(r.stale).toHaveLength(3)
    expect(r.stale.every((s) => s.matchesPreproofread)).toBe(true)
    expect(r.correctedLive).toBe(0)
  })

  it("the folded verbatim check alone is blind to the stale spelling (why raw mode exists)", () => {
    const shown = correctedIdx.map((i) => pre[i])
    const r = checkQuoteSpelling(renderedQuotes(page(shown))!, current, pairs)
    // Folded: every stale quote is still "verbatim" — the fold erases ة/ه etc.
    expect(r.notVerbatim).toEqual([])
    // Raw: it is not the corrected text.
    expect(r.stale).toHaveLength(3)
  })

  it("a quote that is not in the local file at all fails the folded check", () => {
    const r = checkQuoteSpelling(["جملة لم يقلها أحد في هذه الحلقة"], current, pairs)
    expect(r.notVerbatim).toHaveLength(1)
    expect(r.stale).toEqual([])
  })
})
