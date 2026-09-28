/**
 * The action-error overlay must never cover the transport controls.
 *
 * History, because the rule changed shape twice:
 *   1. The banner in `live-v2-client.tsx` was `fixed inset-x-0 top-0 z-50`.
 *      Out of flow, pinned to the TOP — exactly where <StatusRail> carries
 *      pause / resume / end. The instant an action failed mid-take, the banner
 *      landed on the stop button.
 *   2. It was moved into NORMAL FLOW above the view. That fixed the overlap but
 *      made every failure shove the whole cockpit down mid-take, and it
 *      scrolled away.
 *   3. (2026-09-28, Khaled-approved host plan) The rail is now STICKY at the
 *      top, and the overlay floats at the BOTTOM, above the fixed thumb bar
 *      (`--khat-bottom-bar`). The top edge stays spoken for by the rail; the
 *      overlay can cover neither.
 *
 * Why a SOURCE-level guard: the failure is geometric and this suite runs in
 * `environment: "node"` with no layout engine. What CAN be pinned are the class
 * properties the guarantee derives from: (1) anything out of flow in the
 * overlay is bottom-anchored and never top-pinned, (2) the overlay is still
 * rendered as a sibling BEFORE the phase view (not inside the rail), (3) the
 * rail is the first row of the on-air view and is sticky under the fixed-height
 * header, and (4) nothing on this surface is a top-pinned viewport overlay —
 * except a `role="dialog"` sheet the host opened himself and can dismiss.
 */

import { describe, expect, it } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"

const ROOT = resolve(__dirname, "../..")
const V2_DIR = "app/admin/recording/[roomId]/v2"

const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8")

function parse(rel: string): ts.SourceFile {
  return ts.createSourceFile(rel, read(rel), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}

function walk(node: ts.Node, visit: (n: ts.Node) => void) {
  visit(node)
  ts.forEachChild(node, (c) => walk(c, visit))
}

/** Every string fragment that can end up in a `className`, comments excluded. */
function classText(init: ts.Node | undefined): string {
  if (!init) return ""
  const parts: string[] = []
  walk(init, (n) => {
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) parts.push(n.text)
    else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) parts.push(n.text)
  })
  return parts.join(" ")
}

const tokens = (s: string) => s.split(/\s+/).filter(Boolean)

/** Utilities that remove an element from normal flow (so it can paint over siblings). */
const OUT_OF_FLOW = new Set(["fixed", "absolute", "sticky"])

/**
 * Utilities that pin a box to the TOP edge — where the transport controls live.
 * `inset-x-*` is deliberately absent: stretching horizontally is harmless.
 */
const pinsToTop = (t: string) => /^-?top-/.test(t) || t === "inset-0" || /^-?inset-y-/.test(t)

/** The `<div role="alert">` that carries the action error. */
function bannerClassName(): string {
  const sf = parse(`${V2_DIR}/live-v2-client.tsx`)
  const found: string[] = []
  walk(sf, (n) => {
    if (!ts.isJsxOpeningLikeElement(n)) return
    const attrs = n.attributes.properties.filter(ts.isJsxAttribute)
    const role = attrs.find((a) => a.name.getText() === "role")
    if (!role || classText(role.initializer) !== "alert") return
    const cls = attrs.find((a) => a.name.getText() === "className")
    found.push(classText(cls?.initializer))
  })
  expect(found, 'expected exactly one role="alert" element in live-v2-client.tsx').toHaveLength(1)
  return found[0]
}

/** Every className string inside the `actionErrorBanner` initializer. */
function overlayClassNames(): string[] {
  const sf = parse(`${V2_DIR}/live-v2-client.tsx`)
  const found: string[] = []
  walk(sf, (n) => {
    if (!ts.isVariableDeclaration(n) || n.name.getText() !== "actionErrorBanner") return
    walk(n, (m) => {
      if (!ts.isJsxAttribute(m) || m.name.getText() !== "className") return
      found.push(classText(m.initializer))
    })
  })
  return found
}

describe("action-error banner vs. the transport rail", () => {
  it("floats at the BOTTOM, above the thumb bar — never pinned to the top", () => {
    // Exactly one alert region still exists (announced regardless of scroll).
    bannerClassName()
    const classes = overlayClassNames()
    expect(classes.length, "actionErrorBanner should render elements").toBeGreaterThan(0)
    for (const cls of classes.map(tokens)) {
      expect(cls.filter(pinsToTop), "the top edge belongs to the sticky rail").toEqual([])
      expect(cls.filter((t) => /^-mt-/.test(t))).toEqual([])
      if (cls.some((t) => OUT_OF_FLOW.has(t))) {
        expect(
          cls.some((t) => /^bottom-/.test(t)),
          `an out-of-flow overlay must be bottom-anchored: [${cls.join(" ")}]`,
        ).toBe(true)
        // …and clear the fixed thumb bar, whatever its height.
        expect(cls.join(" ")).toContain("--khat-bottom-bar")
      }
    }
  })

  it("is still rendered BEFORE the phase view, not inside it", () => {
    // In-flow only guarantees "does not overlap a LATER sibling". If the banner
    // ever moved after the view it would be in flow and still useless.
    const sf = parse(`${V2_DIR}/live-v2-client.tsx`)
    const orders: string[][] = []
    walk(sf, (n) => {
      if (!ts.isVariableDeclaration(n) || n.name.getText() !== "withBanner") return
      const init = n.initializer
      if (!init || !ts.isArrowFunction(init)) return
      const body = ts.isParenthesizedExpression(init.body) ? init.body.expression : init.body
      if (!ts.isJsxFragment(body)) return
      orders.push(
        body.children
          .filter((c) => !ts.isJsxText(c) || c.text.trim() !== "")
          .map((c) => c.getText().trim()),
      )
    })
    expect(orders, "withBanner should be one arrow function returning a fragment").toHaveLength(1)
    expect(orders[0]).toEqual(["{actionErrorBanner}", "{node}"])
  })

  it("keeps the rail as the first row of the on-air view", () => {
    // This is WHY the top edge is spoken for. If the rail ever stops being the
    // top row, re-read the banner decision above before moving anything.
    const sf = parse(`${V2_DIR}/onair-view.tsx`)
    const firsts: string[] = []
    walk(sf, (n) => {
      if (!ts.isFunctionDeclaration(n) || n.name?.getText() !== "OnAirView") return
      walk(n, (m) => {
        if (firsts.length || !ts.isReturnStatement(m) || !m.expression) return
        const expr = ts.isParenthesizedExpression(m.expression) ? m.expression.expression : m.expression
        if (!ts.isJsxElement(expr)) return
        const child = expr.children.find((c) => !ts.isJsxText(c) || c.text.trim() !== "")
        if (!child) return
        if (ts.isJsxElement(child)) firsts.push(child.openingElement.tagName.getText())
        else if (ts.isJsxSelfClosingElement(child)) firsts.push(child.tagName.getText())
        else firsts.push(child.getText().trim())
      })
    })
    expect(firsts[0]).toBe("StatusRail")
  })

  it("keeps the rail STICKY directly under the fixed-height page header", () => {
    // If either number moves alone, the rail slides under the header (or
    // leaves a gap the question scrolls through).
    const rail = read(`${V2_DIR}/status-rail.tsx`)
    expect(rail).toMatch(/className="sticky top-9 /)
    const page = read(`${V2_DIR}/page.tsx`)
    expect(page).toMatch(/<header className="sticky top-0[^"]*\bh-9\b/)
  })

  it("has no top-pinned viewport overlay anywhere on the recording surface", () => {
    const offenders: string[] = []
    for (const file of readdirSync(resolve(ROOT, V2_DIR)).filter((f) => f.endsWith(".tsx"))) {
      const sf = parse(`${V2_DIR}/${file}`)
      walk(sf, (n) => {
        if (!ts.isJsxOpeningLikeElement(n)) return
        const attrs = n.attributes.properties.filter(ts.isJsxAttribute)
        const cls = attrs.find((a) => a.name.getText() === "className")
        if (!cls) return
        const t = tokens(classText(cls.initializer))
        if (!t.includes("fixed")) return
        // A dialog the host opened and can dismiss (Sheet) may cover the page.
        const role = attrs.find((a) => a.name.getText() === "role")
        if (role && classText(role.initializer) === "dialog") return
        const pins = t.filter(pinsToTop)
        if (pins.length) offenders.push(`${file}: fixed + ${pins.join(" ")}`)
      })
    }
    expect(
      offenders,
      "a viewport-pinned overlay at the top edge covers the transport controls",
    ).toEqual([])
  })
})
