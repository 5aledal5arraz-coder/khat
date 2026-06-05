/**
 * Khat Brain Phase 5 + UX-11 — /admin/discovery
 *
 * Hidden Guest Discovery surface. Operators land here either from the
 * sidebar (generic discovery) or from an episode's Guest tab (which
 * passes `?eirId=…` to scope the run to that episode's season + auto-
 * seed the prompt). UX-11 adds env-config + worker-status warnings,
 * episode-context badge, and a manual "rank now" button per run.
 */

import Link from "next/link"
import {
  Sparkles,
  CheckCircle2,
  XCircle,
  Bookmark,
  Activity,
  Compass,
} from "lucide-react"
import { listDiscoveryRuns, listCandidates } from "@/lib/discovery"
import { runStatusLabel } from "@/lib/operator-language"
import { db } from "@/lib/db"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { eq } from "drizzle-orm"
import { formatDateTime } from "@/lib/shared/formatters"
import { StartRunForm } from "./start-run-form"
import { CandidateRow } from "./candidate-row"
import { DiscoveryEnvWarning } from "./env-warning"
import { WorkerStatusWarning } from "./worker-warning"
import { RankNowButton } from "./rank-now-button"
import { KHAT_TOPIC_DOMAIN_LABEL } from "@/types/khat-map"

export const dynamic = "force-dynamic"

interface SearchParams {
  eirId?: string
}

export default async function DiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const { eirId } = await searchParams

  // UX-11 — when arriving with `?eirId=…`, resolve a default seed
  // prompt from the EIR so the operator doesn't have to type it. The
  // action will re-derive the same prompt server-side as a safety
  // net, but pre-filling the form is the operator-facing fix.
  let defaultSeedPrompt: string | null = null
  let defaultEpisodeTitle: string | null = null
  // CR-2 — surface the season's hard guest filters so the operator
  // sees the constraint that WILL be applied. Resolved from the EIR's
  // season's editorial_controls.guest_filters.
  let inheritedGender: "male" | "female" | null = null
  let inheritedNationality: "kuwaiti" | "non_kuwaiti" | null = null
  if (eirId && db) {
    const [eir] = await db
      .select({
        working_title: episodeIntelligenceRecords.working_title,
        editorial_intent: episodeIntelligenceRecords.editorial_intent,
        topic_domain: episodeIntelligenceRecords.topic_domain,
        season_id: episodeIntelligenceRecords.season_id,
      })
      .from(episodeIntelligenceRecords)
      .where(eq(episodeIntelligenceRecords.id, eirId))
      .limit(1)
    if (eir) {
      defaultEpisodeTitle = eir.working_title
      const intent = (eir.editorial_intent ?? {}) as Record<string, unknown>
      const hook =
        typeof intent.hook === "string" ? intent.hook.trim() : ""
      const whyMatters =
        typeof intent.why_matters === "string"
          ? intent.why_matters.trim()
          : ""
      const parts: string[] = [
        `بحث عن ضيف للحلقة: ${eir.working_title}`,
      ]
      if (eir.topic_domain) {
        // CR-6 — Arabic label, not raw enum (was "identity_masculinity").
        const arLabel =
          KHAT_TOPIC_DOMAIN_LABEL[
            eir.topic_domain as keyof typeof KHAT_TOPIC_DOMAIN_LABEL
          ]?.label ?? eir.topic_domain
        parts.push(`مجال: ${arLabel}`)
      }
      if (hook) parts.push(`الخطّاف: ${hook}`)
      if (whyMatters) parts.push(`لماذا يهم: ${whyMatters}`)
      defaultSeedPrompt = parts.join(" · ").slice(0, 1200)

      // CR-2 — resolve the season-level filters.
      if (eir.season_id) {
        const { khatMapSeasons } = await import("@/lib/db/schema/khat-map")
        const [seasonRow] = await db
          .select({ editorial_controls: khatMapSeasons.editorial_controls })
          .from(khatMapSeasons)
          .where(eq(khatMapSeasons.id, eir.season_id))
          .limit(1)
        const controls = seasonRow?.editorial_controls as
          | { guest_filters?: { gender?: string; nationality?: string } }
          | null
          | undefined
        const gf = controls?.guest_filters
        if (gf?.gender === "male" || gf?.gender === "female") {
          inheritedGender = gf.gender
        }
        if (gf?.nationality === "kuwaiti" || gf?.nationality === "non_kuwaiti") {
          inheritedNationality = gf.nationality
        }
      }
    }
  }

  const [runs, recent] = await Promise.all([
    listDiscoveryRuns({ limit: 12 }),
    listCandidates({ limit: 50 }),
  ])

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/5 via-violet-500/5 to-transparent p-6">
        <div className="absolute -top-8 -end-8 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-[11px] font-medium text-primary">
              <Compass className="h-3 w-3" />
              اكتشاف الضيوف الخفيين
            </div>
            <h1 className="text-2xl font-bold tracking-tight">اكتشاف الضيوف</h1>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              نبدأ من أنماط بشرية، لا من أسماء ولا من عدد المتابعين. النتائج
              الأولية تصل بمستوى أدلة، يتحقق منها الذكاء الاصطناعي، ثم تُرتَّب
              وفق ذوق خط.
            </p>
            {defaultEpisodeTitle && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-200">
                <Sparkles className="h-3 w-3" />
                <span>سياق الحلقة:</span>
                <span className="font-medium text-foreground/90" dir="auto">
                  {defaultEpisodeTitle.slice(0, 50)}
                </span>
              </div>
            )}
          </div>
          <StartRunForm
            defaultEirId={eirId ?? null}
            defaultSeedPrompt={defaultSeedPrompt}
            defaultEpisodeTitle={defaultEpisodeTitle}
            inheritedGender={inheritedGender}
            inheritedNationality={inheritedNationality}
          />
        </div>
      </div>

      {/* UX-11 — Env-config + worker warnings */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <DiscoveryEnvWarning />
        {/* WorkerStatusWarning may render null when no stuck jobs. */}
        <WorkerStatusWarning />
      </div>

      {/* Runs */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Activity className="h-4 w-4" />
          آخر التشغيلات
        </h2>
        {runs.length === 0 ? (
          <Empty text="لا توجد تشغيلات بعد. ابدأ تشغيلاً جديداً." />
        ) : (
          <div className="divide-y divide-border/30 rounded-xl border border-border/30 bg-card/40">
            {runs.map((r) => {
              const stuck =
                (r.status === "searching" ||
                  r.status === "verifying" ||
                  r.status === "seeding") &&
                Date.now() - new Date(r.created_at).getTime() > 60_000
              return (
                // RWA-P2 — make rows clickable to per-run audit page
                <Link
                  key={r.id}
                  href={`/admin/discovery/runs/${r.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 text-[13px] transition-colors hover:bg-violet-500/5"
                >
                  <RunStatusIcon status={r.status} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium" dir="auto">
                      {r.seed_prompt
                        ? r.seed_prompt.slice(0, 80)
                        : `تشغيل ${r.id.slice(0, 8)}`}
                    </div>
                    <div
                      className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-muted-foreground"
                      dir="rtl"
                    >
                      <span>{runStatusLabel(r.status)}</span>
                      <span>· {r.candidate_count} مرشّح</span>
                      {r.archetypes && (
                        <span>· {r.archetypes.length} نموذج</span>
                      )}
                      <span>· {formatDateTime(r.created_at)}</span>
                      {stuck && (
                        <span className="text-amber-400">
                          · انتظار طويل — تأكّد من العامل
                        </span>
                      )}
                    </div>
                    {r.error_message && (
                      <div
                        className="mt-0.5 truncate text-[10px] text-rose-400/80"
                        dir="auto"
                      >
                        {r.error_message}
                      </div>
                    )}
                  </div>
                  {(r.status === "searching" ||
                    r.status === "verifying") && (
                    <RankNowButton runId={r.id} />
                  )}
                  <code
                    className="text-[10px] text-muted-foreground/60"
                    dir="ltr"
                  >
                    {r.id.slice(0, 8)}
                  </code>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {/* Candidates */}
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <Sparkles className="h-4 w-4" />
          المرشّحون (مرتّبون حسب التقييم المركّب)
        </h2>
        {recent.length === 0 ? (
          <Empty text="لا توجد مرشّحون بعد. تأكّد من تهيئة مصادر البحث أعلاه ومن أنّ عامل المهام الخلفي شغّال." />
        ) : (
          <div className="space-y-2">
            {recent.map((c) => (
              <CandidateRow key={c.id} candidate={c} />
            ))}
          </div>
        )}
      </section>

      <div className="rounded-xl border border-border/30 bg-muted/5 p-4 text-[11px] text-muted-foreground">
        <strong>كيف تعمل:</strong> ابدأ تشغيلاً → الذكاء الاصطناعي يولّد أنماطاً
        بشرية → عوامل البحث تجمع أدلة من المنصات المُهيّأة → التحقق يلخّص الفرص
        والمخاطر → الترتيب يحسب التقييم النهائي. تجري العمليات في الخلفية
        تلقائياً.
      </div>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border/40 bg-muted/5 p-4 text-center text-[12px] text-muted-foreground/70">
      {text}
    </div>
  )
}

function RunStatusIcon({ status }: { status: string }) {
  if (status === "completed")
    return <CheckCircle2 className="h-4 w-4 text-emerald-400" />
  if (status === "failed") return <XCircle className="h-4 w-4 text-rose-400" />
  if (status === "cancelled")
    return <Bookmark className="h-4 w-4 text-muted-foreground" />
  return <Activity className="h-4 w-4 animate-pulse text-amber-400" />
}
