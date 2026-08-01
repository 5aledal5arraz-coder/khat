/**
 * The action-error banner must never cover the transport controls.
 *
 * The defect: the banner in `live-v2-client.tsx` was
 * `fixed inset-x-0 top-0 z-50`, ~44px tall. `position: fixed` takes an element
 * out of normal flow, so nothing below reserves its height and it paints on top
 * of the first rows of whichever phase branch is mounted. In <OnAirView> the
 * first row is the <StatusRail>, which carries pause / resume / end. Net
 * effect: the instant an action failed mid-take, the banner landed exactly on
 * the buttons that stop the take. There is a "إخفاء" button, so it was
 * recoverable — but only if the director noticed it while the camera rolled.
 *
 * Why a SOURCE-level guard instead of a render test: the failure is geometric
 * (two boxes sharing pixels), and this suite runs in `environment: "node"` with
 * `renderToStaticMarkup` — no layout engine, no jsdom, so no rendered assertion
 * can measure an overlap. What CAN be pinned is the property the CSS box model
 * derives the guarantee from: a block-level element in NORMAL FLOW cannot
 * overlap a later sibling, at any scroll offset or viewport width. So this file
 * asserts (1) the banner stays in normal flow, (2) it stays a preceding sibling
 * of the phase view, (3) the rail is still the first thing in the on-air view,
 * and (4) nothing else on this surface is a top-pinned viewport overlay.
 *
 * (4) is the general form of the bug. Bottom-pinned `fixed` bars are fine and
 * several exist deliberately (the checklist action bar, the preflight go-live
 * bar, the notes panel); the top edge is the one that is spoken for.
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

describe("action-error banner vs. the transport rail", () => {
  it("stays in normal flow — it can never paint over the rail", () => {
    const cls = tokens(bannerClassName())

    const offending = cls.filter((t) => OUT_OF_FLOW.has(t))
    expect(
      offending,
      `the banner sits above <StatusRail> (pause / resume / end). Positioning it ` +
        `[${offending.join(", ")}] removes it from flow, so nothing reserves its height ` +
        `and it lands on the stop button the moment an action fails mid-take.`,
    ).toEqual([])

    // Belt and braces: no top pin, and no negative top margin pulling it back
    // over whatever precedes it.
    expect(cls.filter(pinsToTop)).toEqual([])
    expect(cls.filter((t) => /^-mt-/.test(t))).toEqual([])
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

  it("has no top-pinned viewport overlay anywhere on the recording surface", () => {
    const offenders: string[] = []
    for (const file of readdirSync(resolve(ROOT, V2_DIR)).filter((f) => f.endsWith(".tsx"))) {
      const sf = parse(`${V2_DIR}/${file}`)
      walk(sf, (n) => {
        if (!ts.isJsxAttribute(n) || n.name.getText() !== "className") return
        const t = tokens(classText(n.initializer))
        if (!t.includes("fixed")) return
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
