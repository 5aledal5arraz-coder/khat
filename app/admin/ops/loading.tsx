/**
 * Loading skeleton for the `/admin/ops` home.
 *
 * Renders during the server-side `takeOpsSnapshot()` call.
 *
 * The ONLY job of this file is to occupy the same space, in the same order,
 * as `page.tsx`. It had drifted badly once before: it skipped «الوارد» and «ما
 * يحتاج انتباهك» entirely and put the KPI row where «الوارد» actually is, so it
 * stood ~1172px tall against a ~3246px page at 390px — a guaranteed layout
 * jump on every single load of the page every admin session lands on.
 *
 * The section ORDER below must stay in lockstep with `page.tsx`:
 *   hero → health band → الوارد → ما يحتاج انتباهك → الأيام الجاية →
 *   نبض التشغيل → خط إنتاج الحلقات
 *
 * The heights are MEASURED off the live page (2026-07-26, at both 390px and
 * 1280px), not guessed — that is why several carry a breakpoint: the health
 * band and the KPI tiles genuinely change height when their text stops
 * wrapping. Two sections can still differ from the page, and only by rows:
 *   • «ما يحتاج انتباهك» and «الأيام الجاية» are variable-length and are drawn
 *     at three rows, a typical queue. The agenda row heights are the ones
 *     measured when the agenda last had rows; the live agenda is currently
 *     empty, so they were not re-measured this pass.
 *   • The hero's summary line is drawn at ONE line. It is computed text
 *     («3 طلبات بانتظارك · تصوير بعد يومين · كل الأنظمة سليمة») and a busy day
 *     can wrap it to two at 390px.
 *
 * Every grid here repeats the real component's breakpoints on purpose — a
 * skeleton that reflows differently from the page is its own layout jump.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-border ${className}`} />
}

function Block({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-2xl border border-border/80 bg-card ${className}`}
    />
  )
}

/**
 * Section heading placeholder — icon + title, plus the count chip on the
 * sections that carry one. «نبض التشغيل» has no chip, so it must not reserve
 * space for one.
 */
function Heading({ chip = true }: { chip?: boolean }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Bar className="h-[23px] w-[23px] rounded-md" />
      <Bar className="h-[23px] w-28" />
      {chip ? <Bar className="h-[23px] w-8 rounded-md" /> : null}
    </div>
  )
}

export default function Loading() {
  return (
    <div dir="rtl" lang="ar">
      {/* Hero — title + the computed day summary, with the snapshot pill
          wrapping below on mobile exactly as the real header does. */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Bar className="h-[38px] w-40" />
          <Bar className="mt-1.5 h-[21px] w-[420px] max-w-full bg-border/70" />
        </div>
        <Bar className="h-[31px] w-[238px] max-w-full rounded-full" />
      </div>

      {/* Health band — taller on mobile, where the subtitle wraps. */}
      <Block className="mb-6 h-[158px] sm:h-[87px]" />

      {/* الوارد — 4 channel cards, TWO across on mobile */}
      <div className="mb-8">
        <Heading />
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Block key={i} className="h-[107px]" />
          ))}
        </div>
      </div>

      {/* ما يحتاج انتباهك — attention rows (CTA drops to its own line below sm).
          Capped at 1100px, same as the real rows. */}
      <div className="mb-8">
        <Heading />
        <div className="max-w-[1100px] space-y-2">
          {[1, 2, 3].map((i) => (
            <Block key={i} className="h-[146px] sm:h-[91px]" />
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

      {/* نبض التشغيل — THREE tiles (the AI-call counter was removed). Drawn for
          an ADMIN, the common case: a role without the cost tile sees two.
          The third tile spans both mobile columns rather than sitting alone at
          half width, exactly as the page does. */}
      <div className="mb-8">
        <Heading chip={false} />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Block className="h-[195px] sm:h-[157px]" />
          <Block className="h-[195px] sm:h-[157px]" />
          <Block className="h-[139px] max-sm:col-span-2 sm:h-[157px]" />
        </div>
      </div>

      {/* خط إنتاج الحلقات — header + headline + the FIVE funnel stages */}
      <div className="rounded-2xl border border-border/80 bg-card p-6">
        <Bar className="h-[23px] w-40" />
        <Bar className="mt-4 h-8 w-24" />
        <div className="mt-5 grid grid-cols-5 gap-1.5 sm:gap-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Bar key={i} className="h-[79px] rounded-xl sm:h-[66px]" />
          ))}
        </div>
      </div>
    </div>
  )
}
