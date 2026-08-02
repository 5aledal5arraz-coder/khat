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
    // `leading-none` is a line box exactly as tall as the font size. Arabic ink
    // is 1.365x its font size PLAIN and 1.708x with a shadda+kasratan stack
    // (measured 2026-08-02, IBM Plex Sans Arabic 600, canvas actualBoundingBox
    // — the ratio is size-independent). So leading-none collides at every size
    // this kit uses. Deleting `leading-control` from DialogTitle or CardTitle,
    // or putting `leading-none` back, must fail here.
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
    const offenders: string[] = []
    const sizePattern = new RegExp(
      `(^|[\\s"'\`{])text-(${steps.join("|")})(?=[\\s"'\`}]|$)|text-\\[[^\\]]+\\]`,
    )
    for (const { file, line, tag } of headingTags()) {
      if (/\btracking-tight(er)?\b/.test(tag)) offenders.push(`${file}:${line} tracking-tight`)
      if (!sizePattern.test(tag)) offenders.push(`${file}:${line} no size step`)
    }
    expect(offenders).toEqual([])
  })

  it("--ui-heading-leading clears the measured worst-case Arabic ink", () => {
    // The number itself, not just its presence. 1.708 is the tallest ink/size
    // ratio measured on this typeface at 600 weight; Noura independently
    // measured 1.737 on a harsher sample. A future edit that "tidies" this back
    // toward a Latin-looking 1.2 must fail.
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

  it("every elevation rung is drawn in --shadow-tint", () => {
    const rungs = [...theme.matchAll(/^\s*--shadow-([a-z0-9]+):\s*([^;]+);/gm)]
    expect(rungs.length).toBeGreaterThanOrEqual(4)
    expect(rungs.filter(([, , v]) => !v.includes("var(--shadow-tint)")).map(([, k]) => k)).toEqual([])
    // …and the tint itself is NOT in @theme, or Tailwind mints a `shadow-tint`
    // utility that renders a colour triplet as a box-shadow.
    expect(theme).not.toMatch(/--shadow-tint:/)
    expect(css).toMatch(/--shadow-tint:\s*[\d\s%.]+;/)
  })

  it("no source file still uses the two merged-away rungs", () => {
    // `rounded` and `rounded-sm` computed the SAME 4px under two names, and
    // bare `rounded` is a v3 compatibility constant that `@theme` cannot
    // reach at all (tried `--radius-DEFAULT`; Tailwind ignores it, verified in
    // the compiled stylesheet). `shadow` and `shadow-sm` were likewise
    // byte-identical. Both were rewritten to the surviving name for exactly
    // zero pixels of change; this stops them coming back.
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
