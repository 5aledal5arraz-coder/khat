/**
 * The on-air controls a thumb lands on, rendered (SSR, no DOM) plus the one
 * structural rule no render can show: «إنهاء» needs two taps.
 *
 * The defect: Pause and End were 32×24 icons 6px apart, End one tap with no
 * confirmation, danger-red all take long — while the far less final "reset"
 * already asked first.
 */

import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"
import {
  EndTakeControl,
  PauseResumeButton,
  CompactClock,
} from "@/app/admin/recording/[roomId]/v2/cockpit-clock"
import { ThumbBar } from "@/app/admin/recording/[roomId]/v2/flag-control"
import { classifyActionFailure, failureMessageForResult } from "@/app/admin/components/run-action"

const ROOT = resolve(__dirname, "../..")

describe("EndTakeControl", () => {
  it("at rest: a labelled, NEUTRAL button — no danger colour, no confirm yet", () => {
    const html = renderToStaticMarkup(createElement(EndTakeControl, { busy: false, onEnd: () => {} }))
    expect(html).toContain("إنهاء")
    expect(html).not.toContain("متأكد")
    expect(html).not.toMatch(/bg-rose-7|text-rose-/)
    expect(html).toContain("min-h-[44px]")
  })

  it("calls onEnd ONLY from the armed «متأكد؟ إنهاء» button", () => {
    // Structural: inside EndTakeControl, every `onEnd(` call must sit in a
    // JSX element whose text is the confirm label. The idle button may only arm.
    const src = readFileSync(resolve(ROOT, "app/admin/recording/[roomId]/v2/cockpit-clock.tsx"), "utf8")
    const sf = ts.createSourceFile("c.tsx", src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const callers: string[] = []
    const visit = (n: ts.Node, owner: ts.JsxElement | null) => {
      const el = ts.isJsxElement(n) ? n : owner
      if (ts.isCallExpression(n) && n.expression.getText() === "onEnd") {
        callers.push(el ? el.getText() : "<outside JSX>")
      }
      ts.forEachChild(n, (c) => visit(c, el))
    }
    sf.forEachChild((n) => {
      if (ts.isFunctionDeclaration(n) && n.name?.getText() === "EndTakeControl") visit(n, null)
    })
    expect(callers.length).toBe(1)
    expect(callers[0]).toContain("متأكد؟ إنهاء")
  })
})

describe("PauseResumeButton", () => {
  it("is a labelled ≥44px target", () => {
    const html = renderToStaticMarkup(
      createElement(PauseResumeButton, { status: "live", busy: false, onPause: () => {}, onResume: () => {} }),
    )
    expect(html).toContain("إيقاف")
    expect(html).toContain("min-h-[44px]")
  })
})

describe("CompactClock", () => {
  it("shows whole seconds only — no centiseconds while live", () => {
    const html = renderToStaticMarkup(
      createElement(CompactClock, { status: "live", elapsedMsAtBaseline: 61_230, windowStartedAt: null }),
    )
    expect(html).toContain("00:01:01")
    expect(html).not.toContain(".23")
  })
})

describe("ThumbBar", () => {
  const bar = () =>
    renderToStaticMarkup(
      createElement(ThumbBar, {
        onTag: async () => ({ ok: true as const, ms: 0 }),
        onAsked: () => {},
      }),
    )

  it("is FIXED to the bottom edge and safe-area aware", () => {
    const html = bar()
    expect(html).toMatch(/class="fixed inset-x-0 bottom-0 /)
    expect(html).toContain("safe-area-inset-bottom")
  })

  it("carries «طُرِح» and the flags, every target ≥44px", () => {
    const html = bar()
    expect(html).toContain("طُرِح")
    expect(html).toContain("علّم لحظة")
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThanOrEqual(5)
    for (const b of buttons) expect(b, b).toMatch(/min-h-\[(4[4-9]|5\d)px\]/)
  })
})

describe("an expired session is named, not called «unexpected»", () => {
  it("classifies requireActionRole's sentence (dev) as unauthorized", () => {
    expect(classifyActionFailure(new Error("يجب تسجيل الدخول أولاً")).kind).toBe("unauthorized")
  })

  it("maps a RETURNED unauthorized to «انتهت الجلسة»", () => {
    expect(failureMessageForResult("unauthorized")).toContain("انتهت الجلسة")
    expect(failureMessageForResult("forbidden")).toContain("صلاحية")
    expect(failureMessageForResult("room_not_found")).not.toContain("room_not_found")
  })
})

describe("SectionTimer — no hydration mismatch", () => {
  it("server-renders the timeless form: no elapsed value, no «+Nد» branch", async () => {
    // Elapsed comes from Date.now(); the over-time «+Nد» span appears or not.
    // The server render (and the hydration pass) must not depend on it — it
    // did, and React threw "Hydration failed" whenever a second ticked between
    // the two. The first CLIENT render fills the value in.
    const { SectionTimer } = await import("@/app/admin/recording/[roomId]/v2/status-rail")
    const html = renderToStaticMarkup(
      createElement(SectionTimer, {
        label: "المواجهة",
        status: "live",
        elapsedMsAtBaseline: 30 * 60_000, // far past a 12-minute plan
        windowStartedAt: null,
        sectionStartedMs: 0,
        estimatedMinutes: 12,
      }),
    )
    expect(html).toContain("—")
    expect(html).toContain("/ 12د")
    expect(html).not.toMatch(/\+\d+د/)
    expect(html).not.toContain("30:00")
  })
})
