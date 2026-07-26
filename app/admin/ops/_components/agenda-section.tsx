/**
 * «الأيام الجاية» — the dated-commitments strip on the admin home.
 *
 * One merged, ascending list over three sources (`lib/ops/agenda.ts`): planned
 * recordings, scheduled episode content, and open CRM follow-ups. Overdue rows
 * lead and carry a warning marker — they are the reason the section exists,
 * since `crm_tasks.due_at` had no cross-record reader anywhere in the product.
 *
 * Display rules, same family as «الوارد»:
 *   • Nothing due → an explicit sentence, never blank space. Empty is a real,
 *     calm answer.
 *   • Unreadable → «تعذّر قراءة المواعيد». Absence is not success, so a failed
 *     read must never look like an empty agenda.
 *   • Truncated → says so. A capped list that stays silent about the cap is
 *     how a reminder goes missing, which is the failure being fixed.
 *
 * Pure presentational server component; all derivation is in lib/ops/agenda.ts.
 */
import Link from "next/link"
import { CalendarClock, AlertTriangle, ArrowLeft } from "lucide-react"
import { formatArabicDateTime } from "@/lib/shared/formatters"
import { AGENDA_WINDOW_DAYS, type Agenda } from "@/lib/ops/agenda"

export function AgendaSection({ agenda }: { agenda: Agenda | null }) {
  const overdueCount = agenda?.items.filter((i) => i.overdue).length ?? 0

  return (
    <section className="mb-8" data-agenda-section>
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
        <CalendarClock className="h-4 w-4 text-violet-700" />
        الأيام الجاية
        {overdueCount > 0 ? (
          <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-amber-700">
            {overdueCount} متأخر
          </span>
        ) : null}
      </h2>

      {agenda === null ? (
        <div
          className="rounded-2xl border border-border/60 bg-card p-4 text-[12.5px] text-muted-foreground"
          data-agenda-state="unreadable"
        >
          تعذّر قراءة المواعيد — أعِد تحميل الصفحة، وإذا استمر بلّغ مدير النظام.
        </div>
      ) : agenda.items.length === 0 ? (
        <div
          className="rounded-2xl border border-border/60 bg-card p-4 text-[12.5px] text-muted-foreground"
          data-agenda-state="empty"
        >
          ما فيه مواعيد في الـ{AGENDA_WINDOW_DAYS} يوم الجاية، ولا متابعات متأخرة.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {agenda.items.map((item) => (
              <Link
                key={`${item.kind}:${item.id}`}
                href={item.href}
                data-agenda-row
                data-agenda-kind={item.kind}
                data-agenda-overdue={item.overdue ? "true" : "false"}
                className={
                  "flex flex-col gap-2 rounded-2xl border p-3.5 transition-colors sm:flex-row sm:items-center sm:justify-between sm:gap-3 " +
                  (item.overdue
                    ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50"
                    : "border-border/80 bg-card hover:border-muted-foreground/30 hover:bg-muted/50")
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      {item.kindLabel}
                    </span>
                    {item.overdue ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                        data-agenda-overdue-badge
                      >
                        <AlertTriangle className="h-3 w-3" />
                        متأخر
                      </span>
                    ) : null}
                    <span className="text-[10px] text-muted-foreground">
                      {formatArabicDateTime(item.due_at)}
                    </span>
                  </span>
                  {/* Two lines on mobile, one truncated line once the row has
                      width — same rule as the attention queue above. */}
                  <span className="line-clamp-2 text-[13px] font-semibold leading-tight text-foreground sm:truncate">
                    {item.title}
                  </span>
                </span>
                <ArrowLeft className="h-4 w-4 shrink-0 self-start text-muted-foreground/50 sm:self-center" />
              </Link>
            ))}
          </div>
          {agenda.hasMore ? (
            <p className="mt-2 text-[11px] text-muted-foreground" data-agenda-more>
              وفيه مواعيد أخرى داخل النافذة — افتح السجل المعني لبقيّتها.
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
