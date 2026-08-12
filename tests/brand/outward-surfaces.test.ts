/**
 * The logo guard, widened to every surface that leaves the building.
 *
 * `logo-art.test.ts` proves the shipped assets ARE the artwork, and that no
 * rebuild survives in `components/brand`. That scope was too narrow and it cost
 * us: the CSS lookalike was still alive in `lib/email/templates.ts`, on the
 * campaign send path, so it reached every newsletter subscriber — a wider
 * external audience than any of the surfaces that had been cleaned.
 *
 * So this file does not look at a directory. It walks every module that can put
 * a logo in front of someone outside the team — email, generated images, print
 * documents, structured data, the media kit — and asserts on what they emit.
 */
import { describe, it, expect } from "vitest"
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs"
import path from "node:path"

import { KHAT_INDIGO, KHAT_ORANGE, KHAT_IVORY } from "@/components/brand/khat-logo-art"
import {
  communityContributionConfirmHtml,
  communityOutcomeHtml,
  directEmailHtml,
  guestApplicationAdminHtml,
  guestApplicationConfirmHtml,
  guestPrepConfirmHtml,
  newsletterHtml,
  newsletterWelcomeHtml,
  partnerTaskReminderHtml,
  prepSubmittedAdminHtml,
  sponsorApplicationAdminHtml,
  sponsorApplicationConfirmHtml,
} from "@/lib/email/templates"
import { buildProposalHtml, type ProposalPdfInput } from "@/lib/pdf/proposal-pdf"

const ROOT = process.cwd()

/**
 * The four colours the deleted CSS lookalike invented. None is in either KHAT
 * palette. Finding any of them in code is the signature of a rebuilt logo.
 */
const INVENTED = ["#3a2d70", "#ee6a2c", "#45367f", "#2f2560", "#5a47a8"]

/**
 * The retired identity's gold, and the one question the earlier sweep never
 * asked. The media kit was searched for the wordmark's ORDER and not for its
 * PALETTE, so `#c9a84c` survived in 20 places across three files — the
 * partner-facing surface — while every other surface was cleaned.
 *
 * The answer is not "delete the gold". CLAUDE.md records the media kit's
 * black/gold palette as deliberately separate from the site tokens, and it is
 * the art direction of a document, not a logo colour: rules, folios, section
 * numerals, eyebrows, stat figures, the gate's button. That stays.
 *
 * What does not stay is gold setting the brand NAME. `PODCAST KHAT` typeset in
 * the retired identity's colour, next to the new mark, is a wordmark
 * substitute — the exact thing this wave removed everywhere else, wearing the
 * palette that was supposed to have been retired with it. The cover, the
 * password gate and the closing signature all did that, on screen and in the
 * PDF; all four are the artwork now.
 */
const RETIRED_GOLD = "#c9a84c"

/**
 * The brand name, in either script.
 *
 * BOTH SCRIPTS, DELIBERATELY. The first version of the typeset-name rule below
 * matched `PODCAST KHAT` only, so the Arabic name — the one a reader of this
 * site actually reads — could be set as type on any surface and the whole file
 * stayed green. The cover mutation that put «بودكاست خط» back beside the lockup,
 * i.e. exactly the third printing of the name this wave removed, passed 67/67.
 */
const BRAND_NAME = /PODCAST\s+KHAT|بودكاست\s+خط/

/**
 * What the reader sees, not what the file contains.
 *
 * `&nbsp;` renders as a space and this document already uses it between words
 * («أُعدّ لـ &nbsp;/&nbsp; PREPARED FOR»), so `PODCAST&nbsp;KHAT` is the same
 * wordmark to a reader and a different string to `\s`. Both spellings of the
 * name went through the guard untouched until this normalised first.
 *
 * ENTITIES ARE DECODED, NOT LISTED. The first version enumerated the six space
 * entities it knew about, which answered "is this whitespace" and left the
 * letters alone: «&#1576;&#1608;&#1583;&#1603;&#1575;&#1587;&#1578; &#1582;&#1591;»
 * is «بودكاست خط» to every reader, and matched nothing here. Any name can
 * be spelled that way, in any script, so the fix is to decode the numeric forms
 * generally rather than to add another six strings to a list.
 *
 * DECLARED LIMIT: only the NUMERIC forms are decoded. NAMED entities other than
 * the ones listed below are not, and that is a judgement rather than an
 * omission — neither Arabic letters nor the Latin alphabet have named entities,
 * so there is no way to spell either half of this brand with them. If a name
 * ever appears here that can be (an accented Latin one, say), this is the
 * function to widen, and the canary block near the bottom is where the case
 * gets pinned before the fix.
 *
 * ── THE INVISIBLE CHARACTERS, WHICH ARE THE DANGEROUS ONES IN AN RTL FILE ──
 * `\s` and «بودكاست خط» both assume the name is spelled with the characters a
 * reader sees. In an Arabic codebase it very often is not. All three of these
 * render as the brand name — identically, to the pixel, in the last case — and
 * none of them matched `BRAND_NAME`:
 *
 *   RLM (U+200F) in front of it. Routine in RTL source: editors and paste
 *     buffers insert bidi marks on their own, so this one needs no author.
 *   ZWJ (U+200D) inside the word.
 *   TATWEEL (U+0640), the Arabic elongation character, inside the word.
 *
 * This is the same question the entity decoding above answers — what does the
 * READER see — asked of characters that have no width at all, so it belongs in
 * this function rather than in a fourth rule beside it. Stripped after
 * decoding, so the numeric spellings (`&#8207;`) are caught by the same pass.
 *
 * \u2500\u2500 A COUNTED LIST WAS THE WRONG SHAPE, AND IT MISSED THE ARABIC ONE \u2500\u2500\u2500\u2500\u2500\u2500\u2500
 * The list above enumerated the bidi marks somebody had thought of. What it
 * left out is the spelling most likely to occur in an Arabic codebase at all:
 * TASHKEEL. \u00ab\u0628\u064f\u0648\u062f\u0643\u0627\u0633\u062a \u062e\u064e\u0637\u00bb is the brand name to every reader \u2014 the vowel marks
 * sit above the letters and change nothing about the word \u2014 and it matched
 * nothing here. Nor did WORD JOINER (U+2060), SOFT HYPHEN (U+00AD) or the
 * emoji variation selector (U+FE0F), each zero-width, each needing its own
 * entry in a list that was already the wrong shape.
 *
 * So the rule is the Unicode CLASS instead of the members. `\p{Cf}` is every
 * format character \u2014 all the bidi marks and joiners, WORD JOINER, SOFT HYPHEN,
 * BOM \u2014 and `\p{Mn}` is every nonspacing mark \u2014 all tashkeel, the variation
 * selectors. Both are BY DEFINITION characters that advance the cursor by
 * nothing, which is precisely the property that makes them invisible to a
 * reader and fatal to a `\s`-based rule; enumerating them was answering a
 * question Unicode had already answered. TATWEEL stays named because it is
 * neither: a modifier LETTER (Lm) that happens to render as stretched baseline.
 *
 * MEASURED, both directions: the eleven real surfaces gain no offender from
 * this, and every prose canary still reads as prose. The only strings it newly
 * matches are ones a reader already reads as the name.
 */
const INVISIBLE_MARKS = /[\p{Cf}\p{Mn}\u0640]/gu

function renderedText(chunk: string): string {
  const cp = (raw: string, point: number) =>
    Number.isFinite(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : raw
  return (
    chunk
      .replace(/&#x([0-9a-f]+);/gi, (raw, hex) => cp(raw, parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (raw, dec) => cp(raw, Number(dec)))
      // The named spaces have no numeric form to decode, and a decoded
      // non-breaking or thin space is still not a plain space to `\s`. The
      // named joiner and bidi marks are listed for the same reason.
      .replace(/&nbsp;|&ensp;|&emsp;|&thinsp;/gi, " ")
      .replace(/&zwnj;|&zwj;|&lrm;|&rlm;/gi, "")
      .replace(/[\u00a0\u2002\u2003\u2009\u202f]/g, " ")
      .replace(INVISIBLE_MARKS, "")
  )
}

/**
 * The index of the `}` closing the `{` at `start`, or -1 if nothing closes it.
 *
 * Nesting and quoting both matter: `{cond && <X>{y}</X>}` closes at the LAST
 * brace, and `{"}"}` closes at the last one too. A plain `indexOf("}")` folds
 * away half a container and leaves the other half sitting in the text — the
 * same class of half-fix as stripping `/* … *\/` and leaving `{}` behind.
 */
function matchBrace(text: string, start: number): number {
  let depth = 0
  let quote: string | null = null
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (quote) {
      if (ch === "\\") i++
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === "`") quote = ch
    else if (ch === "{") depth++
    else if (ch === "}" && --depth === 0) return i
  }
  return -1
}

/**
 * What a `{…}` container renders, when that is knowable: the content of a
 * string literal, or the value behind a binding we resolved. `null` = unknown.
 *
 * ── A BACKTICK IS NOT A QUOTE ──────────────────────────────────────────────
 * The literal match used to accept all three quote characters and return the
 * raw inner text, so `` {`${x}`} `` rendered the four characters `${x}` AS THE
 * NAME'S NEIGHBOURS — an implementation error, not a declared limit: the guard
 * asserted a rendered value it had no way to know. A template literal is a
 * container in its own right, so it is folded like one and its `${…}` holes
 * become the same unknown space every other unknown becomes. That makes
 * `` {`بودكاست خط ${ref}`} `` READABLE rather than merely un-mangled.
 *
 * ── THE NAME INSIDE THE EXPRESSION, NOT ONLY BEFORE IT ─────────────────────
 * The container fold caught `{cond && <Icon />}بودكاست خط` — the name AFTER an
 * expression. It was blind to the name INSIDE one:
 *
 *   {cond && "بودكاست خط"}          {cond ? "بودكاست خط" : ""}
 *
 * which is the ordinary way anyone writes a conditional label, and which folded
 * to a single space — the name deleted rather than displaced, so not even the
 * anchor could see it. Any branch that CAN render the name is treated as
 * rendering it, which is the same deliberate conservatism declared on the fold:
 * a false positive costs one exemption, a false negative ships a wordmark.
 *
 * ── AND THE BARE-IDENTIFIER BRANCH IS GONE, BECAUSE IT WAS DEAD ────────────
 * `if (/^[A-Za-z_$][\w$]*$/.test(inner)) return bindings.get(inner) ?? null`
 * stood here and no input in the world could tell it from its absence: the
 * compound path below scans the same identifiers and returns the same binding,
 * and returns null in the same case. Mutation testing found it — deleting the
 * line changed nothing, which is the definition of untestable rather than
 * untested. The honest options were to cover it or to delete it, and there is
 * no input that covers it, so it is deleted. `{BRAND}` still resolves; the
 * canary that says so is in the table at the bottom.
 */
function containerValue(inner: string, bindings: Map<string, string>): string | null {
  const literal = inner.match(/^(["'])([^"'`]*)\1$/)
  if (literal) return literal[2]
  const template = inner.match(/^`([^`]*)`$/)
  if (template) return foldExpressions(template[1], bindings)

  // A compound expression — and a bare identifier is the one-term case of it.
  // Only its knowable pieces are read, and only to answer "can the name come
  // out of here" — never to claim what it renders.
  for (const [, , value] of inner.matchAll(/(["'`])((?:[^"'`\\]|\\.)*)\1/g)) {
    if (BRAND_NAME.test(renderedText(value))) return value
  }
  for (const [name] of inner.matchAll(/[A-Za-z_$][\w$]*/g)) {
    const bound = bindings.get(name)
    if (bound !== undefined) return bound
  }
  return null
}

/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  THE ROOT CAUSE OF THE BLIND GUARD — a JSX comment was never the class.  ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 *
 * `code()` below strips the comment form `{/* … *\/}` because a bare `{}` left
 * in the text pushed the name off the `^\s*` anchor. That treated ONE spelling
 * of a general fault: the anchor is defeated by ANY expression container, and
 * the comment is the least likely of them. Measured, each of these hid a live
 * violation with the whole file green:
 *
 *   {" "}   {null}   {cond && <Icon />}   {"بودكاست خط"}   {BRAND}
 *
 * `{" "}` is the one that matters, because NOBODY HAS TO WRITE IT: Prettier
 * emits it when it wraps a line, so reformatting app/page.tsx is enough to
 * blind the guard with no intent and nothing in the diff worth reviewing. One
 * is already live in that file, harmless only because of where it happens to
 * sit.
 *
 * So the fold is over containers, not over comments. Three outcomes:
 *   · a literal — `{"بودكاست خط"}` — renders its content, so the name held
 *     in a JS string is caught exactly like the name written as text;
 *   · a resolved binding — `{BRAND}` — renders the string it holds. This is
 *     the same one-hop resolution the colour rule already does for
 *     `style={{ color: LEGACY }}`, and the symmetry is the point: two rules
 *     disagreeing about what a binding means is how a surface falls between
 *     them;
 *   · anything else renders an unknown, folded to a space. DELIBERATELY
 *     CONSERVATIVE — `{x}بودكاست خط` is reported even though `x` may print
 *     something first. A guard that guesses "probably prose" is the guard we
 *     already had. A false positive costs one declared exemption; a false
 *     negative ships a wordmark to a partner.
 *
 * `${…}` in a template literal is the same container wearing a dollar — the
 * `.ts` surfaces (email, PDF) are built entirely out of those — so the `$` is
 * folded away with it instead of being left behind to break the anchor itself.
 *
 * `literalsOnly` is for the whole-FILE scan, where a JSX container cannot be
 * told apart from an object literal or a CSS block. There, only containers
 * whose rendered value is KNOWN are folded and the rest are left alone.
 */
function foldExpressions(
  text: string,
  bindings: Map<string, string>,
  literalsOnly = false,
): string {
  let out = ""
  let i = 0
  while (i < text.length) {
    if (text[i] !== "{") {
      out += text[i++]
      continue
    }
    const end = matchBrace(text, i)
    // Unbalanced — a stray brace in prose is text, like any other character.
    if (end === -1) {
      out += text[i++]
      continue
    }
    const value = containerValue(text.slice(i + 1, end).trim(), bindings)
    if (value === null && literalsOnly) {
      out += text.slice(i, end + 1)
    } else {
      if (out.endsWith("$")) out = out.slice(0, -1)
      out += value ?? " "
    }
    i = end + 1
  }
  return out
}

/**
 * The elements that render INSIDE a run of text instead of breaking it.
 *
 * THE SECOND HALF OF THE SAME ROOT CAUSE. Normalising `&nbsp;` fixed the
 * characters and left the markup: the previous walk cut a new chunk at every
 * `<`, so a name with an inline element in the middle of it arrived as two
 * chunks and neither one held the name. That was not hypothetical — it was
 * shipping, in `lib/pdf/proposal-pdf.ts`, on the partner-facing document:
 *
 *   <div>بودكاست <span class="em">خط</span> · ${esc(reference)}</div>
 *
 * A reader gets «بودكاست خط · REF-…»; the guard got `<div>بودكاست ` and
 * `<span class="em">خط` and reported zero matches. Text sitting after an inline
 * close (` · …` above) was in no chunk at all. Folding these tags away is the
 * markup-level version of what `renderedText` does at the character level.
 */
const INLINE_ELEMENTS = new Set([
  "a", "abbr", "b", "bdi", "bdo", "big", "cite", "code", "del", "dfn", "em", "i", "ins",
  "kbd", "label", "mark", "q", "s", "samp", "small", "span", "strong", "sub", "sup",
  "time", "tspan", "u",
])

/** The same set as markup, for stripping inline tags out of a whole file. */
const INLINE_TAG = new RegExp(`</?(?:${[...INLINE_ELEMENTS].join("|")})\\b[^<>]*>`, "gi")

/** Elements that never have a closing tag, so they must not open a run. */
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
  "source", "track", "wbr",
])

/**
 * The elements whose nesting is tracked, so a colour set on a WRAPPER is known
 * to reach the name inside it.
 *
 * A fixed HTML vocabulary on purpose, not "anything shaped like a tag". These
 * are TypeScript files: `Record<string, X>` and `<QuoteImageTemplateProps>`
 * split on `<` exactly like markup and would push an element that never closes,
 * and a drifting stack invents ancestors. Components are therefore NOT tracked
 * — see the limits declared on the colour rule.
 */
const BLOCK_ELEMENTS = new Set([
  "article", "aside", "blockquote", "body", "button", "div", "dd", "dl", "dt", "fieldset",
  "figcaption", "figure", "footer", "form", "g", "h1", "h2", "h3", "h4", "h5", "h6",
  "head", "header", "html", "li", "main", "nav", "ol", "p", "section", "svg", "table",
  "tbody", "td", "text", "tfoot", "th", "thead", "title", "tr", "ul",
])

/**
 * One element and the text a reader actually reads inside it.
 *
 * `text` is the run with inline elements folded in and entities resolved.
 * `markup` is every tag that opened in it, so an exemption can be anchored to
 * any of them. `segments` records which tags were OPEN across each stretch of
 * that text, and `ancestors` the block elements enclosing the whole run —
 * together they answer "what is painting this name", wrapper included.
 */
type Element = {
  head: string
  markup: string
  text: string
  ancestors: string[]
  segments: { from: number; to: number; tags: string[] }[]
}

function elements(src: string): Element[] {
  const out: Element[] = []
  const stack: string[] = [] // open block elements, outermost first
  let cur: Element | null = null
  let inline: string[] = [] // open inline elements inside `cur`

  const addText = (raw: string) => {
    if (!cur || !raw) return
    const from = cur.text.length
    cur.text += renderedText(raw)
    cur.markup += raw
    cur.segments.push({ from, to: cur.text.length, tags: [cur.head, ...inline] })
  }
  const flush = () => {
    if (cur) out.push(cur)
    cur = null
    inline = []
  }

  const parts = src.split("<")
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    // A `<` that does not begin a tag — a comparison, the tail of a generic —
    // is text. Same tolerance the previous chunker had.
    const m = part.match(/^(\/?)([A-Za-z][\w.:-]*)(?=[\s/>]|$)/)
    if (!m) {
      addText("<" + part)
      continue
    }
    const closing = m[1] === "/"
    const gt = part.indexOf(">")
    const tag = "<" + (gt === -1 ? part : part.slice(0, gt + 1))
    const after = gt === -1 ? "" : part.slice(gt + 1)
    const name = m[2].toLowerCase()
    const selfClosing = tag.endsWith("/>")

    if (INLINE_ELEMENTS.has(name)) {
      if (cur) cur.markup += tag
      if (closing) inline.pop()
      else if (!selfClosing) inline.push(tag)
      addText(after)
      continue
    }
    // Void and self-closing elements own no text: an <img/> or a <Sparkles/>
    // does not end its parent's run, it sits inside it.
    if (selfClosing || VOID_ELEMENTS.has(name)) {
      if (cur) cur.markup += tag
      addText(after)
      continue
    }

    flush()
    const ancestors = [...stack]
    if (BLOCK_ELEMENTS.has(name)) {
      if (closing) stack.pop()
      else stack.push(tag)
    }
    if (closing) {
      // ── THE TEXT AFTER A CLOSE IS IN THE ELEMENT STILL OPEN AROUND IT ─────
      // This used to be `continue`, which threw `after` away: every character
      // between a `</div>` and the next `<` belonged to no element and no rule
      // ever saw it. That is not a corner of the syntax, it is how JSX is
      // ordinarily formatted, and the wrapped plant below CANNOT detect it —
      // the plant carries its own <div>, so it always opens a run for itself.
      // Measured: a bare «بودكاست خط · khatpodcast.com» planted after a
      // `</div>` in components/media-kit/media-kit-view.tsx — a real wordmark,
      // on a partner-facing surface, with no exemption near it — passed this
      // file 87/87 and the whole brand suite 120/120.
      //
      // A reader reads that text inside the PARENT, so the run resumes there:
      // the parent's opening tag becomes this run's head, so a colour set on it
      // still counts as painting the name and an exemption anchored to it still
      // covers its own text. Top-level text (no block open) keeps an empty head
      // rather than being dropped — an empty tag paints nothing and anchors
      // nothing, which is the truthful answer, and the name is still SEEN.
      const parent = stack[stack.length - 1] ?? ""
      cur = { head: parent, markup: parent, text: "", ancestors: stack.slice(0, -1), segments: [] }
      addText(after)
      continue
    }
    cur = { head: tag, markup: tag, text: "", ancestors, segments: [] }
    addText(after)
  }
  flush()
  return out
}

/**
 * A whole file as a reader would see it: entities resolved, inline elements
 * removed, and the containers whose value is knowable folded to it. For the
 * rules that scan a file rather than an element.
 *
 * `literalsOnly`, because at file level there is no way to tell a JSX container
 * from an object literal or a CSS block, and folding those away would delete
 * the vocabulary the colour rules read. It is still enough for the spelling
 * that actually occurs — `KHAT{" "}PODCAST`, which Prettier can write on its
 * own — without inventing a parser for the rest.
 */
function renderedSource(src: string): string {
  return foldExpressions(renderedText(src), new Map(), true).replace(INLINE_TAG, "")
}

/**
 * The retired gold in any notation these files actually use. `--gold-glow` is
 * already written `rgba(201, 168, 76, …)`, so hex-only matching left the same
 * colour reachable under a second spelling.
 */
function isRetiredGold(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (v === RETIRED_GOLD) return true
  const rgb = v.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/)
  if (!rgb) return false
  const hex = rgb.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("")
  return `#${hex}` === RETIRED_GOLD
}

/**
 * The custom properties in a file that resolve — through `var()` chains — to
 * the retired gold.
 *
 * THIS IS THE HOLE THE WAVE WAS BUILT TO FIND, in its own guard. The PDF path
 * is one big `<style>` block over CSS variables: `#c9a84c` appears once in the
 * entire file, in the `--gold:` declaration, and every use is `var(--gold)`. A
 * rule that demanded the literal hex on the element therefore could not fire on
 * that surface at all — the brand name painted `var(--gold)` in the PDF passed
 * 67/67. Resolving the vocabulary first is the difference between checking
 * characters and checking the colour.
 */
function goldVars(src: string): Set<string> {
  const declared = new Map<string, string>()
  for (const [, name, value] of src.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+)[;}]/g)) {
    declared.set(name, value.trim())
  }
  const resolve = (value: string, depth = 0): string => {
    const ref = depth > 8 ? null : value.match(/^var\(\s*(--[\w-]+)/)
    const next = ref ? declared.get(ref[1]) : undefined
    return next === undefined ? value : resolve(next, depth + 1)
  }
  const gold = new Set<string>()
  for (const [name, value] of declared) if (isRetiredGold(resolve(value))) gold.add(name)
  return gold
}

/** Does this declaration value land on the retired gold, directly or via a var? */
function valuePaintsGold(value: string, vars: Set<string>): boolean {
  if (value.toLowerCase().includes(RETIRED_GOLD)) return true
  for (const [, name] of value.matchAll(/var\(\s*(--[\w-]+)/g)) if (vars.has(name)) return true
  for (const [rgb] of value.matchAll(/rgba?\([^)]*\)/g)) if (isRetiredGold(rgb)) return true
  return false
}

/**
 * The classes in a stylesheet whose `color` lands on the retired gold. Without
 * this, `.page-footer-brand { color: var(--gold) }` would repaint the one
 * placement this file exempts by name straight back into the retired identity,
 * and the colour rule — which never looks inside the style block — would agree.
 */
function goldClasses(src: string, vars: Set<string>): Set<string> {
  const out = new Set<string>()
  for (const [, selector, body] of src.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    const color = body.match(/(?:^|[;\s])color\s*:\s*([^;]+)/)
    if (!color || !valuePaintsGold(color[1], vars)) continue
    for (const [, cls] of selector.matchAll(/\.([\w-]+)/g)) out.add(cls)
  }
  return out
}

/**
 * The same resolution one level up, for the TSX surfaces: JavaScript bindings
 * whose value IS the retired gold, so `style={{ color: LEGACY }}` counts as the
 * colour it holds. CSS variables were not the only way to spell the hex without
 * writing it — this is the JS spelling of the identical dodge.
 */
function goldIdentifiers(src: string): Set<string> {
  const out = new Set<string>()
  for (const [, name, value] of src.matchAll(
    /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*["'`]([^"'`]+)["'`]/g,
  )) {
    if (isRetiredGold(value)) out.add(name)
  }
  for (const [, name, value] of src.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*["'`]([^"'`]+)["'`]/g)) {
    if (isRetiredGold(value)) out.add(name)
  }
  return out
}

/**
 * The same resolution across a module boundary, one hop.
 *
 * `goldIdentifiers` only ever looked inside the file it was handed, so lifting
 * the palette into a shared module — an ordinary refactor, not a corner case —
 * reopened the very rule this guard was written for: `${LEGACY_GOLD}` imported
 * from `./palette` repainted the wordmark with the hex nowhere in the file, and
 * all 68 tests stayed green. One hop covers extraction; a constant re-exported
 * through a second module is a limit declared on the colour rule.
 */
function importedGoldIdentifiers(rel: string, src: string): Set<string> {
  const out = new Set<string>()
  const dir = path.dirname(path.join(ROOT, rel))
  for (const [, names, spec] of src.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+|@\/[^"']+)["']/g,
  )) {
    const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : path.resolve(dir, spec)
    const file = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(
      (p) => existsSync(p) && statSync(p).isFile(),
    )
    if (!file) continue
    const gold = goldIdentifiers(code(readFileSync(file, "utf8")))
    if (gold.size === 0) continue
    for (const entry of names.split(",")) {
      const [imported, alias] = entry.trim().split(/\s+as\s+/)
      if (imported && gold.has(imported.trim())) out.add((alias || imported).trim())
    }
  }
  return out
}

/** Is the name in this stretch of text set in the retired gold by this tag? */
function tagPaintsGold(
  tag: string,
  vars: Set<string>,
  classes: Set<string>,
  idents: Set<string>,
): boolean {
  if (valuePaintsGold(tag, vars)) return true
  for (const id of idents) if (new RegExp(`\\b${id}\\b`).test(tag)) return true
  const named = tag.match(/class(?:Name)?="([^"]*)"/)
  return named ? named[1].split(/\s+/).some((c) => classes.has(c)) : false
}

/**
 * The places the name may still be set as type, and why. Each is anchored to
 * something a rewrite has to touch on purpose, so the exception cannot quietly
 * spread — same shape as MIN_HEIGHT_EXEMPT in the icon builder. The last test
 * in this describe fails if an entry here stops matching anything, so the list
 * cannot rot into a rubber stamp either.
 */
const TYPESET_NAME_EXEMPTIONS: { surface: string; anchor: RegExp; why: string }[] = [
  {
    surface: "app/admin/media-kit/page.tsx",
    anchor: /class="page-footer-brand"/,
    why:
      "Running foot repeated beside a page number at 10px in a print document. " +
      "No lockup fits (MIN_HEIGHT 40 against a 10px band) and a publication name " +
      "next to a folio is document furniture, not a logo placement.",
  },
  {
    surface: "lib/email/templates.ts",
    anchor: /^<title>/,
    why:
      "The document title — the string the mail client puts in its own chrome. " +
      "It is metadata, never rendered as type inside the message, and no image " +
      "can go there.",
  },
  {
    surface: "lib/email/templates.ts",
    anchor: /class="nl-footer-brand"/,
    why:
      "The newsletter's own running foot, under the social row at 12–12.5px. " +
      "Same case as the print footer: the real lockup is already at the top of " +
      "the message as artwork, and this is the sign-off line beside the URL.",
  },
  {
    surface: "app/(home)/page.tsx",
    anchor: /className="inline-flex[^"]*rounded-full[^"]*text-micro/,
    why:
      "The hero eyebrow pill, anchored to the <span> that actually carries its " +
      "styling. It used to be anchored to the <Sparkles /> icon instead, purely " +
      "because the old chunker cut a new chunk at every '<' and the pill's text " +
      "landed after the icon rather than after the span; now that inline " +
      "elements are folded into their run, the exemption can name the real " +
      "thing. OPEN DESIGN QUESTION, not a settled exemption: the site header " +
      "directly above already renders the real lockup, so this is the name set " +
      "a second time on the same screen. Left as-is because removing it changes " +
      "the homepage — sara and Khaled decide, and until then it is declared.",
  },
  {
    surface: "lib/pdf/proposal-pdf.ts",
    anchor: /class="footer-brand"/,
    why:
      "The proposal's running foot, at 12px beside the reference number, under " +
      "a cover that already carries the real horizontal lockup at 44px. Same " +
      "case as the media-kit and newsletter footers: no lockup fits (MIN_HEIGHT " +
      "40 against a 12px band) and a publication name next to a reference is " +
      "document furniture. THIS WAS NOT A JUDGEMENT ANYONE MADE — it shipped " +
      "unseen: «بودكاست <span class=\"em\">خط</span>» split the name across two " +
      "chunks, so the guard counted zero matches on a partner-facing document " +
      "and no exemption was ever needed. The class exists so the exemption has " +
      "something a rewrite has to touch on purpose. STILL OPEN: the <span> sets " +
      "خط in indigo, which makes this two-tone type rather than the flat single " +
      "colour the other two footers use — a design call for sara, not a guard " +
      "call, and deliberately not changed here.",
  },
]

/**
 * The bindings on this surface that HOLD the brand name, one hop out.
 *
 * The colour rule resolves `LEGACY` to the hex it holds; this is the same
 * question asked of the other half of the wordmark. Without it `{BRAND}`
 * renders an unknown and the name is reported as an unattributable offender —
 * true, but useless to whoever has to fix it — and `<span>{BRAND}</span>` with
 * `const BRAND = "بودكاست خط"` is a wordmark by any reading.
 *
 * One hop ACROSS A MODULE BOUNDARY, the same limit the colour side declares: it
 * resolves the extraction refactor that actually happens, not a chain of
 * re-exports.
 *
 * INSIDE one file the chain is followed, and the distinction is not pedantry —
 * the written limit said "one hop" and the reader was left to assume it covered
 * `const A = "بودكاست خط"` followed by `const B = A`, which it did not. A local
 * alias is not a hop at all: nothing is imported, nothing is re-exported, and
 * `{B}` renders the name. It cost four lines to actually cover, so it is
 * covered rather than declared away. Bounded to keep a cycle from hanging the
 * suite; a chain deeper than that is a limit, and a real one this time.
 */
function brandNameBindings(rel: string, src: string): Map<string, string> {
  const harvest = (text: string): Map<string, string> => {
    const found = new Map<string, string>()
    const keep = (name: string, value: string) => {
      if (BRAND_NAME.test(renderedText(value))) found.set(name, value)
    }
    for (const [, name, value] of text.matchAll(
      /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*["'`]([^"'`]+)["'`]/g,
    )) keep(name, value)
    for (const [, name, value] of text.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*["'`]([^"'`]+)["'`]/g))
      keep(name, value)

    // `const B = A`, where A already holds the name. Repeated so a two-step
    // rename resolves; the pass stops as soon as it stops learning anything.
    for (let depth = 0; depth < 4; depth++) {
      const before = found.size
      for (const [, alias, source] of text.matchAll(
        /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*([A-Za-z_$][\w$]*)\s*(?:$|[\n;])/gm,
      )) {
        const value = found.get(source)
        if (value !== undefined && !found.has(alias)) found.set(alias, value)
      }
      if (found.size === before) break
    }
    return found
  }

  const out = harvest(src)
  const dir = path.dirname(path.join(ROOT, rel))
  for (const [, names, spec] of src.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*["'](\.[^"']+|@\/[^"']+)["']/g,
  )) {
    const base = spec.startsWith("@/") ? path.join(ROOT, spec.slice(2)) : path.resolve(dir, spec)
    const file = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find(
      (p) => existsSync(p) && statSync(p).isFile(),
    )
    if (!file) continue
    const found = harvest(code(readFileSync(file, "utf8")))
    if (found.size === 0) continue
    for (const entry of names.split(",")) {
      const [imported, alias] = entry.trim().split(/\s+as\s+/)
      const value = imported ? found.get(imported.trim()) : undefined
      if (value !== undefined) out.set((alias || imported).trim(), value)
    }
  }
  return out
}

/**
 * The anchor: the name STANDS ALONE inside an element — it is the first thing a
 * reader sees there, and nothing but furniture follows it.
 *
 * ── THE RULE NOW MATCHES THE SENTENCE THAT DESCRIBES IT ────────────────────
 * The prose declared right above the offender test — "the name inside a
 * sentence is prose about the show and is left alone" — was not the rule. The
 * rule was "the name is first and is followed by a space", so
 *
 *   <p>بودكاست خط يستضيف هذا الأسبوع ضيفاً جديداً</p>
 *
 * was reported as a typeset wordmark. That is an ordinary sentence opening with
 * the subject, which is how Arabic sentences open, and there is no artwork that
 * can replace the first two words of it. A guard that cries on the correct
 * thing is a guard someone deletes a week later, and this one is load-bearing.
 *
 * So: what may follow the name is FURNITURE, not another word. A separator, a
 * reference number, a URL — «بودكاست خط · REF-2026-01», «بودكاست خط —
 * khatpodcast.com» — is a running foot with the name set as type, which is
 * exactly what the exemptions below describe. A LETTER OR DIGIT immediately
 * after it is a continuing sentence, and it is left alone.
 *
 * DECLARED TRADE, made on purpose: a genuine wordmark followed directly by a
 * word — `PODCAST KHAT MEDIA KIT` as a cover title — now reads as prose and is
 * not reported here. It is not unguarded: the colour rule matches the name
 * ANYWHERE in a run, so the same title painted in the retired gold still fails.
 * Between a false negative on a phrase nobody has written and a false alarm on
 * a sentence the site would legitimately print, the false alarm is the one that
 * gets the guard turned off.
 *
 * ── A BARE NUMBER IS FURNITURE, AND TREATING IT AS A WORD WAS INCONSISTENT ──
 * "A letter or digit is a continuing sentence" put the threshold in a place
 * nobody would defend once it was pointed at:
 *
 *   «بودكاست خط · REF-2026-01»   caught      (separator first)
 *   «بودكاست خط 2026»            not caught  (space first)
 *
 * Same name, same kind of tail, opposite answers — and the second one is a
 * COVER TITLE, which is the single most likely place a wordmark gets typeset.
 * The rule was written about the first character after the name; what it meant
 * to be about is whether a WORD follows. So a digit is now read to the end of
 * its number: «بودكاست خط 2026» ends there and is furniture, «بودكاست خط 19
 * حلقة» runs on into a word and is a sentence. A letter immediately after is
 * unchanged and still prose.
 *
 * The trade above is unchanged too and still declared: `PODCAST KHAT MEDIA KIT`
 * is prose to this rule, and gold-painted it is still caught by the colour rule.
 * Measured: the eleven surfaces and the rendered templates gain no offender.
 */
const ANCHORED_NAME = new RegExp(
  `^\\s*(?:${BRAND_NAME.source})(?!\\S)` +
    // A word straight after the name — an ordinary sentence.
    `(?!\\s*\\p{L})` +
    // A number that leads INTO a word — «… 19 حلقة» — is part of the sentence
    // too. A number that ends, or runs into more furniture, is not.
    `(?!\\s*\\p{N}[\\p{N}\\s.,:/\\u060c-]*\\p{L})`,
  "u",
)

/**
 * Every run on one surface whose own text OPENS with the brand name.
 *
 * Takes the source rather than reading it, so the canary block at the bottom of
 * this file can push planted violations through the exact same pipeline the
 * real surfaces go through. That is the whole point of it: a scanner can only
 * be proved to still see if something known-visible is fed to it.
 */
function typesetNameRuns(rel: string, src: string): Element[] {
  const bindings = brandNameBindings(rel, src)
  return elements(src).filter((el) => ANCHORED_NAME.test(foldExpressions(el.text, bindings)))
}

/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  THE OTHER END OF THE PIPE — what these modules EMIT, not what they   ║
 * ║  are written as.                                                      ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 *
 * Every rule above reads SOURCE, and each of the mechanisms this file has grown
 * — entity decoding, invisible marks, the container fold, one-hop bindings — is
 * a separate answer to the same question: what will this source PRINT? Each one
 * was added after a spelling got past the last, which is the shape of a problem
 * that has no last answer. There is one class it cannot reach at all, and it
 * needs no cleverness to write:
 *
 *   const A = "بودكاست"
 *   const B = "خط"
 *   `<div>${A} ${B}</div>`
 *
 * Neither half is the name, so no binding holds it, no entity spells it, and no
 * fold assembles it. Measured: invisible to the source scan (0), visible in the
 * output (1). `String.fromCharCode`, `.join("")` and every other composition are
 * the same shape.
 *
 * For a `.tsx` component, running it means rendering React, which is a different
 * kind of test. For the `.ts` surfaces it means CALLING THE FUNCTION, and that
 * is what these are: eleven email templates and the partner proposal, invoked
 * with neutral inputs, their HTML fed through the SAME `typesetNameRuns` and the
 * SAME exemptions as the files themselves. It is not a substitute for the source
 * scan — a template nobody renders here would go unchecked — it is the one
 * mechanism in this file that answers the question directly instead of
 * modelling it.
 *
 * INPUTS ARE DELIBERATELY NEUTRAL. A fixture containing «بودكاست خط» would
 * report the fixture, so nothing passed in here spells the name; what the
 * output holds, the template put there.
 */
const UNSUB = "https://khatpodcast.com/unsub?token=x"

const RENDERED_SURFACES: { rel: string; what: string; html: () => string }[] = [
  { rel: "lib/email/templates.ts", what: "newsletterHtml", html: () => newsletterHtml("<p>نص تجريبي</p>", UNSUB) },
  { rel: "lib/email/templates.ts", what: "newsletterWelcomeHtml", html: () => newsletterWelcomeHtml(UNSUB) },
  { rel: "lib/email/templates.ts", what: "directEmailHtml", html: () => directEmailHtml("سالم", "موضوع", "نص", "المحرر") },
  {
    rel: "lib/email/templates.ts",
    what: "guestApplicationAdminHtml",
    html: () => guestApplicationAdminHtml({ name: "سالم", email: "a@b.co", phone: "123", country: "الكويت" }),
  },
  { rel: "lib/email/templates.ts", what: "guestApplicationConfirmHtml", html: () => guestApplicationConfirmHtml("سالم", "REF-1") },
  { rel: "lib/email/templates.ts", what: "communityContributionConfirmHtml", html: () => communityContributionConfirmHtml("سالم", "فكرة", "REF-1") },
  { rel: "lib/email/templates.ts", what: "communityOutcomeHtml (accepted)", html: () => communityOutcomeHtml("سالم", "فكرة", "accepted", "REF-1") },
  { rel: "lib/email/templates.ts", what: "communityOutcomeHtml (routed)", html: () => communityOutcomeHtml("سالم", "فكرة", "routed", "REF-1") },
  { rel: "lib/email/templates.ts", what: "guestPrepConfirmHtml", html: () => guestPrepConfirmHtml("سالم") },
  {
    rel: "lib/email/templates.ts",
    what: "sponsorApplicationAdminHtml",
    html: () => sponsorApplicationAdminHtml({ company: "شركة", contact: "سالم", email: "a@b.co", budget: "—", reference: "REF-1" }),
  },
  { rel: "lib/email/templates.ts", what: "sponsorApplicationConfirmHtml", html: () => sponsorApplicationConfirmHtml("سالم", "REF-1") },
  {
    rel: "lib/email/templates.ts",
    what: "partnerTaskReminderHtml",
    html: () =>
      partnerTaskReminderHtml({
        items: [{ company: "شركة", title: "مهمة", dueLabel: "غداً", overdue: true, priority: "high", leadId: "L1" }],
      }),
  },
  {
    rel: "lib/email/templates.ts",
    what: "prepSubmittedAdminHtml",
    html: () => prepSubmittedAdminHtml({ candidateName: "سالم", category: null, completionPercent: 80, candidateId: "C1" }),
  },
  {
    rel: "lib/pdf/proposal-pdf.ts",
    what: "buildProposalHtml",
    html: () =>
      buildProposalHtml({
        // Only five fields are read (company_name, industry, contact_name,
        // job_title, and the packages off the offer). The cast is to the
        // function's own input type, so a field it starts reading tomorrow
        // fails to type-check here rather than rendering as `undefined`.
        lead: { company_name: "شركة", industry: "إعلام", contact_name: "سالم", job_title: "مدير" },
        proposal: null,
        offer: null,
        reference: "REF-2026-01",
      } as ProposalPdfInput),
  },
]

/**
 * One walk of every surface for typeset brand names, returning both the
 * offenders and which exemptions actually fired.
 *
 * Computed once here rather than accumulated as a side effect of the offender
 * test, so the dead-exemption check below does not silently depend on another
 * test having run first — running either one alone gives the same answer.
 *
 * `code()` runs on the SOURCE targets only. Rendered HTML has no source
 * comments to strip, and what looks like one in a `<style>` block is a live
 * rule; stripping there would be the file's own runaway-comment fault, reopened
 * on the one target that is already the ground truth.
 */
function scanTypesetNames(): { offenders: string[]; used: Set<RegExp> } {
  const targets = [
    ...OUTWARD_SURFACES.map((rel) => ({ label: rel, rel, src: code(read(rel)) })),
    ...RENDERED_SURFACES.map((s) => ({ label: `${s.rel} → ${s.what}()`, rel: s.rel, src: s.html() })),
  ]
  const offenders: string[] = []
  const used = new Set<RegExp>()
  for (const { label, rel, src } of targets) {
    for (const el of typesetNameRuns(rel, src)) {
      // Exemptions are matched against the element's whole markup, so an anchor
      // may name any tag in the run rather than only the one it opens with.
      const hit = TYPESET_NAME_EXEMPTIONS.filter((e) => e.surface === rel && e.anchor.test(el.markup))
      if (hit.length === 0) offenders.push(`${label}: ${el.text.trim().slice(0, 120)}`)
      for (const e of hit) used.add(e.anchor)
    }
  }
  return { offenders, used }
}

/**
 * The retired identities: the gold wordmark (`/logo.png`, `/logo-wide.jpg`) and
 * the periwinkle chat badge (`/logo-small.jpg`).
 *
 * Anchored so `/partners/logo.png` — a placeholder for a SPONSOR's logo in the
 * partnerships admin form, nothing to do with ours — does not match.
 */
const RETIRED_ASSETS = [
  /(?<![\w/-])\/logo\.png/,
  /(?<![\w/-])\/logo-small\.jpg/,
  /(?<![\w/-])\/logo-wide\.jpg/,
  /(?<![\w/-])\/apple-touch-icon\.png/,
]

/**
 * Every file that can render a logo to someone outside the team. Kept explicit
 * rather than globbed: a new outward surface should have to be added here
 * deliberately, and the last test in this file fails if one appears that is not
 * on the list.
 */
const OUTWARD_SURFACES = [
  "lib/email/templates.ts",
  "lib/pdf/proposal-pdf.ts",
  "lib/ai/content.ts",
  "components/quotes/quote-image-templates.tsx",
  "components/media-kit/media-kit-view.tsx",
  "app/admin/media-kit/page.tsx",
  "app/media-kit/[slug]/page.tsx",
  "app/(home)/page.tsx",
  "app/manifest.ts",
  "scripts/generate-og-image.ts",
  "scripts/build-brand-icons.ts",
]

/**
 * Strip comments — a comment explaining what was removed is not a rebuild.
 *
 * ── THE BRACE STRIP IS GONE, AND ITS ABSENCE IS THE FIX ────────────────────
 * This used to lead with `/\{\s*\/\*[\s\S]*?\*\/\s*\}/g`, on the argument that
 * a JSX comment is `{/* … *\/}` and the braces are part of it: stripping only
 * the inner `/* … *\/` left a bare `{}` in the text, and the name anchor is
 * `^\s*`, so a comment above the homepage hero pill pushed `{}` in front of
 * «بودكاست خط» and the guard stopped seeing the name at all.
 *
 * That regex matched a SHAPE, not a balanced container. `{` … `*\/}` with
 * nothing tying the two together means that when a `{` is not closed
 * immediately after its comment, the match runs forward to the first `*\/`
 * followed by `}` ANYWHERE LATER IN THE FILE and deletes everything between.
 * The trigger is not exotic, it is ordinary formatting:
 *
 *   {
 *     /* keep in sync with X *\/
 *     value
 *   }
 *
 * Measured on a 152-character sample shaped like that: `code()` returned 15
 * characters. Both a «بودكاست خط» and a `PODCAST KHAT` further down the file
 * were deleted before any rule ever saw them. Not a missed violation — an
 * invisible one, which is this file's entire failure history.
 *
 * The right answer is not a better regex. It is that THE BRACES NO LONGER NEED
 * STRIPPING: `foldExpressions` now folds every `{…}` container to a space via
 * `matchBrace`, which counts depth and respects quotes. The leftover `{}` that
 * this line existed to remove is folded away by the general rule, so removing
 * the special case both fixes the blindness and deletes the reason it was here.
 * The canaries below pin both halves.
 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(\/\/|\*).*$/gm, "")
}

const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8")

describe("no outward-facing surface rebuilds or misbrands the logo", () => {
  it.each(OUTWARD_SURFACES)("%s carries none of the invented colours", (rel) => {
    const src = code(read(rel)).toLowerCase()
    for (const hex of INVENTED) {
      expect(src, `${rel} still paints ${hex}`).not.toContain(hex)
    }
  })

  it.each(OUTWARD_SURFACES)("%s serves no retired logo asset", (rel) => {
    // apple-touch-icon.png is legitimately WRITTEN by the icon builder; what
    // must never happen is a surface pointing at one of these as its logo.
    if (rel.startsWith("scripts/build-brand-icons")) return
    const src = code(read(rel))
    for (const asset of RETIRED_ASSETS) {
      expect(src, `${rel} still points at ${asset}`).not.toMatch(asset)
    }
  })

  it("never paints the brand name in the retired gold", () => {
    // Not "no gold anywhere" — the media kit's document palette is sanctioned.
    // The rule is that gold may not BE the wordmark. Checked per element, so a
    // gold divider two lines from the name does not trip it and a gold name
    // does — and now through the file's own colour vocabulary, so `var(--gold)`
    // and `.some-gold-class` count as the colour they resolve to. That includes
    // the exempted footers: they may keep being type, they may not become gold.
    //
    // "What paints it" is every tag OPEN where the name sits — the element, the
    // inline tags wrapping it, and the block elements enclosing the run. The
    // ancestors matter: colour inherits, so wrapping the exempted footer in
    // `<div style="color:var(--gold)">` produced the exact rendered result this
    // rule exists to forbid, and reached it without touching the exempted
    // element at all. Position could not save that case by definition — the
    // element is exempt — so the colour rule had to learn ancestry.
    //
    // Ancestry is a real stack, so it holds at any depth and across siblings
    // that open and close in between — both measured, not assumed. And it stays
    // quiet on gold that is merely NEAR the name: a gold inline divider that
    // closes before it, a gold sibling block, a gold span after it. Only what
    // is open where the name sits counts.
    //
    // DECLARED LIMITS, both measured as still passing:
    //   · A gold `style` on a wrapper that is NOT in BLOCK_ELEMENTS — a JSX
    //     component, `<Wrapper style="color:var(--gold)">` — is not tracked.
    //     Widening the vocabulary to "anything shaped like a tag" is what makes
    //     the stack drift on `Record<string, X>`, and an invented ancestor is a
    //     false alarm on a guard that then gets deleted. Not a good trade.
    //   · Gold re-exported through a SECOND module. One hop resolves the
    //     extraction refactor that actually happens; a chain does not.
    const offenders: string[] = []
    for (const rel of OUTWARD_SURFACES) {
      const src = code(read(rel))
      const vars = goldVars(src)
      const classes = goldClasses(src, vars)
      const idents = new Set([...goldIdentifiers(src), ...importedGoldIdentifiers(rel, src)])
      const anywhere = new RegExp(BRAND_NAME.source, "g")
      for (const el of elements(src)) {
        for (const hit of el.text.matchAll(anywhere)) {
          const from = hit.index!
          const to = from + hit[0].length
          const painting = new Set(el.ancestors)
          for (const seg of el.segments) {
            if (seg.from < to && seg.to > from) for (const tag of seg.tags) painting.add(tag)
          }
          if (![...painting].some((tag) => tagPaintsGold(tag, vars, classes, idents))) continue
          offenders.push(`${rel}: ${el.text.trim().slice(0, 120)}`)
        }
      }
    }
    expect(offenders, "brand name typeset in the retired gold").toEqual([])
  })

  it("sets the brand name as type only where the artwork cannot go", () => {
    // Everything else must be a <KhatLogo> / khatLogoMarkup() call. The cover,
    // the password gate and the closing signature were all typeset wordmarks.
    //
    // "As type" means the name STANDS ALONE as an element's own text — first
    // inside it, with the inline elements folded away, so `بودكاست <span>خط
    // </span>` is caught and `· بودكاست خط` is not. A name with a WORD after it
    // is a sentence about the show and is left alone; a name with only
    // furniture after it — a separator, a reference, a URL — is a running foot
    // with the wordmark set as type. See ANCHORED_NAME for where that line is
    // drawn and what it deliberately gives up. (A name that is not first but IS
    // painted gold is still caught by the colour rule above, which matches it
    // anywhere in the run.)
    expect(
      scanTypesetNames().offenders,
      "brand name typeset outside the declared exemptions",
    ).toEqual([])
  })

  it("declares no exemption that has stopped matching anything", () => {
    // An exemption that no longer fires is either dead weight or — worse — a
    // renamed anchor that silently stopped protecting the thing it names, which
    // is how a guard turns into decoration.
    const { used } = scanTypesetNames()
    const dead = TYPESET_NAME_EXEMPTIONS.filter((e) => !used.has(e.anchor))
    expect(dead.map((e) => `${e.surface} ${e.anchor}`), "dead exemption").toEqual([])
  })

  it("keeps the wordmark in the order the artwork uses: PODCAST KHAT", () => {
    // Every shipped SVG reads `PODCAST KHAT`. The media kit had it reversed in
    // 14 places, including the footer of every PDF page, under a cover that had
    // it the right way round.
    //
    // ON THE RENDERED FILE, like every other rule here. This one read the raw
    // source and so kept the whole hole the rest of the file was rewritten to
    // close: `KHAT&nbsp;PODCAST` and `KHAT <span>PODCAST</span>` are the
    // reversed wordmark to a reader and passed 68/68. Comments are stripped too
    // — naming the reversed order while explaining its removal is not shipping
    // it, which is the same call `code()` makes everywhere else.
    const offenders: string[] = []
    for (const rel of OUTWARD_SURFACES) {
      if (/KHAT\s+PODCAST/.test(renderedSource(code(read(rel))))) offenders.push(rel)
    }
    expect(offenders, "reversed wordmark").toEqual([])
  })
})

/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  THE CANARY — proof the scanner can still SEE, on any surface.        ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 *
 * EVERY FAULT THIS FILE HAS EVER HAD WAS THE SCANNER GOING BLIND, and not one
 * of them was found by the rule that was supposed to fire. `&nbsp;` in the
 * name, an inline `<span>` splitting it, `{}` left by a stripped comment — each
 * one made a live violation invisible, and each was caught by accident: the
 * dead-exemption test noticed an exemption had stopped matching. That test is a
 * tripwire in ONE place. Where a surface has no exemption — nine of the eleven —
 * the same blindness is completely silent, measured: a wordmark planted after
 * `{" "}` in components/quotes/quote-image-templates.tsx passed 36/36.
 *
 * So the guard cannot only assert that the surfaces are clean. It has to assert
 * that it would still notice if they were not. Each entry below is a spelling
 * of the name that a reader reads as the name, pushed through the SAME
 * `typesetNameRuns` the real surfaces go through — with no exemption anywhere
 * near it, so a green result means the scanner genuinely saw it.
 *
 * Every entry is a fault that was real: shipped, or measured as an evasion.
 * When the next one is found, it is added here first — that is what turns "we
 * fixed it" into "we would know".
 *
 * ── WHAT `pins` IS FOR, AND WHY SOME ENTRIES SHARE ONE ─────────────────────
 * A canary that reddens only when another canary also reddens is not a
 * detector, it is a second copy of one. Measured across 16 targeted mutations
 * of this file, the `{" "}`, `{null}` and `${ref}` entries had an IDENTICAL
 * signature — one detector wearing three hats — and the JSX-comment entry had
 * stopped detecting anything of its own at all, because the container fold had
 * quietly taken over the job the comment strip used to do.
 *
 * The honest fix is not to delete them. It is to say what each one pins, so a
 * shared mechanism is visible in the table instead of being mistaken for
 * breadth. Several entries below share `container fold` ON PURPOSE: they are
 * distinct SPELLINGS that were each really written or really measured, they
 * cost one regex run apiece, and if the fold is ever narrowed to some of them
 * the table says which. What they do NOT do is add coverage, and this comment
 * is what stops the row count from being read as though they did.
 *
 * `smoke` is the same admission in one word: the plain-text entry only fails
 * when the pipeline is broken end to end. That is worth exactly one test, and
 * it is labelled so nobody mistakes it for a discriminator.
 *
 * ── AND THE TABLE ONLY KNOWS WHAT WE THOUGHT OF ────────────────────────────
 * Every row here is a class someone already found. That is regression cover,
 * which is real, and it is NOT detection of a class nobody has imagined. The
 * nearest thing to a general answer is the block after this one, which plants
 * the name in each REAL surface's own syntax at every position it could sit and
 * requires the scanner to find it there; that catches a surface going dark for
 * a reason not listed below. It does not catch a spelling of the NAME nobody
 * has thought of, and there is no mechanism in this file that does — stated
 * plainly rather than implied away, because a guard overstating its reach is
 * the thing this whole file exists to stop.
 */
type CanaryMechanism =
  | "smoke"
  | "entity decoding"
  | "invisible marks"
  | "inline element folding"
  | "container fold"
  | "container value"
  | "binding resolution"
  | "comment stripping"
  | "both scripts"
  | "furniture threshold"

/** Declared once so a mechanism cannot lose its last canary unnoticed. */
const CANARY_MECHANISMS: CanaryMechanism[] = [
  "smoke",
  "entity decoding",
  "invisible marks",
  "inline element folding",
  "container fold",
  "container value",
  "binding resolution",
  "comment stripping",
  "both scripts",
  "furniture threshold",
]

/** The invisible characters, spelled by code point so this file stays legible. */
const RLM = String.fromCharCode(0x200f)
const ZWJ = String.fromCharCode(0x200d)
const TATWEEL = String.fromCharCode(0x0640)
const DAMMA = String.fromCharCode(0x064f) // بُ — the vowel mark above the letter
const FATHA = String.fromCharCode(0x064e) // خَ
const WORD_JOINER = String.fromCharCode(0x2060)
const SOFT_HYPHEN = String.fromCharCode(0x00ad)
const VS16 = String.fromCharCode(0xfe0f)

const SCANNER_CANARIES: { spelling: string; pins: CanaryMechanism; source: string }[] = [
  { spelling: "plain text", pins: "smoke", source: `<div>\n  بودكاست خط\n</div>` },

  { spelling: "&nbsp; inside the name", pins: "entity decoding", source: `<div>\n  بودكاست&nbsp;خط\n</div>` },
  { spelling: "decimal HTML entities", pins: "entity decoding", source: `<div>\n  &#1576;&#1608;&#1583;&#1603;&#1575;&#1587;&#1578; &#1582;&#1591;\n</div>` },
  // The hex branch of renderedText had NO canary at all: deleting it left every
  // other entry green. Same characters, the other numeric spelling.
  { spelling: "hex HTML entities", pins: "entity decoding", source: `<div>\n  &#x628;&#x648;&#x62f;&#x643;&#x627;&#x633;&#x62a; &#x62e;&#x637;\n</div>` },

  // The three that matter most in an Arabic codebase: the reader sees the name
  // exactly, and before this the guard saw nothing at all.
  { spelling: "an RLM in front of the name", pins: "invisible marks", source: `<div>\n  ${RLM}بودكاست خط\n</div>` },
  { spelling: "a ZWJ inside the name", pins: "invisible marks", source: `<div>\n  بودكاس${ZWJ}ت خط\n</div>` },
  { spelling: "a tatweel inside the name", pins: "invisible marks", source: `<div>\n  بو${TATWEEL}${TATWEEL}دكاست خط\n</div>` },
  { spelling: "an RLM written as an entity", pins: "invisible marks", source: `<div>\n  &#8207;بودكاست خط\n</div>` },
  // TASHKEEL — the one the counted list left out, and the likeliest of all of
  // them in an Arabic file. Nothing renders differently; the guard saw nothing.
  { spelling: "tashkeel on the name", pins: "invisible marks", source: `<div>\n  ب${DAMMA}ودكاست خ${FATHA}ط\n</div>` },
  { spelling: "a WORD JOINER inside the name", pins: "invisible marks", source: `<div>\n  بودكاست${WORD_JOINER} خط\n</div>` },
  { spelling: "a SOFT HYPHEN inside the name", pins: "invisible marks", source: `<div>\n  بودكا${SOFT_HYPHEN}ست خط\n</div>` },
  { spelling: "a variation selector inside the name", pins: "invisible marks", source: `<div>\n  بودكاست${VS16} خط\n</div>` },
  // ── THE NAMED INVISIBLE ENTITIES, WHICH HAD NO CANARY AT ALL ─────────────
  // `renderedText` strips `&zwnj;|&zwj;|&lrm;|&rlm;`, and deleting that whole
  // line broke NOTHING in the 87 tests here: the one entry that looked like it
  // covered them spells the RLM numerically (`&#8207;`), which the decoder
  // handles two lines earlier. Exactly the fault this file caught for the hex
  // branch, made again by the same reasoning — a mechanism assumed covered
  // because something NEARBY was. Both halves of the line are pinned: a bidi
  // mark and a joiner, each in its named spelling.
  { spelling: "a named &rlm; in front of the name", pins: "invisible marks", source: `<div>\n  &rlm;بودكاست خط\n</div>` },
  { spelling: "a named &zwj; inside the name", pins: "invisible marks", source: `<div>\n  بودكاس&zwj;ت خط\n</div>` },

  { spelling: "an inline tag splitting the name", pins: "inline element folding", source: `<div>\n  بودكاست <span class="em">خط</span>\n</div>` },

  { spelling: '{" "} before it (Prettier writes this)', pins: "container fold", source: `<div>\n  {" "}بودكاست خط\n</div>` },
  { spelling: "{null} before it", pins: "container fold", source: `<div>\n  {null}بودكاست خط\n</div>` },
  { spelling: "a conditional element before it", pins: "container fold", source: `<div>\n  {show && <Icon />}بودكاست خط\n</div>` },
  { spelling: "a template interpolation before it", pins: "container fold", source: `<div>\n  \${ref}بودكاست خط\n</div>` },
  { spelling: "a JSX comment before it", pins: "container fold", source: `<div>\n  {/* why this is here */}\n  بودكاست خط\n</div>` },

  // `code()` used to match `{ … */}` as a SHAPE, so a comment container whose
  // brace does not close right after it ran forward to the next `*/}` anywhere
  // later in the file and deleted everything between. Ordinary formatting;
  // measured at 152 characters in, 15 out, with both names below deleted unseen.
  {
    spelling: "a multi-line comment container above it (code() used to eat the file)",
    pins: "comment stripping",
    source:
      `<div>\n  {\n    /* keep this in sync with X */\n    value\n  }\n  بودكاست خط\n</div>\n` +
      `<div>PODCAST KHAT and a tail that must survive */}</div>`,
  },

  { spelling: "the name as a JS string literal", pins: "container value", source: `<div>\n  {"بودكاست خط"}\n</div>` },
  // The name INSIDE the expression, not merely before it — the ordinary way a
  // conditional label is written, and previously folded away to a single space.
  { spelling: "the name inside a && expression", pins: "container value", source: `<div>\n  {show && "بودكاست خط"}\n</div>` },
  { spelling: "the name inside a ternary", pins: "container value", source: `<div>\n  {show ? "بودكاست خط" : ""}\n</div>` },
  { spelling: "a template literal with a hole after the name", pins: "container value", source: `<div>\n  {\`بودكاست خط \${ref}\`}\n</div>` },
  // THE HOLE FIRST, which is the spelling that actually needs the template
  // branch. The literal regex used to accept backticks and hand back the four
  // characters `${ref}` AS RENDERED TEXT, so the name stopped being first in
  // its own run and went unseen — a claim about a value the guard could not
  // know. Measured: with the name before the hole, removing the template branch
  // changes nothing (the compound-literal path catches it anyway), so that
  // spelling alone left this mechanism with no canary of its own.
  { spelling: "a template literal with a hole before the name", pins: "container value", source: `<div>\n  {\`\${ref}بودكاست خط\`}\n</div>` },

  { spelling: "the name behind a binding", pins: "binding resolution", source: `const BRAND = "بودكاست خط"\n<div>\n  {BRAND}\n</div>` },
  { spelling: "the name behind a local alias of a binding", pins: "binding resolution", source: `const NAME = "بودكاست خط"\nconst BRAND = NAME\n<div>\n  {BRAND}\n</div>` },
  { spelling: "the name behind a binding inside an expression", pins: "binding resolution", source: `const BRAND = "بودكاست خط"\n<div>\n  {show && BRAND}\n</div>` },

  { spelling: "the Latin wordmark", pins: "both scripts", source: `<div>\n  PODCAST KHAT\n</div>` },

  // A COVER TITLE, and the shape the old threshold let through: the same tail
  // as «بودكاست خط · REF-2026-01», which was caught, differing only in whether
  // a separator or a space came first.
  { spelling: "the name followed by a bare year", pins: "furniture threshold", source: `<div>\n  بودكاست خط 2026\n</div>` },
  { spelling: "the name followed by an Arabic-Indic year", pins: "furniture threshold", source: `<div>\n  بودكاست خط ٢٠٢٦\n</div>` },
]

/**
 * The inverse, and it is not optional: without it a scanner that reported EVERY
 * run would satisfy the whole table above, and "catches everything" is not the
 * rule. The rule is that the name STANDING ALONE is a wordmark and the name in
 * a sentence is prose.
 */
const PROSE_CANARIES: { shape: string; source: string }[] = [
  {
    // Live on a card in app/page.tsx.
    shape: "the name at the end of a phrase",
    source: `<div>\n  مقاطع من بودكاست خط\n</div>`,
  },
  {
    // THE FALSE ALARM THE OLD ANCHOR PRODUCED. The rule was "name first, then a
    // space", so an ordinary sentence opening with its subject — which is how
    // Arabic sentences open — was reported as a typeset wordmark. There is no
    // artwork that can replace the first two words of a sentence.
    shape: "the name opening a sentence that keeps going",
    source: `<div>\n  بودكاست خط يستضيف هذا الأسبوع ضيفاً جديداً\n</div>`,
  },
  {
    shape: "a longer word that merely starts with the name",
    source: `<div>\n  بودكاست خطوط\n</div>`,
  },
  {
    // Agreed with noura as CORRECT behaviour and not a hole: the fold returns
    // `}`, which is genuinely what a reader sees in front of the name, so the
    // name is not first. Pinned so nobody "fixes" it into a false positive.
    shape: "a literal brace rendered in front of it",
    source: `<div>\n  {"}"}بودكاست خط\n</div>`,
  },
  {
    // THE OTHER SIDE OF THE NUMBER RULE, and the reason it reads to the end of
    // the number instead of stopping at the first digit. A count is a sentence
    // opening with its subject, exactly like «بودكاست خط يستضيف…» — treating
    // every digit as furniture would have reported it.
    shape: "the name followed by a count and then a word",
    source: `<div>\n  بودكاست خط 19 حلقة منشورة\n</div>`,
  },
]

describe("the scanner is not blind", () => {
  it.each(SCANNER_CANARIES)("still sees the name written as $spelling [$pins]", ({ source }) => {
    // A path that does not exist on disk: the import hop resolves nothing, so
    // this measures the scanner and not the repository around it.
    const runs = typesetNameRuns("virtual/canary.tsx", code(source))
    expect(runs.length, `the scanner no longer sees the name in:\n${source}`).toBeGreaterThan(0)
  })

  it.each(PROSE_CANARIES)("still leaves $shape alone", ({ source }) => {
    expect(
      typesetNameRuns("virtual/canary.tsx", code(source)),
      `reported as a typeset wordmark, but a reader reads prose:\n${source}`,
    ).toEqual([])
  })

  it("keeps every declared mechanism covered by at least one canary", () => {
    // The table's own dead-entry check, and the reason `pins` is a closed union
    // rather than a free string: a mechanism that loses its last canary — the
    // way hex-entity decoding never had one — shows up here instead of nowhere.
    const covered = new Set(SCANNER_CANARIES.map((c) => c.pins))
    expect(
      CANARY_MECHANISMS.filter((m) => !covered.has(m)),
      "declared mechanism with no canary left",
    ).toEqual([])
  })
})

/**
 * ╔═══════════════════════════════════════════════════════════════════════╗
 * ║  THE SAME QUESTION, ON THE REAL FILES — the nearest thing here to a   ║
 * ║  detector for a blindness nobody thought of.                          ║
 * ╚═══════════════════════════════════════════════════════════════════════╝
 *
 * The table above proves the scanner sees twenty-two spellings on a synthetic
 * two-line document. It says nothing about whether it can still see anything at
 * all inside `lib/pdf/proposal-pdf.ts`, which is one long template literal, or
 * past whatever a future `code()` decides to remove.
 *
 * That gap is not theoretical. The runaway comment strip deleted 1042 characters
 * of a real file and every rule in this suite then reported a clean surface,
 * with the whole canary table green — because those canaries run on their own
 * sources and never touch the file that has gone dark.
 *
 * So: plant the name in each real surface, at EVERY position a block element
 * opens and at the end of the file, and require the scanner to find that exact
 * planted element. The plant carries a marker class so it is IDENTIFIED rather
 * than counted: an insertion splits the element it lands in, which moves runs
 * around, and a count would read that as blindness.
 *
 * WHAT THIS DOES NOT COVER, measured rather than assumed: the plant goes in
 * AFTER `code()` has run, so it exercises the element walk and the folds on
 * each surface's real syntax and it is blind to `code()` itself. Restoring the
 * runaway comment strip and giving app/page.tsx the formatting that triggers it
 * left this block entirely green. `code()` is therefore checked directly, by
 * the conservation test right below — planting cannot answer a question about
 * the step that runs before the plant exists.
 */
const PLANT_MARKER = "khat-canary-plant"
const PLANTED = `<div class="${PLANT_MARKER}">\n  بودكاست خط\n</div>\n`
const BLOCK_NAMES = "div|p|td|section|header|footer|h1|h2|h3|body|main|article|li"
const BLOCK_OPEN = new RegExp(`<(?:${BLOCK_NAMES})\\b[^<>]*>`, "g")

/**
 * ── AND THE PLANT ABOVE CANNOT SEE THE BIGGEST HOLE THERE WAS ──────────────
 *
 * `PLANTED` carries its OWN `<div>`, so it opens an element for itself wherever
 * it lands. That makes it blind by construction to the one question that
 * matters about the element walk: does a name that opens NO element of its own
 * still get read? For every position measured, the wrapped plant said yes and
 * the answer for bare text was no.
 *
 * The hole: `elements()` met a closing block tag, flushed the run, and
 * `continue`d — so the text between `</div>` and the next `<` was in no element
 * and no rule ever saw it. Measured on the tree before the fix, at exactly the
 * positions below: 466 of 466 invisible — every single one, on all seven
 * surfaces that have a closing block tag at all (lib/email/templates 86,
 * app/admin/media-kit 242, media-kit-view 50, lib/pdf/proposal-pdf 38,
 * app/page 29, quote-image-templates 14, app/media-kit/[slug] 7). The WRAPPED
 * plant reported 0 invisible over the same tree in the same run. One plant said
 * the scanner was perfectly sighted while the other found it totally blind, and
 * the difference between them is only that one brought its own `<div>`.
 *
 * (Noura reached the same conclusion from the other side, planting bare text at
 * the WRAPPED plant's positions and measuring 321 of 532. Fewer, because some of
 * those positions sit right after an OPEN, where bare text was always read. The
 * class is the same; these positions isolate it.)
 *
 * So the plant is run in both shapes. The marker is inside the TEXT here rather
 * than in a class, because bare text has nowhere else to carry one; the
 * separator in front of it is what a running foot looks like, and it keeps the
 * planted run anchored (see ANCHORED_NAME).
 */
const BARE_MARKER = "khat-canary-bare"
const PLANTED_BARE = `\nبودكاست خط · ${BARE_MARKER}\n`
const BLOCK_CLOSE = new RegExp(`</(?:${BLOCK_NAMES})\\s*>`, "g")

describe("the scanner is not blind on the real surfaces", () => {
  it.each(OUTWARD_SURFACES)("%s: a name planted anywhere in it is still seen", (rel) => {
    const src = code(read(rel))
    const positions = [
      ...[...src.matchAll(BLOCK_OPEN)].map((m) => m.index! + m[0].length),
      src.length,
    ]
    const blind = positions.filter((at) => {
      const planted = src.slice(0, at) + PLANTED + src.slice(at)
      return !typesetNameRuns(rel, planted).some((el) => el.markup.includes(PLANT_MARKER))
    })
    expect(
      blind.length,
      `${rel}: ${blind.length} of ${positions.length} planted names were invisible ` +
        `(first at offset ${blind[0]}). Something in this file is removing text ` +
        `before any rule ever sees it.`,
    ).toBe(0)
  })

  it.each(OUTWARD_SURFACES)("%s: a BARE name planted after a close is still seen", (rel) => {
    const src = code(read(rel))
    const positions = [...src.matchAll(BLOCK_CLOSE)].map((m) => m.index! + m[0].length)
    const blind = positions.filter((at) => {
      const planted = src.slice(0, at) + PLANTED_BARE + src.slice(at)
      return !typesetNameRuns(rel, planted).some((el) => el.text.includes(BARE_MARKER))
    })
    expect(
      blind.length,
      `${rel}: ${blind.length} of ${positions.length} names planted as BARE TEXT after a ` +
        `closing tag were invisible (first at offset ${blind[0]}). The element walk is ` +
        `dropping text that a reader reads inside the enclosing element.`,
    ).toBe(0)
  })

  /**
   * `code()` MAY REMOVE COMMENTS. IT MAY NOT REMOVE ANYTHING ELSE.
   *
   * This is the general form of the fault, and the one check here that can fail
   * on a blindness nobody has thought of: it does not ask whether some known
   * spelling still gets through, it asks whether the first step of the pipeline
   * is still handing the rules the file. Every other test in this file starts
   * AFTER `code()` has run, so all of them agree happily about a file that has
   * been half deleted — which is precisely what the runaway brace regex did,
   * with 1042 characters gone and the whole suite green.
   *
   * Line-granular on purpose: a line no comment covers has no business
   * disappearing, and saying it that way needs no second parser to disagree
   * with the first.
   *
   * The comment spans are found with the SAME `/* … *\/` regex `code()` uses,
   * and that is the point rather than a circularity: what it deliberately does
   * NOT reuse is the brace matching. A strip that removes exactly its comments
   * agrees with this check by construction; a strip that runs past them — the
   * whole failure being guarded against — removes lines no span covers, and
   * that is what shows up here.
   */
  it.each(OUTWARD_SURFACES)("%s: code() deletes comments and nothing else", (rel) => {
    const src = read(rel)
    const stripped = code(src)
    const lines = src.split("\n")

    // Which lines a block comment genuinely covers, including its own
    // continuation lines — those may vanish, and routinely do.
    const commented = new Set<number>()
    for (const m of src.matchAll(/\/\*[\s\S]*?\*\//g)) {
      const first = src.slice(0, m.index!).split("\n").length - 1
      for (let i = first; i <= first + m[0].split("\n").length - 1; i++) commented.add(i)
    }

    const swallowed = lines.filter(
      (line, i) =>
        line.trim() &&
        !commented.has(i) &&
        !/^\s*(\/\/|\*)/.test(line) &&
        !stripped.includes(line),
    )
    expect(
      swallowed.slice(0, 3),
      `${rel}: code() removed ${swallowed.length} line(s) that no comment covers`,
    ).toEqual([])
  })
})

describe("the newsletter sends the real artwork", () => {
  // This is the exact call `lib/newsletter/sender.ts` makes per recipient.
  const campaign = newsletterHtml("<p>نص تجريبي</p>", "https://khatpodcast.com/unsub?token=x")
  const welcome = newsletterWelcomeHtml("https://khatpodcast.com/unsub?token=x")

  it.each([
    ["campaign", campaign],
    ["welcome", welcome],
  ])("%s email embeds the generated lockup raster, at an absolute URL", (_name, html) => {
    const img = html.match(/<img[^>]+email-lockup\.png[^>]*>/)
    expect(img, "no lockup <img> in the email").not.toBeNull()
    expect(img![0]).toMatch(/src="https?:\/\/[^"]+\/brand\/email-lockup\.png"/)
    // Blocked-images fallback: the reader must get the name, not a broken icon.
    expect(img![0]).toContain('alt="بودكاست خط"')
    // Fixed box so the layout does not jump before the image loads.
    expect(img![0]).toMatch(/width="\d+"/)
    expect(img![0]).toMatch(/height="\d+"/)
  })

  it.each([
    ["campaign", campaign],
    ["welcome", welcome],
  ])("%s email contains no rebuilt mark and no invented colour", (_name, html) => {
    for (const hex of INVENTED) {
      expect(html.toLowerCase(), `email paints ${hex}`).not.toContain(hex)
    }
    // The lookalike's tell: the bare string خط set in a UI font inside a
    // rounded, filled box. The real mark is a drawing; no font contains it.
    expect(html).not.toMatch(/border-radius:1[0-9]px[^"]*"[^>]*>\s*<span[^>]*>\s*خط/)
    expect(html, "gradients do not render in Outlook").not.toContain("linear-gradient")
  })

  it.each([
    ["campaign", campaign],
    ["welcome", welcome],
  ])("%s email paints brand chrome in the identity's own colours", (_name, html) => {
    expect(html.toLowerCase()).toContain(KHAT_INDIGO)
    expect(html.toLowerCase()).toContain(KHAT_ORANGE)
  })

  it("ships the raster the emails point at", () => {
    const png = path.join(ROOT, "public", "brand", "email-lockup.png")
    expect(statSync(png).size).toBeGreaterThan(0)
    // PNG magic — a 404 page or an HTML error saved here would still "exist".
    expect(readFileSync(png).subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    )
  })
})

describe("the icon set is one treatment with a declared exemption", () => {
  const iconSvg = read("app/icon.svg")

  it("puts every icon surface on the indigo tile with the ivory mark", () => {
    expect(iconSvg).toContain(`fill="${KHAT_INDIGO}"`) // the tile
    expect(iconSvg).toContain(`fill="${KHAT_IVORY}"`) // the mark
    expect(iconSvg, "tab icon is back on transparency").toContain("<rect")
  })

  // The exemption itself, and whether the guard around it actually throws, are
  // checked by CALLING it in tests/brand/icon-policy.test.ts. This file used to
  // assert that the source contains the string "assertMinHeightPolicy", which
  // passes just as happily if the function is never called — the same class of
  // hollow check as a comment promising a build gate that does not exist.

  it("gives the maskable icon its own asset", () => {
    const manifest = read("app/manifest.ts")
    expect(manifest).toContain("icon-maskable-512.png")
    // The bug this replaced: icon-512 listed twice, once as maskable.
    const maskableBlock = manifest.slice(manifest.indexOf('purpose: "maskable"') - 400)
    expect(maskableBlock).not.toMatch(/src: "\/brand\/icon-512\.png"[\s\S]{0,200}maskable/)
  })
})

describe("the list of outward surfaces is not silently out of date", () => {
  it("finds no unlisted file that renders a brand mark", () => {
    // Walk the source tree for anything referencing the artwork or a retired
    // logo asset, and require it to be either a brand module, a test, or on the
    // OUTWARD_SURFACES list. This is the check that would have caught
    // lib/email/templates.ts.
    const SKIP = new Set(["node_modules", ".next", ".git", ".claude", "public", "drizzle"])
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (SKIP.has(entry)) continue
        const full = path.join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full)
          continue
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue
        const rel = path.relative(ROOT, full)
        if (rel.startsWith("components/brand") || rel.startsWith("tests/")) continue
        if (OUTWARD_SURFACES.includes(rel)) continue
        const src = code(readFileSync(full, "utf8"))
        if (RETIRED_ASSETS.some((a) => a.test(src))) hits.push(rel)
        if (INVENTED.some((h) => src.toLowerCase().includes(h))) hits.push(rel)
      }
    }
    walk(ROOT)
    expect([...new Set(hits)], "unlisted surface referencing a logo").toEqual([])
  })
})
