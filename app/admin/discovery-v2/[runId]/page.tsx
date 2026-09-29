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
import { STORY_REVIEW_FLAGS } from "@/lib/discovery-v2/types"
import { CandidateCard, type V2CardData } from "../candidate-card"
import { AutoRefresh } from "../auto-refresh"
import { RetryRunButton } from "../retry-run-button"
import { displayDiscoveryTopic } from "@/lib/discovery-v2/topic"
import { resolveV2RunErrorKind, v2RunFailureMessage } from "@/lib/discovery-v2/run-failure"
import { canRetryDegradedRun, proposeWarning, webSearchWarning } from "@/lib/discovery-v2/web-search-health"

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
      grounded: (v2.grounded as V2CardData["grounded"]) ?? null,
      story: (v2.story as V2CardData["story"]) ?? null,
      flags: (v2.flags as V2CardData["flags"]) ?? [],
      origin: (v2.origin as V2CardData["origin"]) ?? null,
      links: (r.evidence_urls ?? []).map((e) => ({ platform: e.platform, url: e.url, title: e.title })),
    }
  })

  // needs_review = a verified strong story awaiting an identity check — it
  // belongs with the strong list, badged differently on the card. A story
  // Khaled reviews by hand (unpublished / told by others) is listed apart:
  // it is not a verified strong story.
  const storyReview = (c: V2CardData) =>
    c.decision === "needs_review" && !!c.flags?.some((f) => STORY_REVIEW_FLAGS.includes(f))
  const review = cards.filter(storyReview)
  const strong = cards.filter(
    (c) => (c.decision === "accepted" || c.decision === "needs_review") && !storyReview(c),
  )
  const shortlist = cards.filter((c) => c.decision === "shortlist")
  const rejected = cards.filter((c) => c.decision === "rejected")
  const stats =
    (run.source_config as {
      v2_stats?: Record<string, number | string | boolean | null>
      v2_error?: string
      v2_error_kind?: string
    } | null) ?? {}
  const failed = run.status === "failed"
  // A failed run says WHY in the operator's words (a timeout is not "try a
  // broader topic"); the raw provider error stays underneath for diagnosis.
  const rawError = stats.v2_error ?? run.error_message ?? null
  const failureMessage = failed
    ? v2RunFailureMessage(resolveV2RunErrorKind(stats.v2_error_kind, rawError))
    : null
  // Run-level honesty: the harvest and story checks fail SAFE (fewer names,
  // «لم يُفحص»), so a run the search provider mostly refused used to end as a
  // quiet «اكتمل». Said once here when a real share of the searches failed.
  const webWarning = running ? null : webSearchWarning(stats.v2_stats)
  const proposeNote = running || failed ? null : proposeWarning(stats.v2_stats)

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 pb-16" dir="rtl">
      {running && <AutoRefresh seconds={4} />}
      <Link href="/admin/discovery-v2" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground">
        <ArrowRight className="h-3 w-3" /> العودة
      </Link>

      <div className="rounded-2xl border border-border/40 bg-card/40 p-4">
        <h1 className="text-xl font-bold">{run.seed_prompt ? displayDiscoveryTopic(run.seed_prompt) : "اكتشاف"}</h1>
        <div className="mt-1 text-[11.5px] text-muted-foreground">
          {runStatusLabel(run.status)} · {formatDateTime(run.created_at)}
          {stats.v2_stats ? ` · ${stats.v2_stats.proposed ?? 0} مقترح → ${stats.v2_stats.resolved ?? 0} محقّق → ${strong.length} قويّ + ${review.length} للمراجعة + ${shortlist.length} مختصرة` : ""}
        </div>
        {webWarning && (
          <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3" data-web-degraded>
            <p className="text-[12.5px] font-semibold text-amber-800">{webWarning.headline}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{webWarning.detail}</p>
            {!failed && canRetryDegradedRun(stats.v2_stats, run.created_at) && <RetryRunButton runId={run.id} />}
          </div>
        )}
        {proposeNote && (
          <p className="mt-2 text-[11.5px] font-medium text-amber-800" data-propose-empty>
            {proposeNote}
          </p>
        )}
        {/* D5: X refused (402 wallet / 429 rate limit) — the run went on without it. */}
        {stats.v2_stats?.x_degraded ? (
          <p className="mt-2 text-[11px] text-amber-700" data-x-degraded>
            تعذّر البحث في X في هذا التشغيل ({String(stats.v2_stats.x_degraded)}) — أُكمل التشغيل بدونه.
          </p>
        ) : null}
        {/* X was not read at all: no curated list touches this topic (0 calls). */}
        {stats.v2_stats?.x_skipped === "no_relevant_list" ? (
          <p className="mt-2 text-[11px] text-muted-foreground" data-x-skipped>
            لم يُبحث في X في هذا التشغيل — لا قائمة منسّقة تخصّ هذا الموضوع.
          </p>
        ) : null}
        {failed && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3">
            <p className="text-[12.5px] font-semibold text-rose-700">{failureMessage}</p>
            {rawError && (
              <p className="mt-1 text-[10.5px] text-muted-foreground" dir="ltr">
                {String(rawError)}
              </p>
            )}
            <RetryRunButton runId={run.id} />
          </div>
        )}
        {running && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-[11.5px] text-primary">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ الاقتراح والتحقّق والإثراء… يتحدّث تلقائياً
          </div>
        )}
      </div>

      {strong.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-emerald-700/90">مرشّحون أقوياء ({strong.length})</h2>
          <div className="grid grid-cols-1 gap-3">{strong.map((c) => <CandidateCard key={c.id} c={c} />)}</div>
        </section>
      )}

      {review.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-sky-700">قصص تحتاج مراجعتك ({review.length})</h2>
          <p className="mb-2 text-[11px] text-muted-foreground">
            قصص لم تُنشر علناً أو يرويها غير صاحبها — لم تُحتسب في التقييم، تحقّق منها بنفسك قبل التواصل.
          </p>
          <div className="grid grid-cols-1 gap-3">{review.map((c) => <CandidateCard key={c.id} c={c} />)}</div>
        </section>
      )}

      {shortlist.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold text-amber-700/90">قائمة مختصرة ({shortlist.length})</h2>
          <div className="grid grid-cols-1 gap-3">{shortlist.map((c) => <CandidateCard key={c.id} c={c} />)}</div>
        </section>
      )}

      {!running && !failed && strong.length === 0 && review.length === 0 && shortlist.length === 0 && (
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
