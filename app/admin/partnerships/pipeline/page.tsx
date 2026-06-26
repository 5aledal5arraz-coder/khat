import Link from "next/link"
import { Sparkles, TrendingUp, AlertCircle, Inbox } from "lucide-react"
import { AdminPageHeader } from "../../components/admin-page-header"
import { getPipelineLeads, type PipelineLead } from "@/lib/partnership-pipeline"
import type { SponsorshipStatus } from "@/types/database"

export const dynamic = "force-dynamic"

const STAGES: { id: SponsorshipStatus; label: string; accent: string }[] = [
  { id: "new", label: "جديدة", accent: "text-sky-700 bg-sky-50 border-sky-200" },
  { id: "reviewing", label: "قيد المراجعة", accent: "text-violet-700 bg-violet-50 border-violet-200" },
  { id: "proposal_sent", label: "أُرسل العرض", accent: "text-amber-700 bg-amber-50 border-amber-200" },
  { id: "negotiation", label: "تفاوض", accent: "text-orange-700 bg-orange-50 border-orange-200" },
  { id: "confirmed", label: "مؤكّدة", accent: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { id: "declined", label: "مرفوضة", accent: "text-rose-700 bg-rose-50 border-rose-200" },
]

const BUDGET_LABELS: Record<string, string> = {
  below_500: "أقل من 500",
  "500_1000": "500–1,000",
  "1000_3000": "1,000–3,000",
  "3000_plus": "أكثر من 3,000",
  flexible: "مرن",
}

const VERDICT_LABEL: Record<string, string> = {
  strong_fit: "توافق قوي",
  possible_fit: "توافق ممكن",
  weak_fit: "توافق ضعيف",
  not_recommended: "غير موصى",
}

const ACTION_LABEL: Record<string, string> = {
  advance: "المضي لعرض",
  request_info: "اطلب معلومات",
  nurture: "أبقِه دافئًا",
  decline: "اعتذر بلطف",
}

function fitColor(score: number | null): string {
  if (score == null) return "text-slate-400 bg-slate-100"
  if (score >= 70) return "text-emerald-700 bg-emerald-100"
  if (score >= 40) return "text-amber-700 bg-amber-100"
  return "text-rose-700 bg-rose-100"
}

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const d = Math.floor(ms / 86_400_000)
  if (d <= 0) return "اليوم"
  if (d === 1) return "أمس"
  return `منذ ${d} يوم`
}

function LeadCard({ lead }: { lead: PipelineLead }) {
  return (
    <Link
      href={`/admin/submissions?tab=sponsors&lead=${lead.id}`}
      className="block rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.2)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-900">{lead.company_name}</p>
          <p className="truncate text-[11px] text-slate-500">{lead.industry}</p>
        </div>
        {lead.fit_score != null ? (
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${fitColor(lead.fit_score)}`}>
            {lead.fit_score}
          </span>
        ) : lead.analysis_status === "generating" ? (
          <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-600">يُقيّم…</span>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {lead.recommended_action && (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <Sparkles className="h-2.5 w-2.5" />
            {ACTION_LABEL[lead.recommended_action]}
          </span>
        )}
        {lead.fit_verdict && (
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
            {VERDICT_LABEL[lead.fit_verdict]}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
        <span>{BUDGET_LABELS[lead.budget_range] || lead.budget_range} د.ك</span>
        <span>{ageLabel(lead.created_at)}</span>
      </div>
    </Link>
  )
}

export default async function PartnershipPipelinePage() {
  const leads = await getPipelineLeads()

  const byStage = new Map<SponsorshipStatus, PipelineLead[]>()
  for (const s of STAGES) byStage.set(s.id, [])
  for (const l of leads) (byStage.get(l.status) ?? byStage.get("new"))!.push(l)

  const total = leads.length
  const active = leads.filter((l) => l.status !== "confirmed" && l.status !== "declined").length
  const needAction = leads.filter(
    (l) => l.analysis_status === "ready" && (l.recommended_action === "advance" || l.recommended_action === "request_info"),
  ).length
  const awaitingTriage = leads.filter((l) => l.status === "new" && l.analysis_status !== "ready").length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="خط الشراكات"
        description="كل طلبات الشراكة في لوحة واحدة — مع تقييم الذكاء الاصطناعي والإجراء الموصى به لكل طلب."
      />

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Inbox} label="إجمالي الطلبات" value={total} tone="neutral" />
        <Stat icon={TrendingUp} label="نشطة" value={active} tone="neutral" />
        <Stat icon={Sparkles} label="جاهزة لإجراء" value={needAction} tone="good" />
        <Stat icon={AlertCircle} label="بانتظار التقييم" value={awaitingTriage} tone={awaitingTriage > 0 ? "warn" : "neutral"} />
      </div>

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const items = byStage.get(stage.id) ?? []
          return (
            <div key={stage.id} className="w-[260px] shrink-0">
              <div className={`mb-3 flex items-center justify-between rounded-lg border px-3 py-1.5 text-[12px] font-semibold ${stage.accent}`}>
                <span>{stage.label}</span>
                <span className="tabular-nums opacity-70">{items.length}</span>
              </div>
              <div className="space-y-2.5">
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-[11px] text-slate-400">
                    لا طلبات
                  </p>
                ) : (
                  items.map((lead) => <LeadCard key={lead.id} lead={lead} />)
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ElementType
  label: string
  value: number
  tone: "neutral" | "good" | "warn"
}) {
  const toneCls =
    tone === "good" ? "bg-emerald-50 text-emerald-700" : tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-slate-600">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${toneCls}`}>
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="mt-2 text-[26px] font-bold leading-none tabular-nums text-slate-900">{value}</div>
    </div>
  )
}
