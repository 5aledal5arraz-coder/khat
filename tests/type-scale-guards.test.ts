/**
 * Regression guards for the type scale (wave 2 → 2-c).
 *
 * The scale shipped with ZERO test coverage, and all three defects it produced
 * were invisible to a green suite:
 *
 *   1. `cn()` silently DELETED a scale class whenever a colour class followed
 *      it, because tailwind-merge did not know the scale existed and bucketed
 *      `text-<step>` as a colour. The element then inherited a size that was
 *      usually itself on the scale, so nothing looked obviously wrong.
 *   2. Switching a raw px size to a scale step also changed LINE-HEIGHT,
 *      because each step carries a paired `--text-*--line-height`. Measuring
 *      font-size alone reported a clean zero while the live director console
 *      reflowed.
 *   3. `--ui-field`'s 16px iOS floor only protects a field that asks for it,
 *      and fifteen hand-rolled public fields asked for a raw 14px step instead.
 *
 * These are source-level guards. They cannot see a browser, so they check the
 * three INVARIANTS that would have caught each defect at the point of writing.
 *
 * WAVE 2-D — the two places these guards were themselves blind.
 *
 *   a. Guard 2 only inspected classNames that CONTAIN a scale step, so it could
 *      not see the regression that actually happened: the director panel's raw
 *      `text-[10px]`/`text-[11px]` labels reflowed without a single one of them
 *      being edited, because the public wrapper in app/layout.tsx gained
 *      `text-body` and leading is INHERITED. Measured at 375 against a
 *      pre-wave-1 baseline server: 33 of 70 rendered text nodes moved, +3.15 to
 *      +3.85px of line-height each, font-size delta 0. The fix is architectural
 *      — the panel root now declares its own leading — so the guard now checks
 *      that root pin, which is the invariant that makes every raw-px label in
 *      the panel genuinely frozen instead of accidentally stable.
 *
 *   b. Guard 3 skipped `live-client.tsx` BY NAME, and its size pattern only
 *      knew about named steps — so the notes textarea was invisible twice over:
 *      once for being in the exempted file, and once for spelling its size
 *      `text-[13px]` instead of a step. Both holes are closed: the exemption is
 *      gone and raw px/rem sizes are now measured numerically.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE MEASURING ANYTHING IN A BROWSER WHILE MUTATION-TESTING.
 *
 * The harness for these guards edits `app/globals.css` in place, runs vitest,
 * and restores. Any dev server pointed at this repo is watching that file, and
 * a browser measurement taken during a run measures the MUTANT.
 *
 * There is no external signal that this has happened. Three things were tried
 * and none of them tells you:
 *
 *   · The stylesheet FILENAME is derived from the path, not the content. A real
 *     declaration was changed and the served name stayed
 *     `app_globals_0yg4wg8.css`, byte for byte. Watching for a new hash tells
 *     you nothing.
 *   · The served CONTENT changes under that same unchanged name in under two
 *     seconds. So there is no window in which the old stylesheet is still being
 *     served and the measurement is stale-but-honest.
 *   · The page does not reload visibly, so nothing on screen announces it.
 *
 * This is not hypothetical: a wave-3 measurement of 8px was recorded and
 * puzzled over, and 8px is `0.5rem`, which is verbatim the value the mutation
 * running at that moment had written. The rule is therefore mechanical, not a
 * matter of care — DO NOT RUN THE MUTATION HARNESS AND THE BROWSER AT THE SAME
 * TIME. Measure on a clean tree (`git status` empty of globals.css), or stop
 * the dev server for the duration of the run.
 *
 * A SECOND MEASUREMENT TRAP, in the same family — see INK_TITLE_MAX. Proving a
 * webfont is really loaded by MEASURING it does not work at all, in either
 * dimension. `document.fonts.check()` with the exact weight is the only
 * reliable signal, and it must be read on a COLD page — see below.
 *
 * A THIRD ONE, and it is the reason the second is stated so absolutely. THE
 * PROBE LOADS THE FONT IT IS PROBING FOR. Setting `ctx.font = '400 100px
 * Amiri'` on a canvas is itself a request for that face: on a page where Amiri
 * is not already painted, the FIRST measureText() returns the fallback serif
 * and the second returns Amiri, with nothing announcing the difference.
 * Noura hit this and so did the wave that wrote 1.644. The protocol is
 * therefore: load a page that RENDERS the class, read `document.fonts.check()`
 * BEFORE touching a canvas, and only measure if it was already true.
 *
 * A FOURTH, which is about reading evidence rather than taking it: a console
 * error can outlive the page that produced it. One was observed here naming a
 * class that does not exist anywhere in globals.css, surviving a client-side
 * navigation. "The console shows an error" is not evidence that the code under
 * test is broken — same family as "the name did not change".
 */
import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { cn } from "@/lib/utils"

const ROOT = process.cwd()

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (full.endsWith(".tsx")) out.push(full)
  }
  return out
}

/** Every step declared as a `text-*` utility in globals.css. */
function declaredSteps(): string[] {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
  const steps = new Set<string>()
  for (const m of css.matchAll(/^\s*--text-([a-z-]+):/gm)) {
    if (!m[1].endsWith("--line-height")) steps.add(m[1])
  }
  return [...steps]
}

// ── globals.css, read the way the browser reads it ───────────────────────────
//
// Guards 1–5 all check a token's TEXT. That is what let wave 3-b's worst
// mutant through: `--leading-control: 1.2` leaves `--ui-heading-leading: 1.75`
// declared, above its floor, and referenced by name in the kit — and connected
// to nothing. The helpers below resolve a token the way the cascade does, per
// surface and through `var()`, so a guard can assert on the number that
// actually ARRIVES at the element.

/** The whole file with comments removed — prose says `--radius: 0.5rem` too. */
const CSS = readFileSync(join(ROOT, "app/globals.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "")

/** Split on a separator that is not inside parentheses. */
function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ""
  for (const ch of s) {
    if (ch === "(") depth++
    else if (ch === ")") depth--
    if (ch === sep && depth === 0) {
      out.push(cur)
      cur = ""
    } else cur += ch
  }
  out.push(cur)
  return out.map((p) => p.trim()).filter(Boolean)
}

/** The `[start, end)` offsets of one top-level block, by its opening text. */
function blockSpan(opener: string): [number, number] {
  const start = CSS.indexOf(opener)
  if (start < 0) throw new Error(`block not found in globals.css: ${opener}`)
  let depth = 0
  for (let i = start + opener.length - 1; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++
    else if (CSS[i] === "}" && --depth === 0) return [start, i + 1]
  }
  throw new Error(`unbalanced block in globals.css: ${opener}`)
}

/** The custom-property declarations of one block, by its opening text. */
function blockDecls(opener: string): Record<string, string> {
  const [start, end] = blockSpan(opener)
  const out: Record<string, string> = {}
  for (const m of CSS.slice(start + opener.length, end - 1).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].trim()
  }
  return out
}

const THEME_DECLS = blockDecls("@theme inline {")
const SITE_DECLS = blockDecls(":root {")
const ADMIN_DECLS = { ...SITE_DECLS, ...blockDecls(':root[data-surface="admin"] {') }
const SURFACES = { site: SITE_DECLS, admin: ADMIN_DECLS }
type Surface = keyof typeof SURFACES

/**
 * `@theme inline` emits its declarations OUTSIDE any cascade layer, so for a
 * name declared in both it beats the `@layer base` :root block. No name is in
 * both today; the order encodes the rule rather than the coincidence.
 */
function lookup(name: string, surface: Surface): string {
  const v = THEME_DECLS[name] ?? SURFACES[surface][name]
  if (v === undefined) throw new Error(`${name} is not declared for surface "${surface}"`)
  return v
}

/** Replace every `var(--x)` with the value that surface resolves it to. */
function substitute(value: string, surface: Surface, seen: string[] = []): string {
  return value.replace(/var\((--[a-z0-9-]+)\)/g, (_, name: string) => {
    if (seen.includes(name)) throw new Error(`var() cycle: ${[...seen, name].join(" → ")}`)
    return substitute(lookup(name, surface), surface, [...seen, name])
  })
}

const balanced = (s: string) => {
  let d = 0
  for (const ch of s) {
    if (ch === "(") d++
    else if (ch === ")" && --d < 0) return false
  }
  return d === 0
}

/**
 * A fully substituted value as a number — px for a length, the bare number for
 * a unitless ratio — or null when it cannot be reduced without a font context
 * (`em`). Callers that need a number assert it is not null, so an unresolvable
 * value FAILS rather than skips.
 *
 * WAVE 3-C: `vw` and `clamp()` are now evaluated at a given viewport instead of
 * returning null. The two top steps of the scale are
 * `clamp(2.25rem, 1.71rem + 2.29vw, 2.75rem)`-shaped, so with them
 * unresolvable, EVERY numeric check silently stopped at `heading` — the two
 * biggest sizes on the site were outside the reach of the guards that claim to
 * cover "the ladder". Fluid steps get checked at both ends of their range.
 */
function toNumber(expr: string, vw = 1280): number | null {
  const s = expr.trim()
  const leaf = s.match(/^(-?\d*\.?\d+)(rem|px|vw)?$/)
  if (leaf) {
    const n = parseFloat(leaf[1])
    if (leaf[2] === "rem") return n * 16
    if (leaf[2] === "vw") return (n * vw) / 100
    return n
  }
  const fn = s.match(/^([a-z]*)\(([\s\S]*)\)$/)
  if (fn && balanced(fn[2])) {
    const args = splitTopLevel(fn[2], ",").map((a) => toNumber(a, vw))
    if (args.some((a) => a === null)) return null
    const n = args as number[]
    if (fn[1] === "max") return Math.max(...n)
    if (fn[1] === "min") return Math.min(...n)
    if (fn[1] === "clamp" && n.length === 3) return Math.min(Math.max(n[0], n[1]), n[2])
    if ((fn[1] === "calc" || fn[1] === "") && n.length === 1) return n[0]
    return null
  }
  // Binary operators, lowest precedence first, scanning right so `a - b - c`
  // stays left-associative. CSS requires whitespace around + and -.
  for (const ops of ["+-", "*/"]) {
    let depth = 0
    for (let i = s.length - 1; i > 0; i--) {
      const ch = s[i]
      if (ch === ")") depth++
      else if (ch === "(") depth--
      else if (depth === 0 && ops.includes(ch) && (ops === "*/" || /\s/.test(s[i - 1]))) {
        const l = toNumber(s.slice(0, i), vw)
        const r = toNumber(s.slice(i + 1), vw)
        if (l === null || r === null) return null
        return ch === "+" ? l + r : ch === "-" ? l - r : ch === "*" ? l * r : l / r
      }
    }
  }
  return null
}

/** The number a surface actually delivers for a token, at a viewport width. */
const resolved = (name: string, surface: Surface, vw = 1280) =>
  toNumber(substitute(lookup(name, surface), surface), vw)

/**
 * The distinct token names a declaration references DIRECTLY — one hop, no
 * following.
 *
 * ONE HOP AND NOT A CHAIN, WHICH IS THE WHOLE POINT AND WAS LEARNED THE HARD
 * WAY. Section 8 first asked whether the bound source appears ANYWHERE in the
 * var() chain, and one mutation walked straight through that:
 *
 *   --text-control: var(--ui-control)  →  var(--ui-field)
 *
 * `--ui-field` is `max(1rem, var(--ui-control))`, so the chain from
 * `--text-control` still CONTAINED `--ui-control` — transitively, through the
 * very token that had replaced it. Every button, label and badge in the shared
 * kit would have gone from 14px to 16px on both surfaces with the guard green.
 * A reachability test cannot tell "reads X" from "reads something that happens
 * to read X"; a one-hop test can, and `@theme` is a one-hop seam by
 * construction — every one of its declarations references exactly one `:root`
 * token today.
 */
function directRefs(value: string): Set<string> {
  return new Set([...value.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]))
}

// ── 1. cn() must not eat a scale class that sits next to a colour ────────────

describe("cn() keeps every declared type step", () => {
  const steps = declaredSteps()

  it("declares the eight brand steps plus the four ui primitives", () => {
    expect(steps.length).toBeGreaterThanOrEqual(12)
    expect(steps).toContain("micro")
    expect(steps).toContain("display")
    expect(steps).toContain("field")
  })

  it.each(declaredSteps())(
    "text-%s survives a following colour class",
    (step) => {
      // The exact shape of the bug: size first, colour second.
      const merged = cn(`text-${step}`, "text-primary-foreground")
      expect(merged).toContain(`text-${step}`)
      expect(merged).toContain("text-primary-foreground")
    },
  )

  it("still lets one step override another (the whole point of twMerge)", () => {
    expect(cn("text-micro", "text-display")).toBe("text-display")
    expect(cn("text-field", "text-control")).toBe("text-control")
  })

  it("every step declared in globals.css is registered in lib/utils.ts", () => {
    // The comment in lib/utils.ts says a new step must be added in both
    // places. This is that sentence, enforced.
    const utils = readFileSync(join(ROOT, "lib/utils.ts"), "utf8")
    const missing = declaredSteps().filter((s) => !utils.includes(`"${s}"`))
    expect(missing).toEqual([])
  })
})

// ── 2. A scale step on the live console must pin its leading ─────────────────

describe("live recording console pins its leading", () => {
  const file = "app/prepare/live/[token]/live-client.tsx"
  const src = readFileSync(join(ROOT, file), "utf8")

  it("every scale step in the panel carries an explicit leading-*", () => {
    // Each step emits a paired line-height, so a step WITHOUT `leading-*`
    // silently changes the panel's vertical rhythm — which is a reflow on the
    // one screen that must not reflow during a live recording.
    //
    // The single exception is the drawer body, which sets `leading-relaxed`
    // once for its whole subtree; it is matched by the same rule because it
    // carries the class itself.
    const offenders: string[] = []
    for (const m of src.matchAll(/className=\{?[`"'][^`"']*[`"']/g)) {
      const cls = m[0]
      if (!/\btext-(micro|caption|body|lead|subhead|heading|title|display)\b/.test(cls)) continue
      if (/\bleading-[\w[\]./-]+/.test(cls)) continue
      offenders.push(cls.slice(0, 110))
    }
    expect(offenders).toEqual([])
  })

  it("the panel ROOT pins a leading, so none is inherited from the site", () => {
    // THE GUARD FOR THE REGRESSION ABOVE DID NOT EXIST. Pinning the steps
    // protects the elements that name a step; it does nothing for the
    // twenty-four raw-px labels, whose line-height comes entirely from an
    // ancestor. `/prepare/live` has no layout of its own, so that ancestor was
    // the PUBLIC WRAPPER — a file this panel does not own and whose typography
    // is expected to keep changing. The invariant that makes the panel safe is
    // therefore not "every label pins its leading" but "no leading crosses the
    // panel boundary": the root declares one, and everything below inherits
    // from inside the console.
    //
    // Deleting `leading-normal` from that root element must fail this test.
    const root = src.match(/className="([^"]*\bmin-h-screen\b[^"]*)"\s+dir="rtl"/)
    expect(root, "panel root element not found — did its className change?").not.toBeNull()
    expect(root![1]).toMatch(/\bleading-[\w[\]./-]+/)
  })
})

// ── 3. No public focusable field may sit under the 16px iOS floor ────────────

describe("public form fields keep the 16px iOS floor", () => {
  /**
   * A sub-16px step, and ONLY when it is unprefixed. `md:text-control` is the
   * correct desktop half of the pairing — at ≥768px there is no phone to zoom —
   * so the token must not be preceded by a variant prefix.
   */
  const SUB_16 = /(^|[\s"'`{])text-(caption|micro|control|control-sm|sm|xs)(?=[\s"'`}]|$)/
  /**
   * The same rule for a size written as a raw arbitrary value —
   * `text-[13px]`, `text-[0.8rem]`. Wave 2-c's pattern only knew the NAMED
   * steps, so the one field that spelled its size in px was invisible to it;
   * that is how a 13px textarea shipped on a public route under a test titled
   * "no field under 16px". The leading `(^|[\s"'`{])` is what makes
   * `md:text-[13px]` legal, exactly as it does for the named steps.
   */
  const RAW_SIZE = /(^|[\s"'`{])text-\[(\d+(?:\.\d+)?)(px|rem)\]/g
  const rawPx = (n: string, unit: string) => (unit === "rem" ? parseFloat(n) * 16 : parseFloat(n))
  const NON_TEXT = /type=["{]?["']?(hidden|checkbox|radio|submit|button|file|range|color)/

  /** Files under app/ or components/ that are NOT part of the admin panel. */
  const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))].filter(
    (f) => !f.includes(`${join("app", "admin")}`) && !f.includes(`${join("components", "admin")}`),
  )

  it("finds fields to check at all (guards a broken walker)", () => {
    const withFields = files.filter((f) => /<(input|textarea|select)\b/.test(readFileSync(f, "utf8")))
    expect(withFields.length).toBeGreaterThan(5)
  })

  it("no <input>/<textarea>/<select> declares a sub-16px step", () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, "utf8")
      for (const m of src.matchAll(/<(input|textarea|select)\b/g)) {
        // Read forward to the end of the opening tag, tracking JSX braces.
        const seg = src.slice(m.index!, m.index! + 1200)
        let depth = 0
        let quote: string | null = null
        let end = seg.length
        for (let i = 0; i < seg.length; i++) {
          const ch = seg[i]
          if (quote) {
            if (ch === quote) quote = null
          } else if (ch === '"' || ch === "'") quote = ch
          else if (ch === "{") depth++
          else if (ch === "}") depth--
          else if (ch === ">" && depth === 0) {
            end = i
            break
          }
        }
        // Strip JSX comments before matching. A comment INSIDE the opening tag
        // is prose, not a class, and matching it makes the guard fire on the
        // sentence that explains the rule — which is how this line was found.
        const tag = seg.slice(0, end).replace(/\{?\/\*[\s\S]*?\*\/\}?/g, " ").replace(/\/\/[^\n]*/g, " ")
        if (NON_TEXT.test(tag)) continue
        // NO FILE-NAME EXEMPTIONS. `live-client.tsx` used to be skipped here on
        // the grounds that its textarea belonged to the deferred sub-12px LABEL
        // pass. It is not a label — it is the only focusable field on the live
        // director console, i.e. the one place on the public site where an iOS
        // zoom lands mid-recording. An exemption that hides the worst instance
        // of the rule is not an exemption, it is a hole.
        const line = () => src.slice(0, m.index!).split("\n").length
        if (SUB_16.test(tag)) offenders.push(`${relative(ROOT, f)}:${line()}`)
        for (const s of tag.matchAll(RAW_SIZE)) {
          if (rawPx(s[2], s[3]) < 16) {
            offenders.push(`${relative(ROOT, f)}:${line()} (${s[0].trim()})`)
          }
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it("--ui-field really is a max() floor, not a plain alias", () => {
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
    expect(css).toMatch(/--ui-field:\s*max\(\s*1rem\s*,/)
  })
})

// ── 4. The shared kit is not exempt from the type rules ──────────────────────

/**
 * WAVE 3. Guards 1–3 all police `app/` and the surfaces we had just edited.
 * `components/ui/*` — the ONE folder both surfaces import — was policed by
 * nothing, and that is where the two worst instances were sitting:
 *
 *   · DialogTitle: `text-control-lead font-semibold leading-none tracking-tight`
 *     — 18px of type in an 18px line box, when plain Arabic ink at that size
 *     measures 24.57px and tashkeel-bearing ink 30.74px. Overlap on every
 *     sample, confirmed live on a wrapped title.
 *   · CardTitle: the same, and with NO size class at all, so its size was
 *     whatever the surrounding page happened to set.
 *
 * Both reach the PUBLIC site through app/contact/page.tsx, so the wave-2
 * promise — "a step can never be used at a leading that collides" — was true
 * only of the eight brand steps and never covered the kit. These are the two
 * rules that make that promise cover it.
 */
describe("components/ui headings cannot collide", () => {
  const KIT = join(ROOT, "components/ui")
  const steps = declaredSteps()

  /** Opening tags of <h1>…<h6> in the shared kit, comments stripped. */
  function headingTags(): { file: string; line: number; tag: string }[] {
    const out: { file: string; line: number; tag: string }[] = []
    for (const f of walk(KIT)) {
      const src = readFileSync(f, "utf8")
      for (const m of src.matchAll(/<h[1-6]\b/g)) {
        const seg = src.slice(m.index!, m.index! + 2000)
        let depth = 0
        let quote: string | null = null
        let end = seg.length
        for (let i = 0; i < seg.length; i++) {
          const ch = seg[i]
          if (quote) {
            if (ch === quote) quote = null
          } else if (ch === '"' || ch === "'" || ch === "`") quote = ch
          else if (ch === "{") depth++
          else if (ch === "}") depth--
          else if (ch === ">" && depth === 0) {
            end = i
            break
          }
        }
        const tag = seg
          .slice(0, end)
          .replace(/\{?\/\*[\s\S]*?\*\/\}?/g, " ")
          .replace(/\/\/[^\n]*/g, " ")
        out.push({ file: relative(ROOT, f), line: src.slice(0, m.index!).split("\n").length, tag })
      }
    }
    return out
  }

  it("finds the kit's headings at all (guards a broken walker)", () => {
    const tags = headingTags()
    expect(tags.length).toBeGreaterThanOrEqual(2)
    expect(tags.map((t) => t.file)).toContain("components/ui/dialog.tsx")
    expect(tags.map((t) => t.file)).toContain("components/ui/card.tsx")
  })

  it("no heading sets leading-none, and every one names a leading", () => {
    // `leading-none` is a line box exactly as tall as the font size, and
    // Arabic ink is taller than that across nearly all of our copy: measured
    // over 4905 harvested strings, mean 1.103x and max 1.763x the font size at
    // weight 600 (see the note on --ui-heading-leading in globals.css for the
    // method and for why the per-category table that used to be quoted here
    // was unreproducible). So leading-none collides at every size this kit
    // uses. Deleting `leading-control` from DialogTitle or CardTitle, or
    // putting `leading-none` back, must fail here.
    const offenders: string[] = []
    for (const { file, line, tag } of headingTags()) {
      if (/\bleading-none\b/.test(tag)) offenders.push(`${file}:${line} leading-none`)
      else if (!/\bleading-[\w[\]./-]+/.test(tag)) offenders.push(`${file}:${line} no leading-*`)
    }
    expect(offenders).toEqual([])
  })

  it("no heading sets a negative tracking, and every one names a size step", () => {
    // `tracking-tight(er)` is a Latin display habit: negative letter-spacing
    // pulls JOINED Arabic letterforms into each other. Noura counted 40 of them
    // on Arabic across app/admin + components/ui against ONE left on the public
    // site — and two of the forty were these, which is how a Latin default
    // reached app/contact.
    //
    // The size half is the CardTitle defect: a primitive with no size class
    // does not have a size, it has whatever its parent had.
    //
    // THE ARBITRARY-VALUE BRANCH USED TO BE `text-\[[^\]]+\]`, which accepts
    // ANY bracketed value — so `text-[#fff]`, a COLOUR, satisfied a test whose
    // subject is size. Mutation H03 put exactly that on CardTitle and passed
    // all thirty-one guards while the primitive went back to having no size at
    // all. An arbitrary size is a LENGTH, so only a length is accepted here.
    const offenders: string[] = []
    const sizePattern = new RegExp(
      `(^|[\\s"'\`{])text-(${steps.join("|")})(?=[\\s"'\`}]|$)` +
        `|text-\\[(?:length:)?\\d+(?:\\.\\d+)?(?:px|rem|em)\\]`,
    )
    for (const { file, line, tag } of headingTags()) {
      if (/\btracking-tight(er)?\b/.test(tag)) offenders.push(`${file}:${line} tracking-tight`)
      if (!sizePattern.test(tag)) offenders.push(`${file}:${line} no size step`)
    }
    expect(offenders).toEqual([])
  })

  it("--ui-heading-leading clears the ink of every heading the kit renders", () => {
    // The number itself, not just its presence. The tallest of the 18 strings
    // the shared kit actually puts in a Card/DialogTitle measures 1.365x its
    // font size at weight 600, so 1.75 clears the kit's own worst case with
    // room; over the whole 4905-string corpus the tallest is 1.763, which it
    // does NOT clear — recorded, not hidden, on --ui-heading-leading itself.
    // A future edit that "tidies" this back toward a Latin-looking 1.2 fails
    // here; one that detaches it from its consumers fails in section 6.
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
    const m = css.match(/--ui-heading-leading:\s*([\d.]+)\s*;/)
    expect(m, "--ui-heading-leading not declared").not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(1.74)
  })

  it("a caller's font-size does not delete the primitive's leading", () => {
    // THE BUG THIS WAVE ALMOST SHIPPED. twMerge declares `font-size` as
    // conflicting with `leading`, so the first version of the leading
    // registration — which used twMerge's own `leading` group — let a caller's
    // later `text-[13px]` DELETE the base `leading-control`. Measured live on
    // /admin/settings: all twelve admin card titles rendered 19.5px of leading
    // on 13px Arabic, i.e. the collision was still there behind a green suite
    // and a "fixed" component.
    //
    // The conflict is not even true in Tailwind v4 — `leading-*` sets
    // `--tw-leading` and a step's paired line-height reads
    // `var(--tw-leading, …)`, so an explicit leading wins in CSS regardless of
    // class order. This is the real call site, verbatim.
    const merged = cn(
      "text-control-lead font-semibold leading-control",
      "text-[13px] font-semibold flex items-center gap-2",
    )
    expect(merged).toContain("leading-control")
    expect(merged).toContain("text-[13px]")
    expect(merged).not.toContain("text-control-lead")

    // …and the merging that must still work.
    expect(cn("leading-control", "leading-relaxed")).toBe("leading-relaxed")
    expect(cn("leading-none", "leading-control")).toBe("leading-control")
    expect(cn("leading-prose", "text-title")).toContain("leading-prose")
  })

  it("every --leading-* token is registered in the leading group of lib/utils.ts", () => {
    // Same invariant as the font sizes, one namespace over — and a nastier
    // failure, because an unregistered `leading-*` neither merges nor loses:
    // it coexists with the caller's and stylesheet order decides.
    //
    // SCOPED TO THE `leading:` GROUP, not the whole file. Mutation testing
    // caught the first version of this: it searched all of lib/utils.ts for
    // `"control"`, which is ALSO a font-size step, so deleting the leading
    // registration passed cleanly. A guard satisfied by a coincidence in a
    // different group is not a guard.
    const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
    const utils = readFileSync(join(ROOT, "lib/utils.ts"), "utf8")
    const group = utils.match(/"khat-leading":\s*\[\s*\{\s*leading:\s*\[([\s\S]*?)\]/)
    expect(group, "no `khat-leading` classGroup registered in lib/utils.ts").not.toBeNull()
    const tokens = [...css.matchAll(/^\s*--leading-([a-z-]+):/gm)].map((m) => m[1])
    expect(tokens.length).toBeGreaterThanOrEqual(2)
    expect(tokens.filter((t) => !group![1].includes(`"${t}"`))).toEqual([])
  })

  /**
   * WAVE 3-C — THE UMBRELLA WAS THE WRONG SHAPE, not too small by accident.
   *
   * Everything above is scoped to `<h1>`–`<h6>` inside `components/ui`. That
   * caught the two primitives wave 3 was about and, by construction, could
   * never catch `leading-none` on a scale step anywhere else — which is where
   * Noura found the next one (components/guests/athar-card.tsx:54). The rule
   * "a step is never used at a leading that collides" is not a property of the
   * kit or of heading tags; it is a property of the class pairing. So the scan
   * is by PAIRING, over every public and shared file.
   *
   * Two occurrences exist and both are named below. Naming beats widening in
   * silence and beats an exemption with no reason attached: the value of this
   * test is that occurrence number THREE fails.
   */
  const LEADING_NONE_ALLOWED: Record<string, string> = {
    // A single decorative “ glyph at opacity 0.07 behind the card, absolutely
    // positioned, one character, cannot wrap. `leading-none` is what stops the
    // watermark reserving a 62px line box in the layout. Not a collision:
    // there is no second line to collide with.
    "components/guests/athar-card.tsx": "decorative single-glyph watermark, absolutely positioned",
    // NOT A DECISION — AN OPEN DEFECT, RECORDED RATHER THAN HIDDEN BEHIND A
    // GUARD THAT DOES NOT LOOK. `Label` is `text-control leading-none`: a 14px
    // line box on 14px Arabic. Measured 2026-08-02 on /partner at 375, the one
    // public route using this primitive: 7 labels, all single-line today, and
    // 6 of the 7 have ink TALLER than their line box (1.052–1.239 × 14px), so
    // the first label long enough to wrap overlaps. It is latent, not live —
    // and more than latent: measured 2026-08-02, no viewport reaches the wrap.
    // The widest of the 7 was narrowed to 200px without a single one wrapping.
    //
    // THE DEFERRAL STANDS AND ITS STATED REASON WAS WRONG, which is worse than
    // no reason because the next reader sizes the wave from it. This comment
    // used to say `leading-none` was load-bearing "across 56 files". 56 is the
    // number of admin files that import BUTTON — it is written verbatim beside
    // --ui-control in app/globals.css and it walked from one component to
    // another on the way into this file. Label's own number, counted
    // 2026-08-02: 9 importers (8 admin + components/forms/
    // partner-application-form.tsx), 38 usages. The wave is roughly six times
    // cheaper than this comment claimed. It is still its own wave and not a
    // drive-by on the way past, but for the right reason: the fix is a
    // measured leading on a shared primitive, not a scope the size of Button.
    "components/ui/label.tsx": "OPEN: latent collision if a label ever wraps — see comment, needs its own wave",
  }

  /** Every line of a file that pairs a declared step with `leading-none`. */
  const pairedLines = (file: string): number[] =>
    readFileSync(join(ROOT, file), "utf8")
      .split("\n")
      .flatMap((l, i) =>
        /\bleading-none\b/.test(l) && new RegExp(`(^|[\\s"'\`{])text-(${steps.join("|")})(?=[\\s"'\`}]|$)`).test(l)
          ? [i + 1]
          : [],
      )

  it("no scale step is paired with leading-none outside the two named cases", () => {
    // Line-scoped, and that is not laziness: both halves of the pairing are
    // written into one class string, and a file-wide search would report the
    // wrong line and — worse — be satisfied by an unrelated `leading-none`
    // elsewhere in the file. athar-card.tsx has exactly such a second one on a
    // `text-[10rem]` watermark, which is how this was found.
    const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))].filter(
      (f) => !f.includes(`${join("app", "admin")}`) && !f.includes(`${join("components", "admin")}`),
    )
    const offenders: string[] = []
    for (const f of files) {
      const rel = relative(ROOT, f)
      if (rel in LEADING_NONE_ALLOWED) continue
      offenders.push(...pairedLines(rel).map((n) => `${rel}:${n}`))
    }
    expect(offenders).toEqual([])
  })

  it("both named leading-none exceptions still pair a step, and still say why", () => {
    // An exemption list that outlives what it exempts is a lie the next reader
    // inherits. If either file stops pairing a step with `leading-none` — the
    // Label wave lands, the watermark is redrawn — its row must go.
    //
    // THE FIRST VERSION OF THIS CHECKED `src.includes("leading-none")` AND WAS
    // SATISFIED BY THE WRONG LINE: removing the exempted pairing from
    // athar-card.tsx left the test green, because the file's OTHER decorative
    // watermark (`text-[10rem] leading-none`, an arbitrary size and not a step)
    // still matched. Same failure as the `leading:`-group lesson two tests up —
    // a guard satisfied by a coincidence somewhere else in the same file.
    for (const [file, reason] of Object.entries(LEADING_NONE_ALLOWED)) {
      expect(
        pairedLines(file).length,
        `${file} no longer pairs a step with leading-none — delete its exemption`,
      ).toBeGreaterThan(0)
      expect(reason.length, `${file} is exempt with no reason given`).toBeGreaterThan(20)
    }
  })
})

// ── 5. Spacing, radius and elevation are ON the switch point ─────────────────

/**
 * WAVE 3's own claim, enforced. The census found no arbitrary values and a
 * tidy fourteen-rung spacing scale — the defect was never the values, it was
 * that none of them were reachable from the block that calls itself the one
 * place the identity is defined. Measured by perturbation on the homepage
 * BEFORE this wave: scaling --type-size-body x1.5 and --radius x3 moved 0 of
 * the 100 elements carrying padding/margin/gap, 6 of the 35 carrying a radius,
 * and 0 of the 27 carrying a shadow.
 *
 * These are the source-level invariants that keep it that way. A literal
 * pasted back into any of the three must fail here.
 */
describe("spacing, radius and elevation resolve from the switch point", () => {
  const css = readFileSync(join(ROOT, "app/globals.css"), "utf8")
  /** Just the `@theme inline { … }` block. */
  const theme = (() => {
    const start = css.indexOf("@theme inline {")
    let depth = 0
    for (let i = start; i < css.length; i++) {
      if (css[i] === "{") depth++
      else if (css[i] === "}" && --depth === 0) return css.slice(start, i)
    }
    throw new Error("@theme inline block not found")
  })()

  it("--spacing is the type rhythm, not a literal", () => {
    // Tailwind v4 builds every p-/m-/gap-/space-/h-/w-/size- utility as
    // `calc(var(--spacing) * N)`, so this one declaration IS the spacing
    // system. `--spacing: 0.25rem` would pass a "no arbitrary values" census
    // and still be off the switch point — which is exactly what shipped.
    expect(theme).toMatch(/--spacing:\s*var\(--type-rhythm\)/)
    expect(css).toMatch(/--type-rhythm:\s*calc\(\s*var\(--type-size-body\)\s*\/\s*4\s*\)/)
  })

  /** `--radius-<key>` → its multiple of --radius, or null if it is not one. */
  function radiusRungs(): Record<string, number | null> {
    const out: Record<string, number | null> = {}
    for (const [, key, value] of theme.matchAll(/^\s*--radius-([a-z0-9]+):\s*([^;]+);/gm)) {
      const v = value.trim()
      if (/^var\(--radius\)$/.test(v)) out[key] = 1
      else {
        const m = v.match(/^calc\(\s*var\(--radius\)\s*\*\s*([\d.]+)\s*\)$/)
        out[key] = m ? Number(m[1]) : null
      }
    }
    return out
  }

  it("every radius rung is a plain MULTIPLE of --radius", () => {
    // "contains var(--radius)" is not enough, and mutation testing is how we
    // learned it: `calc(var(--radius) - 2px)` — the exact form this wave
    // removed — contains it, passes a substring check, and reintroduces a
    // 6px rung two pixels from its neighbours. Only `var(--radius)` or
    // `calc(var(--radius) * N)` is accepted, which also makes the ladder
    // arithmetically readable for the spacing test below.
    const rungs = radiusRungs()
    expect(Object.keys(rungs).length).toBeGreaterThanOrEqual(6)
    expect(Object.entries(rungs).filter(([, v]) => v === null).map(([k]) => k)).toEqual([])
  })

  it("no two radius rungs land within half a --radius of each other", () => {
    // `rounded` (4px), `rounded-md` (6px) and `rounded-lg` (8px) were three
    // rungs inside a four-pixel band — not a scale, noise. Worse, the shared
    // kit split across it: Button was rounded-md and Input/Textarea
    // rounded-lg, so a button and the field beside it disagreed by 2px.
    //
    // The rule is expressed in the base unit rather than in px, so it still
    // holds after the identity retunes --radius. Resolved at today's 0.5rem
    // the surviving ladder is 4 / 8 / 12 / 16 / 24px — minimum gap 4px, which
    // is exactly half a --radius. The old ladder had gaps of 0px (rounded vs
    // rounded-sm) and 2px (rounded-md vs rounded-lg) and fails this.
    const baseRem = Number(css.match(/--radius:\s*([\d.]+)rem/)![1])
    const basePx = baseRem * 16
    const rungs = radiusRungs()
    // A rung this test cannot resolve is a FAILURE, not a skip — otherwise a
    // malformed value silently drops out of the ladder being measured.
    expect(Object.entries(rungs).filter(([, v]) => v === null).map(([k]) => k)).toEqual([])
    const px = Object.values(rungs).map((m) => m! * basePx)
    const sorted = [...new Set(px)].sort((a, b) => a - b)
    const tooClose = sorted
      .map((v, i) => (i > 0 ? { gap: v - sorted[i - 1], between: [sorted[i - 1], v] } : null))
      .filter((g) => g && g.gap < basePx / 2)
    expect(tooClose).toEqual([])
  })

  it("the ladder is the documented one — same rungs, same order", () => {
    // N03: `--radius-3xl: calc(var(--radius) * 3)` → `* 2` passed everything,
    // including the gap test one line up, because that test dedupes with
    // `new Set` BEFORE measuring gaps. A rung collapsing ONTO its neighbour
    // produces a duplicate, the Set eats it, and the surviving ladder is
    // perfectly well spaced — while `rounded-3xl` silently renders 16px
    // instead of 24px on all 30 of its call sites. Deduping is right for the
    // gap question and blind to the collapse question, so the collapse gets
    // its own assertion.
    //
    // The ladder is PINNED rather than merely ordered, because md and lg are a
    // deliberate alias pair (both 1x — see the table beside --radius-sm), so
    // "strictly increasing" is not true of it and "non-decreasing" would not
    // have caught N03 either: 0.5/1/1/1.5/2/2 is non-decreasing. Adding or
    // retuning a rung is meant to land here as a failing test.
    const rungs = radiusRungs()
    expect(Object.entries(rungs).map(([k, v]) => `${k}=${v}`)).toEqual([
      "sm=0.5",
      "md=1",
      "lg=1",
      "xl=1.5",
      "2xl=2",
      "3xl=3",
    ])
    // …and the distinct rung COUNT, stated separately so the failure message
    // says "a rung collapsed" and not just "the list differs".
    expect(new Set(Object.values(rungs)).size, "two rungs now compute the same corner").toBe(5)
  })

  it("every LAYER of every elevation rung is drawn in --shadow-tint", () => {
    // Per LAYER, not per rung. A box-shadow is a comma-separated list and each
    // rung here has two, so `v.includes("var(--shadow-tint)")` was satisfied by
    // ONE surviving layer: mutation M13 hardcoded the first half of --shadow-md
    // back to `rgb(0 0 0 / 0.1)` and passed, leaving a rung half on the switch
    // point and half off it — which is worse than being wholly off, because
    // retinting the brand would then split one shadow into two colours.
    const rungs = [...theme.matchAll(/^\s*--shadow-([a-z0-9]+):\s*([^;]+);/gm)]
    expect(rungs.length).toBeGreaterThanOrEqual(4)
    const offenders: string[] = []
    for (const [, key, value] of rungs) {
      splitTopLevel(value, ",").forEach((layer, i) => {
        if (!layer.includes("var(--shadow-tint)")) offenders.push(`--shadow-${key} layer ${i + 1}`)
      })
    }
    expect(offenders).toEqual([])
    // …and the tint itself is NOT in @theme, or Tailwind mints a `shadow-tint`
    // utility that renders a colour triplet as a box-shadow.
    expect(theme).not.toMatch(/--shadow-tint:/)
    expect(css).toMatch(/--shadow-tint:\s*[\d\s%.]+;/)
  })

  it("no source file still uses the two merged-away rungs", () => {
    // `rounded` and `rounded-sm` computed the SAME 4px under two names, and
    // bare `rounded` is a v3 compatibility constant that `@theme` cannot
    // reach at all (tried `--radius-DEFAULT`; Tailwind ignores it).
    //
    // `shadow` and `shadow-sm` were NOT byte-identical, and calling them that
    // was wrong. Read back off the served stylesheet 2026-08-02:
    //
    //   .shadow     0 1px 3px 0 #0000001a,               0 1px 2px -1px #0000001a
    //   .shadow-sm  0 1px 3px 0 hsl(var(--shadow-tint)/.1), 0 1px 2px -1px …
    //
    // Identical GEOMETRY, and the colours differ: `#0000001a` is alpha
    // 26/255 = 0.10196, the tint ladder asks for 0.1. A 0.002 alpha delta on a
    // 10%-opacity shadow is not visible and the rewrite was still right — but
    // "zero pixels of change" is the honest claim and "byte-identical" was not.
    //
    // NOTE FOR ANYONE VERIFYING THIS FROM THE COMPILED CSS: `.rounded` and
    // `.shadow` are STILL emitted, and that is not evidence of a call site.
    // Tailwind v4 scans every file it can reach and treats any word-shaped
    // token as a candidate, comments and JSON prose included. Proved
    // 2026-08-02 by compiling globals.css against a directory holding one
    // file whose entire content is `// duration is rounded down, with a
    // subtle shadow` — both classes were minted. `lib/whisper.ts` ("do not
    // swap in the rounded one") and components/guests/guest-avatar.tsx
    // ("Subtle inner shadow for depth") are the live sources today. So the
    // source scan below is the real check; the stylesheet cannot answer this.
    const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))]
    const BARE = /(?<![a-zA-Z-])(rounded|shadow)(?![a-zA-Z0-9/:[-])/
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, "utf8")
      src.split("\n").forEach((l, i) => {
        // class strings only — prose in comments legitimately says "rounded"
        if (!/\bclass(Name)?\s*=/.test(l) && !/["'`][^"'`]*\b(rounded|shadow)\b/.test(l)) return
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return
        if (BARE.test(l)) offenders.push(`${relative(ROOT, f)}:${i + 1} ${l.trim().slice(0, 80)}`)
      })
    }
    expect(offenders).toEqual([])
  })
})

// ── 6. The CHAIN, not the two endpoints ──────────────────────────────────────

/**
 * WAVE 3-B. Mutation testing put twenty-three mutants past guards 1–5 and five
 * of them SURVIVED. Four were one shape: a token whose value is checked and
 * whose LINK is not.
 *
 *   --leading-control: 1.2
 *
 * restores the exact collision this whole wave existed to remove, and every
 * one of the thirty-one guards stayed green. Guard 4 asserts
 * `--ui-heading-leading >= 1.74`, and asserts the kit's headings carry
 * `leading-control`; nothing asserted that `leading-control` READS
 * `--ui-heading-leading`. Cut the wire between them and the measurement is
 * still declared, still above its floor, and reaches no element on either
 * surface. The same cut worked on `--leading-prose` and on `--ui-control-lead`.
 *
 * So these guards resolve the variable chain the way the browser does — per
 * surface, through `var()` and `calc()`/`max()` — and assert on the number that
 * ARRIVES. Note what that buys: `--leading-control: 1.75`, a literal copy of
 * today's correct value, ALSO fails. That is the point. The next person to
 * retune the ink measurement must have every consumer follow it.
 */
/**
 * INK, MEASURED PROPERLY THIS TIME — and the earlier table was wrong.
 *
 * Wave 3 justified --ui-heading-leading with five per-category ratios
 * (plain 1.365 … shadda+kasratan 1.708). Noura could not reproduce any of
 * them; her own canvas run returned 1.044 / 1.561 on the same font. Both
 * runs were correct and the labels were the defect: THE RATIO IS A PROPERTY
 * OF THE STRING, not of a category. "Plain Arabic" measures 0.961 on `كتاب`
 * and 1.441 on the tallest untashkeel'd string we actually ship, so a table
 * of category names is unreproducible by construction.
 *
 * Re-measured 2026-08-02 the only way that is reproducible: over the copy
 * this project renders. 4905 Arabic strings harvested from app/ +
 * components/, canvas actualBoundingBoxAscent+Descent over font size, IBM
 * Plex Sans Arabic, with a width check against a bogus family first so a
 * silent fallback cannot be mistaken for a measurement. Ratios confirmed
 * size-independent at 13 / 16 / 18 / 32px.
 *
 *   weight 600   mean 1.103   max 1.763  ("أُزيل التخصيص — عاد الافتراضي")
 *   weight 400   mean 1.082   max 1.705   (same string)
 *   tallest with no tashkeel at all       1.441
 *   the 18 strings the shared kit actually
 *   puts in a Card/DialogTitle, max       1.365  ("كن ضيفاً على البودكاست")
 *
 * That last line is where the old 1.365 came from — it is real, it was just
 * labelled "plain Arabic" instead of "the worst heading we ship".
 *
 * WHAT THIS MEANS FOR 1.75, STATED HONESTLY. It clears every string the kit
 * puts in a heading today (1.365) by a wide margin. It does NOT clear the
 * corpus maximum of 1.763 — one string in 4905, and not a heading — which
 * would overlap by 0.23px at 18px if it ever wrapped in a DialogTitle. The
 * value is left alone: raising it would loosen every kit heading on both
 * surfaces to chase a string that never appears in one. Recorded rather than
 * silently rounded away.
 */
const INK_MEAN = 1.103
const INK_HEADING_FLOOR = 1.74

/**
 * WAVE 3-C — AND THE SAMPLE ABOVE HAS A HOLE THAT THIS NUMBER FILLS.
 *
 * Those 4905 strings were harvested from `app/` + `components/`. That is
 * every string a developer typed, and NONE of the strings a visitor mostly
 * reads, because those come out of Postgres. Two steps are affected, and
 * only one of them was justified correctly:
 *
 *   · `text-display` — one call site, app/page.tsx:99, the homepage hero,
 *     whose two lines are authored in the file with a literal <br>. Measured
 *     live at 375: 10.87px of ink clearance at 1.4. "Short text, chosen by
 *     hand" is simply true here.
 *   · `text-title`  — components/episodes/episode-hero.tsx:63 and
 *     app/guests/[slug]/page.tsx:141 (both at `sm:`), which render an
 *     EPISODE TITLE and a GUEST NAME out of the database. The same sentence
 *     was written about this step and it was never true of it.
 *
 * Re-measured 2026-08-02 over the real population — the 42 stored episode
 * titles as `displayEpisodeTitle` renders them (that transform is what the
 * <h1> prints; measuring the raw stored string measures text no visitor
 * sees) plus the 3 guest names, read-only from the local DB — at weight 700,
 * which is the `font-bold` both <h1>s carry:
 *
 *   n = 45   mean 1.2362   max 1.4470 ("كيف تصبح مليونيراً .!")
 *   above 1.4 (the old value):  2 of 45
 *   above 1.5:                  0 of 45   ⇒ `text-heading`, the phone half
 *                                          of the same two <h1>s, is clear
 *                                          at 1.5 with room.
 *
 * THE PIN WAS 1.4468 AND THE MEASUREMENT IS 1.4470, which is the wrong
 * direction by 0.0002: a floor UNDER the population it claims to clear lets
 * `--type-leading-title: 1.4469` through with the tallest stored title's ink
 * a hair taller than its line box. Re-measured 2026-08-02 on a cold page
 * (`document.fonts.check('700 100px "IBM Plex Sans Arabic"')` true before any
 * canvas call), the value is 1.447 at every size from 16px to 1000px. Nothing
 * was live — `--type-leading-title` is 1.45 and 0 of 45 exceed it — but a
 * floor rounded down is not a floor, so the constant now carries the measured
 * number.
 *
 * WHAT THE OLD 1.4 ACTUALLY COST, measured on a live episode page instead of
 * inferred: worst adjacent-line ink clearance across all 45 rendered in the
 * real <h1> was +0.47px at 640, +0.48px at 841 and +0.48px at 1280 — thin,
 * but positive, because the only two strings over 1.4 are 21 and 56
 * characters and do not wrap at a title size. Nothing was colliding. The
 * value moved to 1.45 to restore a margin, not to fix a live defect, and
 * both halves of that are stated so neither can be quoted alone.
 *
 * A METHOD NOTE WORTH MORE THAN THE NUMBER, AND ITS FIRST VERSION WAS HALF
 * WRONG. Wave 3-b checked "is the webfont really loaded?" by comparing
 * measured WIDTH against a bogus family, found the gap was only 0.8% on its
 * probe string, and concluded: measure INK instead. The conclusion does not
 * hold. BOTH numbers are properties of the STRING, not of the substitution —
 * the same defect as the category table two blocks up, made again. Measured
 * 2026-08-02, IBM Plex Sans Arabic 700 against the fallback:
 *
 *   «كن ضيفاً على البودكاست»      width 3.24%   ink  1.12%   ← ink is WORSE
 *   «كيف تصبح مليونيراً .!»        width 8.85%   ink  2.99%   ← ink is WORSE
 *   «حوارات تستحق أن تبقى»        width 5.35%   ink 17.98%
 *
 * So there is no "right dimension". The only reliable signal is
 * `document.fonts.check()` with the exact weight, read before any canvas has
 * touched the family — see the fourth trap in the header. Where ink DOES
 * separate cleanly it is a happy accident of the string: Amiri's tallest
 * headline measures 1.6440 against 1.1528 in the fallback serif, a 30% gap,
 * while the Plex row above is 3% on the very string that sets INK_TITLE_MAX.
 */
const INK_TITLE_MAX = 1.447

describe("the switch point reaches the element, not just the stylesheet", () => {
  const SURFACE_NAMES = Object.keys(SURFACES) as Surface[]

  it("the kit's leading IS the ink measurement, on every surface", () => {
    for (const surface of SURFACE_NAMES) {
      const measured = resolved("--ui-heading-leading", surface)
      const applied = resolved("--leading-control", surface)
      expect(applied, `--leading-control did not resolve on "${surface}"`).not.toBeNull()
      expect(applied, `leading-control is detached from the measurement on "${surface}"`).toBe(measured)
      expect(applied!).toBeGreaterThanOrEqual(INK_HEADING_FLOOR)
    }
  })

  it("leading-prose IS the body step's leading", () => {
    // `--leading-prose` exists so running prose set at a HEADLINE size keeps
    // body leading. Detached, it is just another number and the homepage
    // statement stops following the scale.
    for (const surface of SURFACE_NAMES) {
      const body = resolved("--type-leading-body", surface)
      const prose = resolved("--leading-prose", surface)
      expect(prose, `--leading-prose did not resolve on "${surface}"`).not.toBeNull()
      expect(prose).toBe(body)
    }
  })

  it("every step's paired line-height IS that step's declared leading", () => {
    // The eight `--text-<step>--line-height` pairings are what make the wave-2
    // promise — "a step can never be used at a leading that collides" — true.
    // Nothing checked they still point at `--type-leading-<step>`; repointing
    // one, or pasting a literal into it, was invisible to all thirty-one.
    const steps = ["micro", "caption", "body", "lead", "subhead", "heading", "title", "display"]
    for (const surface of SURFACE_NAMES) {
      for (const step of steps) {
        const paired = resolved(`--text-${step}--line-height`, surface)
        const declared = resolved(`--type-leading-${step}`, surface)
        expect(paired, `--text-${step}--line-height did not resolve`).not.toBeNull()
        expect(paired, `text-${step} no longer carries --type-leading-${step}`).toBe(declared)
      }
    }
  })

  it("no leading falls under the mean ink of our own copy", () => {
    // A floor, not a target. At 1.103 the AVERAGE string in this project's
    // copy exactly fills its line box, so anything below it overlaps more
    // often than not — `--type-leading-body: 1` was one of the surviving
    // mutants and this is what stops it.
    //
    // Deliberately NOT claimed: that these values clear the WORST string in
    // the whole corpus (1.763). What IS claimed, per step, is that each clears
    // the population that step actually renders — see INK_TITLE_MAX below for
    // the two steps where that population lives in the database rather than in
    // the source, and where the wave-3-b justification was measured on the
    // wrong crowd.
    const offenders: string[] = []
    for (const surface of SURFACE_NAMES) {
      for (const [name] of Object.entries(SURFACES[surface])) {
        if (!/^--(type-)?leading-/.test(name)) continue
        const v = resolved(name, surface)
        if (v === null || v < INK_MEAN) offenders.push(`${surface}: ${name} = ${v}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it("the two DB-fed heading steps clear the ink of the DB's own strings", () => {
    // The step the episode <h1> and the guest <h1> use at `sm:` and above, and
    // the step they use below it. Their copy is not in this repository, so a
    // guard that only reads source files can never re-derive INK_TITLE_MAX —
    // it is pinned here, with the harvest described above, precisely so that
    // raising it is a deliberate act with a number attached.
    //
    // Reverting --type-leading-title to its old 1.4 must fail here.
    for (const surface of SURFACE_NAMES) {
      const title = resolved("--type-leading-title", surface)
      const heading = resolved("--type-leading-heading", surface)
      expect(title, `--type-leading-title did not resolve on "${surface}"`).not.toBeNull()
      expect(heading, `--type-leading-heading did not resolve on "${surface}"`).not.toBeNull()
      expect(title!, `${surface}: text-title no longer clears the tallest title in the DB`).toBeGreaterThanOrEqual(
        INK_TITLE_MAX,
      )
      expect(
        heading!,
        `${surface}: text-heading (the phone half of the same <h1>) no longer clears it`,
      ).toBeGreaterThanOrEqual(INK_TITLE_MAX)
    }
  })

  it("the shared kit's size ladder is monotonic and above both floors", () => {
    // `--ui-control-lead` is the size of every Card/DialogTitle. Setting it to
    // 0.5rem — 8px headings, smaller than the body text beside them — passed
    // every guard, because nothing said a heading has to be bigger than what
    // it heads. Ordering is that rule; it also catches a swapped pair.
    //
    // The 16px floor on `--ui-field` is the iOS zoom rule, asserted here on
    // the RESOLVED number. Guard 3 only checks that the declaration is spelled
    // `max(1rem, …)`, which a surface override could still undercut.
    for (const surface of SURFACE_NAMES) {
      const sm = resolved("--ui-control-sm", surface)
      const base = resolved("--ui-control", surface)
      const lead = resolved("--ui-control-lead", surface)
      const field = resolved("--ui-field", surface)
      for (const [n, v] of [["sm", sm], ["control", base], ["lead", lead], ["field", field]] as const) {
        expect(v, `--ui-${n} did not resolve to a number on "${surface}"`).not.toBeNull()
      }
      expect(sm!, `${surface}: control-sm is not below control`).toBeLessThan(base!)
      expect(base!, `${surface}: a kit heading is not bigger than kit body text`).toBeLessThan(lead!)
      expect(sm!, `${surface}: below the 12px floor for visible text`).toBeGreaterThanOrEqual(12)
      expect(field!, `${surface}: under the 16px iOS zoom floor`).toBeGreaterThanOrEqual(16)
    }
  })

  it("every value in @theme traces back to a :root token", () => {
    // The rule the block already follows, made enforceable. `@theme inline` is
    // the seam: :root declares the identity, @theme turns it into utilities.
    // A value with no `var()` back into :root is a utility that the switch
    // point cannot reach — which is what `--leading-control: 1.2` was, and
    // what every one of the 27 shadows and 35 radii was before wave 3.
    //
    // This is the DECLARATION half. The resolved-identity tests above are the
    // other half: this one catches a literal pasted in today, those catch the
    // source being retuned tomorrow without its consumer following.
    const ALLOWED_LITERALS: Record<string, string> = {
      // The museum overlay's own near-black. Genuinely off the switch point
      // and left that way in wave 3: it is a fixed dark scrim behind a single
      // gallery surface, not a brand colour, and the palette above has no slot
      // for it. Named here so it is a decision on the record rather than a
      // token nobody noticed.
      "--color-museum-bg": "hsl(252 44% 6%)",
    }
    const offenders: string[] = []
    for (const [token, value] of Object.entries(THEME_DECLS)) {
      if (token in ALLOWED_LITERALS) {
        expect(value, `${token} changed — re-decide whether it is still an exception`).toBe(
          ALLOWED_LITERALS[token],
        )
        continue
      }
      const refs = [...value.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1])
      if (!refs.some((r) => r in SITE_DECLS)) offenders.push(`${token}: ${value}`)
    }
    expect(offenders).toEqual([])
  })

  it("--spacing resolves to a real length, on every surface", () => {
    // Guard 5 checks --spacing is spelled `var(--type-rhythm)`. This checks it
    // still ARRIVES as a number: every p-/m-/gap-/size- utility in the app is
    // `calc(var(--spacing) * N)`, so an unresolvable value silently collapses
    // the entire layout rather than one component.
    for (const surface of SURFACE_NAMES) {
      const px = resolved("--spacing", surface)
      expect(px, `--spacing did not resolve on "${surface}"`).not.toBeNull()
      expect(px!).toBeGreaterThan(0)
    }
  })
})

// ── 7. tailwind-merge knows every utility @theme mints ───────────────────────

/**
 * THE THIRD TIME, so the guard stopped being a list.
 *
 * Registering the tokens we REMEMBER is what produced all three cn() defects:
 * the eight type steps (wave 2, silently deleted by a colour class), the two
 * leadings (wave 3, deleted by a caller's font-size), and `max-w-measure`,
 * which Noura found in no group at all. That third one was latent — all 23
 * call sites are literal className strings and none passes a second `max-w-*`
 * through cn() — but it is the identical defect twice repaired, sitting in a
 * namespace neither repair thought to look at.
 *
 * `@theme` mints a utility for EVERY key in a Tailwind namespace, so this
 * enumerates that block instead of a list of names. A new key is a failing
 * test until lib/utils.ts learns it, and a new NAMESPACE is a failing test
 * until someone decides which group it belongs to.
 */
describe("tailwind-merge knows every utility @theme mints", () => {
  /** `--<namespace>-<key>` → the class it mints and the group it must land in. */
  const NAMESPACES: Record<string, { cls: (k: string) => string; group: string }> = {
    color: { cls: (k) => `text-${k}`, group: "text-color" },
    font: { cls: (k) => `font-${k}`, group: "font-family" },
    text: { cls: (k) => `text-${k}`, group: "font-size" },
    // Ours live in `khat-leading`, which conflicts with `leading` BOTH ways —
    // so by annihilation the two are indistinguishable, which is exactly the
    // behaviour we want. That ours is in the separate group is asserted by
    // name in guard 4, and its consequence by the font-size test there.
    leading: { cls: (k) => `leading-${k}`, group: "leading" },
    radius: { cls: (k) => `rounded-${k}`, group: "rounded" },
    shadow: { cls: (k) => `shadow-${k}`, group: "shadow" },
    container: { cls: (k) => `max-w-${k}`, group: "max-w" },
  }

  /** Two known members of each group; a class is IN a group if it kills them. */
  const PROBES: Record<string, string[]> = {
    "text-color": ["text-red-500", "text-black"],
    "font-family": ["font-mono", "font-serif"],
    "font-size": ["text-sm", "text-9xl"],
    leading: ["leading-relaxed", "leading-7"],
    rounded: ["rounded-none", "rounded-full"],
    // `shadow-xs`, not `shadow-inner`. `shadow-inner` still COMPILES (v4 keeps
    // it as a legacy alias and guest-avatar.tsx uses it), but tailwind-merge
    // 3.4 does not group it — v4's inset shadows are the `inset-shadow-*`
    // namespace now. So it is a bad probe, and separately a thing to know
    // before anyone passes it through cn(): it will coexist, not merge.
    shadow: ["shadow-none", "shadow-xs"],
    "max-w": ["max-w-none", "max-w-full"],
    padding: ["p-0", "p-12"],
  }

  const groupsOf = (cls: string) =>
    Object.entries(PROBES)
      .filter(([, ps]) => ps.every((p) => cn(cls, p) === p && cn(p, cls) === cls))
      .map(([g]) => g)

  const minted: { token: string; cls: string; group: string }[] = []
  const unknownNamespaces: string[] = []
  for (const token of Object.keys(THEME_DECLS)) {
    if (token.includes("--line-height")) continue // a pairing; mints no class
    if (token === "--spacing") {
      // Mints no single class — it is the multiplier under every p-/m-/gap-.
      minted.push({ token, cls: "p-4", group: "padding" })
      continue
    }
    const ns = Object.keys(NAMESPACES).find((n) => token.startsWith(`--${n}-`))
    if (!ns) {
      unknownNamespaces.push(token)
      continue
    }
    minted.push({ token, cls: NAMESPACES[ns].cls(token.slice(ns.length + 3)), group: NAMESPACES[ns].group })
  }

  it("every namespace in @theme is one this guard knows how to check", () => {
    // A new namespace (`--tracking-*`, `--ease-*`, …) mints utilities nobody
    // has decided a merge group for. Failing here is the decision point.
    expect(unknownNamespaces).toEqual([])
    expect(minted.length).toBeGreaterThanOrEqual(30)
  })

  it.each(minted.map((m) => [m.cls, m.group, m.token]))(
    "%s lands in exactly tailwind-merge's `%s` group  (%s)",
    (cls, group) => {
      // Exactly one group: landing in NONE is the max-w-measure /
      // --leading-prose failure (coexists, stylesheet order decides); landing
      // in TWO means an ambiguous key across namespaces.
      expect(groupsOf(cls as string)).toEqual([group])
    },
  )

  it("a width cap merges with another width cap and with nothing else", () => {
    // The bug in its own shape, so it reads as a regression rather than as a
    // row in a table.
    expect(cn("max-w-measure", "max-w-2xl")).toBe("max-w-2xl")
    expect(cn("max-w-2xl", "max-w-measure")).toBe("max-w-measure")
    expect(cn("max-w-measure", "text-body")).toContain("max-w-measure")
    expect(cn("max-w-measure", "p-4")).toContain("max-w-measure")
  })
})

// ── 8. The guard asserts on the END of the chain the element actually reads ──

/**
 * WAVE 3-C. Wave 3-b resolved the chain instead of reading a token's text, and
 * that killed five mutants. NINE more survived it, and they are ONE shape, not
 * nine problems: every guard so far asserts on a `:root` token, while the
 * element wears a class minted from a `@theme` token. So pointing a `@theme`
 * token at a DIFFERENT, PERFECTLY VALID `:root` token passes everything —
 * because the value still arrives through `var()`, just from the wrong place.
 *
 *   --text-field: var(--ui-field)  →  var(--ui-control)
 *
 * compiles to `.text-field { font-size: var(--ui-control) }`, i.e. 14px, and
 * reproduces the LITERAL defect written at the top of this file: iOS Safari
 * zooms the viewport when a focused field computes under 16px. Confirmed live
 * on /contact at 375 — a real public field with `text-field` computing
 * `fontSize: "14px"` — with all 88 guards green. `--ui-field` was still
 * `max(1rem, …)`, still resolved to 16, still above every floor asserted about
 * it, and reached no field on the site.
 *
 * WHY A TENTH GUARD FOR THE TENTH MUTANT IS THE WRONG ANSWER. The nine differ
 * only in which pair of tokens is swapped; the tenth will swap a pair nobody
 * listed. So this section does not check values at all in its first half. It
 * checks the WIRE: every token in `@theme` declares which `:root` token it is
 * the utility FOR, and its declaration must reference that token — exactly
 * that one, in one hop. A token with no declared binding fails too, so a new
 * key in `@theme` is a failing test until someone says what it is bound to.
 *
 * "Exactly, in one hop" is not pedantry; it is the second thing this section
 * got wrong before it got right. The first version asked whether the source
 * appeared anywhere in the resolved chain, and `--text-control: var(--ui-field)`
 * survived it — 14px to 16px on every button and label on both surfaces —
 * because `--ui-field` is itself `max(1rem, var(--ui-control))`. The full note
 * is on `directRefs`.
 *
 * The strength of that is easiest to see in the case no value check can ever
 * catch: `--text-title--line-height: var(--type-leading-display)`. Both are
 * 1.4 today, so every resolved NUMBER is byte-identical and correct — and the
 * title step has silently stopped following its own leading, so the moment the
 * two are retuned apart the titles follow the wrong one. Only the chain sees
 * it. Same for `--color-ring: hsl(var(--primary))`: `--ring` and `--primary`
 * hold the same triplet, so nothing numeric moves, and the focus ring has
 * quietly stopped being independently tunable.
 *
 * The second half then asserts the numbers that MUST hold, on the minted
 * token rather than on its source, plus the sanity floors under the brand
 * steps themselves — because a chain can be perfectly wired and still deliver
 * 9.6px body text.
 */
describe("what the class delivers, not what the token declares", () => {
  const SURFACE_NAMES = Object.keys(SURFACES) as Surface[]
  const BRAND_STEPS = ["micro", "caption", "body", "lead", "subhead", "heading", "title", "display"]

  /**
   * Tokens in `@theme` that are a literal on purpose. Kept in step with the
   * same list in section 6 — a literal has no chain, so it cannot be bound.
   */
  const LITERALS = ["--color-museum-bg"]

  /** `@theme` token → the `:root` token it is the utility for. */
  const EXPLICIT: Record<string, string> = {
    // The shared-kit primitives. THE X01/X02 PAIR: swapping any two of these
    // four is invisible to every value assertion, because all four are real
    // sizes that pass every floor asserted about *themselves*.
    "--text-control": "--ui-control",
    "--text-control-sm": "--ui-control-sm",
    "--text-control-lead": "--ui-control-lead",
    "--text-field": "--ui-field",
    // Leading.
    "--leading-prose": "--type-leading-body",
    "--leading-control": "--ui-heading-leading",
    // Width cap and rhythm.
    "--container-measure": "--type-measure",
    "--spacing": "--type-rhythm",
    // Family.
    "--font-sans": "--font-brand-sans",
  }

  /**
   * The families whose binding follows from the name, so that ADDING a step or
   * a colour does not mean remembering to add a row above. A name that matches
   * no rule and is in neither list is a failing test by design.
   */
  function boundTo(token: string): string | null {
    const paired = token.match(/^--text-([a-z-]+)--line-height$/)
    if (paired && BRAND_STEPS.includes(paired[1])) return `--type-leading-${paired[1]}`
    const step = token.match(/^--text-([a-z-]+)$/)
    if (step && BRAND_STEPS.includes(step[1])) return `--type-size-${step[1]}`
    if (token in EXPLICIT) return EXPLICIT[token]
    if (token.startsWith("--color-")) return `--${token.slice("--color-".length)}`
    if (token.startsWith("--radius-")) return "--radius"
    if (token.startsWith("--shadow-")) return "--shadow-tint"
    return null
  }

  const bindings = Object.keys(THEME_DECLS)
    .filter((t) => !LITERALS.includes(t))
    .map((token) => ({ token, source: boundTo(token) }))

  it("every token in @theme declares which :root token it is the utility for", () => {
    // The decision point. A new `@theme` key — a step, a colour, a namespace
    // nobody has thought about — lands here as a failure until someone writes
    // down what it is FOR. That is the whole reason this is not a list of nine
    // regression tests.
    expect(bindings.filter((b) => b.source === null).map((b) => b.token)).toEqual([])
    expect(bindings.length).toBeGreaterThanOrEqual(40)
    // …and the literals are still literals, so the exemption cannot quietly
    // grow to cover a token that should have been wired.
    for (const token of LITERALS) {
      expect(THEME_DECLS[token], `${token} is exempt from binding but is no longer a literal`).not.toMatch(/var\(/)
    }
  })

  it.each(bindings.filter((b) => b.source !== null).map(({ token, source }) => [token, source as string]))(
    "%s reads exactly %s",
    (token, source) => {
      // EXACTLY, not "contains". See the note on `directRefs`: asking whether
      // the source is reachable let `--text-control: var(--ui-field)` through,
      // because --ui-field reads --ui-control itself.
      const refs = [...directRefs(THEME_DECLS[token])].sort()
      expect(refs, `${token} reads ${refs.join(", ") || "no token at all"}, not ${source}`).toEqual([source])
      // …and the source is a :root token on BOTH surfaces, not another @theme
      // entry. A binding satisfied by a second utility token is not a binding.
      for (const surface of SURFACE_NAMES) {
        expect(source in SURFACES[surface], `${source} is not declared in :root for "${surface}"`).toBe(true)
      }
    },
  )

  it("the brand family is FIRST in the sans stack, not merely present in it", () => {
    // N09: `--font-sans: ui-sans-serif, system-ui, var(--font-brand-sans),
    // sans-serif` satisfies the binding above exactly — the declaration reads
    // --font-brand-sans and nothing else, so `toEqual([source])` is green. But
    // a font stack is an ORDERED fallback list: a token that is read from
    // third position is read only for glyphs the two families before it do not
    // cover. "Reads the token" and "is the family that paints" are different
    // claims, and only the second one is what the switch point promises.
    //
    // HONEST ABOUT WHAT IS AND IS NOT PROVEN: the gap is logical and certain;
    // the visible damage is not demonstrated on macOS, where `system-ui` has
    // no Arabic coverage, so the brand face would still paint the site's copy
    // and the mutation would show as zero pixels here. It would not on a
    // platform whose system UI face covers Arabic. Position is asserted
    // because position is the property that decides, not because a screenshot
    // was produced.
    const stack = splitTopLevel(THEME_DECLS["--font-sans"], ",")
    expect(stack[0], `--font-sans paints ${stack[0]} first, not the brand family`).toBe(
      "var(--font-brand-sans)",
    )
  })

  /**
   * ONE LAYER FURTHER DOWN, because the seam has two sides.
   *
   * Everything above polices `@theme → :root`. The same swap is available
   * inside `:root` itself for the six tokens there that are DERIVED rather
   * than authored — `--ui-control-lead: var(--type-size-lead)` becoming
   * `var(--ui-field)` moves every kit heading to 16px with all of the above
   * still green, because `--text-control-lead` still reads
   * `--ui-control-lead` exactly as it should.
   *
   * Authored values (the palette, --radius, the eight steps, the leadings) are
   * deliberately literals and are NOT listed: :root is where a human decides a
   * number. Only the tokens that claim to follow another token are here.
   */
  const ROOT_DERIVATIONS: Record<string, string> = {
    "--ui-control": "--type-size-caption",
    "--ui-control-sm": "--type-size-micro",
    "--ui-control-lead": "--type-size-lead",
    "--ui-field": "--ui-control",
    "--type-rhythm": "--type-size-body",
    "--type-measure": "--type-char-advance",
  }

  it.each(Object.entries(ROOT_DERIVATIONS))("%s follows exactly %s on the site", (token, source) => {
    const refs = [...directRefs(SITE_DECLS[token] ?? "")].sort()
    expect(refs, `${token} follows ${refs.join(", ") || "nothing"}, not ${source}`).toEqual([source])
  })

  it("the admin pins its primitives to literals, so a font swap cannot move it", () => {
    // The mirror image of the rule above, and it is a rule the stylesheet
    // already states: admin density must NOT follow the brand type scale, so
    // the perturbation claim ("scaling the eight steps moves 0 of 8 admin
    // elements") holds. Making any of these three a `var()` onto the scale
    // would be the same defect wearing the opposite sign.
    const adminOnly = blockDecls(':root[data-surface="admin"] {')
    for (const token of ["--ui-control", "--ui-control-sm", "--ui-control-lead"]) {
      expect(adminOnly[token], `${token} is no longer pinned in the admin block`).toBeDefined()
      expect(adminOnly[token], `${token} now follows the brand scale in the admin`).not.toMatch(/var\(/)
    }
  })

  // ── the numbers, asserted where the class lands ────────────────────────────

  it("the 16px iOS floor holds on the CLASS, on every surface", () => {
    // Section 3 checks `--ui-field` is spelled `max(1rem, …)`; section 6 checks
    // `--ui-field` RESOLVES to >= 16. Neither says anything about `text-field`,
    // which is the only thing an <input> actually wears. This does.
    for (const surface of SURFACE_NAMES) {
      const px = resolved("--text-field", surface)
      expect(px, `--text-field did not resolve on "${surface}"`).not.toBeNull()
      expect(px!, `${surface}: the text-field CLASS computes ${px}px — iOS zooms on focus`).toBeGreaterThanOrEqual(16)
    }
  })

  it("the minted control ladder is ordered, on every surface", () => {
    // The same ordering section 6 asserts on `--ui-*`, restated on the four
    // classes `components/ui/*` actually wear. A kit heading smaller than kit
    // body text is the visible half of X02.
    for (const surface of SURFACE_NAMES) {
      const sm = resolved("--text-control-sm", surface)
      const base = resolved("--text-control", surface)
      const lead = resolved("--text-control-lead", surface)
      for (const [n, v] of [["control-sm", sm], ["control", base], ["control-lead", lead]] as const) {
        expect(v, `--text-${n} did not resolve on "${surface}"`).not.toBeNull()
      }
      expect(sm!, `${surface}: text-control-sm is not below text-control`).toBeLessThan(base!)
      expect(base!, `${surface}: a kit heading is not bigger than kit body text`).toBeLessThan(lead!)
      expect(sm!, `${surface}: below the 12px floor for visible text`).toBeGreaterThanOrEqual(12)
    }
  })

  it("the minted brand ladder is ordered at both ends of the fluid range", () => {
    // Checked at 375 and 1280 because the top two steps are `clamp(… vw …)`:
    // `title` and `display` cross over on a phone if either anchor is edited
    // carelessly, which is exactly what the flat 2.75rem used to do. Until
    // wave 3-c `toNumber` returned null for both, so no guard in this file
    // reached the two biggest sizes on the site.
    for (const vw of [375, 1280]) {
      for (const surface of SURFACE_NAMES) {
        const px = BRAND_STEPS.map((s) => {
          const v = resolved(`--text-${s}`, surface, vw)
          expect(v, `--text-${s} did not resolve at ${vw}px on "${surface}"`).not.toBeNull()
          return { s, v: v! }
        })
        for (let i = 1; i < px.length; i++) {
          expect(
            px[i].v,
            `${surface} @${vw}: text-${px[i].s} (${px[i].v}px) is not above text-${px[i - 1].s} (${px[i - 1].v}px)`,
          ).toBeGreaterThan(px[i - 1].v)
        }
      }
    }
  })

  it("the brand steps have a floor a retune cannot fall through", () => {
    // S08: `--type-size-body: 0.6rem` — 9.6px body copy, and because
    // `--spacing` is body/4 the ENTIRE layout shrinks with it — passed all 88
    // guards. Ordering alone does not catch a ladder scaled uniformly down, so
    // the two absolute anchors the stylesheet already documents are asserted:
    // 12px is written beside --type-size-micro as "the floor for visible text",
    // and body copy outside 14–24px is not body copy.
    for (const vw of [375, 1280]) {
      for (const surface of SURFACE_NAMES) {
        const micro = resolved("--text-micro", surface, vw)!
        const body = resolved("--text-body", surface, vw)!
        expect(micro, `${surface} @${vw}: the smallest step is under the 12px visible-text floor`).toBeGreaterThanOrEqual(12)
        expect(body, `${surface} @${vw}: body copy at ${body}px is not readable`).toBeGreaterThanOrEqual(14)
        expect(body, `${surface} @${vw}: body copy at ${body}px is a heading, not body`).toBeLessThanOrEqual(24)
      }
    }
  })

  it("every minted line-height arrives, and none is under the mean ink", () => {
    // Section 6 asserts the PAIRING equals `--type-leading-<step>`; this
    // asserts the number that pairing delivers is a usable leading. Both are
    // needed: the pairing test compares two tokens, so pointing BOTH at the
    // same wrong value satisfies it.
    for (const surface of SURFACE_NAMES) {
      for (const step of BRAND_STEPS) {
        const v = resolved(`--text-${step}--line-height`, surface)
        expect(v, `--text-${step}--line-height did not resolve on "${surface}"`).not.toBeNull()
        expect(
          v!,
          `${surface}: text-${step} would render at leading ${v}, under the mean ink of our copy`,
        ).toBeGreaterThanOrEqual(INK_MEAN)
      }
      const control = resolved("--leading-control", surface)
      expect(control!, `${surface}: leading-control is under the kit's ink floor`).toBeGreaterThanOrEqual(
        INK_HEADING_FLOOR,
      )
    }
  })

  it("the line-length cap is DERIVED from the measured glyph advance", () => {
    // S07: `--type-measure: 29.3rem` — the same 468.84px, written as a dead
    // number. Every guard passed, `max-w-measure` still capped paragraphs at
    // the right width, and the ONE property the token exists for was gone: a
    // new typeface changes --type-char-advance and the line length no longer
    // follows it. The cap is a count of characters times a measured advance,
    // so that is the shape asserted — not the value.
    const measure = SITE_DECLS["--type-measure"]
    expect(measure, "--type-measure is not declared in :root").toBeDefined()
    const m = measure.match(/^calc\(\s*(\d+(?:\.\d+)?)\s*\*\s*var\(--type-char-advance\)\s*\)$/)
    expect(m, `--type-measure must be \`calc(<chars> * var(--type-char-advance))\`, got \`${measure}\``).not.toBeNull()
    const chars = Number(m![1])
    // 50–80 is the comfortable band for Arabic quoted beside --type-char-advance.
    // The episode summary ran at a measured 142 before the cap existed.
    expect(chars, "the character count is outside the comfortable Arabic band").toBeGreaterThanOrEqual(50)
    expect(chars).toBeLessThanOrEqual(80)
    // …and the advance is a FONT-RELATIVE length, or the cap stops tracking the
    // type size at all. X09's shape — pointing the cap at a font-size token —
    // is caught by the binding above; this catches the same idea one level down.
    expect(SITE_DECLS["--type-char-advance"]).toMatch(/^[\d.]+em$/)
  })
})

// ── 9. The rules that READ the switch point, not the utilities it mints ──────

/**
 * THE THIRD HOLE, and it is a whole CLASS rather than a pair of tokens.
 *
 * Sections 6 and 8 police two seams: `@theme → :root`, and the six `:root`
 * tokens that derive from another `:root` token. Between them they cover every
 * CUSTOM PROPERTY in the file. They cover no ORDINARY CSS RULE at all — and
 * globals.css has fifteen declarations in plain selectors that read a brand
 * token seventeen times across nine tokens. Every one of them was outside the
 * reach of all 160 guards.
 *
 * THE TWO MUTANTS THIS SECTION WAS BUILT ON ARE GONE, AND SO IS THEIR ELEMENT.
 * N01 (`--type-leading-display-font: 1.8 → 1.2`) and N02
 * (`.museum-font-headline { font-family }` repointed to the sans) were both
 * about the Amiri apparatus. That apparatus was removed in wave 4, and the
 * reason is worth keeping here rather than in a changelog: this comment used to
 * assert the class "is the episode card's <h3>
 * (components/episodes/episode-card.tsx:61) and therefore renders on the
 * episode page, on /topics/[slug] and on /guests/[slug]". That component had
 * already been deleted. Measured on the running site: zero
 * `.museum-font-headline` nodes on every public route, all 12 Amiri faces
 * `status: "unloaded"`.
 *
 * So N01's −6.156px overlap was real when measured and had since become
 * unreachable, and N02 was describing the state the file was ALREADY in — a
 * display family with no consumer. Two guards were holding a rule that drew
 * nothing, over a font we were still fetching. THE GUARDS WERE GREEN AND THE
 * THING THEY GUARDED WAS DEAD, which is its own failure mode and the reason the
 * removal is written down here at all.
 *
 * The section keeps its shape. It enumerates the class: every
 * declaration in globals.css outside the three switch-point blocks that reads
 * a token declared in them must say WHICH tokens it reads, and read exactly
 * those. A new rule that reaches for a token is a failing test until someone
 * writes down what it is for; a repointed one fails on the token list; a rule
 * that drops its `var()` for a literal fails as a stale entry. That is the
 * same decision-point shape as section 8's binding table, applied to the side
 * of the seam nobody had looked at.
 */
describe("ordinary rules read the switch point, and say what they read", () => {
  // `SURFACE_NAMES` WAS HERE. Its only reader in this section was the Amiri ink
  // guard, which left with Amiri; the binding tests are per-rule, not
  // per-surface. Section 8 keeps its own copy.

  /** Every custom property the switch point declares, on either surface. */
  const BRAND_TOKENS = new Set([
    ...Object.keys(SITE_DECLS),
    ...Object.keys(ADMIN_DECLS),
    ...Object.keys(THEME_DECLS),
  ])

  /**
   * Token references INCLUDING the fallback form. `directRefs` matches only
   * `var(--x)`, so `var(--primary, red)` would slip past it — a repoint with a
   * fallback attached is still a repoint, and this side of the seam is exactly
   * where someone would write one.
   */
  const tokenRefs = (value: string) =>
    [...new Set([...value.matchAll(/var\(\s*(--[a-z0-9-]+)/g)].map((m) => m[1]))]
      .filter((t) => BRAND_TOKENS.has(t))
      .sort()

  /**
   * Every declaration outside `@theme inline`, `:root` and the admin `:root`,
   * keyed by `<full selector path> { <property> }`. The selector path keeps
   * the enclosing at-rule, so `@layer base ::-webkit-scrollbar-thumb` and a
   * bare `::-webkit-scrollbar-thumb` are not the same rule.
   */
  function ordinaryReads(): Map<string, string[]> {
    let rest = CSS
    const spans = ["@theme inline {", ":root {", ':root[data-surface="admin"] {']
      .map(blockSpan)
      .sort((a, b) => b[0] - a[0])
    for (const [s, e] of spans) rest = rest.slice(0, s) + rest.slice(e)

    const out = new Map<string, string[]>()
    const stack: string[] = []
    let buf = ""
    const flush = () => {
      const m = buf.match(/^\s*(-{0,2}[a-zA-Z][-a-zA-Z0-9]*)\s*:\s*([\s\S]+?)\s*$/)
      if (m) {
        const tokens = tokenRefs(m[2])
        if (tokens.length) {
          const key = `${stack.join(" ")} { ${m[1]} }`
          // Union, so a second declaration of the same property in the same
          // rule cannot hide behind the first.
          out.set(key, [...new Set([...(out.get(key) ?? []), ...tokens])].sort())
        }
      }
      buf = ""
    }
    for (const ch of rest) {
      if (ch === "{") {
        stack.push(buf.trim().replace(/\s+/g, " "))
        buf = ""
      } else if (ch === "}") {
        flush()
        stack.pop()
        buf = ""
      } else if (ch === ";") flush()
      else buf += ch
    }
    return out
  }

  /**
   * `<selector> { <property> }` → the brand tokens that rule is FOR.
   *
   * Grouped by what they are, because the reason is the point of the table:
   * a row here is a statement that this rule is supposed to follow the
   * identity, and which part of it.
   */
  const RULE_BINDINGS: Record<string, string[]> = {
    // Browser chrome: the scrollbar is painted from the palette so a retint
    // reaches it. Not decorative — it sits over every scrolling surface.
    "@layer base ::-webkit-scrollbar-track { background }": ["--background"],
    "@layer base ::-webkit-scrollbar-thumb { background }": ["--border"],
    "@layer base ::-webkit-scrollbar-thumb:hover { background }": ["--muted-foreground"],

    // The admin shell's glass/elevation set. All five follow --card/--border
    // so the admin's single light surface stays one surface after a retint.
    ".admin-glass { background }": ["--card"],
    ".admin-surface { background }": ["--card"],
    ".admin-glow { box-shadow }": ["--border"],
    ".admin-glow-hover:hover { box-shadow }": ["--border"],
    ".admin-card { background }": ["--card"],
    ".admin-card { border }": ["--border"],
    ".admin-card:hover { border-color }": ["--border"],
    ".admin-shimmer { background }": ["--muted"],
    ".admin-nav-item::before { background }": ["--primary"],

    // THE FONT HALF OF THE SWITCH POINT, and now the ONLY place the brand
    // family is consumed by a plain rule: `.transcript-viewer`, the studio
    // transcript pane. The two `.museum-font-headline` entries that stood here
    // went with the rule and with Amiri — see the section header.
    ".transcript-viewer { font-family }": ["--font-brand-sans"],
  }

  const observed = ordinaryReads()

  it("every ordinary rule that reads a brand token is declared above", () => {
    // The decision point, same as section 8's. A rule added tomorrow that
    // reaches into the palette or the type scale lands here as a failure
    // until someone writes down what it is following.
    const undeclared = [...observed.keys()].filter((k) => !(k in RULE_BINDINGS))
    expect(undeclared, "these rules read the switch point and nothing says why").toEqual([])
    // Was 15. Removing `.museum-font-headline` took two of them with it, and
    // the floor moves with the file rather than being left high to "keep the
    // number" — a floor nothing can satisfy is not a guard.
    expect(observed.size).toBeGreaterThanOrEqual(13)
  })

  it("no declared rule has quietly disappeared", () => {
    // The other direction, and it is not symmetry for its own sake: replacing
    // `font-family: var(--font-brand-sans)` with a literal `"IBM Plex …", serif`
    // detaches the rule from the switch point WITHOUT tripping the test above,
    // because the rule stops reading any token at all. It trips this one.
    const missing = Object.keys(RULE_BINDINGS).filter((k) => !observed.has(k))
    expect(missing, "declared here but no longer reading a brand token").toEqual([])
  })

  it.each(Object.entries(RULE_BINDINGS))("%s reads exactly %s", (key, tokens) => {
    expect(observed.get(key), `${key} is not in globals.css any more`).toBeDefined()
    expect(observed.get(key), `${key} reads ${observed.get(key)?.join(", ")}, not ${tokens.join(", ")}`).toEqual(
      tokens,
    )
  })

  /**
   * WE FETCH ONLY WHAT WE NAME — the guard the Amiri hole actually needed.
   *
   * The two guards that stood here pinned Amiri's leading and Amiri's binding.
   * Both were green for weeks while `.museum-font-headline` had no caller and
   * `document.fonts` reported every Amiri face `unloaded`: they policed the
   * relationship between the token and the rule, and nobody policed whether
   * either end was connected to a page. A stronger question, and the one that
   * would have failed on the day episode-card.tsx was deleted, is about the
   * OTHER half of the switch point — the <link> that costs real bytes.
   *
   * So: every family we fetch from Google Fonts must be named by a font token
   * in globals.css. It is one direction on purpose. A token with no <link> is a
   * missing font — loud, visible, and nobody ships it twice. A <link> with no
   * token is silent, costs every visitor a download, and is exactly what we
   * shipped.
   *
   * ── IT SAID "EVERY <link>" AND READ ONE ATTRIBUTE IN ONE FILE ─────────────
   * The claim above the previous version was "every family in every <link>".
   * What it actually matched was a DOUBLE-QUOTED href beginning
   * `https://fonts.googleapis.com/css2?`, in `app/layout.tsx` alone. Four ways
   * to fetch a font went straight through it, none of them exotic:
   *
   *   /css?family=Lobster    the OLDER endpoint. It still works in every
   *                          browser and it is what most copy-pasted snippets
   *                          on the web still say.
   *   href='…'               single quotes.
   *   href={FONT_HREF}       the URL behind a constant.
   *   @import url(…)         inside a <style> block — no <link> at all.
   *
   * And the last one is not hypothetical: THE TREE ALREADY HAD FOUR OF THEM,
   * every one single-quoted, none ever read by this test —
   * `app/admin/media-kit/page.tsx`, `app/admin/submissions/submissions-tabs.tsx`
   * and `lib/pdf/proposal-pdf.ts`. They happen to fetch the family we paint
   * with, so nothing is wrong today; the guard simply had no idea they existed.
   *
   * The root cause is that it matched the DELIVERY MECHANISM instead of the
   * thing that costs bytes. A stylesheet URL is a stylesheet URL whether an
   * href, an @import or a template literal carries it, so this now scans for
   * the URL itself and the four evasions collapse into one rule. The file list
   * is explicit — and the test below fails if a file appears with a font URL
   * that is not on it, so the list cannot silently go out of date the way the
   * single hardcoded filename did.
   *
   * DECLARED LIMIT: a URL assembled at runtime (`\`…css2?family=${name}\``) is
   * not resolved. The literal text has to be in the file.
   */
  const FONT_FETCHING_FILES = [
    "app/layout.tsx",
    "app/admin/media-kit/page.tsx",
    "app/admin/submissions/submissions-tabs.tsx",
    "lib/pdf/proposal-pdf.ts",
  ]

  /** Both endpoints, any quoting, href or @import — the URL is the URL. */
  const FONT_URL = /https:\/\/fonts\.googleapis\.com\/css2?\?[^"'`\s)]*/g

  it("every family we fetch from Google Fonts is a family we actually paint with", () => {
    const urls = FONT_FETCHING_FILES.flatMap((rel) => [
      ...readFileSync(join(ROOT, rel), "utf8").matchAll(FONT_URL),
    ].map((m) => m[0]))
    expect(urls.length, "no Google Fonts URL found at all").toBeGreaterThan(0)

    // `family=IBM+Plex+Sans+Arabic:wght@300;400` → `IBM Plex Sans Arabic`
    const fetched = urls.flatMap((href) =>
      [...href.matchAll(/family=([^&:]+)/g)].map((m) =>
        decodeURIComponent(m[1]).replace(/\+/g, " ").trim(),
      ),
    )
    expect(fetched.length, "the stylesheet URLs fetch nothing").toBeGreaterThan(0)

    // ── WHAT COUNTS AS "NAMED" ────────────────────────────────────────────
    // The FIRST family in a token's stack, and only that one. Two separate
    // faults made the old haystack answer yes to things it should not have:
    //
    //   · SUBSTRING, NOT FAMILY. `named.includes("IBM Plex Sans")` is true
    //     because «IBM Plex Sans Arabic» contains it — so a genuinely
    //     DIFFERENT Google family, one nothing on the site can paint, passed.
    //     Font names nest constantly (Noto Sans / Noto Sans Arabic, Cairo /
    //     Cairo Play), so this is the normal case, not a corner one.
    //
    //   · FALLBACK POSITION IS NOT INTENT. «Cairo» sits in --font-brand-sans
    //     as the third entry, i.e. a name we hope is already ON THE DEVICE if
    //     the first two fail. Downloading it makes it not a fallback at all:
    //     every visitor pays for a face that can only paint if a font arriving
    //     in the SAME stylesheet failed to. Fetching a family is a statement
    //     that we intend to paint with it, and that is the head of the stack.
    //
    // A leading `var(--x)` is resolved one hop, because --font-sans is written
    // `var(--font-brand-sans), ui-sans-serif, …` and its real head lives there.
    const decls: Record<string, string> = { ...THEME_DECLS, ...SITE_DECLS, ...ADMIN_DECLS }
    const head = (value: string, depth = 0): string => {
      const first = splitTopLevel(value, ",")[0] ?? ""
      const ref = depth > 4 ? null : first.match(/^var\(\s*(--[\w-]+)\s*\)$/)
      const next = ref ? decls[ref[1]] : undefined
      return next === undefined ? first.replace(/^["']|["']$/g, "").trim() : head(next, depth + 1)
    }
    const painted = new Set(
      Object.entries(decls)
        .filter(([k]) => k.startsWith("--font-"))
        .map(([, v]) => head(v))
        .filter(Boolean),
    )

    const orphans = fetched.filter((family) => !painted.has(family))
    expect(
      orphans,
      `fetched but painted by no --font-* token — every visitor downloads these ` +
        `and nothing on the site sets them as its first family. Painted: ` +
        `${[...painted].join(", ")}`,
    ).toEqual([])
  })

  it("fetches no font from a file the guard above does not read", () => {
    // The reason the previous version could claim "every <link>" while reading
    // one hardcoded filename is that nothing checked the filename was still the
    // whole story. Four files were fetching fonts outside it. This is the check
    // that would have said so, and it is the same shape as the OUTWARD_SURFACES
    // guard in tests/brand/outward-surfaces.test.ts.
    const found: string[] = []
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          scan(full)
          continue
        }
        if (!/\.(ts|tsx|css)$/.test(entry)) continue
        const rel = relative(ROOT, full)
        // The test file itself names these URLs in order to look for them.
        if (rel.startsWith("tests/") || FONT_FETCHING_FILES.includes(rel)) continue
        if (new RegExp(FONT_URL.source).test(readFileSync(full, "utf8"))) found.push(rel)
      }
    }
    scan(ROOT)
    expect(found, "fetches a Google font and is not in FONT_FETCHING_FILES").toEqual([])
  })
})
