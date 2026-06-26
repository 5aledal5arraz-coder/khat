import Link from "next/link"
import { Sparkles, TrendingUp, AlertCircle, Inbox } from "lucide-react"
import { AdminPageHeader } from "../components/admin-page-header"
import { getCastingPipeline, type CastingLead } from "@/lib/guest-crm/pipeline"
import type { GuestApplicationStatus } from "@/types/database"

export const dynamic = "force-dynamic"

const STAGES: { id: GuestApplicationStatus; label: string; accent: string }[] = [
  { id: "new", label: "جديدة", accent: "text-sky-700 bg-sky-50 border-sky-200" },
  { id: "under_review", label: "قيد المراجعة", accent: "text-violet-700 bg-violet-50 border-violet-200" },
  { id: "accepted", label: "مقبول", accent: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { id: "consider_later", label: "للاحتفاظ", accent: "text-amber-700 bg-amber-50 border-amber-200" },
  { id: "rejected", label: "معتذر", accent: "text-rose-700 bg-rose-50 border-rose-200" },
]

const REC_LABEL: Record<string, string> = {
  strong_accept: "قبول قوي",
  accept: "قبول",
  consider_later: "للاحتفاظ",
  reject: "اعتذار",
}

function fitColor(score: number | null): string {
  if (score == null) return "text-slate-400 bg-slate-100"
  if (score >= 75) return "text-emerald-700 bg-emerald-100"
  if (score >= 45) return "text-amber-700 bg-amber-100"
  return "text-rose-700 bg-rose-100"
}

function ageLabel(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (d <= 0) return "اليوم"
  if (d === 1) return "أمس"
  return `منذ ${d} يوم`
}

function CastingCard({ lead }: { lead: CastingLead }) {
  return (
    <Link
      href={`/admin/casting/${lead.id}`}
      className="block rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.2)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-slate-900">{lead.name}</p>
          <p className="truncate text-[11px] text-slate-500">{lead.country}</p>
        </div>
        {lead.fit_score != null ? (
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${fitColor(lead.fit_score)}`}>
            {lead.fit_score}
          </span>
        ) : lead.analysis_status === "generating" ? (
          <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-600">يُقيّم…</span>
        ) : null}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-slate-600">{lead.story_idea}</p>
      <div className="mt-2 flex items-center justify-between">
        {lead.recommendation ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-primary">
            <Sparkles className="h-2.5 w-2.5" />
            {REC_LABEL[lead.recommendation]}
          </span>
        ) : (
          <span />
        )}
        <span className="text-[10px] text-slate-400">{ageLabel(lead.created_at)}</span>
      </div>
    </Link>
  )
}

export default async function CastingBoardPage() {
  const leads = await getCastingPipeline()

  const byStage = new Map<GuestApplicationStatus, CastingLead[]>()
  for (const s of STAGES) byStage.set(s.id, [])
  for (const l of leads) (byStage.get(l.status) ?? byStage.get("new"))!.push(l)

  const total = leads.length
  const active = leads.filter((l) => l.status === "new" || l.status === "under_review").length
  const ready = leads.filter(
    (l) => l.analysis_status === "ready" && (l.recommendation === "strong_accept" || l.recommendation === "accept"),
  ).length
  const awaiting = leads.filter((l) => l.status === "new" && l.analysis_status !== "ready").length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="ترشيح الضيوف"
        description="كل طلبات الضيافة في لوحة واحدة — مع تقييم الترشيح والإجراء الموصى به لكل قصة."
        badge="ai"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Inbox} label="إجمالي الطلبات" value={total} tone="neutral" />
        <Stat icon={TrendingUp} label="قيد التقييم" value={active} tone="neutral" />
        <Stat icon={Sparkles} label="جاهزة للدعوة" value={ready} tone="good" />
        <Stat icon={AlertCircle} label="بانتظار التقييم" value={awaiting} tone={awaiting > 0 ? "warn" : "neutral"} />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const items = byStage.get(stage.id) ?? []
          return (
            <div key={stage.id} className="w-[268px] shrink-0">
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
                  items.map((lead) => <CastingCard key={lead.id} lead={lead} />)
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
