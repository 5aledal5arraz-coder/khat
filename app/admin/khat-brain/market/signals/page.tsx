/**
 * Phase 2 — Market Signals review queue.
 *
 *   /admin/khat-brain/market/signals?tab=<new|strong|weak|rejected|archived|manual>&page=N
 *
 * Server-rendered shell. Loads the current tab's signals + global tab
 * counts in parallel; client component handles selection, bulk
 * actions, and the per-card forms. Every operator action writes an
 * audit row to market_signal_review_events via the server action layer
 * — no automatic state changes happen here.
 *
 * Operator-only surface. Arabic copy lives in `_components/copy.ts`;
 * internal terms (market.collect, pipeline, scheduler, …) are
 * explicitly forbidden by the Phase 2 smoke.
 */

import Link from "next/link"
import { Activity, ArrowLeft, Inbox } from "lucide-react"
import { requireAdmin } from "@/lib/api-utils"
import {
  getReviewQueueCounts,
  listSignalsForReview,
  PAGE_SIZE,
  REVIEW_TABS,
  type ReviewTab,
} from "@/lib/market-intelligence/review-queries"
import { listTrustedSources } from "@/lib/market-intelligence/sources-queries"
import { PAGE_COPY, REVIEW_TAB_LABEL } from "./_components/copy"
import { SignalsList } from "./_components/signals-client"
import { ManualSignalForm } from "./_components/manual-signal-form"
import { RefreshScoringButton } from "./_components/refresh-scoring-button"
import { MarketSubnav } from "../_components/market-subnav"

export const dynamic = "force-dynamic"

function coerceTab(raw: string | string[] | undefined): ReviewTab {
  const v = Array.isArray(raw) ? raw[0] : raw
  return (REVIEW_TABS as readonly string[]).includes(v ?? "")
    ? (v as ReviewTab)
    : "new"
}
function coercePage(raw: string | string[] | undefined): number {
  const v = Array.isArray(raw) ? raw[0] : raw
  const n = v ? Math.floor(Number(v)) : 1
  return Number.isFinite(n) && n >= 1 ? n : 1
}

export default async function MarketSignalsReviewPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireAdmin()
  const sp = (await searchParams) ?? {}
  const tab = coerceTab(sp.tab)
  const page = coercePage(sp.page)

  const [counts, listed, trustedSources] = await Promise.all([
    getReviewQueueCounts(),
    listSignalsForReview({ tab, page }),
    listTrustedSources({ filter: "active" }),
  ])

  const totalAcrossAllTabs = counts.total

  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-4">
      <div>
        <Link
          href="/admin/khat-brain"
          className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> العودة إلى مركز القيادة
        </Link>
        <div className="mt-3 flex items-baseline justify-between gap-2">
          <div>
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-[10.5px] font-medium text-primary">
              <Activity className="h-3 w-3" /> {PAGE_COPY.title}
            </div>
            <h1 className="text-xl font-bold tracking-tight">{PAGE_COPY.title}</h1>
            <p className="mt-1.5 max-w-3xl text-[12px] leading-relaxed text-muted-foreground">
              {PAGE_COPY.subtitle}
            </p>
          </div>
          <RefreshScoringButton />
        </div>
      </div>

      <MarketSubnav />

      {/* Manual signal form — collapsible at the top of the queue */}
      <ManualSignalForm
        trustedSources={trustedSources.map((s) => ({
          id: s.id,
          display_name: s.display_name,
          source_type: s.source_type,
        }))}
      />

      {/* Tabs (server-rendered links — bookmarkable) */}
      <nav
        className="flex flex-wrap gap-1.5 rounded-2xl border border-border/40 bg-card/30 p-1.5"
        aria-label="تصنيفات الإشارات"
        data-tabs
      >
        {REVIEW_TABS.map((t) => {
          const meta = REVIEW_TAB_LABEL[t]
          const count = counts[t]
          const active = t === tab
          return (
            <Link
              key={t}
              href={`/admin/khat-brain/market/signals?tab=${t}`}
              data-tab-key={t}
              data-active={active}
              className={
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11.5px] font-medium transition-colors " +
                (active
                  ? "border border-primary/30 bg-primary/10 text-primary"
                  : "border border-transparent text-muted-foreground hover:border-border/40 hover:bg-background/60")
              }
            >
              <span>{meta.label}</span>
              <span
                className="rounded-full border border-current/30 bg-current/10 px-1.5 py-0 text-[10px] opacity-80"
                dir="ltr"
              >
                {count}
              </span>
            </Link>
          )
        })}
      </nav>

      <p className="text-[11px] text-muted-foreground/80">
        {REVIEW_TAB_LABEL[tab].help}
      </p>

      {totalAcrossAllTabs === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/40 bg-card/20 px-6 py-12 text-center">
          <Inbox className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
          <p className="text-[12.5px] text-muted-foreground">
            {PAGE_COPY.noSignalsTotal}
          </p>
        </div>
      ) : (
        <SignalsList
          signals={listed.signals}
          totalForTab={listed.totalForTab}
          page={page}
          pageSize={PAGE_SIZE}
          tabKey={tab}
        />
      )}
    </div>
  )
}
