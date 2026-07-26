/**
 * Loading skeleton for the `/admin/ops` home.
 *
 * Renders during the server-side `takeOpsSnapshot()` call.
 *
 * The ONLY job of this file is to occupy the same space, in the same order,
 * as `page.tsx`. It had drifted badly: it skipped «الوارد» and «ما يحتاج
 * انتباهك» entirely and put the KPI row where «الوارد» actually is, so it
 * stood ~1172px tall against a ~3246px page at 390px — a guaranteed layout
 * jump on every single load of the page every admin session lands on.
 *
 * The section ORDER below must stay in lockstep with `page.tsx`:
 *   hero → health band → الوارد → ما يحتاج انتباهك → الأيام الجاية →
 *   KPI row → ابدأ من هنا → خط إنتاج الحلقات
 *
 * The heights are MEASURED off the live page (2026-07-26, Chrome, at both
 * 390px and 1280px), not guessed — that is why several carry a breakpoint:
 * the health band and the KPI tiles genuinely change height when their text
 * stops wrapping. The two variable-length sections («ما يحتاج انتباهك»,
 * «الأيام الجاية») are drawn at three rows, a typical queue; they are the
 * only places the skeleton can still differ from the page, and by rows
 * rather than by whole sections.
 *
 * Every grid here repeats the real component's breakpoints on purpose — a
 * skeleton that reflows differently from the page is its own layout jump.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />
}

function Block({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl border border-border/80 bg-card ${className}`}
    />
  )
}

/** Section heading placeholder — icon + title + count chip, as rendered. */
function Heading() {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Bar className="h-[22px] w-[22px] rounded-md" />
      <Bar className="h-[22px] w-28" />
      <Bar className="h-[22px] w-8 rounded-md" />
    </div>
  )
}

export default function Loading() {
  return (
    <div dir="rtl" lang="ar">
      {/* Hero — title + subtitle, with the snapshot pill wrapping below on
          mobile exactly as the real header does. */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Bar className="h-9 w-40" />
          <Bar className="mt-1.5 h-5 w-80 max-w-full bg-border/70" />
        </div>
        <Bar className="h-8 w-44 rounded-full" />
      </div>

      {/* Health band — taller on mobile, where the subtitle wraps. */}
      <Block className="mb-6 h-[158px] sm:h-[88px]" />

      {/* الوارد — 4 channel cards */}
      <div className="mb-8">
        <Heading />
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Block key={i} className="h-[107px]" />
          ))}
        </div>
      </div>

      {/* ما يحتاج انتباهك — attention rows (CTA drops to its own line below sm) */}
      <div className="mb-8">
        <Heading />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Block key={i} className="h-[157px] sm:h-[103px]" />
          ))}
        </div>
      </div>

      {/* الأيام الجاية — agenda rows */}
      <div className="mb-8">
        <Heading />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Block key={i} className="h-[91px] sm:h-[67px]" />
          ))}
        </div>
      </div>

      {/* KPI row — 2 columns on mobile, 4 on lg. The row's height is set by
          the TALLEST tile (the cost one, whose hint runs to three lines), not
          by the plain «مهام نشطة» tile. */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Block key={i} className="h-[178px] lg:h-[174px]" />
        ))}
      </div>

      {/* ابدأ من هنا */}
      <div className="mb-8">
        <Bar className="mb-3 h-3 w-24" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Block key={i} className="h-[78px]" />
          ))}
        </div>
      </div>

      {/* خط إنتاج الحلقات — header + headline + the 13 non-terminal phase cells */}
      <div className="rounded-2xl border border-border/80 bg-card p-6">
        <Bar className="h-5 w-40" />
        <Bar className="mt-4 h-8 w-24" />
        <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {Array.from({ length: 13 }, (_, i) => (
            <Bar key={i} className="h-[75px] rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
