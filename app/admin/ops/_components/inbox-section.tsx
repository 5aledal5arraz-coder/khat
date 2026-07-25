/**
 * «الوارد» — the human inbox strip on the admin home.
 *
 * Four channels, one row each: a count, a label, and a link that opens the
 * channel ALREADY filtered to what is waiting.
 *
 * Display rules (they are the point of the section, not decoration):
 *   • A count > 0 gets an attention dot. Zero does NOT — a permanent dot on a
 *     resting queue is how an operator learns to stop reading dots.
 *   • Zero still renders «0» and still links: the destination page shows its
 *     own «ما فيه…» message. A dead link on an empty queue is what made the
 *     teaser questions invisible for months.
 *   • An unreadable count renders «—», never «0». Absence is not success.
 *
 * Pure presentational server component; data comes from lib/ops/inbox.ts.
 */
import Link from "next/link"
import { Inbox, ArrowLeft } from "lucide-react"
import type { InboxChannel } from "@/lib/ops/inbox"

export function InboxSection({
  channels,
  total,
}: {
  channels: InboxChannel[]
  /** null when any channel is unreadable. */
  total: number | null
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
        <Inbox className="h-4 w-4 text-violet-700" />
        الوارد
        <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-violet-700">
          {total ?? "—"}
        </span>
      </h2>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {channels.map((c) => {
          const waiting = c.count !== null && c.count > 0
          return (
            <Link
              key={c.key}
              href={c.href}
              data-inbox-channel={c.key}
              data-inbox-count={c.count ?? "unknown"}
              className={
                "group flex items-center justify-between gap-3 rounded-2xl border p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors " +
                (waiting
                  ? "border-violet-500/25 bg-violet-500/[0.04] hover:border-violet-500/40"
                  : "border-border/80 bg-card hover:border-muted-foreground/30 hover:bg-muted/50")
              }
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="text-[12px] font-medium text-muted-foreground">
                    {c.label}
                  </span>
                  {waiting ? (
                    <span
                      data-attention-dot
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-600"
                    />
                  ) : null}
                </span>
                <span className="mt-1.5 block text-[26px] font-semibold leading-none tracking-tight tabular-nums text-foreground">
                  {c.count ?? "—"}
                </span>
                <span className="mt-1.5 block text-[11px] text-muted-foreground">
                  {c.count === null
                    ? "تعذّر قراءة العدّاد"
                    : c.count === 0
                      ? c.emptyHint
                      : "بانتظار قرارك"}
                </span>
              </span>
              <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-colors group-hover:text-muted-foreground" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
