/**
 * UX-1 — `/admin/khat-brain` is the operator's home.
 *
 * Reads `lib/khat-brain/command-center.ts` for the system state and
 * `lib/khat-brain/next-action.ts` for the per-EIR "do this next" CTA.
 *
 * Layout priority (top → bottom):
 *   1. Hero with active counts
 *   2. ما الذي يحتاج انتباهك الآن؟ — Next Action queue
 *   3. Attention alerts
 *   4. Phase distribution
 *   5. Worked report (Phase 8)
 *   6. Market intelligence (Phase X-1)
 *   7. Collapsible: raw activity feeds (transitions / AI runs / jobs / etc.)
 */

import Link from "next/link"
import {
  Brain,
  AlertTriangle,
  AlertOctagon,
  Info,
  Activity,
  CheckCircle2,
  XCircle,
  Workflow,
  Sparkles,
  Compass,
  BarChart3,
  Clock,
  ExternalLink,
  ChevronDown,
  ListChecks,
} from "lucide-react"
import { getCommandCenterData } from "@/lib/khat-brain/command-center"
import { buildWorkedReport } from "@/lib/khat-brain/performance-learning"
import { buildNextActionQueue, type NextActionTone } from "@/lib/khat-brain/next-action"
import { getAiHealth } from "@/lib/ai-router/health"
import { getStaleEirs } from "@/lib/khat-brain/staleness"
import {
  jobStatusLabel,
  jobTypeLabel,
  runStatusLabel,
} from "@/lib/operator-language"
import { AiHealthBanner } from "./components/ai-health-banner"
import {
  EPISODE_PHASES,
  type EpisodePhase,
} from "@/lib/db/schema/eir"
import { formatDateTime } from "@/lib/shared/formatters"

export const dynamic = "force-dynamic"

const PHASE_LABEL: Record<EpisodePhase, string> = {
  idea: "فكرة",
  guest_discovery: "اكتشاف ضيف",
  guest_assigned: "ضيف معيّن",
  approved: "معتمدة",
  researching: "قيد البحث",
  prepared: "إعداد جاهز",
  ready_to_record: "جاهزة للتسجيل",
  recording: "قيد التسجيل",
  recorded: "مسجّلة",
  producing: "إنتاج",
  ready_to_publish: "جاهزة للنشر",
  published: "منشورة",
  analyzing: "تحليل",
  learned: "تم التعلّم",
  archived: "مؤرشفة",
}

export default async function CommandCenterPage() {
  const [data, worked, aiHealth, staleEirs] = await Promise.all([
    getCommandCenterData(),
    buildWorkedReport(),
    getAiHealth(),
    getStaleEirs(),
  ])

  const phaseEntries = EPISODE_PHASES.filter((p) => p !== "archived")
  const peak = Math.max(1, ...phaseEntries.map((p) => data.phase_counts[p] ?? 0))

  // UX-1 — derive "what should I do next?" from the recent-EIR feed.
  // The Command Center surfaces the top 8 items so the queue stays
  // scannable. If the operator wants the long tail they open the
  // Episodes view (UX-3, not yet shipped) — until then, they expand the
  // raw activity feed below.
  const queue = buildNextActionQueue(data.recent.eirs).slice(0, 8)

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* AI health banner — production-readiness fix #1. Renders only
          when state ≠ "ok"; sits above everything else so the operator
          sees the system status before they do anything. */}
      <AiHealthBanner snapshot={aiHealth} />

      {/* ── Hero ────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/5 via-violet-500/5 to-transparent p-6">
        <div className="absolute -top-8 -end-8 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary">
              <Brain className="h-3 w-3" />
              مركز قيادة Khat Brain
            </div>
            <h1 className="text-2xl font-bold tracking-tight">مركز القيادة</h1>
            <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
              لوحة تشغيلية واحدة لكل ما يحدث في المنصة الآن — حلقات نشطة،
              اكتشافات، أداء، ذكاء اصطناعي، ومهام خلفية. تتحدّث في كل تحميل.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="حلقات نشطة" value={data.totals.active_eirs} />
            <Stat label="اكتشافات مفتوحة" value={data.totals.discovery_runs_open} />
            <Stat
              label="مهام فاشلة"
              value={data.totals.failed_jobs_recent}
              tone={data.totals.failed_jobs_recent > 0 ? "warn" : "muted"}
            />
            <Stat
              label="تشغيلات AI فاشلة"
              value={data.totals.failed_ai_runs_recent}
              tone={data.totals.failed_ai_runs_recent > 0 ? "warn" : "muted"}
            />
          </div>
        </div>
      </div>

      {/* ── ما الذي يحتاج انتباهك الآن؟ — UX-1 Next Action queue ── */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <ListChecks className="h-4 w-4 text-violet-300" />
          ما الذي يحتاج انتباهك الآن؟
          <span className="rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-200">
            {queue.length}
          </span>
        </h2>
        {queue.length === 0 ? (
          <Empty text="لا توجد حلقات نشطة بانتظار قرار. ابدأ موسماً جديداً من «المواسم»." />
        ) : (
          <div className="space-y-2">
            {/* Phase 7 — at-a-glance summary above the per-item rows.
                Groups consecutive identical actions into one count chip so
                the operator sees "5 episodes need guest discovery, 2 need
                prep review" instead of scanning 7 rows individually. Per-
                row CTAs below remain untouched — clicking still goes to
                the specific episode. */}
            {(() => {
              const summary = new Map<string, { label: string; count: number; tone: NextActionTone }>()
              for (const it of queue) {
                const prev = summary.get(it.action.key)
                if (prev) prev.count++
                else summary.set(it.action.key, { label: it.action.label, count: 1, tone: it.action.tone })
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
                          ? "rounded-full bg-rose-500/10 px-2 py-0.5 text-rose-300"
                          : g.tone === "warning"
                            ? "rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-300"
                            : "rounded-full bg-violet-500/10 px-2 py-0.5 text-violet-200"
                      }
                    >
                      <span className="tabular-nums font-semibold">{g.count}</span>{" "}
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
                phase={item.eir.phase}
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

      {/* ── Stale EIR alerts — fix sprint #2.8 ─────────────────── */}
      {staleEirs.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            حلقات متوقفة
            <span className="rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px]">
              {staleEirs.length}
            </span>
            <span className="text-[10px] font-normal text-muted-foreground/70">
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
                      <span className="text-[10.5px] text-amber-300" dir="ltr">
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
                  <span className="shrink-0 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11.5px] font-medium text-amber-200">
                    حرّك ←
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ── Attention ──────────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <AlertTriangle className="h-4 w-4" />
          ما يحتاج اهتماماً
          <span className="rounded-md bg-muted/30 px-1.5 py-0.5 text-[10px]">
            {data.alerts.length}
          </span>
        </h2>
        {data.alerts.length === 0 ? (
          <Empty text="كل شيء يسير بسلاسة. لا توجد تنبيهات." />
        ) : (
          <div className="space-y-1.5">
            {data.alerts.map((a) => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </div>
        )}
      </section>

      {/* ── EIR phase distribution (simple bar cards) ──────────── */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <BarChart3 className="h-4 w-4" />
          توزيع الحلقات حسب المرحلة
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {phaseEntries.map((phase) => {
            const n = data.phase_counts[phase] ?? 0
            const pct = (n / peak) * 100
            return (
              <div
                key={phase}
                className={
                  "rounded-xl border p-3 transition-colors " +
                  (n > 0
                    ? "border-primary/30 bg-primary/5"
                    : "border-border/30 bg-muted/5 opacity-60")
                }
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {PHASE_LABEL[phase]}
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums">{n}</div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/30">
                  <div
                    className={"h-full " + (n > 0 ? "bg-primary" : "bg-transparent")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* UX-1 — collapse the 8 raw activity feeds. The Next Action queue
          above already covers what an operator usually needs from the
          recent-EIR list; the rest is debug-grade detail. */}
      <details className="group rounded-2xl border border-border/40 bg-card/20 p-4">
        <summary className="flex cursor-pointer select-none items-center gap-2 text-sm font-semibold text-muted-foreground">
          <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
          تفاصيل النشاط الخام
          <span className="text-[10.5px] text-muted-foreground/60">
            (transitions, jobs, AI runs, snapshots, candidates)
          </span>
        </summary>
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* ── Recent EIRs ──────────────────────────── */}
          <Section title="آخر الحلقات" icon={<Sparkles className="h-4 w-4" />}>
          {data.recent.eirs.length === 0 ? (
            <Empty text="لا توجد حلقات نشطة بعد." />
          ) : (
            <List>
              {data.recent.eirs.map((e) => (
                <Row key={e.id}>
                  <RowMain title={e.working_title}>
                    <span className="text-primary">{PHASE_LABEL[e.phase]}</span>
                    <span dir="ltr">{formatDateTime(e.updated_at)}</span>
                  </RowMain>
                </Row>
              ))}
            </List>
          )}
        </Section>

        {/* ── Phase transitions ──────────────────── */}
        <Section title="آخر التحولات" icon={<Workflow className="h-4 w-4" />}>
          {data.recent.transitions.length === 0 ? (
            <Empty text="لا توجد تحولات." />
          ) : (
            <List>
              {data.recent.transitions.map((t) => (
                <Row key={t.id}>
                  <div className="min-w-0 flex-1 text-[12px]">
                    <span className="text-muted-foreground/70">
                      {t.from_phase ? PHASE_LABEL[t.from_phase] : "—"}
                    </span>
                    <span className="mx-1 text-muted-foreground/40">→</span>
                    <span className="font-medium">{PHASE_LABEL[t.to_phase]}</span>
                    {t.reason && (
                      <span className="text-muted-foreground/60" dir="ltr">
                        {" · "}
                        {t.reason}
                      </span>
                    )}
                    <div className="mt-0.5 text-[10px] text-muted-foreground" dir="ltr">
                      {formatDateTime(t.created_at)}
                    </div>
                  </div>
                </Row>
              ))}
            </List>
          )}
        </Section>

        {/* ── Discovery runs ──────────────────────── */}
        <Section title="تشغيلات الاكتشاف" icon={<Compass className="h-4 w-4" />}>
          {data.recent.discovery_runs.length === 0 ? (
            <Empty text="لا توجد تشغيلات." />
          ) : (
            <List>
              {data.recent.discovery_runs.map((r) => (
                <Row key={r.id}>
                  <RunStatusIcon status={r.status} />
                  <RowMain title={r.seed_prompt ?? `تشغيل ${r.id.slice(0, 8)}`}>
                    <span>{runStatusLabel(r.status)}</span>
                    <span>· {r.candidate_count} مرشح</span>
                    {r.error_message && (
                      <span className="text-rose-400" dir="ltr">
                        {r.error_message}
                      </span>
                    )}
                  </RowMain>
                </Row>
              ))}
            </List>
          )}
        </Section>

        {/* ── Top candidates ──────────────────────── */}
        <Section title="أعلى المرشحين">
          {data.recent.top_candidates.length === 0 ? (
            <Empty text="لا توجد مرشحون مفتوحون." />
          ) : (
            <List>
              {data.recent.top_candidates.map((c) => (
                <Row key={c.id}>
                  <RowMain title={c.proposed_name ?? "(unnamed)"}>
                    {c.archetype && <span>{c.archetype}</span>}
                    {c.composite_score !== null && (
                      <span className="text-amber-300" dir="ltr">
                        {c.composite_score.toFixed(2)}
                      </span>
                    )}
                  </RowMain>
                </Row>
              ))}
            </List>
          )}
        </Section>

        {/* ── Recent promotions ───────────────────── */}
        <Section title="ترقيات أخيرة">
          {data.recent.promotions.length === 0 ? (
            <Empty text="لا توجد ترقيات." />
          ) : (
            <List>
              {data.recent.promotions.map((p) => (
                <Row key={p.id}>
                  <RowMain title={p.proposed_name ?? "(unnamed)"}>
                    {p.has_canonical_link ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        مرتبط
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        بدون رابط
                      </span>
                    )}
                    {p.promoted_guest_id && (
                      <Link
                        href={`/admin/guests/${p.promoted_guest_id}`}
                        className="inline-flex items-center gap-0.5 text-[10px] hover:text-foreground"
                      >
                        ضيف <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    )}
                    <span dir="ltr">{formatDateTime(p.updated_at)}</span>
                  </RowMain>
                </Row>
              ))}
            </List>
          )}
        </Section>

        {/* ── Performance snapshots ──────────────── */}
        <Section title="آخر لقطات الأداء" icon={<Activity className="h-4 w-4" />}>
          {data.recent.performance_snapshots.length === 0 ? (
            <Empty text="لا توجد لقطات." />
          ) : (
            <List>
              {data.recent.performance_snapshots.map((s) => (
                <Row key={s.id}>
                  <RowMain title={`EIR ${s.eir_id.slice(0, 8)}`}>
                    <span dir="ltr">
                      views: {s.view_count ? Number(s.view_count).toLocaleString() : "—"}
                    </span>
                    <span dir="ltr">{s.source}</span>
                    <span dir="ltr">{formatDateTime(s.snapshot_at)}</span>
                  </RowMain>
                </Row>
              ))}
            </List>
          )}
        </Section>

        {/* ── Recent AI runs ──────────────────────── */}
        <Section title="آخر تشغيلات الذكاء الاصطناعي" icon={<Activity className="h-4 w-4" />}>
          {data.recent.ai_runs.length === 0 ? (
            <Empty text="لا توجد تشغيلات." />
          ) : (
            <List>
              {data.recent.ai_runs.map((r) => (
                <Row key={r.id}>
                  {r.status === "succeeded" ? (
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 flex-shrink-0 text-rose-400" />
                  )}
                  <RowMain title={`${r.task_kind} · ${r.model_name}`}>
                    <span>{jobStatusLabel(r.status)}</span>
                    {r.latency_ms !== null && <span dir="ltr">{r.latency_ms}ms</span>}
                    {r.cost_usd !== null && (
                      <span dir="ltr">${r.cost_usd.toFixed(4)}</span>
                    )}
                    {r.error_class && (
                      <span className="text-rose-400" dir="ltr">
                        {r.error_class}
                      </span>
                    )}
                  </RowMain>
                </Row>
              ))}
            </List>
          )}
        </Section>

        {/* ── Recent jobs ─────────────────────────── */}
        <Section title="آخر المهام" icon={<Clock className="h-4 w-4" />}>
          {data.recent.jobs.length === 0 ? (
            <Empty text="لا توجد مهام." />
          ) : (
            <List>
              {data.recent.jobs.map((j) => (
                <Row key={j.id}>
                  <JobStatusIcon status={j.status} />
                  <RowMain title={jobTypeLabel(j.type)}>
                    <span>{jobStatusLabel(j.status)}</span>
                    {j.attempts > 1 && (
                      <span>
                        محاولة {j.attempts}/{j.max_attempts}
                      </span>
                    )}
                    {j.error_message && (
                      <span className="text-rose-400" dir="ltr">
                        {j.error_message.slice(0, 60)}
                      </span>
                    )}
                  </RowMain>
                </Row>
              ))}
            </List>
          )}
        </Section>
        </div>
      </details>

      {/* ── What worked / what didn't (Phase 8) ───────────────── */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          ماذا نجح / ماذا لم ينجح
          <span className="text-[10px] text-muted-foreground/60" dir="ltr">
            · n={worked.top_episodes.length + worked.weak_episodes.length}
          </span>
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SubSection title="أعلى الحلقات أداءً" empty={worked.top_episodes.length === 0}>
            <List>
              {worked.top_episodes.map((e) => (
                <Row key={e.eir_id}>
                  <RowMain title={e.working_title}>
                    {e.topic_domain && <span>{e.topic_domain}</span>}
                    <span dir="ltr">signal {e.signal_score.toFixed(2)}</span>
                    {e.views_at_28d !== null && (
                      <span dir="ltr">
                        views28d {Math.round(e.views_at_28d).toLocaleString()}
                      </span>
                    )}
                  </RowMain>
                </Row>
              ))}
            </List>
          </SubSection>

          <SubSection title="أضعف الحلقات أداءً" empty={worked.weak_episodes.length === 0}>
            <List>
              {worked.weak_episodes.map((e) => (
                <Row key={e.eir_id}>
                  <RowMain title={e.working_title}>
                    {e.topic_domain && <span>{e.topic_domain}</span>}
                    <span dir="ltr">signal {e.signal_score.toFixed(2)}</span>
                  </RowMain>
                </Row>
              ))}
            </List>
          </SubSection>

          <SubSection
            title="مجالات قوية"
            empty={worked.strong_topic_domains.length === 0}
            note="عينة دنيا: 3 حلقات لكل مجال"
          >
            <DimList items={worked.strong_topic_domains} />
          </SubSection>

          <SubSection title="مجالات ضعيفة" empty={worked.weak_topic_domains.length === 0}>
            <DimList items={worked.weak_topic_domains} />
          </SubSection>

          <SubSection title="أنواع حلقات قوية" empty={worked.strong_episode_types.length === 0}>
            <DimList items={worked.strong_episode_types} />
          </SubSection>

          <SubSection title="أنواع حلقات ضعيفة" empty={worked.weak_episode_types.length === 0}>
            <DimList items={worked.weak_episode_types} />
          </SubSection>
        </div>

        {worked.recommendations.length > 0 && (
          <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
            <h3 className="mb-2 text-[12px] font-semibold text-emerald-300">
              توصيات الموسم القادم
            </h3>
            <ul className="list-inside list-disc space-y-0.5 text-[12px] text-foreground/85">
              {worked.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Market Intelligence (Phase X Step 1) ────────────────────── */}
      <Section title="ذكاء السوق" icon={<Compass className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="إشارات (إجمالي)"
            value={data.market_intelligence.totals.signals_total}
          />
          <Stat
            label="إشارات (٧ أيام)"
            value={data.market_intelligence.totals.signals_last_7d}
          />
          <Stat
            label="عناقيد"
            value={data.market_intelligence.totals.clusters_total}
          />
          <Stat
            label="مصادر"
            value={Object.keys(data.market_intelligence.source_breakdown).length}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <SubSection
            title="أقوى العناقيد"
            empty={data.market_intelligence.top_clusters.length === 0}
            note="حسب عدد الإشارات"
          >
            <List>
              {data.market_intelligence.top_clusters.map((c) => (
                <Row key={`${c.label}|${c.language}`}>
                  <RowMain title={`${c.label} (${c.language})`}>
                    <span dir="ltr">n={c.signal_count}</span>
                    {c.dominant_emotions[0] && <span>· {c.dominant_emotions[0]}</span>}
                  </RowMain>
                </Row>
              ))}
            </List>
          </SubSection>

          <SubSection
            title="أقوى المحفّزات العاطفية"
            empty={data.market_intelligence.strongest_emotional_triggers.length === 0}
          >
            <List>
              {data.market_intelligence.strongest_emotional_triggers.map((t) => (
                <Row key={t.trigger}>
                  <RowMain title={t.trigger}>
                    <span dir="ltr">{t.count}</span>
                  </RowMain>
                </Row>
              ))}
            </List>
          </SubSection>

          <SubSection
            title="أمثلة عناوين"
            empty={data.market_intelligence.narrative_hooks.length === 0}
            note="عينة من كل عنقود"
          >
            <List>
              {data.market_intelligence.narrative_hooks.map((h, i) => (
                <Row key={`${h.label}-${i}`}>
                  <RowMain title={h.hook}>
                    <span>{h.label}</span>
                    <span dir="ltr">· {h.language}</span>
                  </RowMain>
                </Row>
              ))}
            </List>
          </SubSection>
        </div>

        {Object.keys(data.market_intelligence.source_breakdown).length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            {Object.entries(data.market_intelligence.source_breakdown).map(
              ([src, n]) => (
                <span
                  key={src}
                  className="rounded-full border border-border/50 px-2 py-0.5"
                  dir="ltr"
                >
                  {src}: {n}
                </span>
              ),
            )}
          </div>
        )}
      </Section>

      <div
        className="mt-6 text-[10px] text-muted-foreground"
      >
        تم التوليد في {formatDateTime(data.generated_at)}
      </div>
    </div>
  )
}

function SubSection({
  title,
  empty,
  note,
  children,
}: {
  title: string
  empty: boolean
  note?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {title}
        {note && (
          <span className="ms-2 text-[9.5px] font-normal text-muted-foreground/50">
            · {note}
          </span>
        )}
      </h3>
      {empty ? <Empty text="لا توجد بيانات كافية بعد." /> : children}
    </div>
  )
}

function DimList({
  items,
}: {
  items: Array<{ key: string; mean_score: number; sample_size: number; median_views: number | null }>
}) {
  return (
    <List>
      {items.map((d) => (
        <Row key={d.key}>
          <RowMain title={d.key}>
            <span dir="ltr">mean {d.mean_score.toFixed(2)}</span>
            <span dir="ltr">n={d.sample_size}</span>
            {d.median_views !== null && (
              <span dir="ltr">median views {Math.round(d.median_views).toLocaleString()}</span>
            )}
          </RowMain>
        </Row>
      ))}
    </List>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────

function Stat({
  label,
  value,
  tone = "muted",
}: {
  label: string
  value: number
  tone?: "muted" | "warn"
}) {
  return (
    <div
      className={
        "rounded-xl border p-3 text-center " +
        (tone === "warn" ? "border-amber-500/30 bg-amber-500/5" : "border-border/40 bg-background/40")
      }
    >
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div
        className={
          "mt-1 text-xl font-bold tabular-nums " +
          (tone === "warn" ? "text-amber-400" : "")
        }
      >
        {value}
      </div>
    </div>
  )
}

function AlertRow({ alert }: { alert: { level: string; message: string; href?: string } }) {
  const Icon =
    alert.level === "error" ? AlertOctagon : alert.level === "warn" ? AlertTriangle : Info
  const cls =
    alert.level === "error"
      ? "border-rose-500/30 bg-rose-500/5 text-rose-300"
      : alert.level === "warn"
        ? "border-amber-500/30 bg-amber-500/5 text-amber-300"
        : "border-sky-500/30 bg-sky-500/5 text-sky-300"
  const Body = (
    <div className={"flex items-center gap-2 rounded-lg border px-3 py-2 text-[12px] " + cls}>
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="min-w-0 flex-1">{alert.message}</span>
    </div>
  )
  return alert.href ? <Link href={alert.href}>{Body}</Link> : Body
}

function Section({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-muted-foreground">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

function List({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-border/30 rounded-xl border border-border/30 bg-card/40">
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-[12px]">{children}</div>
}

function RowMain({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium">{title}</div>
      <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground">{children}</div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/30 bg-muted/5 px-3 py-2.5 text-center text-[11px] text-muted-foreground/70">
      {text}
    </div>
  )
}

function NextActionRow({
  title,
  phase,
  phaseLabel,
  actionLabel,
  description,
  href,
  tone,
  updatedAt,
}: {
  title: string
  phase: EpisodePhase
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
        : "border-violet-500/20 bg-card/40"
  const toneCta =
    tone === "urgent"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
      : tone === "warning"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20"
        : "border-violet-500/40 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
  return (
    <Link
      href={href}
      className={
        "block rounded-2xl border p-3.5 transition-colors " + toneRing
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {phaseLabel}
            </span>
            <span className="text-[10.5px] text-muted-foreground/60" dir="ltr">
              {phase}
            </span>
            <span className="text-[10px] text-muted-foreground/50" dir="ltr">
              · {formatDateTime(updatedAt)}
            </span>
          </div>
          <h3 className="truncate text-[13px] font-semibold leading-tight">{title}</h3>
          <p className="mt-1 line-clamp-1 text-[11.5px] text-muted-foreground/85">
            {description}
          </p>
        </div>
        <span
          className={
            "shrink-0 rounded-xl border px-3 py-1.5 text-[11.5px] font-medium " +
            toneCta
          }
        >
          {actionLabel} ←
        </span>
      </div>
    </Link>
  )
}

function RunStatusIcon({ status }: { status: string }) {
  if (status === "completed") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-rose-400" />
  return <Activity className="h-3.5 w-3.5 animate-pulse text-amber-400" />
}

function JobStatusIcon({ status }: { status: string }) {
  if (status === "succeeded") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
  if (status === "failed" || status === "dead") return <XCircle className="h-3.5 w-3.5 text-rose-400" />
  if (status === "running") return <Activity className="h-3.5 w-3.5 animate-pulse text-amber-400" />
  return <Clock className="h-3.5 w-3.5 text-muted-foreground" />
}
