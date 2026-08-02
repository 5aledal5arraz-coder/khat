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

/** The custom-property declarations of one block, by its opening text. */
function blockDecls(opener: string): Record<string, string> {
  const start = CSS.indexOf(opener)
  if (start < 0) throw new Error(`block not found in globals.css: ${opener}`)
  let depth = 0
  for (let i = start + opener.length - 1; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++
    else if (CSS[i] === "}" && --depth === 0) {
      const out: Record<string, string> = {}
      for (const m of CSS.slice(start + opener.length, i).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        out[m[1]] = m[2].trim()
      }
      return out
    }
  }
  throw new Error(`unbalanced block in globals.css: ${opener}`)
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
 * a unitless ratio — or null when it cannot be reduced without a viewport
 * (`clamp(… vw …)`) or a font context (`em`). Callers that need a number
 * assert it is not null, so an unresolvable value FAILS rather than skips.
 */
function toNumber(expr: string): number | null {
  const s = expr.trim()
  const leaf = s.match(/^(-?\d*\.?\d+)(rem|px)?$/)
  if (leaf) return leaf[2] === "rem" ? parseFloat(leaf[1]) * 16 : parseFloat(leaf[1])
  const fn = s.match(/^([a-z]*)\(([\s\S]*)\)$/)
  if (fn && balanced(fn[2])) {
    const args = splitTopLevel(fn[2], ",").map(toNumber)
    if (args.some((a) => a === null)) return null
    const n = args as number[]
    if (fn[1] === "max") return Math.max(...n)
    if (fn[1] === "min") return Math.min(...n)
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
        const l = toNumber(s.slice(0, i))
        const r = toNumber(s.slice(i + 1))
        if (l === null || r === null) return null
        return ch === "+" ? l + r : ch === "-" ? l - r : ch === "*" ? l * r : l / r
      }
    }
  }
  return null
}

/** The number a surface actually delivers for a token. */
const resolved = (name: string, surface: Surface) => toNumber(substitute(lookup(name, surface), surface))

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
describe("the switch point reaches the element, not just the stylesheet", () => {
  const SURFACE_NAMES = Object.keys(SURFACES) as Surface[]

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
    // Deliberately NOT claimed: that these values clear the WORST string.
    // `--type-leading-title` and `--type-leading-display` are 1.4, under the
    // 1.441 tallest-untashkeel'd measurement, so a title can still collide on
    // its worst input. That is a real residual at display sizes — where the
    // copy is short and hand-chosen — and it is a decision, not an oversight.
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
