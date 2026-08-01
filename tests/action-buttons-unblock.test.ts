/**
 * Wave 1 "كسر الصمت" — every admin button that awaits a Server Action inside
 * `startTransition` must go through `runAction`.
 *
 * Why a SOURCE-level guard and not a render test: the defect lives in the seam
 * between the action and the hand, and it is invisible to both a unit test of
 * the action (which returns fine) and a render test with a mocked action
 * (which resolves fine). It only appears when the promise REJECTS — nginx
 * cutting the request at 120s, the tab predating the running build, the
 * network dropping. In that case the rejection escapes the transition,
 * `isPending` never returns to false, and the button is dead until reload.
 * `tests/run-action.test.ts` already proves the wrapper never rejects; this
 * file proves each button actually uses it.
 *
 * Worst case in the list is `prep-inline-editor.tsx`: its whole row is
 * `disabled={pending}`, so a stuck transition took away the "إلغاء" button too
 * and stranded the operator's unsaved edit in a textarea they could not close.
 */

import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"

const ROOT = resolve(__dirname, "..")

/** The seven buttons named in the Wave 1 audit. */
const BUTTONS = [
  "app/admin/khat-brain/episodes/[eirId]/job-action-button.tsx",
  "app/admin/khat-brain/episodes/[eirId]/prep-inline-editor.tsx",
  "app/admin/discovery-v2/candidate-card.tsx",
  "app/admin/khat-brain/episodes/[eirId]/create-room-button.tsx",
  "app/admin/khat-brain/episodes/[eirId]/assign-guest-form.tsx",
  "app/admin/khat-brain/episodes/[eirId]/launch-episode-discovery-button.tsx",
  "app/admin/discovery-v2/start-form.tsx",
]

const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8")

/**
 * Every `await` that sits INSIDE a transition callback.
 *
 * Two earlier versions of this check were both green on code they existed to
 * forbid, and each failure was the same mistake at a different scale:
 *
 *  1. A regex for `await <name>Action(` over the whole file. The real defect in
 *     `job-action-button.tsx` was `await action()` — the action arrives as a
 *     prop named `action`, which does not end in "Action" — so the guard passed
 *     on it (verified by reverting the file).
 *  2. A brace-walker that recognised exactly two opener names,
 *     `startTransition(` and `start(`. But the setter from `useTransition()` is
 *     destructured, so it can be called anything; this repo has 17 distinct
 *     names (`startBusy`, `startSave`, `startRegen`, …). That guard swept the
 *     whole tree, reported zero offenders, and was hiding 36 unwrapped awaits
 *     in 8 files.
 *
 * The lesson both times: a HAND-MAINTAINED list of names cannot guard against
 * a name nobody thought of. So this version keeps no list. It parses the file
 * and derives the opener names from the source itself:
 *
 *  - every `const [, startX] = useTransition()` binding (the first slot is
 *    frequently omitted, as in `const [, startNotesTransition]`), and
 *  - to a fixpoint, every local function that forwards one of ITS OWN
 *    parameters into a known opener. `live-v2-client.tsx` defines
 *    `withBusy(fn) { return () => startTransition(fn) }` and routes five timer
 *    actions through it; the awaits live in the arguments passed to `withBusy`,
 *    so no amount of scanning inside `startTransition(...)` can ever see them.
 *    Requiring the forwarded identifier to be the candidate's own parameter is
 *    what separates a real wrapper from a component that merely happens to
 *    contain a transition.
 *
 * A rejection anywhere in that body is what strands `isPending`, whatever the
 * callee happens to be named.
 */
function transitionOpeners(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>(["startTransition"])

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(sf).endsWith("useTransition") &&
      ts.isArrayBindingPattern(node.name) &&
      node.name.elements.length >= 2
    ) {
      const setter = node.name.elements[1]
      if (setter && !ts.isOmittedExpression(setter) && ts.isIdentifier(setter.name)) {
        names.add(setter.name.text)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  // Fixpoint: wrappers that forward a parameter into an opener are openers too.
  for (let pass = 0; pass < 6; pass++) {
    const before = names.size
    const visitFns = (node: ts.Node): void => {
      const fn = ts.isFunctionDeclaration(node)
        ? node
        : ts.isVariableDeclaration(node) &&
            node.initializer &&
            (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
          ? node.initializer
          : null
      const name = ts.isFunctionDeclaration(node)
        ? node.name?.text
        : ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
          ? node.name.text
          : undefined

      if (fn?.body && name && !names.has(name)) {
        const params = new Set(
          fn.parameters.filter((p) => ts.isIdentifier(p.name)).map((p) => (p.name as ts.Identifier).text),
        )
        if (params.size) {
          let forwards = false
          const scan = (x: ts.Node): void => {
            if (
              ts.isCallExpression(x) &&
              ts.isIdentifier(x.expression) &&
              names.has(x.expression.text) &&
              x.arguments.length === 1 &&
              ts.isIdentifier(x.arguments[0]) &&
              params.has((x.arguments[0] as ts.Identifier).text)
            ) {
              forwards = true
            }
            ts.forEachChild(x, scan)
          }
          scan(fn.body)
          if (forwards) names.add(name)
        }
      }
      ts.forEachChild(node, visitFns)
    }
    visitFns(sf)
    if (names.size === before) break
  }

  return names
}

/** `{ callee, line }` for every await inside a transition, line 1-based. */
function awaitedInTransitions(
  src: string,
  file = "probe.tsx",
): { callee: string; line: number }[] {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const openers = transitionOpeners(sf)
  const out: { callee: string; line: number }[] = []
  const seen = new Set<string>()

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && openers.has(node.expression.text)) {
      for (const arg of node.arguments) {
        const scan = (x: ts.Node): void => {
          // Anything inside a `runAction(...)` call is already contained — the
          // wrapper never rejects — so a multi-step callback like
          // `runAction(async () => { await a(); return b() })` is correct and
          // must not be reported as an unwrapped await.
          if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === "runAction") {
            return
          }
          // A `try { … } catch { … }` also guarantees the transition settles,
          // which is the property this guard actually protects. The catch and
          // finally blocks are still scanned — an await that rejects THERE
          // escapes exactly like an unguarded one.
          if (ts.isTryStatement(x) && x.catchClause) {
            scan(x.catchClause.block)
            if (x.finallyBlock) scan(x.finallyBlock)
            return
          }
          if (ts.isAwaitExpression(x)) {
            const inner = x.expression
            const callee = ts.isCallExpression(inner)
              ? inner.expression.getText(sf)
              : inner.getText(sf)
            const line = sf.getLineAndCharacterOfPosition(x.getStart(sf)).line + 1
            const key = `${line}:${callee}`
            if (!seen.has(key)) {
              seen.add(key)
              out.push({ callee, line })
            }
          }
          ts.forEachChild(x, scan)
        }
        scan(arg)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return out
}

function awaitedCalleesInTransitions(src: string): string[] {
  return awaitedInTransitions(src).map((a) => a.callee)
}

describe("startTransition buttons are wrapped in runAction", () => {
  it.each(BUTTONS)("%s imports runAction", (rel) => {
    expect(read(rel)).toContain(
      'from "@/app/admin/components/run-action"',
    )
  })

  it.each(BUTTONS)("%s awaits its action through runAction", (rel) => {
    const src = read(rel)
    expect(src).toMatch(/await runAction\(/)
  })

  it.each(BUTTONS)(
    "%s awaits NOTHING but runAction inside a transition",
    (rel) => {
      const callees = awaitedCalleesInTransitions(read(rel))
      // Non-empty is itself part of the assertion: a file whose transition
      // body we failed to find would otherwise pass with an empty list.
      expect(callees.length, "no awaited call found in any transition").toBeGreaterThan(0)
      const unwrapped = callees.filter((c) => c !== "runAction")
      expect(unwrapped, `unwrapped awaits: ${unwrapped.join(", ")}`).toEqual([])
    },
  )

  it("candidate-card unblocks all three of its buttons", () => {
    // One shared `pending` flag disables promote / save / reject together, so
    // a rejection on ANY of the three froze the whole card.
    const src = read("app/admin/discovery-v2/candidate-card.tsx")
    expect(src.match(/runAction\(/g) ?? []).toHaveLength(3)
  })
})

/**
 * The list above is the seven buttons the audit NAMED. On its own it is a
 * snapshot, not a guard: the audit list was assembled by hand, and a hand list
 * is exactly how the next unwrapped button gets shipped. Four more were in fact
 * found after the seven were "done" — three files that imported `runAction` and
 * never called it (`signals-client`, `sources-client`, `questions-client`) and
 * one that had grown its own private wrapper (`episodes-grid`).
 *
 * So the real guard is this one: scan EVERY source file, not a list.
 */

/** Files allowed to await something other than `runAction` in a transition. */
const ALLOWED_NON_RUNACTION: Record<string, string> = {
  // The wrapper's own JSDoc usage example, not executable code.
  "app/admin/components/run-action.ts": "someAction",
  // Adapts runAction to this file's `{success, error}` convention. Asserted
  // below to actually delegate, so it is a rename of runAction, not a bypass.
  "app/admin/episodes/components/episodes-grid.tsx": "safeAction",
}

function sourceFiles(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue
    const rel = `${dir}/${e.name}`
    if (e.isDirectory()) sourceFiles(rel, acc)
    else if (/\.tsx?$/.test(e.name)) acc.push(rel)
  }
  return acc
}

describe("no transition anywhere awaits an unwrapped Server Action", () => {
  it("sweeps app/ and components/ for the pattern", () => {
    const offenders: string[] = []
    for (const rel of [...sourceFiles("app"), ...sourceFiles("components")]) {
      const src = readFileSync(resolve(ROOT, rel), "utf8")
      if (!src.includes("startTransition") && !src.includes("useTransition")) {
        continue
      }
      const unwrapped = awaitedInTransitions(src, rel).filter(
        (c) => c.callee !== "runAction" && c.callee !== ALLOWED_NON_RUNACTION[rel],
      )
      for (const u of unwrapped) offenders.push(`${rel}:${u.line} → await ${u.callee}(`)
    }
    expect(offenders, `unwrapped awaits inside a transition:\n${offenders.join("\n")}`).toEqual([])
  })

  it("every allowlisted file still exists and still delegates to runAction", () => {
    // Without this, the allowlist becomes a place to hide a regression: a file
    // could drop its `runAction` call and stay green because it is exempt.
    for (const rel of Object.keys(ALLOWED_NON_RUNACTION)) {
      const src = readFileSync(resolve(ROOT, rel), "utf8")
      expect(src, `${rel} no longer mentions runAction`).toMatch(/runAction/)
    }
  })

  it("no file imports runAction without using it", () => {
    // The precise shape of the half-finished sweep: the import was added to
    // three files and the call site was never converted, so the file LOOKED
    // migrated to anyone grepping for the import.
    const dead: string[] = []
    for (const rel of [...sourceFiles("app"), ...sourceFiles("components")]) {
      const src = readFileSync(resolve(ROOT, rel), "utf8")
      if (!/^import\s*\{[^}]*\brunAction\b/m.test(src)) continue
      if (!/\brunAction\s*\(/.test(src)) dead.push(rel)
    }
    expect(dead, `imports runAction but never calls it:\n${dead.join("\n")}`).toEqual([])
  })
})
