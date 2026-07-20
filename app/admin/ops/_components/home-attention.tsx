/**
 * Home "attention" block — merged into `/admin/ops` from the retired Khat
 * Brain command center (Phase 2.2). Two stacked sections:
 *   1. ما الذي يحتاج انتباهك الآن؟ — the Next-Action queue (top 8).
 *   2. حلقات متوقفة — stale EIRs (>48h without progress).
 *
 * Pure presentational server component; all data is fetched in ops/page.tsx
 * (getRecentActiveEirs + getStaleEirs) and passed in.
 */
import Link from "next/link"
import { AlertTriangle, ListChecks } from "lucide-react"
import { PHASE_LABEL } from "@/lib/khat-brain/phase-labels"
import type { EirNextAction, NextActionTone } from "@/lib/khat-brain/next-action"
import type { RecentActiveEir } from "@/lib/eir/service"
import type { StaleEir } from "@/lib/khat-brain/staleness"
import { formatDateTime } from "@/lib/shared/formatters"

type QueueItem = EirNextAction<RecentActiveEir>

export function HomeAttention({
  queue,
  staleEirs,
}: {
  queue: QueueItem[]
  staleEirs: StaleEir[]
}) {
  return (
    <div className="mb-8 space-y-6">
      {/* ── ما الذي يحتاج انتباهك الآن؟ ── */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
          <ListChecks className="h-4 w-4 text-violet-700" />
          ما الذي يحتاج انتباهك الآن؟
          <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-violet-700">
            {queue.length}
          </span>
        </h2>
        {queue.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card p-4 text-[12.5px] text-muted-foreground">
            لا توجد حلقات نشطة بانتظار قرار. ابدأ موسماً جديداً من «المواسم».
          </div>
        ) : (
          <div className="space-y-2">
            {/* At-a-glance summary — groups identical actions into count chips. */}
            {(() => {
              const summary = new Map<
                string,
                { label: string; count: number; tone: NextActionTone }
              >()
              for (const it of queue) {
                const prev = summary.get(it.action.key)
                if (prev) prev.count++
                else
                  summary.set(it.action.key, {
                    label: it.action.label,
                    count: 1,
                    tone: it.action.tone,
                  })
              }
              if (summary.size <= 1) return null
              return (
                <div
                  className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-border/40 bg-muted/20 px-3 py-2 text-[11px]"
                  data-queue-summary
                  data-summary-groups={summary.size}
                >
                  <span className="text-muted-foreground">يحتاج اهتمامك:</span>
                  {Array.from(summary.entries()).map(([key, g]) => (
                    <span
                      key={key}
                      data-action-key={key}
                      className={
                        g.tone === "urgent"
                          ? "rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-700"
                          : g.tone === "warning"
                            ? "rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700"
                            : "rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-700"
                      }
                    >
                      <span className="font-semibold tabular-nums">{g.count}</span>{" "}
                      {g.label}
                    </span>
                  ))}
                </div>
              )
            })()}
            {queue.map((item) => (
              <NextActionRow
                key={item.eir.id}
                title={item.eir.working_title}
                phaseLabel={PHASE_LABEL[item.eir.phase]}
                actionLabel={item.action.label}
                description={item.action.description}
                href={item.href}
                tone={item.action.tone}
                updatedAt={item.eir.updated_at}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── حلقات متوقفة (stale EIRs) ── */}
      {staleEirs.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            حلقات متوقفة
            <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] tabular-nums">
              {staleEirs.length}
            </span>
            <span className="text-[10px] font-normal text-muted-foreground">
              {"(>48 ساعة دون تقدم)"}
            </span>
          </h2>
          <div
            className="space-y-2"
            data-stale-eir-list
            data-stale-eir-count={staleEirs.length}
          >
            {staleEirs.map((e) => (
              <Link
                key={e.id}
                href={e.recommended_href}
                className="block rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 transition-colors hover:bg-amber-500/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {PHASE_LABEL[e.phase]}
                      </span>
                      <span className="text-[10.5px] text-amber-700" dir="ltr">
                        {e.age_hours}h idle
                      </span>
                    </div>
                    <h3 className="truncate text-[13px] font-semibold leading-tight">
                      {e.working_title}
                    </h3>
                    <p className="mt-1 line-clamp-1 text-[11.5px] text-muted-foreground/85">
                      {e.recommended_action}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11.5px] font-medium text-amber-700">
                    حرّك ←
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function NextActionRow({
  title,
  phaseLabel,
  actionLabel,
  description,
  href,
  tone,
  updatedAt,
}: {
  title: string
  phaseLabel: string
  actionLabel: string
  description: string
  href: string
  tone: NextActionTone
  updatedAt: string
}) {
  const toneRing =
    tone === "urgent"
      ? "border-rose-500/30 bg-rose-500/5"
      : tone === "warning"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-violet-500/20 bg-card"
  const toneCta =
    tone === "urgent"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
        : "border-violet-500/40 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20"
  return (
    <Link href={href} className={"block rounded-2xl border p-3.5 transition-colors " + toneRing}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {phaseLabel}
            </span>
            <span className="text-[10px] text-muted-foreground" dir="ltr">
              {formatDateTime(updatedAt)}
            </span>
          </div>
          <h3 className="truncate text-[13px] font-semibold leading-tight">{title}</h3>
          <p className="mt-1 line-clamp-1 text-[11.5px] text-muted-foreground/85">
            {description}
          </p>
        </div>
        <span
          className={"shrink-0 rounded-xl border px-3 py-1.5 text-[11.5px] font-medium " + toneCta}
        >
          {actionLabel} ←
        </span>
      </div>
    </Link>
  )
}
