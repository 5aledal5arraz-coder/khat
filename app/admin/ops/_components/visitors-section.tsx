/**
 * «زوار الموقع» — the visitor counter on the admin home.
 *
 * Pure presentational server component; data comes from
 * lib/analytics/stats.ts (`getVisitorStats`). Display rules:
 *   • `null` stats = the counter could not be read → «تعذّر قراءة العدّاد»,
 *     never zeros. Absence is not success.
 *   • No recorded view yet → an honest empty state, not a wall of «0».
 *   • Every window total is the sum of DAILY uniques (the id rotates daily, by
 *     design), and the footnote says so — a 7-day number that silently
 *     double-counts returning readers would be read as reach.
 *
 * The sparkline is a hand-drawn inline SVG: the admin has no chart library and
 * one series of 30 bars does not justify adding one.
 */
import { Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatArabicCount, formatArabicDate } from "@/lib/shared/formatters"
import { SOURCE_LABELS, type VisitorStats, type DailyPoint } from "@/lib/analytics/stats"

const CARD =
  "rounded-2xl border border-border/80 bg-card p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)]"

const PRIVACY_NOTE = "يعدّ الزوار بدون كوكيز؛ الموظفين والروبوتات مستبعدين."

/**
 * Always through `formatArabicCount`: it owns the number–noun agreement
 * («مشاهدة واحدة» · «مشاهدتان» · «3 مشاهدات» · «11 مشاهدة»). Prefixing a
 * digit to the dual produced «2 مشاهدتان», which says the number twice.
 */
const count = formatArabicCount

/** Visitors, as a bare numeral under a «زوار …» label — no noun to agree with. */
function WindowTile({ label, visitors, views }: { label: string; visitors: number; views: number }) {
  return (
    <div className="min-w-0" data-visitor-window={label}>
      <div className="text-[13px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
        {visitors}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground tabular-nums">{count(views, "مشاهدة")}</div>
    </div>
  )
}

/** 30 bars, oldest at the inline-START (right, in RTL) — read the way the page reads. */
function Sparkline({ series }: { series: DailyPoint[] }) {
  const peak = Math.max(1, ...series.map((p) => p.visitors))
  const W = 300
  const H = 48
  const gap = 2
  const bar = (W - gap * (series.length - 1)) / series.length
  const last = series[series.length - 1]
  return (
    <figure className="mt-5" data-visitor-sparkline>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-12 w-full -scale-x-100"
        role="img"
        aria-label={`الزوار يوميًا خلال آخر ${series.length} يوم، أعلى يوم ${peak}، اليوم ${last?.visitors ?? 0}`}
      >
        {series.map((p, i) => {
          const h = p.visitors === 0 ? 1 : Math.max(2, (p.visitors / peak) * H)
          return (
            <rect
              key={p.day}
              x={i * (bar + gap)}
              y={H - h}
              width={bar}
              height={h}
              rx={1}
              className={p.visitors === 0 ? "fill-border" : i === series.length - 1 ? "fill-primary" : "fill-primary/40"}
            >
              <title>{`${p.day}: ${count(p.visitors, "زائر")}`}</title>
            </rect>
          )
        })}
      </svg>
      <figcaption className="mt-1.5 text-[11px] text-muted-foreground">
        الزوار يوميًا — آخر {series.length} يوم (اليوم بالأغمق)
      </figcaption>
    </figure>
  )
}

function RankedList({
  title,
  rows,
  empty,
  attr,
}: {
  title: string
  rows: Array<{ key: string; label: string; value: string }>
  empty: string
  attr: string
}) {
  return (
    <div className="min-w-0" {...{ [attr]: true }}>
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-[12px] text-muted-foreground">{empty}</p>
      ) : (
        <ol className="mt-2 space-y-1.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-foreground" title={r.label}>
                {r.label}
              </span>
              <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{r.value}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

export function VisitorsSection({ stats }: { stats: VisitorStats | null }) {
  return (
    <section className="mt-8" data-visitors-section>
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold text-foreground">
        <Users className="h-4 w-4 text-primary" />
        زوار الموقع
      </h2>
      <div className={CARD}>
        {stats === null ? (
          <p className="text-[13px] text-muted-foreground" data-visitors-state="unreadable">
            تعذّر قراءة العدّاد.
          </p>
        ) : stats.firstDay === null ? (
          <p className="text-[13px] text-muted-foreground" data-visitors-state="empty">
            ما في زيارات مسجّلة بعد — العدّاد يبدأ مع أول زيارة للموقع العام.
          </p>
        ) : (
          <div data-visitors-state="ready">
            <div className="grid grid-cols-3 gap-4">
              <WindowTile label="زوار اليوم" visitors={stats.today.visitors} views={stats.today.views} />
              <WindowTile label="زوار آخر 7 أيام" visitors={stats.week.visitors} views={stats.week.views} />
              <WindowTile label="زوار آخر 30 يوم" visitors={stats.month.visitors} views={stats.month.views} />
            </div>
            <Sparkline series={stats.series} />
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <RankedList
                title="أكثر الصفحات (30 يوم)"
                attr="data-visitors-top-pages"
                empty="ما في صفحات بعد."
                rows={stats.topPages.map((p) => ({
                  key: p.path,
                  label: p.label,
                  value: count(p.views, "مشاهدة"),
                }))}
              />
              <RankedList
                title="من وين جوا (30 يوم)"
                attr="data-visitors-top-sources"
                empty="كل الزيارات من داخل الموقع."
                rows={stats.topSources.map((s) => ({
                  key: s.source,
                  label: SOURCE_LABELS[s.source],
                  value: count(s.views, "زيارة"),
                }))}
              />
            </div>
          </div>
        )}
        <p className={cn("text-[11px] text-muted-foreground", stats === null ? "mt-2" : "mt-5")}>
          {PRIVACY_NOTE}
          {stats && stats.firstDay ? (
            <>
              {" "}الزائر يُحسب مرة وحدة كل يوم، فمجموع 7 و30 يوم يعدّ الزائر المتكرر بعدد أيامه. العدّاد بدأ يوم{" "}
              {formatArabicDate(stats.firstDay)}.
            </>
          ) : null}
        </p>
      </div>
    </section>
  )
}
