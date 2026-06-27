import Link from "next/link"
import { Sparkles, Inbox, Send, AlertCircle, UserPlus, Lightbulb, MessageCircleQuestion, Wand2 } from "lucide-react"
import { AdminPageHeader } from "../components/admin-page-header"
import { listCommunityContributions } from "@/lib/community/queries"
import { communityRef } from "@/lib/community-ref"
import type { CommunityContribution, CommunityContributionStatus } from "@/types/database"

export const dynamic = "force-dynamic"

const STAGES: { id: CommunityContributionStatus; label: string; accent: string }[] = [
  { id: "new", label: "جديدة", accent: "text-sky-700 bg-sky-50 border-sky-200" },
  { id: "reviewing", label: "قيد المراجعة", accent: "text-violet-700 bg-violet-50 border-violet-200" },
  { id: "accepted", label: "مقبولة", accent: "text-emerald-700 bg-emerald-50 border-emerald-200" },
  { id: "routed", label: "مُوجّهة لخط برين", accent: "text-indigo-700 bg-indigo-50 border-indigo-200" },
  { id: "declined", label: "مرفوضة", accent: "text-rose-700 bg-rose-50 border-rose-200" },
]

const TYPE_META: Record<string, { label: string; icon: React.ElementType }> = {
  guest: { label: "ضيف", icon: UserPlus },
  topic: { label: "فكرة حلقة", icon: Lightbulb },
  question: { label: "سؤال", icon: MessageCircleQuestion },
  concept: { label: "فكرة محتوى", icon: Sparkles },
  improvement: { label: "تحسين", icon: Wand2 },
}

const ACTION_LABEL: Record<string, string> = {
  advance: "المضي قدمًا",
  request_info: "اطلب تفاصيل",
  nurture: "احتفظ بها",
  decline: "اعتذر",
}

function qualityColor(s: number | null): string {
  if (s == null) return "text-slate-400 bg-slate-100"
  if (s >= 70) return "text-emerald-700 bg-emerald-100"
  if (s >= 45) return "text-amber-700 bg-amber-100"
  return "text-rose-700 bg-rose-100"
}
function ageLabel(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  return d <= 0 ? "اليوم" : d === 1 ? "أمس" : `منذ ${d} يوم`
}

function Card({ c }: { c: CommunityContribution }) {
  const tm = TYPE_META[c.type] || { label: c.type, icon: Sparkles }
  const Icon = tm.icon
  return (
    <Link
      href={`/admin/community/${c.id}`}
      className="block rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.2)]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
            <Icon className="h-2.5 w-2.5" /> {tm.label}
          </span>
          <p className="mt-1 truncate text-[13px] font-semibold text-slate-900">{c.title}</p>
        </div>
        {c.quality_score != null ? (
          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${qualityColor(c.quality_score)}`}>{c.quality_score}</span>
        ) : c.triage_status === "generating" ? (
          <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-600">يُفرز…</span>
        ) : null}
      </div>
      {c.ai_summary && <p className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed text-slate-600">{c.ai_summary}</p>}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {c.spam && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-600">عبثية؟</span>}
          {c.recommended_action && !c.spam && (
            <span className="inline-flex items-center gap-1 rounded-md bg-primary/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-primary">
              <Sparkles className="h-2.5 w-2.5" /> {ACTION_LABEL[c.recommended_action]}
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400">{communityRef(c.id)} · {ageLabel(c.created_at)}</span>
      </div>
    </Link>
  )
}

export default async function CommunityBoardPage() {
  const all = await listCommunityContributions()
  const byStage = new Map<CommunityContributionStatus, CommunityContribution[]>()
  for (const s of STAGES) byStage.set(s.id, [])
  for (const c of all) (byStage.get(c.status) ?? byStage.get("reviewing"))!.push(c)

  const total = all.length
  const pending = all.filter((c) => c.status === "new" || c.status === "reviewing").length
  const strong = all.filter((c) => c.triage_status === "ready" && !c.spam && (c.quality_score ?? 0) >= 70).length
  const routed = all.filter((c) => c.status === "routed").length

  return (
    <div className="space-y-6">
      <AdminPageHeader title="مساهمات المجتمع" description="كل ما يقترحه جمهور خط — مفروزًا بالذكاء، جاهزًا للتوجيه إلى خط برين." badge="ai" />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Inbox} label="إجمالي" value={total} tone="neutral" />
        <Stat icon={AlertCircle} label="بانتظار المراجعة" value={pending} tone={pending > 0 ? "warn" : "neutral"} />
        <Stat icon={Sparkles} label="قوية وجاهزة" value={strong} tone="good" />
        <Stat icon={Send} label="مُوجّهة لخط برين" value={routed} tone="neutral" />
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGES.map((stage) => {
          const items = byStage.get(stage.id) ?? []
          return (
            <div key={stage.id} className="w-[266px] shrink-0">
              <div className={`mb-3 flex items-center justify-between rounded-lg border px-3 py-1.5 text-[12px] font-semibold ${stage.accent}`}>
                <span>{stage.label}</span>
                <span className="tabular-nums opacity-70">{items.length}</span>
              </div>
              <div className="space-y-2.5">
                {items.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-[11px] text-slate-400">لا مساهمات</p>
                ) : (
                  items.map((c) => <Card key={c.id} c={c} />)
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: number; tone: "neutral" | "good" | "warn" }) {
  const cls = tone === "good" ? "bg-emerald-50 text-emerald-700" : tone === "warn" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-slate-600">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${cls}`}><Icon className="h-3.5 w-3.5" /></span>
      </div>
      <div className="mt-2 text-[26px] font-bold leading-none tabular-nums text-slate-900">{value}</div>
    </div>
  )
}
