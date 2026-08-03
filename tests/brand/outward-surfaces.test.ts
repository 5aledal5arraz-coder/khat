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
import { newsletterHtml, newsletterWelcomeHtml } from "@/lib/email/templates"

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
 * the spaces below are not, and that is a judgement rather than an omission —
 * neither Arabic letters nor the Latin alphabet have named entities, so there
 * is no way to spell either half of this brand with them. If a name ever
 * appears here that can be (an accented Latin one, say), this is the function
 * to widen, and the canary block near the bottom is where the case gets pinned
 * before the fix.
 */
function renderedText(chunk: string): string {
  const cp = (raw: string, point: number) =>
    Number.isFinite(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : raw
  return (
    chunk
      .replace(/&#x([0-9a-f]+);/gi, (raw, hex) => cp(raw, parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (raw, dec) => cp(raw, Number(dec)))
      // The named spaces have no numeric form to decode, and a decoded
      // non-breaking or thin space is still not a plain space to `\s`.
      .replace(/&nbsp;|&ensp;|&emsp;|&thinsp;/gi, " ")
      .replace(/[\u00a0\u2002\u2003\u2009\u202f]/g, " ")
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
 */
function containerValue(inner: string, bindings: Map<string, string>): string | null {
  const literal = inner.match(/^(["'`])([^"'`]*)\1$/)
  if (literal) return literal[2]
  if (/^[A-Za-z_$][\w$]*$/.test(inner)) return bindings.get(inner) ?? null
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
    if (closing) continue
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
    surface: "app/page.tsx",
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
 * One hop, the same limit the colour side declares: it resolves the extraction
 * refactor that actually happens, not a chain of re-exports.
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

/** The anchor: the name is the FIRST thing a reader sees inside an element. */
const ANCHORED_NAME = new RegExp(`^\\s*(?:${BRAND_NAME.source})(?:\\s|$)`)

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
 * One walk of every surface for typeset brand names, returning both the
 * offenders and which exemptions actually fired.
 *
 * Computed once here rather than accumulated as a side effect of the offender
 * test, so the dead-exemption check below does not silently depend on another
 * test having run first — running either one alone gives the same answer.
 */
function scanTypesetNames(): { offenders: string[]; used: Set<RegExp> } {
  const offenders: string[] = []
  const used = new Set<RegExp>()
  for (const rel of OUTWARD_SURFACES) {
    for (const el of typesetNameRuns(rel, code(read(rel)))) {
      // Exemptions are matched against the element's whole markup, so an anchor
      // may name any tag in the run rather than only the one it opens with.
      const hit = TYPESET_NAME_EXEMPTIONS.filter((e) => e.surface === rel && e.anchor.test(el.markup))
      if (hit.length === 0) offenders.push(`${rel}: ${el.text.trim().slice(0, 120)}`)
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
  "app/page.tsx",
  "app/manifest.ts",
  "scripts/generate-og-image.ts",
  "scripts/build-brand-icons.ts",
]

/**
 * Strip comments — a comment explaining what was removed is not a rebuild.
 *
 * A JSX COMMENT IS `{/* … *\/}`, AND THE BRACES ARE PART OF IT. Stripping only
 * the `/* … *\/` left a bare `{}` sitting in the text where the comment had
 * been, and `scanTypesetNames` anchors the name to the START of a run (`^\s*`).
 * So a comment written directly above the homepage hero pill pushed `{}` in
 * front of «بودكاست خط» and the guard stopped seeing the name at all — it did
 * not report an offender, it reported nothing.
 *
 * Caught only because the dead-exemption test noticed the hero exemption had
 * stopped matching anything. That test exists so the exemption list cannot rot
 * into a rubber stamp; here it caught the SCANNER going blind instead, which is
 * the same failure wearing different clothes and the better argument for
 * keeping it.
 */
function code(src: string): string {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*(\/\/|\*).*$/gm, "")
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
    // "As type" means the name is an element's OWN text — the first thing
    // INSIDE it, with the inline elements folded away, so `بودكاست <span>خط
    // </span>` is caught and `· بودكاست خط` is not. The name inside a sentence
    // is prose about the show and is left alone; the name standing on its own is
    // a wordmark substitute. (A name that is not first but IS painted gold is
    // still caught — by the colour rule above, which matches it anywhere.)
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
 * Every entry is a fault that was real: the first four shipped, the rest were
 * measured as evasions before the container fold. When the next one is found,
 * it is added here first — that is what turns "we fixed it" into "we would
 * know".
 *
 * The last case is the inverse, and it is not optional: without it a scanner
 * that reported EVERY run would satisfy the whole table, and "catches
 * everything" is not the rule — the rule is that the name standing alone is a
 * wordmark and the name inside a sentence is prose.
 */
const SCANNER_CANARIES: { spelling: string; source: string }[] = [
  { spelling: "plain text", source: `<div>\n  بودكاست خط\n</div>` },
  { spelling: "&nbsp; inside the name", source: `<div>\n  \u0628\u0648\u062f\u0643\u0627\u0633\u062a&nbsp;\u062e\u0637\n</div>` },
  { spelling: "an inline tag splitting the name", source: `<div>\n  \u0628\u0648\u062f\u0643\u0627\u0633\u062a <span class="em">\u062e\u0637</span>\n</div>` },
  { spelling: "a JSX comment before it", source: `<div>\n  {/* why this is here */}\n  بودكاست خط\n</div>` },
  { spelling: '{" "} before it (Prettier writes this)', source: `<div>\n  {" "}بودكاست خط\n</div>` },
  { spelling: "{null} before it", source: `<div>\n  {null}بودكاست خط\n</div>` },
  { spelling: "a conditional element before it", source: `<div>\n  {show && <Icon />}بودكاست خط\n</div>` },
  { spelling: "the name as a JS string literal", source: `<div>\n  {"بودكاست خط"}\n</div>` },
  { spelling: "the name behind a binding", source: `const BRAND = "بودكاست خط"\n<div>\n  {BRAND}\n</div>` },
  { spelling: "a template interpolation before it", source: `<div>\n  \${ref}بودكاست خط\n</div>` },
  { spelling: "numeric HTML entities", source: `<div>\n  &#1576;&#1608;&#1583;&#1603;&#1575;&#1587;&#1578; &#1582;&#1591;\n</div>` },
  { spelling: "the Latin wordmark", source: `<div>\n  PODCAST KHAT\n</div>` },
]

describe("the scanner is not blind", () => {
  it.each(SCANNER_CANARIES)("still sees the name written as $spelling", ({ source }) => {
    // A path that does not exist on disk: the import hop resolves nothing, so
    // this measures the scanner and not the repository around it.
    const runs = typesetNameRuns("virtual/canary.tsx", code(source))
    expect(runs.length, `the scanner no longer sees the name in:\n${source}`).toBeGreaterThan(0)
  })

  it("still leaves the name inside a sentence alone", () => {
    // «\u0645\u0642\u0627\u0637\u0639 \u0645\u0646 \u0628\u0648\u062f\u0643\u0627\u0633\u062a \u062e\u0637» is prose about the show, and it is live on a
    // card in app/page.tsx. A scanner that reported it would pass every case
    // above while telling us nothing.
    const prose = `<div>\n  \u0645\u0642\u0627\u0637\u0639 \u0645\u0646 بودكاست خط\n</div>`
    expect(typesetNameRuns("virtual/canary.tsx", code(prose))).toEqual([])
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
