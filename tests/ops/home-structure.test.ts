/**
 * `/admin/ops` — the structural decisions of the Wave-2ب rebuild, locked.
 *
 * These are source assertions, the same technique `tests/ops/home-rtl-a11y.ts`
 * uses and for the same reason: the repo has no DOM test environment, and
 * adding one is a new dependency rather than a fix. What is guarded here is
 * not styling — it is the three decisions that a future edit could silently
 * undo:
 *
 *   1. The «ابدأ من هنا» launchpad was DELETED. It was six tiles with no state
 *      and no count, every one of them a verbatim duplicate of an
 *      always-visible sidebar item, costing 558px at 390px. Deleting a
 *      navigation block is only safe if it strands nothing, so the test that
 *      matters is not "the block is gone" — it is "every destination it held
 *      is still reachable from the sidebar".
 *   2. The section ORDER. The page is read top-down and the order encodes the
 *      priority («who is waiting» before «what is the machine doing»).
 *   3. The AI-call counter tile is gone and the funnel replaced the 13-cell
 *      phase grid.
 */

import fs from "fs"
import path from "path"
import { describe, it, expect } from "vitest"

const read = (...p: string[]) =>
  fs.readFileSync(path.join(process.cwd(), ...p), "utf8")

/** Comments here quote the code they replaced, so negative matches strip them. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const PAGE = read("app", "admin", "ops", "page.tsx")
const PAGE_CODE = codeOnly(PAGE)
const SIDEBAR = read("app", "admin", "components", "admin-sidebar.tsx")
const INBOX = read("lib", "ops", "inbox.ts")

// ─── 1. The launchpad is gone, and nothing went with it ──────────────

/**
 * The exact six destinations the deleted «ابدأ من هنا» block linked to.
 * Frozen as data: if a future edit removes one of these from the sidebar, the
 * home page no longer has a launchpad to fall back on and the destination
 * becomes unreachable from the landing page.
 */
const LAUNCHPAD_DESTINATIONS = [
  "/admin/khat-brain/seasons",
  "/admin/discovery-v2",
  "/admin/khat-brain/episodes",
  "/admin/studio",
  "/admin/newsletter",
  "/admin/submissions",
]

describe("the «ابدأ من هنا» launchpad is deleted", () => {
  it("no longer renders the section or its tile component", () => {
    expect(PAGE_CODE).not.toContain("ابدأ من هنا")
    expect(PAGE_CODE).not.toContain("QuickTile")
  })

  it("strands NO destination — every one is still in the sidebar", () => {
    for (const href of LAUNCHPAD_DESTINATIONS) {
      expect(SIDEBAR, `${href} disappeared from the sidebar`).toContain(
        `href: "${href}"`,
      )
    }
  })

  it("keeps the two destinations that also had a counted link on the home", () => {
    // «الطلبات» is the الوارد section's destination and «خط الإنتاج» is the
    // pipeline card's — Omar's rule, "a link with a number beats a link
    // without one", is what made the launchpad redundant in the first place.
    expect(INBOX).toContain("/admin/submissions?tab=guests")
    expect(PAGE).toContain('href="/admin/khat-brain/episodes"')
  })
})

// ─── 2. Section order ────────────────────────────────────────────────

describe("the page renders its sections in the agreed order", () => {
  /**
   * Anchors that appear ONCE each in the render tree, in render order.
   * Matched against the component body so the file's header comment (which
   * describes the same page in prose) cannot satisfy them.
   */
  const ORDER: [string, string][] = [
    ["day summary", "data-day-summary"],
    ["health band", "<SystemHealthBand"],
    ["الوارد", "<InboxSection"],
    ["ما يحتاج انتباهك", "<HomeAttention"],
    ["الأيام الجاية", "<AgendaSection"],
    ["نبض التشغيل", "نبض التشغيل"],
    ["خط إنتاج الحلقات", "data-pipeline-funnel"],
  ]

  it("places every section, once, in order", () => {
    const body = PAGE.slice(PAGE.indexOf("export default async function"))
    const positions = ORDER.map(([name, needle]) => {
      const i = body.indexOf(needle)
      expect(i, `${name} is missing from the render`).toBeGreaterThanOrEqual(0)
      return i
    })
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it("puts نبض التشغيل BELOW the agenda — it is the least actionable block", () => {
    const body = PAGE.slice(PAGE.indexOf("export default async function"))
    expect(body.indexOf("نبض التشغيل")).toBeGreaterThan(body.indexOf("<AgendaSection"))
  })
})

// ─── 3. Three tiles, and a funnel instead of a phase grid ────────────

describe("نبض التشغيل carries three indicators, not four", () => {
  it("drops the AI-call activity counter", () => {
    expect(PAGE_CODE).not.toContain("استدعاءات الذكاء الاصطناعي")
    expect(PAGE_CODE).not.toContain("deriveAiHint")
  })

  it("keeps the three that drive a decision", () => {
    expect(PAGE).toContain('label="مهام نشطة"')
    expect(PAGE).toContain('label="كلفة الذكاء الاصطناعي اليوم"')
    expect(PAGE).toContain('label="حلقات منشورة"')
  })

  it("never narrows the row as the viewport grows (no lg:grid-cols-4)", () => {
    // The defect: four tiles at `lg:grid-cols-4` were NARROWER at 1024px than
    // the same tiles at 640px, because the column count outran the width.
    expect(PAGE_CODE).not.toContain("lg:grid-cols-4")
  })
})

describe("the pipeline card renders the funnel, not the 13-cell grid", () => {
  it("no longer sizes bars by the largest cell", () => {
    expect(PAGE_CODE).not.toContain("pipeline.peak")
    expect(PAGE_CODE).not.toContain("data-pipeline-grid")
  })

  it("renders five stage tiles across, at every width", () => {
    expect(PAGE).toContain("data-pipeline-funnel")
    expect(PAGE).toContain("grid-cols-5")
  })

  it("still states the headline it must sum to", () => {
    expect(PAGE).toContain("data-pipeline-total")
  })
})

// ─── The header line is computed, not copy ───────────────────────────

describe("the hero subtitle is derived, not a fixed sentence", () => {
  it("renders the day summary instead of the old marketing line", () => {
    expect(PAGE_CODE).not.toContain("كل أدواتك في مكان واحد")
    expect(PAGE).toContain("deriveDaySummary")
  })

  it("does NOT reach for the AI router to build it", () => {
    // Explicitly rejected: cost + latency on the most-opened page, for a
    // paraphrase of numbers rendered below it, that can be wrong.
    expect(PAGE_CODE).not.toContain("runAiTask")
  })
})
