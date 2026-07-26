/**
 * Wave 2ج — the polish guards for the admin home: Arabic plurals, KHAT tokens,
 * touch targets, and the focus ring.
 *
 * Two kinds of assertion live here, and the split is deliberate:
 *   • BEHAVIOURAL — `formatArabicCount` / the `lib/ops` derivations are pure,
 *     so the plural rules are tested by calling them.
 *   • SOURCE GUARDS — a Tailwind class and a JSX attribute have no runtime
 *     seam, and this repo has no DOM test environment (adding one is a new
 *     dependency, not a polish pass). They are asserted against the source the
 *     same way `home-rtl-a11y.test.ts` already does, so a regression fails
 *     here instead of in a visual review three weeks later.
 *
 * What each block is protecting, measured before the fix:
 *   1. Every count rendered `{n} {fixed singular}` — «1 مهام متعثّرة» and
 *      «15 مهام» are both wrong, and they were on the ONE band an operator
 *      reads to decide whether to intervene.
 *   2. Seven `bg-white` literals in a file whose whole surface is supposed to
 *      come from `--card`, plus `-600`/`-800` text against the admin's
 *      documented `-700` step, plus `dark:` variants for a mode that is
 *      stripped at runtime.
 *   3. Three controls under the 44px pointer floor, one of them (19px) under
 *      even the 24px minimum of WCAG 2.5.8.
 *   4. `button.tsx` halving the app-wide 2px focus ring for every button.
 */

import fs from "fs"
import path from "path"
import { describe, expect, it } from "vitest"
import {
  arabicPluralNoun,
  formatArabicCount,
  ltrIsolate,
} from "@/lib/shared/formatters"
import {
  deriveAiAlerts,
  deriveCostCapLine,
  deriveSystemHealth,
} from "@/lib/ops/home-metrics"
import type { OpsSnapshot } from "@/lib/ops/snapshot"

const read = (...p: string[]) =>
  fs.readFileSync(path.join(process.cwd(), ...p), "utf8")

/** Comments in this repo quote the code they replaced, so "this is gone"
 *  assertions must run against the stripped source. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const OPS_PAGE = read("app", "admin", "ops", "page.tsx")
const ATTENTION = read("app", "admin", "ops", "_components", "home-attention.tsx")
const OPS_ERROR = read("app", "admin", "ops", "error.tsx")
const SIDEBAR = read("app", "admin", "components", "admin-sidebar.tsx")
const LAYOUT = read("app", "admin", "admin-layout-client.tsx")
const BUTTON = read("components", "ui", "button.tsx")
const GLOBALS = read("app", "globals.css")
const INBOX = read("app", "admin", "ops", "_components", "inbox-section.tsx")
const AGENDA = read("app", "admin", "ops", "_components", "agenda-section.tsx")
const NO_ACCESS = read("app", "admin", "ops", "_components", "no-access.tsx")

// ─── 1. Arabic plurals — the five cases, on every noun the home renders ──────

describe("formatArabicCount covers all five Arabic count cases", () => {
  /**
   * 0 → «لا» + plural · 1 → singular + واحد/واحدة · 2 → dual (NO numeral) ·
   * 3–10 → numeral + plural · 11+ → numeral + singular (tamyiz).
   * The bug class this locks out is the 4th and 5th disagreeing: a fixed
   * singular gives «3 مهمة», a fixed plural gives «15 مهام».
   */
  const CASES: Array<[string, [string, string, string, string, string]]> = [
    // noun            0                     1                    2                 3                    15
    ["مهمة", ["لا مهام", "مهمة واحدة", "مهمتان", "3 مهام", "15 مهمة"]],
    [
      "مهمة متعثّرة",
      [
        "لا مهام متعثّرة",
        "مهمة متعثّرة واحدة",
        "مهمتان متعثّرتان",
        "3 مهام متعثّرة",
        "15 مهمة متعثّرة",
      ],
    ],
    [
      "مهمة مجدولة",
      [
        "لا مهام مجدولة",
        "مهمة مجدولة واحدة",
        "مهمتان مجدولتان",
        "3 مهام مجدولة",
        "15 مهمة مجدولة",
      ],
    ],
    [
      "استدعاء",
      ["لا استدعاءات", "استدعاء واحد", "استدعاءان", "3 استدعاءات", "15 استدعاء"],
    ],
    [
      "استدعاء فاشل",
      [
        "لا استدعاءات فاشلة",
        "استدعاء فاشل واحد",
        "استدعاءان فاشلان",
        "3 استدعاءات فاشلة",
        "15 استدعاء فاشل",
      ],
    ],
    ["حلقة", ["لا حلقات", "حلقة واحدة", "حلقتان", "3 حلقات", "15 حلقة"]],
    ["سجل", ["لا سجلات", "سجل واحد", "سجلان", "3 سجلات", "15 سجل"]],
    ["يوم", ["لا أيام", "يوم واحد", "يومين", "3 أيام", "15 يوم"]],
  ]

  it.each(CASES)("«%s» inflects for 0 / 1 / 2 / 3–10 / 11+", (noun, expected) => {
    const [zero, one, two, few, many] = expected
    expect(formatArabicCount(0, noun)).toBe(zero)
    expect(formatArabicCount(1, noun)).toBe(one)
    expect(formatArabicCount(2, noun)).toBe(two)
    expect(formatArabicCount(3, noun)).toBe(few)
    expect(formatArabicCount(15, noun)).toBe(many)
  })

  it("never emits «{n} {singular}» in the 3–10 band — the original defect", () => {
    for (const [noun] of CASES) {
      for (let n = 3; n <= 10; n++) {
        expect(formatArabicCount(n, noun)).not.toBe(`${n} ${noun}`)
      }
    }
  })

  it("never prints a numeral for 1 or 2 — the noun form carries the count", () => {
    for (const [noun] of CASES) {
      expect(formatArabicCount(1, noun)).not.toMatch(/\d/)
      expect(formatArabicCount(2, noun)).not.toMatch(/\d/)
    }
  })

  it("uses Western digits, matching lib/ops/format.ts §11", () => {
    for (const [noun] of CASES) {
      for (const n of [0, 1, 2, 3, 15, 250]) {
        expect(formatArabicCount(n, noun)).not.toMatch(/[٠-٩]/)
      }
    }
  })
})

describe("an unregistered noun FAILS LOUDLY instead of degrading silently", () => {
  it("throws outside production rather than printing the wrong form", () => {
    // The old fallback was `${count} ${singular}` — the single form that is
    // wrong for 1, 2 and 3–10. It never threw and never logged, so a missing
    // entry shipped and read like a deliberate choice.
    expect(() => formatArabicCount(3, "شيء-غير-مسجل")).toThrowError(
      /ARABIC_PLURALS/,
    )
  })

  it("names the offending noun and the file to edit", () => {
    expect(() => formatArabicCount(1, "بلبل")).toThrowError(/«بلبل»/)
    expect(() => formatArabicCount(1, "بلبل")).toThrowError(
      /lib\/shared\/formatters\.ts/,
    )
  })

  it("still registers «ضيف», which used to hit that fallback in production", () => {
    expect(() => formatArabicCount(2, "ضيف")).not.toThrow()
    expect(formatArabicCount(2, "ضيف")).toBe("ضيفان")
  })

  it("EVERY literal call site in the repo passes a registered noun", () => {
    // The throw above is only safe if no shipping call site can reach it: it
    // fires in dev and test, so an unregistered noun would crash the page
    // that renders it. This sweeps every literal `formatArabicCount(x, "…")`
    // in app/, components/ and lib/ and calls it for real.
    const roots = ["app", "components", "lib"].map((d) =>
      path.join(process.cwd(), d),
    )
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) return e.name === "node_modules" ? [] : walk(full)
        return /\.tsx?$/.test(e.name) ? [full] : []
      })

    const nouns = new Set<string>()
    for (const root of roots) {
      for (const file of walk(root)) {
        const src = fs.readFileSync(file, "utf8")
        for (const m of src.matchAll(
          /formatArabicCount\(\s*[^,)]+,\s*"([^"]+)"\s*\)/g,
        )) {
          nouns.add(m[1])
        }
      }
    }

    expect(nouns.size).toBeGreaterThan(5)
    for (const noun of nouns) {
      expect(
        () => formatArabicCount(3, noun),
        `«${noun}» is called somewhere but is not in ARABIC_PLURALS`,
      ).not.toThrow()
    }
  })

  it("leaves arabicPluralNoun lenient — its fallback is never WRONG", () => {
    // Returning the word unchanged is under-specified, not ungrammatical: it
    // is the correct form at 1 and 11+. Invariant product names rely on it.
    expect(() => arabicPluralNoun(3, "تيزر")).not.toThrow()
    expect(arabicPluralNoun(3, "تيزر")).toBe("تيزر")
  })
})

// ─── 2. The derivations actually go through the formatter ────────────────────

/** Minimal all-OK snapshot; each test overrides the one section it needs. */
function snapshot(over: Partial<OpsSnapshot> = {}): OpsSnapshot {
  const section = <T,>(data: T) => ({ ok: true as const, data })
  return {
    taken_at: new Date(),
    duration_ms: 1,
    queue: section({
      countsByStatus: {},
      duePendingCount: 0,
      scheduledPendingCount: 0,
      deadCount24h: 0,
      staleLeaseCount: 0,
      oldestPending: null,
    }),
    systemEvents: section({}),
    aiRouter: section({
      rate_limit_mode: "report",
      tiers: {},
      ai_runs_status_counts_24h: {},
      daily_cost_usd_total: 0,
      unpriced_runs_today: 0,
      day_boundary_tz: "UTC",
      provider_blocked_60m: { count: 0, classes: [], lastAt: null },
      unclassified_failures_24h: 0,
      retrieval_24h: { runs: 0, blind: 0, lastBlindAt: null },
    }),
    eirPipeline: section({}),
    recentActivity: section({}),
    guestIdentity: section({}),
    worker: section({ state: "idle", ageMs: 0, jobType: null }),
    aiModels: section({
      fallbacks: [],
      eolRisks: [],
      catalog: { everLoaded: true, stale: false, lastError: null },
    }),
    ...over,
  } as unknown as OpsSnapshot
}

describe("the status band's chips are grammatical at every count", () => {
  const deadChip = (n: number) => {
    const snap = snapshot()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(snap.queue as any).data.deadCount24h = n
    return deriveSystemHealth(snap).issues.find((i) =>
      i.label.includes("متعثّر"),
    )?.label
  }

  it("says «مهمة متعثّرة واحدة», never «1 مهام متعثّرة»", () => {
    expect(deadChip(1)).toBe("مهمة متعثّرة واحدة")
  })

  it("says «مهمتان متعثّرتان» at two — with no numeral", () => {
    expect(deadChip(2)).toBe("مهمتان متعثّرتان")
  })

  it("says «3 مهام متعثّرة» in the 3–10 band", () => {
    expect(deadChip(3)).toBe("3 مهام متعثّرة")
  })

  it("returns to the singular tamyiz at 11+, never «15 مهام»", () => {
    expect(deadChip(15)).toBe("15 مهمة متعثّرة")
    expect(deadChip(15)).not.toContain("مهام")
  })

  it("carries no numeric value — the count is inside the sentence", () => {
    const snap = snapshot()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(snap.queue as any).data.deadCount24h = 5
    for (const issue of deriveSystemHealth(snap).issues) {
      expect(typeof issue.value).toBe("string")
    }
  })
})

describe("the model-EOL alert", () => {
  const eolAlert = (daysLeft: number, retired = false) => {
    const snap = snapshot()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(snap.aiModels as any).data.eolRisks = [
      {
        modelName: "gpt-5.6-luna",
        retiresOn: "2026-10-16",
        daysLeft,
        retired,
      },
    ]
    return deriveAiAlerts(snap, { includeCost: true }).find(
      (a) => a.id === "model_eol",
    )!
  }

  it("inflects the day count instead of printing «1 يوم» / «2 يوم»", () => {
    expect(eolAlert(1).value).toBe("يوم واحد")
    expect(eolAlert(2).value).toBe("يومين")
    expect(eolAlert(5).value).toBe("5 أيام")
    expect(eolAlert(12).value).toBe("12 يوم")
  })

  it("does not say «يتوقف بعد لا أيام» when it retires today", () => {
    const a = eolAlert(0)
    expect(a.value).toBe("")
    expect(a.label).toContain("يتوقف اليوم")
    expect(a.label).not.toContain("لا أيام")
  })

  it("isolates the model id and the ISO date so they do not paint reversed", () => {
    // U+2066 LRI … U+2069 PDI around each LTR run. Without them UAX#9 hands
    // the neutral `-` and `()` to the Arabic run and the date reverses.
    const label = eolAlert(3, true).label
    expect(label).toContain("⁦gpt-5.6-luna⁩")
    expect(label).toContain("⁦2026-10-16⁩")
  })
})

describe("money and timezone runs are isolated inside Arabic sentences", () => {
  it("pins the cap amount — `$` is a bidi EUROPEAN TERMINATOR and drifts", () => {
    const line = deriveCostCapLine({
      totalUsd: 1,
      capUsd: 30,
      pct: null,
      level: "ok",
      mode: "report",
      unpricedCount: 0,
      tz: "Asia/Kuwait",
    })
    expect(line).toContain("⁦$30.00⁩")
  })

  it("does NOT pin the timezone id — verified unnecessary, so not wrapped", () => {
    // A/B'd in the live RTL page: «(بتوقيت Asia/Kuwait)» renders identically
    // with and without an isolate. A zone id is letters + `/`, i.e. one
    // strong-L run already. Guarding the ABSENCE so nobody "fixes" it back in
    // on the strength of the `$30.00` case above, which is a different rule.
    expect(OPS_PAGE).toContain("إجمالي اليوم (بتوقيت ${cost.tz})")
  })
})

describe("ltrIsolate", () => {
  it("wraps a run in LRI…PDI", () => {
    expect(ltrIsolate("2026-10-16")).toBe("⁦2026-10-16⁩")
  })

  it("returns empty for empty input — never a pair of bare control chars", () => {
    expect(ltrIsolate("")).toBe("")
    expect(ltrIsolate(null)).toBe("")
    expect(ltrIsolate(undefined)).toBe("")
  })
})

// ─── 3. Tokens ───────────────────────────────────────────────────────────────

describe("app/admin/ops uses KHAT tokens, not raw colours", () => {
  const OPS_DIR = path.join(process.cwd(), "app", "admin", "ops")
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name)
      return e.isDirectory() ? walk(full) : /\.tsx?$/.test(e.name) ? [full] : []
    })
  const FILES = walk(OPS_DIR)

  it("has no `bg-white` anywhere — the card surface is `--card`", () => {
    for (const f of FILES) {
      expect(codeOnly(fs.readFileSync(f, "utf8")), f).not.toMatch(/\bbg-white\b/)
    }
  })

  it("KEEPS `to-white` — those are gradient stops on the tinted health band", () => {
    // Guarding the guard: a blind find/replace on "white" would eat these and
    // flatten the three tone gradients into solid tint blocks.
    expect(OPS_PAGE).toMatch(/from-red-50\/80 to-white/)
    expect(OPS_PAGE).toMatch(/from-emerald-50\/70 to-white/)
    expect(OPS_PAGE).toMatch(/from-amber-50\/80 to-white/)
  })

  it("has no `-600` or `-800` coloured text — the admin step is `-700`", () => {
    for (const f of FILES) {
      const src = codeOnly(fs.readFileSync(f, "utf8"))
      expect(src, f).not.toMatch(/\btext-[a-z]+-(600|800|900)\b/)
    }
  })

  it("has no `dark:` variants — `.dark` is stripped at runtime", () => {
    for (const f of FILES) {
      expect(codeOnly(fs.readFileSync(f, "utf8")), f).not.toMatch(/\bdark:/)
    }
  })

  it("pairs `bg-foreground` with `text-background`, not `text-white`", () => {
    expect(codeOnly(OPS_ERROR)).not.toMatch(/\btext-white\b/)
    expect(OPS_ERROR).toContain("text-background")
  })

  it("drops the opacity modifiers that fight the already-darkened token", () => {
    // `--muted-foreground` was darkened to 38% L *because* callers were
    // reducing its opacity (light-theme.ts). Doing both lands ~2.8:1.
    expect(ATTENTION).not.toMatch(/text-muted-foreground\/\d+/)
  })
})

// ─── 4. Arabic typography ────────────────────────────────────────────────────

describe("no letter-spacing or uppercase on Arabic text", () => {
  it("keeps `tracking-*` off Arabic runs in the sidebar", () => {
    // `uppercase` is a pure no-op on Arabic (the script has no case);
    // `tracking-[0.16em]` pulls the cursive letters apart on any line that
    // also contains a Latin token — so the same class rendered two ways.
    expect(codeOnly(SIDEBAR)).not.toMatch(/\buppercase\b/)
    expect(codeOnly(SIDEBAR)).not.toMatch(/\btracking-/)
  })

  it("keeps them off the attention rows", () => {
    expect(codeOnly(ATTENTION)).not.toMatch(/\buppercase\b/)
    expect(codeOnly(ATTENTION)).not.toMatch(/\btracking-/)
  })

  it("leaves `tracking-tight` only on Latin numerals in the ops page", () => {
    const hits = codeOnly(OPS_PAGE).match(/[^"]*\btracking-tight\b[^"]*/g) ?? []
    expect(hits.length).toBeGreaterThan(0)
    for (const h of hits) expect(h).toContain("tabular-nums")
  })
})

describe("the type scale has a floor of 11px and no half-pixel steps", () => {
  const SCALE = new Set(["30px", "26px", "17px", "15px", "13px", "11px"])
  // Every component the admin HOME renders. `/admin/ops/details` is
  // deliberately excluded: it is a dense diagnostic table view with its own
  // (mono, tabular) needs, and re-scaling it is not this pass.
  const FILES: Array<[string, string]> = [
    ["ops/page.tsx", OPS_PAGE],
    ["home-attention.tsx", ATTENTION],
    ["admin-sidebar.tsx", SIDEBAR],
    ["admin-layout-client.tsx", LAYOUT],
    ["ops/error.tsx", OPS_ERROR],
    ["inbox-section.tsx", INBOX],
    ["agenda-section.tsx", AGENDA],
    ["no-access.tsx", NO_ACCESS],
  ]

  it.each(FILES)("%s uses only the six documented steps", (_name, src) => {
    const sizes = (codeOnly(src).match(/text-\[([\d.]+)px\]/g) ?? []).map((m) =>
      m.replace(/text-\[|\]/g, ""),
    )
    expect(sizes.length).toBeGreaterThan(0)
    for (const s of sizes) expect(SCALE, `${s} is off-scale`).toContain(s)
  })

  it.each(FILES)("%s has no sub-11px text left", (_name, src) => {
    const sizes = (codeOnly(src).match(/text-\[([\d.]+)px\]/g) ?? []).map((m) =>
      parseFloat(m.replace(/text-\[|px\]/g, "")),
    )
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(11)
  })
})

// ─── 5. Touch targets ────────────────────────────────────────────────────────

describe("every home control clears the 44px pointer target on mobile", () => {
  // Measured before: «كل الحلقات» 19px (fails even the 24px floor of WCAG
  // 2.5.8), «تفاصيل التشغيل» 37px, the drawer close button 32px. Desktop
  // chrome is allowed to stay compact via an `sm:` override, per Wave 2أ.
  it("«كل الحلقات» — the pipeline card's index link", () => {
    const idx = OPS_PAGE.indexOf("كل الحلقات")
    expect(idx).toBeGreaterThan(-1)
    expect(OPS_PAGE.slice(idx - 500, idx)).toContain("min-h-[44px]")
  })

  it("«تفاصيل التشغيل» — the health band's deep-link", () => {
    const idx = OPS_PAGE.indexOf("تفاصيل التشغيل\n")
    expect(idx).toBeGreaterThan(-1)
    expect(OPS_PAGE.slice(idx - 500, idx)).toContain("min-h-[44px]")
  })

  it("the drawer's close button — the only pointer exit from the mobile nav", () => {
    const idx = LAYOUT.indexOf('aria-label="إغلاق قائمة التنقّل"')
    expect(idx).toBeGreaterThan(-1)
    expect(LAYOUT.slice(idx, idx + 200)).toContain("h-11 w-11")
    expect(LAYOUT.slice(idx, idx + 200)).not.toContain("h-8 w-8")
  })

  it("the error boundary's retry button", () => {
    expect(OPS_ERROR).toContain("min-h-[44px]")
  })
})

// ─── 6. Focus ring + reduced motion ──────────────────────────────────────────

describe("the focus indicator is one standard, app-wide", () => {
  it("globals.css sets the 2px ring", () => {
    expect(GLOBALS).toMatch(/:focus-visible\s*\{[^}]*ring-2/)
  })

  it("button.tsx no longer halves it to ring-1", () => {
    // A `.focus-visible\:ring-1:focus-visible` utility outranks the bare
    // `:focus-visible` element rule, so this ONE class silently overrode the
    // standard for every button in the admin.
    expect(BUTTON).toContain("focus-visible:ring-2")
    expect(BUTTON).not.toContain("focus-visible:ring-1")
  })
})

describe("prefers-reduced-motion is honoured globally", () => {
  it("globals.css carries the media query", () => {
    expect(GLOBALS).toContain("@media (prefers-reduced-motion: reduce)")
  })

  it("neutralises animation, transition and smooth scrolling", () => {
    const block = GLOBALS.slice(
      GLOBALS.indexOf("@media (prefers-reduced-motion: reduce)"),
    ).slice(0, 600)
    expect(block).toContain("animation-duration")
    expect(block).toContain("animation-iteration-count")
    expect(block).toContain("transition-duration")
    expect(block).toContain("scroll-behavior")
  })

  it("keeps a non-zero duration so `animationend` handlers still fire", () => {
    // `animation: none` would strand any code awaiting the event.
    const block = GLOBALS.slice(
      GLOBALS.indexOf("@media (prefers-reduced-motion: reduce)"),
    ).slice(0, 600)
    expect(block).toContain("0.01ms")
    expect(block).not.toMatch(/animation-duration:\s*0s/)
  })
})

// ─── 7. RTL ──────────────────────────────────────────────────────────────────

describe("RTL — sides, indicators and direction-pinned runs", () => {
  it("opens the mobile drawer on the same side as its button (start = right)", () => {
    // Was `end-0`, i.e. the LEFT edge in RTL — the opposite side to both the
    // hamburger and the desktop rail it stands in for.
    expect(LAYOUT).toContain("absolute inset-y-0 start-0 w-72")
    expect(codeOnly(LAYOUT)).not.toContain("absolute inset-y-0 end-0 w-72")
  })

  it("puts the active nav marker on the rail's OUTER edge", () => {
    const rule = GLOBALS.slice(GLOBALS.indexOf(".admin-nav-item::before"))
    expect(rule.slice(0, 300)).toContain("inset-inline-start: 0")
    expect(rule.slice(0, 300)).not.toContain("inset-inline-end: 0")
  })

  it("uses right-panel icons for a right-docked rail", () => {
    expect(LAYOUT).toContain("PanelRightClose")
    expect(LAYOUT).toContain("PanelRight")
    expect(codeOnly(LAYOUT)).not.toMatch(/\bPanelLeft\b/)
  })

  it("points the «الموقع» arrow outward — left is forward in RTL", () => {
    expect(codeOnly(LAYOUT)).not.toContain("ArrowRight")
    expect(LAYOUT).toContain("ArrowLeft")
  })

  it("pins the snapshot timestamp LTR so the time stops preceding the date", () => {
    expect(OPS_PAGE).toMatch(
      /font-mono tabular-nums" dir="ltr">\s*\{formatUtc\(snap\.taken_at\)\}/,
    )
  })

  it("pins the raw JSON payload LTR so the braces stop migrating", () => {
    const EVENTS = read(
      "app", "admin", "ops", "_components", "system-events-section.tsx",
    )
    const idx = EVENTS.indexOf("{payloadPreview}")
    expect(idx).toBeGreaterThan(-1)
    expect(EVENTS.slice(idx - 300, idx)).toContain('dir="ltr"')
  })
})

// ─── 8. The mobile drawer is a real dialog ───────────────────────────────────

describe("mobile drawer — dialog semantics and focus management", () => {
  it("declares itself a modal dialog with an Arabic name", () => {
    expect(LAYOUT).toContain('role="dialog"')
    expect(LAYOUT).toContain('aria-modal="true"')
    expect(LAYOUT).toContain('aria-label="قائمة التنقّل"')
  })

  it("closes on Escape", () => {
    expect(LAYOUT).toContain('e.key === "Escape"')
  })

  it("traps Tab inside the panel, in both directions", () => {
    expect(LAYOUT).toContain('e.key !== "Tab"')
    expect(LAYOUT).toContain("e.shiftKey")
  })

  it("returns focus to the hamburger that opened it", () => {
    // Restored on the explicit close, before the state flip unmounts the
    // panel — not in the effect cleanup, which also fires on route change.
    const close = LAYOUT.slice(
      LAYOUT.indexOf("const closeMobileDrawer"),
      LAYOUT.indexOf("const closeMobileDrawer") + 900,
    )
    expect(close).toContain("hamburgerRef.current?.focus()")
    expect(close.indexOf("hamburgerRef.current?.focus()")).toBeLessThan(
      close.indexOf("setMobileDrawerOpen(false)"),
    )
  })
})

// ─── 9. The skip link is rendered, not just styled ───────────────────────────

describe("skip link", () => {
  it("is rendered by the admin shell", () => {
    // `.skip-link` was defined in globals.css and used by no element at all.
    expect(LAYOUT).toContain('className="skip-link"')
    expect(LAYOUT).toContain('href="#admin-main"')
  })

  it("targets a landmark that actually exists", () => {
    expect(LAYOUT).toContain('id="admin-main"')
  })

  it("is the first focusable element in the shell", () => {
    const skip = LAYOUT.indexOf('href="#admin-main"')
    const header = LAYOUT.indexOf("<header")
    expect(skip).toBeGreaterThan(-1)
    expect(skip).toBeLessThan(header)
  })
})
