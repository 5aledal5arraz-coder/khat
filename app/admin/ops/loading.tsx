/**
 * Loading skeleton for the `/admin/ops` home.
 *
 * Renders during the server-side `takeOpsSnapshot()` call. Mirrors the
 * calm home layout — hero, health band, KPI row, launchpad — so the
 * swap-in is visually stable.
 */

export default function Loading() {
  return (
    <div dir="rtl" lang="ar">
      {/* Hero */}
      <div className="mb-7">
        <div className="h-7 w-44 animate-pulse rounded bg-slate-200" />
        <div className="mt-2 h-4 w-80 animate-pulse rounded bg-slate-200/70" />
      </div>

      {/* Health band */}
      <div className="mb-6 h-[84px] animate-pulse rounded-2xl border border-slate-200/80 bg-white" />

      {/* KPI row */}
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-[116px] animate-pulse rounded-2xl border border-slate-200/80 bg-white"
          />
        ))}
      </div>

      {/* Launchpad */}
      <div className="mb-8">
        <div className="mb-3 h-3 w-24 animate-pulse rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-[76px] animate-pulse rounded-2xl border border-slate-200/80 bg-white"
            />
          ))}
        </div>
      </div>

      {/* Pipeline summary */}
      <div className="h-[132px] animate-pulse rounded-2xl border border-slate-200/80 bg-white" />
    </div>
  )
}
