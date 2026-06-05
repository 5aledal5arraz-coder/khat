/**
 * Khat Brain — Per-run candidate listing page.
 *
 * RWA-P2 (2026-05-31) — companion to the candidate detail page (P1).
 *
 * The main /admin/discovery page is the OPERATOR surface: it shows
 * recent runs + the curated, non-rejected candidates the operator
 * should act on. This page is the AUDITOR surface: it shows every
 * candidate the run produced, including the ones Alpha dropped.
 *
 * Use case: operator wants to understand WHY Alpha said "no" to a
 * run. They click into the run from /admin/discovery, see all rows
 * grouped by drop reason, and can click any row to inspect the full
 * signal trace on the candidate detail page.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  ShieldCheck,
  ShieldQuestion,
  Filter,
  Sparkles,
} from "lucide-react"
import { listCandidates, getDiscoveryRun } from "@/lib/discovery"
import { formatDateTime } from "@/lib/shared/formatters"
import { runStatusLabel } from "@/lib/operator-language"

export const dynamic = "force-dynamic"

interface RunPageProps {
  params: Promise<{ id: string }>
}

export default async function RunPage({ params }: RunPageProps) {
  const { id } = await params

  const run = await getDiscoveryRun(id)
  if (!run) notFound()

  // Include rejected — this is the audit view, not the operator view.
  const all = await listCandidates({
    discovery_run_id: id,
    limit: 200,
    only_persons: false,
    include_rejected: true,
  })

  // Group by status
  const groups: Record<string, typeof all> = {}
  for (const c of all) {
    groups[c.status] ??= []
    groups[c.status].push(c)
  }
  const statusOrder = ["proposed", "saved_for_later", "promoted", "rejected"]
  const orderedGroups = statusOrder
    .filter((s) => groups[s] && groups[s].length > 0)
    .map((s) => ({ status: s, rows: groups[s] }))

  const total = all.length
  const alphaTagged = all.filter((c) => c.pipeline_version === "alpha").length

  // Mean identity confidence on Alpha-tagged
  const idConfs = all
    .filter((c) => c.identity_confidence !== null)
    .map((c) => Number(c.identity_confidence))
  const meanIdConf =
    idConfs.length === 0
      ? null
      : idConfs.reduce((a, b) => a + b, 0) / idConfs.length

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6" dir="rtl">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
        <Link
          href="/admin/discovery"
          className="inline-flex items-center gap-1 rounded-md border border-border/30 bg-background/40 px-2 py-1 transition-opacity hover:opacity-80"
          dir="rtl"
        >
          <ArrowLeft className="h-3 w-3" />
          العودة لاكتشاف الضيوف
        </Link>
        <span>·</span>
        <span dir="rtl">تشغيل اكتشاف</span>
        <code className="font-mono text-[11px]" dir="ltr">
          {run.id.slice(0, 8)}
        </code>
      </div>

      {/* Run header */}
      <section className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/5 via-violet-500/5 to-transparent p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div
              className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary"
              dir="rtl"
            >
              <ShieldCheck className="h-3 w-3" />
              عرض المراجعة — يشمل المرفوضين
            </div>
            <h1 className="text-[16px] font-bold" dir="auto">
              {run.seed_prompt
                ? run.seed_prompt.slice(0, 100)
                : `تشغيل ${run.id.slice(0, 8)}`}
            </h1>
            <div
              className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground"
              dir="rtl"
            >
              <span>{runStatusLabel(run.status)}</span>
              <span>·</span>
              <span>{total} مرشّح</span>
              <span>·</span>
              <span>{run.archetypes?.length ?? 0} نموذج</span>
              <span>·</span>
              <span>{formatDateTime(run.created_at)}</span>
            </div>
          </div>

          {/* Filter summary */}
          {(run.source_config?.gender ||
            run.source_config?.nationality ||
            run.source_config?.hiddenness_preference) && (
            <div className="flex flex-col items-end gap-1 text-[10.5px]">
              {run.source_config?.gender && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                  الجنس: {run.source_config.gender === "male" ? "ذكر" : "أنثى"}
                </span>
              )}
              {run.source_config?.nationality && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                  الجنسية:{" "}
                  {run.source_config.nationality === "kuwaiti"
                    ? "كويتي"
                    : "غير كويتي"}
                </span>
              )}
              {run.source_config?.hiddenness_preference && (
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-300">
                  ميل: {run.source_config.hiddenness_preference}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Aggregate metrics strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 text-[11px] md:grid-cols-4">
          <Stat label="إجمالي المرشّحين" value={String(total)} />
          <Stat
            label="بـ Alpha"
            value={`${alphaTagged}/${total}`}
            accent="violet"
          />
          <Stat
            label="مرفوضون"
            value={`${groups["rejected"]?.length ?? 0}`}
            accent="rose"
          />
          <Stat
            label="متوسّط ثقة الهوية"
            value={meanIdConf !== null ? meanIdConf.toFixed(3) : "—"}
            accent="sky"
          />
        </div>
      </section>

      {/* Candidates grouped by status */}
      {orderedGroups.map(({ status, rows }) => (
        <section key={status}>
          <h2 className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            {statusArabicLabel(status)} ({rows.length})
          </h2>
          <div className="space-y-2">
            {rows.map((c) => {
              const attr = c.attribute_confidences as
                | {
                    nationality?: {
                      value?: string | null
                      confidence?: number
                    }
                    gender?: { value?: string | null; confidence?: number }
                  }
                | null
              const idConf = c.identity_confidence ?? null
              return (
                <Link
                  key={c.id}
                  href={`/admin/discovery/candidates/${c.id}`}
                  className="block rounded-xl border border-border/30 bg-card/40 p-3 transition-colors hover:border-violet-500/30 hover:bg-violet-500/5"
                >
                  <div
                    className="flex flex-wrap items-center gap-2 text-[12.5px]"
                    dir="rtl"
                  >
                    <span className="font-semibold" dir="auto">
                      {c.display_name ?? c.proposed_name ?? "(no name)"}
                    </span>
                    {c.pipeline_version === "alpha" && (
                      <span className="inline-flex items-center gap-0.5 rounded-md border border-violet-500/30 bg-violet-500/5 px-1.5 py-0.5 text-[10px] text-violet-300">
                        <Sparkles className="h-2.5 w-2.5" />
                        Alpha
                      </span>
                    )}
                    {idConf !== null && (
                      <span
                        className={
                          "inline-flex items-center gap-1 rounded-md border bg-background/40 px-1.5 py-0.5 text-[10px] " +
                          (idConf >= 0.85
                            ? "border-emerald-500/30 text-emerald-300"
                            : idConf >= 0.6
                              ? "border-amber-500/30 text-amber-300"
                              : "border-rose-500/30 text-rose-300")
                        }
                      >
                        <ShieldCheck className="h-2.5 w-2.5" />
                        {(idConf * 100).toFixed(0)}%
                      </span>
                    )}
                    {attr?.nationality?.value && (
                      <span className="rounded-md bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {attr.nationality.value === "kuwaiti"
                          ? "كويتي"
                          : "غير كويتي"}{" "}
                        @{((attr.nationality.confidence ?? 0) * 100).toFixed(0)}%
                      </span>
                    )}
                    {attr?.gender?.value && (
                      <span className="rounded-md bg-background/40 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {attr.gender.value === "male" ? "ذكر" : "أنثى"} @
                        {((attr.gender.confidence ?? 0) * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  {c.dropped_reason && (
                    <div
                      className="mt-1 text-[10.5px] text-rose-300/80"
                      dir="ltr"
                    >
                      {c.dropped_reason}
                    </div>
                  )}
                  {c.archetype && (
                    <div
                      className="mt-1 text-[10.5px] text-muted-foreground"
                      dir="rtl"
                    >
                      {c.archetype.name}
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

function statusArabicLabel(status: string): string {
  switch (status) {
    case "proposed":
      return "مقترحون"
    case "under_review":
      return "قيد المراجعة"
    case "saved_for_later":
      return "محفوظون"
    case "promoted":
      return "مُرقَّون"
    case "rejected":
      return "مرفوضون"
    default:
      return status
  }
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: "violet" | "rose" | "sky"
}) {
  const accentCls =
    accent === "violet"
      ? "text-violet-300"
      : accent === "rose"
        ? "text-rose-300"
        : accent === "sky"
          ? "text-sky-300"
          : "text-foreground"
  return (
    <div className="rounded-lg border border-border/30 bg-background/40 p-2.5">
      <div className="text-muted-foreground">{label}</div>
      <div className={`mt-1 text-[14px] font-semibold ${accentCls}`}>
        {value}
      </div>
    </div>
  )
}
