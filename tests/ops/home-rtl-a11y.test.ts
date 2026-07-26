/**
 * The admin home's bidi + accessible-name guards.
 *
 * These four defects have no runtime seam — they are JSX attributes and
 * Tailwind classes, and the repo has no DOM test environment (adding one is a
 * new dependency, not a bug fix). So they are asserted against the source, the
 * same way `tests/teaser-question-form.test.ts` guards the public form. Narrow
 * and named on purpose: a regression fails here, not in a visual review three
 * weeks later.
 *
 * What each guard is protecting, measured before the fix:
 *   1. Every «X / Y» ratio in the ops sections PAINTED reversed inside the RTL
 *      page — UAX#9 resolves the neutral " / " between two numbers to the
 *      surrounding RTL run, so L2 reverses the whole thing. The AI-router
 *      card's daily cost and its cap swapped places on screen.
 *   2. The mobile hamburger is the ONLY navigation below `lg` and had no
 *      accessible name at all.
 *   3. «الموقع» was a `<button>` nested inside an `<a>` — invalid HTML, with
 *      undefined keyboard/AT behaviour, and both elements unnamed at 390px.
 *   4. The attention rows truncated the episode title mid-word at 390px
 *      because a `shrink-0` CTA sat beside it, and clamped «ما المطلوب» to a
 *      single line in every row.
 */

import fs from "fs"
import path from "path"
import { describe, it, expect } from "vitest"

const read = (...p: string[]) =>
  fs.readFileSync(path.join(process.cwd(), ...p), "utf8")

/**
 * Comments in this repo quote the code they replaced ("was `line-clamp-1`",
 * "was <Link><Button/></Link>"), so a naive negative match would fail on the
 * explanation of the fix. Every "this pattern is gone" assertion runs against
 * the stripped source.
 */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const SECTION_CARD = read("app", "admin", "ops", "_components", "section-card.tsx")
const AI_ROUTER = read("app", "admin", "ops", "_components", "ai-router-section.tsx")
const QUEUE_HEALTH = read("app", "admin", "ops", "_components", "queue-health-section.tsx")
const LAYOUT = read("app", "admin", "admin-layout-client.tsx")
const ATTENTION = read("app", "admin", "ops", "_components", "home-attention.tsx")
const AGENDA = read("app", "admin", "ops", "_components", "agenda-section.tsx")
const LOADING = read("app", "admin", "ops", "loading.tsx")

// ─── 1. Ratios are pinned LTR ────────────────────────────────────────

describe("KvRow — the value slot is direction-pinned", () => {
  it("renders the value with dir=\"ltr\"", () => {
    // The span that carries `{value}`, not the label.
    expect(SECTION_CARD).toMatch(
      /<span[^>]*font-mono text-xs text-foreground tabular-nums[^>]*dir="ltr"/,
    )
  })

  it("does not pin the Arabic LABEL — that one must follow the page", () => {
    expect(SECTION_CARD).not.toMatch(/text-xs text-muted-foreground"\s+dir="ltr"/)
  })
})

describe("every ratio on the ops pages goes through a direction-pinned slot", () => {
  /** `a / b` or `a/b` built from two interpolations — the reversible shape. */
  const RATIO = /\{[^}]+\}\s*\/\s*\{[^}]+\}|\$\{[^}]*\}\s*\/\s*\$\{[^}]*\}/g

  it("keeps the AI-router ratios inside KvRow", () => {
    // Both of them (concurrency, daily cost vs cap) are KvRow values, so the
    // guard above covers them. If one is ever moved out of KvRow, it has to
    // carry its own dir — this asserts they have not been moved.
    const ratios = AI_ROUTER.match(RATIO) ?? []
    expect(ratios.length).toBeGreaterThan(0)
    for (const r of ratios) {
      const idx = AI_ROUTER.indexOf(r)
      const before = AI_ROUTER.slice(Math.max(0, idx - 200), idx)
      expect(before).toContain("KvRow")
    }
  })

  it("pins the dead-job attempts ratio directly", () => {
    expect(QUEUE_HEALTH).toMatch(
      /dir="ltr"\s*>\s*\{j\.attempts\}\/\{j\.max_attempts\}/,
    )
  })
})

// ─── 2 + 3. Accessible names on the only mobile navigation ───────────

describe("admin header — every icon-only control has a name", () => {
  it("names the mobile hamburger in Arabic", () => {
    expect(LAYOUT).toMatch(/aria-label="فتح قائمة التنقّل"/)
  })

  it("gives the hamburger the full 44px target (no h-9 w-9 override)", () => {
    // `size="icon"` is already h-11 w-11 in button.tsx; the bug was the
    // className shrinking the sole mobile nav control back to 36px.
    const hamburger = LAYOUT.slice(
      LAYOUT.indexOf("setMobileDrawerOpen(true)") - 200,
      LAYOUT.indexOf("setMobileDrawerOpen(true)") + 300,
    )
    expect(hamburger).not.toMatch(/h-9 w-9/)
  })

  it("names the drawer's close button", () => {
    expect(LAYOUT).toMatch(/aria-label="إغلاق قائمة التنقّل"/)
  })

  it("names the desktop sidebar toggle", () => {
    expect(LAYOUT).toMatch(/aria-label=\{sidebarOpen \? "إخفاء القائمة الجانبية"/)
  })

  it("names the two header controls whose label is hidden below sm", () => {
    expect(LAYOUT).toMatch(/aria-label="تسجيل الخروج"/)
    expect(LAYOUT).toMatch(/aria-label="فتح الموقع العام"/)
  })
})

describe("admin header — no nested interactive elements", () => {
  it("does not wrap a <Button> in a <Link>", () => {
    expect(codeOnly(LAYOUT)).not.toMatch(/<Link[^>]*>\s*<Button/)
  })

  it("styles the site link with buttonVariants instead, so it stays one <a>", () => {
    expect(LAYOUT).toContain("buttonVariants({ variant: \"ghost\", size: \"sm\" })")
  })

  it("raises both header controls to 44px on mobile only", () => {
    const matches = LAYOUT.match(/h-11 min-w-\[44px\][^"]*sm:h-8 sm:min-w-0/g) ?? []
    expect(matches).toHaveLength(2)
  })
})

// ─── 4. The attention rows keep their text ───────────────────────────

describe("attention rows — the title survives 390px", () => {
  it("stacks the row below sm so the CTA stops competing for width", () => {
    expect(ATTENTION).toContain("flex flex-col gap-2 sm:flex-row")
  })

  it("keeps min-w-0 on the text column, or nothing shrinks at all", () => {
    expect(ATTENTION).toContain("min-w-0 flex-1")
  })

  it("allows two title lines on mobile, truncating only once there is room", () => {
    expect(ATTENTION).toMatch(/line-clamp-2 text-\[13px\] font-semibold leading-tight sm:truncate/)
  })

  it("no longer clamps «ما المطلوب» to a single line", () => {
    expect(codeOnly(ATTENTION)).not.toContain("line-clamp-1")
    expect(ATTENTION).toMatch(/line-clamp-2 text-\[11\.5px\]/)
  })
})

describe("agenda rows — same treatment, so the section is not born broken", () => {
  it("stacks below sm", () => {
    expect(AGENDA).toContain("flex flex-col gap-2 rounded-2xl border p-3.5")
    expect(AGENDA).toContain("sm:flex-row")
  })

  it("allows two title lines on mobile", () => {
    expect(AGENDA).toContain("line-clamp-2 text-[13px] font-semibold leading-tight")
  })
})

// ─── 5. The skeleton mirrors the page ────────────────────────────────

describe("ops loading skeleton — same sections, same order", () => {
  /** The section order `page.tsx` actually renders. */
  const ORDER = ["الوارد", "ما يحتاج انتباهك", "الأيام الجاية", "KPI row", "ابدأ من هنا", "خط إنتاج"]

  it("includes a placeholder for every section, including the two it used to skip", () => {
    for (const section of ORDER) {
      expect(LOADING).toContain(section)
    }
  })

  it("keeps the placeholders in page order", () => {
    // From the component body only — the file's header comment lists the same
    // order in prose, which would otherwise be what these indexes find.
    const body = LOADING.slice(LOADING.indexOf("export default function Loading"))
    const positions = ORDER.map((s) => body.indexOf(s))
    expect(positions.every((i) => i >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it("mirrors the page's own grid breakpoints, not a generic 4-up row", () => {
    // الوارد: 1 col mobile → 4 on xl, exactly like inbox-section.tsx.
    expect(LOADING).toContain("grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4")
    // Phase grid: 13 non-terminal cells, 3 → 4 → 7 columns.
    expect(LOADING).toContain("grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7")
    expect(LOADING).toContain("length: 13")
  })
})
