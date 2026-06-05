/**
 * Guest Discovery v2 — run detail. Ranked candidate cards. Strong
 * candidates + shortlist up top; rejected collapsed at the bottom.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, Loader2 } from "lucide-react"
import { getDiscoveryRun, listCandidates } from "@/lib/discovery"
import { runStatusLabel } from "@/lib/operator-language"
import { formatDateTime } from "@/lib/shared/formatters"
import { CandidateCard, type V2CardData } from "../candidate-card"
import { AutoRefresh } from "../auto-refresh"

export const dynamic = "force-dynamic"

export default async function V2RunPage({
  params,
}: {
  params: Promise<{ runId: string }>
}) {
  const { runId } = await params
  const run = await getDiscoveryRun(runId)
  if (!run) notFound()

  const rows = await listCandidates({ discovery_run_id: runId, limit: 200 }).catch(() => [])
  const running = run.status !== "completed" && run.status !== "failed"

  const cards: V2CardData[] = rows.map((r) => {
    const v2 = ((r.platform_signals as Record<string, unknown> | null)?.v2 ?? {}) as Record<string, unknown>
    return {
      id: r.id,
      name: r.proposed_name ?? "—",
      name_en: (v2.name_en as string) ?? null,
      role: r.proposed_role ?? null,
      country: r.proposed_country ?? null,
      image: (v2.image_url as string) ?? null,
      why: (v2.why as string) ?? null,
      decision: (v2.decision as V2CardData["decision"]) ?? (r.status === "rejected" ? "rejected" : "shortlist"),
      status: r.status,
      scores: v2.scores as V2CardData["scores"],
      reasons: (v2.reasons as string[]) ?? [],
      birth_year: (v2.birth_year as number) ?? null,
      sitelinks: (v2.sitelinks as number) ?? null,
      signals: v2.signals as V2CardData["signals"],
      links: (r.evidence_urls ?? []).map((e) => ({ platform: e.platform, url: e.url, title: e.title })),
    }
  })

  const strong = cards.filter((c) => c.decision === "accepted")
  const shortlist = cards.filter((c) => c.decision === "shortlist")
  const rejected = cards.filter((c) => c.decision === "rejected")
  const stats = (run.source_config as { v2_stats?: Record<string, number>; v2_error?: string } | null) ?? {}

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 pb-16" dir="rtl">
      {running && <AutoRefresh seconds={4} />}
      <Link href="/admin/discovery-v2" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-3 w-3" /> العودة
      </Link>

      <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
        <h1 className="text-xl font-bold">{run.seed_prompt ?? "اكتشاف"}</h1>
        <div className="mt-1 text-[11.5px] text-muted-foreground">
          {runStatusLabel(run.status)} · {formatDateTime(run.created_at)}
          {stats.v2_stats ? ` · ${stats.v2_stats.proposed ?? 0} مقترح → ${stats.v2_stats.resolved ?? 0} محقّق → ${strong.length} قويّ + ${shortlist.length} مختصرة` : ""}
        </div>
        {stats.v2_error && <p className="mt-2 text-[11.5px] text-rose-300">{String(stats.v2_error)}</p>}
        {running && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/5 px-3 py-1.5 text-[11.5px] text-violet-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ الاقتراح والتحقّق والإثراء… يتحدّث تلقائياً
          </div>
        )}
      </div>

      {strong.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-emerald-300/90">مرشّحون أقوياء ({strong.length})</h2>
          <div className="grid grid-cols-1 gap-3">{strong.map((c) => <CandidateCard key={c.id} c={c} />)}</div>
        </section>
      )}

      {shortlist.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-amber-300/90">قائمة مختصرة ({shortlist.length})</h2>
          <div className="grid grid-cols-1 gap-3">{shortlist.map((c) => <CandidateCard key={c.id} c={c} />)}</div>
        </section>
      )}

      {!running && strong.length === 0 && shortlist.length === 0 && (
        <div className="rounded-xl border border-border/30 bg-card/40 p-6 text-center text-[12.5px] text-muted-foreground">
          لم يصل أيّ مرشّح إلى المعيار في هذا التشغيل. جرّب موضوعاً أوسع أو خفّف الفلاتر.
        </div>
      )}

      {rejected.length > 0 && (
        <details className="rounded-xl border border-border/30 bg-card/30">
          <summary className="cursor-pointer p-3 text-[11.5px] text-muted-foreground">المستبعَدون ({rejected.length}) — اضغط للعرض</summary>
          <div className="grid grid-cols-1 gap-3 p-3 pt-0">{rejected.map((c) => <CandidateCard key={c.id} c={c} />)}</div>
        </details>
      )}
    </div>
  )
}
