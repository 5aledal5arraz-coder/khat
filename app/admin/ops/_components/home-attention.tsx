/**
 * Home "attention" block — merged into `/admin/ops` from the retired Khat
 * Brain command center (Phase 2.2). ONE section:
 *   ما الذي يحتاج انتباهك الآن؟ — the deduped attention queue.
 *
 * A stalled episode (>48h without progress) renders as a BADGE on its single
 * row here. It used to get a second card in its own «حلقات متوقفة» section
 * below, so an episode that was both active and stalled was drawn twice on
 * one screen with two different buttons. The merge is done in
 * `lib/khat-brain/attention.ts`, keyed by `eir.id`; this component just
 * renders whatever it is handed.
 *
 * The header count is `queue.length` — the number of cards actually below it.
 *
 * Pure presentational server component; all data is fetched in ops/page.tsx
 * (getRecentActiveEirs + getStaleEirs) and merged before it gets here.
 */
import Link from "next/link"
import { ListChecks, Clock } from "lucide-react"
import { PHASE_LABEL } from "@/lib/khat-brain/phase-labels"
import type { NextActionTone } from "@/lib/khat-brain/next-action"
import type { AttentionItem } from "@/lib/khat-brain/attention"
import type { RecentActiveEir } from "@/lib/eir/service"
import { formatDateTime } from "@/lib/shared/formatters"
import { humanizeAge } from "@/lib/ops/format"

type QueueItem = AttentionItem<RecentActiveEir>

export function HomeAttention({ queue }: { queue: QueueItem[] }) {
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
                stalled={item.stalled}
              />
            ))}
          </div>
        )}
      </section>
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
  stalled,
}: {
  title: string
  phaseLabel: string
  actionLabel: string
  description: string
  href: string
  tone: NextActionTone
  updatedAt: string
  /** Set when this episode is also stalled — renders the badge below. */
  stalled: { ageHours: number } | null
}) {
  // A stalled episode keeps the amber surface its old dedicated section had,
  // so deleting that section costs no visual signal — unless the action is
  // already `urgent`, which outranks it.
  const ring =
    stalled !== null && tone !== "urgent" ? "warning" : tone
  const toneRing =
    ring === "urgent"
      ? "border-rose-500/30 bg-rose-500/5"
      : ring === "warning"
        ? "border-amber-500/30 bg-amber-500/5"
        : "border-violet-500/20 bg-card"
  const toneCta =
    tone === "urgent"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20"
        : "border-violet-500/40 bg-violet-500/10 text-violet-700 hover:bg-violet-500/20"
  return (
    <Link
      href={href}
      className={"block rounded-2xl border p-3.5 transition-colors " + toneRing}
      data-eir-row
      data-stalled={stalled !== null ? "true" : "false"}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {phaseLabel}
            </span>
            {/* The stall badge — replaces the whole duplicate card this row
                used to get in the deleted «حلقات متوقفة» section. */}
            {stalled !== null ? (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                data-stalled-badge
              >
                <Clock className="h-3 w-3" />
                متوقفة {humanizeAge(stalled.ageHours * 3_600_000)}
              </span>
            ) : null}
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
