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
})

// ── 3. No public focusable field may sit under the 16px iOS floor ────────────

describe("public form fields keep the 16px iOS floor", () => {
  /**
   * A sub-16px step, and ONLY when it is unprefixed. `md:text-control` is the
   * correct desktop half of the pairing — at ≥768px there is no phone to zoom —
   * so the token must not be preceded by a variant prefix.
   */
  const SUB_16 = /(^|[\s"'`{])text-(caption|micro|control|control-sm|sm|xs)(?=[\s"'`}]|$)/
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
        const tag = seg.slice(0, end)
        if (NON_TEXT.test(tag)) continue
        // The live director console's notes textarea is a KNOWN, deliberate
        // exception — it is part of the deferred sub-12px pass on that panel.
        if (f.includes("live-client.tsx")) continue
        if (SUB_16.test(tag)) {
          const line = src.slice(0, m.index!).split("\n").length
          offenders.push(`${relative(ROOT, f)}:${line}`)
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
