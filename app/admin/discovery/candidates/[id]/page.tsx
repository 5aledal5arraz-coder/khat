/**
 * Khat Brain — Candidate detail page.
 *
 * RWA-P1 (2026-05-31) — built during the real-world audit to close
 * two gaps at once:
 *
 *   1. The audit needed a single-candidate surface so the Alpha
 *      card could render above the fold for visual verification.
 *      The /admin/discovery list filters out rejected candidates by
 *      default, so Alpha drops never appear there — making it hard
 *      to inspect why the classifier dropped them.
 *
 *   2. NetworkSource already emits links pointing here:
 *      "/admin/discovery/candidates/<id>". Before this page existed,
 *      operators clicking those links got a 404. Now they get full
 *      inspection of the cross-referenced candidate.
 *
 * The page renders the full CandidateRow (same component used in
 * the list) PLUS an "Alpha debug" panel below it showing every
 * person-class signal score, attribute_confidences signal_breakdown,
 * and the full evidence_bundle citation list. This is the auditor's
 * view — explicit, deterministic, traceable.
 */

import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Database,
  ShieldCheck,
  Compass,
} from "lucide-react"
import { getCandidate, getDiscoveryRun } from "@/lib/discovery"
import { CandidateRow } from "../../candidate-row"
import { formatDateTime } from "@/lib/shared/formatters"

export const dynamic = "force-dynamic"

interface CandidatePageProps {
  params: Promise<{ id: string }>
}

export default async function CandidatePage({ params }: CandidatePageProps) {
  const { id } = await params

  const candidate = await getCandidate(id)
  if (!candidate) {
    notFound()
  }

  const run = candidate.discovery_run_id
    ? await getDiscoveryRun(candidate.discovery_run_id)
    : null

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6" dir="rtl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Link
          href="/admin/discovery"
          className="inline-flex items-center gap-1 rounded-md border border-border/30 bg-background/40 px-2 py-1 transition-opacity hover:opacity-80"
          dir="rtl"
        >
          <ArrowLeft className="h-3 w-3" />
          العودة لاكتشاف الضيوف
        </Link>
        <span>·</span>
        <span className="font-mono text-[11px]" dir="ltr">
          {candidate.id.slice(0, 8)}
        </span>
        {run?.id && (
          <>
            <span>·</span>
            <span dir="rtl">
              تشغيل: <span className="font-mono" dir="ltr">{run.id.slice(0, 8)}</span>
            </span>
          </>
        )}
      </div>

      {/* Main card — reuse the same component the list uses */}
      <CandidateRow candidate={candidate} />

      {/* Alpha-side debug panel */}
      {candidate.pipeline_version === "alpha" && (
        <section className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
          <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-violet-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            تفاصيل تشخيص Alpha
          </h2>

          {/* Person-class signals */}
          {candidate.person_class_signals && (
            <div className="mb-4">
              <div
                className="mb-2 text-[11px] font-semibold text-foreground/80"
                dir="rtl"
              >
                إشارات تصنيف الشخص
              </div>
              <table className="w-full text-[11px]" dir="rtl">
                <thead>
                  <tr className="border-b border-border/30 text-muted-foreground">
                    <th className="py-1 text-right">الإشارة</th>
                    <th className="py-1 text-right">القيمة</th>
                    <th className="py-1 text-right">دليل</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(
                    candidate.person_class_signals.signals ?? {},
                  ).map(([k, sig]) => (
                    <tr key={k} className="border-b border-border/20">
                      <td className="py-1.5 font-mono" dir="ltr">
                        {k}
                      </td>
                      <td className="py-1.5">{sig.score.toFixed(3)}</td>
                      <td className="py-1.5 text-muted-foreground" dir="auto">
                        {(sig.evidence ?? []).join(" · ").slice(0, 80) ||
                          "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="py-2 font-semibold">composite</td>
                    <td className="py-2 font-semibold text-violet-300">
                      {candidate.person_class_signals.composite.toFixed(3)}
                    </td>
                    <td className="py-2 text-muted-foreground">
                      {candidate.person_class_signals.positive_count} إشارات
                      موجبة · {candidate.person_class_signals.classifier_version}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Attribute signal breakdown */}
          {candidate.attribute_confidences && (
            <div className="mb-4">
              <div
                className="mb-2 text-[11px] font-semibold text-foreground/80"
                dir="rtl"
              >
                تفصيل إشارات السمات
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {(["nationality", "gender"] as const).map((axis) => {
                  const a = candidate.attribute_confidences![axis]
                  return (
                    <div
                      key={axis}
                      className="rounded-lg border border-border/30 bg-background/40 p-3"
                    >
                      <div
                        className="mb-2 flex items-center justify-between text-[11px]"
                        dir="rtl"
                      >
                        <span className="font-semibold">
                          {axis === "nationality" ? "الجنسية" : "الجنس"}
                        </span>
                        <span className="rounded-md bg-background/60 px-1.5 py-0.5 font-mono text-[10px]">
                          {a.value ?? "—"}@{a.confidence.toFixed(2)}
                        </span>
                      </div>
                      <div className="space-y-1 text-[10.5px]">
                        {Object.entries(a.signal_breakdown ?? {}).map(
                          ([sk, sv]) => (
                            <div
                              key={sk}
                              className="flex items-center justify-between"
                            >
                              <span className="font-mono text-muted-foreground" dir="ltr">
                                {sk}
                              </span>
                              <span>{Number(sv).toFixed(3)}</span>
                            </div>
                          ),
                        )}
                      </div>
                      {(a.evidence ?? []).length > 0 && (
                        <div
                          className="mt-2 border-t border-border/20 pt-2 text-[10px] text-muted-foreground"
                          dir="auto"
                        >
                          {(a.evidence ?? []).slice(0, 4).join(" · ")}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Evidence bundle */}
          {candidate.evidence_bundle?.citations &&
            candidate.evidence_bundle.citations.length > 0 && (
              <div className="mb-2">
                <div
                  className="mb-2 text-[11px] font-semibold text-foreground/80"
                  dir="rtl"
                >
                  حزمة الأدلة المختارة (
                  {candidate.evidence_bundle.platform_diversity} منصّات)
                </div>
                <div className="space-y-1.5">
                  {candidate.evidence_bundle.citations.map((c, i) => (
                    <a
                      key={i}
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md border border-violet-500/15 bg-background/40 px-2 py-1.5 text-[11px] transition-colors hover:bg-violet-500/10"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate" dir="auto">
                          {c.title ?? c.url}
                        </span>
                        <span
                          className="shrink-0 rounded-md border border-violet-500/30 bg-violet-500/5 px-1 py-0 text-[9px] uppercase text-violet-300"
                          dir="ltr"
                        >
                          {c.axis}
                        </span>
                      </div>
                      <div
                        className="mt-0.5 text-[10px] text-muted-foreground"
                        dir="rtl"
                      >
                        {c.platform} · {c.supports}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

          {/* Drop reason */}
          {candidate.dropped_reason && (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 px-3 py-2 text-[11px] text-rose-300">
              <strong>سبب الإسقاط:</strong> {candidate.dropped_reason}
            </div>
          )}
        </section>
      )}

      {/* Run context */}
      {run && (
        <section className="rounded-xl border border-border/30 bg-card/40 p-4 text-[11px]" dir="rtl">
          <h2 className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-muted-foreground">
            <Compass className="h-3.5 w-3.5" />
            سياق التشغيل
          </h2>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 md:grid-cols-2">
            <Field label="حالة التشغيل" value={run.status} />
            <Field
              label="عدد المرشّحين في التشغيل"
              value={String(run.candidate_count)}
            />
            {run.source_config?.gender && (
              <Field label="فلتر الجنس" value={run.source_config.gender} />
            )}
            {run.source_config?.nationality && (
              <Field
                label="فلتر الجنسية"
                value={run.source_config.nationality}
              />
            )}
            {run.source_config?.source_episode_working_title && (
              <Field
                label="حلقة المصدر"
                value={run.source_config.source_episode_working_title.slice(
                  0,
                  60,
                )}
              />
            )}
            {run.source_config?.hiddenness_preference && (
              <Field
                label="ميل الذوق"
                value={run.source_config.hiddenness_preference}
              />
            )}
            <Field label="بدأ في" value={formatDateTime(run.created_at)} />
            {run.completed_at && (
              <Field
                label="اكتمل في"
                value={formatDateTime(run.completed_at)}
              />
            )}
          </dl>
        </section>
      )}

      {/* Raw row IDs (for support / debug) */}
      <section
        className="rounded-xl border border-border/20 bg-muted/5 p-3 text-[10px] text-muted-foreground"
        dir="ltr"
      >
        <div className="mb-1 flex items-center gap-1 font-semibold">
          <Database className="h-3 w-3" />
          row identifiers
        </div>
        <div>candidate_id: {candidate.id}</div>
        {candidate.discovery_run_id && (
          <div>discovery_run_id: {candidate.discovery_run_id}</div>
        )}
        {candidate.target_episode_candidate_id && (
          <div>
            target_episode_candidate_id:{" "}
            {candidate.target_episode_candidate_id}
          </div>
        )}
        {candidate.promoted_guest_id && (
          <div>promoted_guest_id: {candidate.promoted_guest_id}</div>
        )}
      </section>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium" dir="auto">
        {value}
      </dd>
    </div>
  )
}
