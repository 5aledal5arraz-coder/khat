"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Sparkles,
  TrendingUp,
  Target,
  Wallet,
  CheckCircle2,
  Clock,
  Plus,
  Pin,
  Trash2,
  Phone,
  Video,
  Users,
  Mail,
  FileText,
  ScrollText,
  Megaphone,
  AlertTriangle,
  Lightbulb,
  MessageSquare,
  Handshake,
  Loader2,
  ExternalLink,
  Brain,
  ShieldAlert,
  Swords,
  Coins,
  CheckCheck,
  CircleDot,
  Download,
} from "lucide-react"
import type {
  PartnerRecord,
  SponsorshipStatus,
  CrmTask,
  CrmNote,
  CrmActivity,
  PartnerMeeting,
} from "@/types/database"
import type { NextBestAction } from "@/lib/partnership-crm/record"
import { generateProposalPdf } from "@/lib/pdf/proposal-pdf"

const STAGES: { id: SponsorshipStatus; label: string }[] = [
  { id: "new", label: "جديدة" },
  { id: "reviewing", label: "مراجعة" },
  { id: "proposal_sent", label: "عرض مُرسل" },
  { id: "negotiation", label: "تفاوض" },
  { id: "confirmed", label: "مؤكّدة" },
  { id: "active", label: "حملة نشطة" },
  { id: "renewal", label: "تجديد" },
]

const BUDGET_LABELS: Record<string, string> = {
  below_500: "أقل من 500 د.ك",
  "500_1000": "500–1,000 د.ك",
  "1000_3000": "1,000–3,000 د.ك",
  "3000_plus": "أكثر من 3,000 د.ك",
  flexible: "ميزانية مرنة",
}

const VERDICT_LABEL: Record<string, string> = {
  strong_fit: "توافق قوي",
  possible_fit: "توافق ممكن",
  weak_fit: "توافق ضعيف",
  not_recommended: "غير موصى",
}

const TONE_STYLES: Record<NextBestAction["tone"], string> = {
  advance: "from-emerald-50 to-teal-50 border-emerald-200 text-emerald-900",
  info: "from-sky-50 to-indigo-50 border-sky-200 text-sky-900",
  warn: "from-amber-50 to-orange-50 border-amber-200 text-amber-900",
  neutral: "from-slate-50 to-slate-100 border-slate-200 text-slate-700",
}

type TabId = "overview" | "director" | "proposal" | "contract" | "campaign" | "email"

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "نظرة عامة" },
  { id: "director", label: "استراتيجية المدير" },
  { id: "proposal", label: "المقترح والعرض" },
  { id: "contract", label: "العقد" },
  { id: "campaign", label: "الحملات" },
  { id: "email", label: "البريد" },
]

function fmtDate(iso: string | null): string {
  if (!iso) return "—"
  try {
    return new Intl.DateTimeFormat("ar", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso))
  } catch {
    return "—"
  }
}
function isOverdue(iso: string | null): boolean {
  return iso ? new Date(iso).getTime() < Date.now() : false
}
function fmtRelative(iso: string | null): string {
  if (!iso) return ""
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.round(ms / 60000)
  if (min < 1) return "الآن"
  if (min < 60) return `قبل ${min} د`
  const h = Math.round(min / 60)
  if (h < 24) return `قبل ${h} س`
  const d = Math.round(h / 24)
  return `قبل ${d} ي`
}

export function PartnerRecordView({
  record,
  nextAction,
  reference,
}: {
  record: PartnerRecord
  nextAction: NextBestAction
  reference: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>("overview")

  const { lead, analysis } = record
  const leadId = lead.id

  async function call(path: string, method: string, body?: unknown): Promise<Response> {
    return fetch(path, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }
  function refresh() {
    startTransition(() => router.refresh())
  }
  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    try {
      await fn()
      refresh()
    } finally {
      setBusy(null)
    }
  }

  const changeStatus = (status: SponsorshipStatus) =>
    run(`status:${status}`, async () => {
      await call(`/api/admin/submissions/sponsors/${leadId}`, "PATCH", { status })
    })

  const runEvaluation = () =>
    run("evaluate", async () => {
      await call(`/api/admin/submissions/sponsors/${leadId}/analyze`, "POST", {})
    })

  const currentIdx = STAGES.findIndex((s) => s.id === lead.status)
  const isDeclined = lead.status === "declined"

  return (
    <div className="space-y-5">
      {/* Back */}
      <Link
        href="/admin/partnerships/pipeline"
        className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 transition-colors hover:text-slate-800"
      >
        <ArrowRight className="h-3.5 w-3.5" />
        خط الشراكات
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-orange-500/15 text-indigo-700">
              <Handshake className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{lead.company_name}</h1>
              <p className="mt-0.5 text-[13px] text-slate-500">
                {lead.industry} · {lead.contact_name} ({lead.job_title})
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600">{reference}</span>
                <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-slate-800">
                  <Mail className="h-3 w-3" /> {lead.email}
                </a>
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {lead.phone}
                </span>
                {lead.company_website && (
                  <a
                    href={lead.company_website}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" /> الموقع
                  </a>
                )}
              </div>
            </div>
          </div>
          <OwnerEditor leadId={leadId} owner={lead.owner} onSaved={refresh} call={call} />
        </div>

        {/* Stage stepper */}
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          {STAGES.map((s, i) => {
            const done = !isDeclined && i < currentIdx
            const current = s.id === lead.status
            return (
              <button
                key={s.id}
                onClick={() => changeStatus(s.id)}
                disabled={busy !== null}
                className={`group inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-all disabled:opacity-60 ${
                  current
                    ? "border-indigo-300 bg-indigo-600 text-white shadow-sm"
                    : done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {busy === `status:${s.id}` ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : done ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : (
                  <CircleDot className="h-3 w-3" />
                )}
                {s.label}
              </button>
            )
          })}
          <button
            onClick={() => changeStatus("declined")}
            disabled={busy !== null}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-all disabled:opacity-60 ${
              isDeclined
                ? "border-rose-300 bg-rose-600 text-white"
                : "border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:text-rose-600"
            }`}
          >
            {busy === "status:declined" ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
            اعتذار
          </button>
        </div>
      </div>

      {/* Next best action hero */}
      <div className={`rounded-2xl border bg-gradient-to-l p-4 ${TONE_STYLES[nextAction.tone]}`}>
        <div className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider opacity-70">الخطوة التالية الأفضل</p>
            <p className="mt-0.5 text-[15px] font-bold leading-snug">{nextAction.title}</p>
            <p className="mt-0.5 text-[13px] opacity-90">{nextAction.detail}</p>
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Target} label="درجة التوافق" value={analysis?.fit_score != null ? `${analysis.fit_score}` : "—"} sub={analysis?.fit_verdict ? VERDICT_LABEL[analysis.fit_verdict] : "بانتظار التقييم"} />
        <Stat icon={TrendingUp} label="احتمال الفوز" value={analysis?.win_probability != null ? `${analysis.win_probability}%` : "—"} sub={analysis?.quality ? `جودة ${analysis.quality}` : ""} />
        <Stat icon={Wallet} label="الميزانية" value={BUDGET_LABELS[lead.budget_range]?.split(" ")[0] || lead.budget_range} sub={BUDGET_LABELS[lead.budget_range]?.includes("د.ك") ? "د.ك" : ""} />
        <Stat icon={Clock} label="الجدول الزمني" value={lead.preferred_timeline || "—"} sub="" />
      </div>

      {/* Body: main + rail */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main */}
        <div className="space-y-4 lg:col-span-2">
          {/* Tabs */}
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-slate-50 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-all ${
                  tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "overview" && <OverviewTab record={record} onEvaluate={runEvaluation} busy={busy} />}
          {tab === "director" && <DirectorTab record={record} onEvaluate={runEvaluation} busy={busy} />}
          {tab === "proposal" && <ProposalTab record={record} run={run} busy={busy} call={call} reference={reference} />}
          {tab === "contract" && <ContractTab record={record} run={run} busy={busy} call={call} />}
          {tab === "campaign" && <CampaignTab record={record} run={run} busy={busy} call={call} />}
          {tab === "email" && <EmailTab record={record} />}
        </div>

        {/* Relationship rail */}
        <div className="space-y-4">
          <TasksCard record={record} run={run} busy={busy} call={call} />
          <NotesCard record={record} run={run} busy={busy} call={call} />
          <MeetingsCard record={record} run={run} busy={busy} call={call} />
          <TimelineCard activities={record.activities} />
        </div>
      </div>
    </div>
  )
}

/* ─── Shared bits ─────────────────────────────────────────────── */

function Stat({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1 truncate text-[20px] font-bold leading-tight text-slate-900">{value}</div>
      {sub && <div className="truncate text-[11px] text-slate-400">{sub}</div>}
    </div>
  )
}

function SectionCard({ title, icon: Icon, children, action }: { title: string; icon?: React.ElementType; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
          {Icon && <Icon className="h-4 w-4 text-slate-400" />}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-[12px] text-slate-400">{children}</p>
}

function Bullets({ items, tone = "slate" }: { items: string[]; tone?: "slate" | "emerald" | "rose" | "indigo" }) {
  const dot = { slate: "bg-slate-300", emerald: "bg-emerald-400", rose: "bg-rose-400", indigo: "bg-indigo-400" }[tone]
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-slate-700">
          <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  )
}

/* ─── Overview tab ────────────────────────────────────────────── */

function OverviewTab({ record, onEvaluate, busy }: { record: PartnerRecord; onEvaluate: () => void; busy: string | null }) {
  const { lead, analysis } = record
  const field = (label: string, v: string | null) =>
    v ? (
      <div>
        <p className="text-[11px] font-medium text-slate-400">{label}</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-slate-700">{v}</p>
      </div>
    ) : null
  return (
    <div className="space-y-4">
      <SectionCard title="الطلب" icon={FileText}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field("الهدف الرئيسي", lead.main_goal)}
          {field("الجمهور المستهدف", lead.target_audience)}
          {field("قيم العلامة", lead.brand_values)}
          {field("أهداف الحملة", lead.campaign_goals)}
          {field("التوقعات", lead.expectations)}
          {field("أنواع التعاون", lead.collaboration_types.join("، "))}
          {field("شراكات سابقة", lead.previous_partnerships)}
          {field("معلومات إضافية", lead.additional_info)}
        </div>
      </SectionCard>

      {analysis?.status === "ready" ? (
        <SectionCard title="البحث الحيّ عن الشركة" icon={Brain}>
          <div className="space-y-3">
            {field("ملخص البحث", analysis.research_summary)}
            {field("المنتجات/الخدمات", analysis.products_summary)}
            {field("السمعة", analysis.reputation)}
            {field("المكانة في السوق", analysis.market_position)}
            {field("الجمهور والتقاطع", analysis.audience_summary)}
            {analysis.research_sources.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-medium text-slate-400">المصادر ({analysis.research_sources.length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {analysis.research_sources.slice(0, 8).map((s, i) => (
                    <a
                      key={i}
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-[200px] items-center gap-1 truncate rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200"
                    >
                      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{s.title || s.url}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      ) : (
        <SectionCard title="تقييم الذكاء الاصطناعي" icon={Brain}>
          {analysis?.status === "generating" ? (
            <Empty>التقييم قيد التشغيل الآن…</Empty>
          ) : (
            <div className="text-center">
              <p className="mb-3 text-[13px] text-slate-500">لم يُجرَ تقييم بعد. شغّله للحصول على بحث حيّ ودرجة توافق واستراتيجية إغلاق.</p>
              <button
                onClick={onEvaluate}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60"
              >
                {busy === "evaluate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                شغّل تقييم المدير
              </button>
            </div>
          )}
        </SectionCard>
      )}
    </div>
  )
}

/* ─── Director tab ────────────────────────────────────────────── */

function DirectorTab({ record, onEvaluate, busy }: { record: PartnerRecord; onEvaluate: () => void; busy: string | null }) {
  const a = record.analysis
  if (!a || a.status !== "ready") {
    return (
      <SectionCard title="استراتيجية مدير الشراكات" icon={Brain}>
        <div className="text-center">
          <p className="mb-3 text-[13px] text-slate-500">شغّل التقييم أولًا ليضع المدير استراتيجية الإغلاق وتكتيكات التفاوض.</p>
          <button
            onClick={onEvaluate}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy === "evaluate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            شغّل تقييم المدير
          </button>
        </div>
      </SectionCard>
    )
  }
  return (
    <div className="space-y-4">
      {a.strategy_summary && (
        <SectionCard title="استراتيجية الإغلاق" icon={Brain}>
          <p className="text-[13px] leading-relaxed text-slate-700">{a.strategy_summary}</p>
          {a.fit_reasoning && <p className="mt-2 border-t border-slate-100 pt-2 text-[12.5px] leading-relaxed text-slate-500">{a.fit_reasoning}</p>}
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {a.opportunity_highlights.length > 0 && (
          <SectionCard title="نقاط القوة والفرص" icon={Lightbulb}>
            <Bullets items={a.opportunity_highlights} tone="emerald" />
          </SectionCard>
        )}
        {a.risk_flags.length > 0 && (
          <SectionCard title="المخاطر والتنبيهات" icon={ShieldAlert}>
            <Bullets items={a.risk_flags} tone="rose" />
          </SectionCard>
        )}
      </div>

      {a.talking_points.length > 0 && (
        <SectionCard title="نقاط الحوار المقنعة" icon={MessageSquare}>
          <Bullets items={a.talking_points} tone="indigo" />
        </SectionCard>
      )}

      {a.likely_objections.length > 0 && (
        <SectionCard title="الاعتراضات المتوقعة والردود" icon={Swords}>
          <div className="space-y-2.5">
            {a.likely_objections.map((o, i) => (
              <div key={i} className="rounded-xl border border-slate-150 bg-slate-50/60 p-3">
                <p className="text-[12.5px] font-semibold text-slate-800">“{o.objection}”</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">↳ {o.response}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {a.negotiation_tactics.length > 0 && (
        <SectionCard title="تكتيكات التفاوض" icon={Target}>
          <Bullets items={a.negotiation_tactics} tone="slate" />
        </SectionCard>
      )}

      <SectionCard title="الهيكل والتسعير الموصى به" icon={Coins}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {a.recommended_structure && (
            <div>
              <p className="text-[11px] font-medium text-slate-400">الهيكل المقترح</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-slate-700">{a.recommended_structure}</p>
            </div>
          )}
          {a.recommended_episodes != null && (
            <div>
              <p className="text-[11px] font-medium text-slate-400">عدد الحلقات</p>
              <p className="mt-0.5 text-[13px] text-slate-700">{a.recommended_episodes} حلقات</p>
            </div>
          )}
          {a.pricing_strategy && (
            <div className="sm:col-span-2">
              <p className="text-[11px] font-medium text-slate-400">استراتيجية التسعير</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-slate-700">{a.pricing_strategy}</p>
            </div>
          )}
          {a.budget_fit && (
            <div>
              <p className="text-[11px] font-medium text-slate-400">ملاءمة الميزانية</p>
              <p className="mt-0.5 text-[13px] text-slate-700">{a.budget_fit}</p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}

/* ─── Proposal & Offer tab ────────────────────────────────────── */

function ProposalTab({
  record,
  run,
  busy,
  call,
  reference,
}: {
  record: PartnerRecord
  run: (k: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  call: (p: string, m: string, b?: unknown) => Promise<Response>
  reference: string
}) {
  const { lead, proposal, offer } = record
  const generate = (tone: "formal" | "warm") =>
    run(`proposal:${tone}`, async () => {
      await call(`/api/admin/submissions/sponsors/${lead.id}/proposal`, "POST", { tone })
    })
  const canPdf = Boolean(offer?.body || offer?.packages?.length || proposal?.full_draft)
  const downloadPdf = () => {
    const ok = generateProposalPdf({ lead, proposal, offer, reference })
    if (!ok) alert("الرجاء السماح بالنوافذ المنبثقة لتنزيل الـ PDF.")
  }
  return (
    <div className="space-y-4">
      <SectionCard
        title="مقترح الشراكة"
        icon={ScrollText}
        action={
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={downloadPdf}
              disabled={!canPdf}
              title={canPdf ? "تنزيل المقترح كملف PDF بهوية خط" : "ولّد المقترح أولًا"}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              <Download className="h-3 w-3" />
              تنزيل PDF
            </button>
            <button
              onClick={() => generate("formal")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {busy === "proposal:formal" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {proposal ? "إعادة توليد" : "توليد"} (رسمي)
            </button>
            <button
              onClick={() => generate("warm")}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2.5 py-1 text-[11.5px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
            >
              ودّي
            </button>
          </div>
        }
      >
        {proposal?.status === "ready" && proposal.full_draft ? (
          <div className="space-y-2">
            {proposal.subject && <p className="text-[13px] font-semibold text-slate-800">{proposal.subject}</p>}
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-700">
              {proposal.edited_draft || proposal.full_draft}
            </pre>
          </div>
        ) : (
          <Empty>لا يوجد مقترح بعد — ولّده استنادًا إلى استراتيجية المدير.</Empty>
        )}
      </SectionCard>

      <SectionCard
        title="العرض على رابط سرّي"
        icon={ExternalLink}
        action={
          <Link
            href={`/admin/offers/${lead.id}`}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] font-medium text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="h-3 w-3" />
            محرّر العرض
          </Link>
        }
      >
        {offer ? (
          <div className="flex items-center justify-between text-[12.5px]">
            <span className={offer.published ? "text-emerald-700" : "text-slate-500"}>
              {offer.published ? "منشور" : "مسودّة"} · {offer.view_count} مشاهدة
            </span>
            {offer.published && (
              <a href={`/offer/${offer.token}`} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">
                فتح الرابط العام
              </a>
            )}
          </div>
        ) : (
          <Empty>لم يُنشأ عرض بعد — افتح محرّر العرض لإنشائه من المقترح.</Empty>
        )}
      </SectionCard>
    </div>
  )
}

/* ─── Contract tab ────────────────────────────────────────────── */

function ContractTab({
  record,
  run,
  busy,
  call,
}: {
  record: PartnerRecord
  run: (k: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  call: (p: string, m: string, b?: unknown) => Promise<Response>
}) {
  const { lead, contract } = record
  const [status, setStatus] = useState(contract?.status ?? "draft")
  const [value, setValue] = useState(contract?.value != null ? String(contract.value) : "")
  const [startDate, setStartDate] = useState(contract?.start_date ? contract.start_date.slice(0, 10) : "")
  const [endDate, setEndDate] = useState(contract?.end_date ? contract.end_date.slice(0, 10) : "")
  const [terms, setTerms] = useState(contract?.terms ?? "")

  const save = () =>
    run("contract", async () => {
      await call(`/api/admin/partnerships/${lead.id}/contract`, "PUT", {
        status,
        value: value ? Number(value) : null,
        start_date: startDate || null,
        end_date: endDate || null,
        terms,
      })
    })

  const STATUS_OPTS: { v: string; l: string }[] = [
    { v: "draft", l: "مسودّة" },
    { v: "sent", l: "مُرسل" },
    { v: "signed", l: "موقّع" },
    { v: "active", l: "ساري" },
    { v: "completed", l: "مكتمل" },
    { v: "expired", l: "منتهٍ" },
    { v: "cancelled", l: "ملغى" },
  ]
  return (
    <SectionCard title="إدارة العقد" icon={FileText}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">الحالة</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px]"
          >
            {STATUS_OPTS.map((o) => (
              <option key={o.v} value={o.v}>{o.l}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">القيمة (د.ك)</span>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px]"
            placeholder="—"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">تاريخ البدء</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px]" />
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-500">تاريخ الانتهاء</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px]" />
        </label>
        <label className="block sm:col-span-2">
          <span className="text-[11px] font-medium text-slate-500">البنود / الملاحظات</span>
          <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={4} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px]" />
        </label>
      </div>
      <div className="mt-3 flex items-center justify-between">
        {contract && <span className="text-[11px] text-slate-400">آخر تحديث {fmtRelative(contract.updated_at)}</span>}
        <button
          onClick={save}
          disabled={busy !== null}
          className="ms-auto inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {busy === "contract" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
          حفظ العقد
        </button>
      </div>
    </SectionCard>
  )
}

/* ─── Campaign tab ────────────────────────────────────────────── */

function CampaignTab({
  record,
  run,
  busy,
  call,
}: {
  record: PartnerRecord
  run: (k: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  call: (p: string, m: string, b?: unknown) => Promise<Response>
}) {
  const { lead, campaigns } = record
  const [title, setTitle] = useState("")
  const add = () =>
    run("campaign:add", async () => {
      if (!title.trim()) return
      await call(`/api/admin/partnerships/${lead.id}/campaigns`, "POST", { title: title.trim() })
      setTitle("")
    })
  return (
    <div className="space-y-4">
      <SectionCard title="الحملات والأداء" icon={Megaphone}>
        <div className="flex gap-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان حملة جديدة…"
            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[13px]"
          />
          <button
            onClick={add}
            disabled={busy !== null || !title.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy === "campaign:add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            إضافة
          </button>
        </div>
      </SectionCard>

      {campaigns.length === 0 ? (
        <Empty>لا توجد حملات بعد.</Empty>
      ) : (
        campaigns.map((c) => <CampaignCard key={c.id} leadId={lead.id} campaign={c} run={run} busy={busy} call={call} />)
      )}
    </div>
  )
}

function CampaignCard({
  leadId,
  campaign,
  run,
  busy,
  call,
}: {
  leadId: string
  campaign: PartnerRecord["campaigns"][number]
  run: (k: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  call: (p: string, m: string, b?: unknown) => Promise<Response>
}) {
  const [imp, setImp] = useState(String(campaign.metrics.impressions ?? ""))
  const [downloads, setDownloads] = useState(String(campaign.metrics.downloads ?? ""))
  const [clicks, setClicks] = useState(String(campaign.metrics.clicks ?? ""))
  const [conversions, setConversions] = useState(String(campaign.metrics.conversions ?? ""))

  const STATUS_OPTS: { v: string; l: string }[] = [
    { v: "planned", l: "مخطّطة" },
    { v: "live", l: "نشطة" },
    { v: "completed", l: "مكتملة" },
    { v: "cancelled", l: "ملغاة" },
  ]
  const saveMetrics = () =>
    run(`campaign:metrics:${campaign.id}`, async () => {
      await call(`/api/admin/partnerships/${leadId}/campaigns/${campaign.id}`, "PATCH", {
        metrics: { impressions: imp, downloads, clicks, conversions },
      })
    })
  const setStatus = (status: string) =>
    run(`campaign:status:${campaign.id}`, async () => {
      await call(`/api/admin/partnerships/${leadId}/campaigns/${campaign.id}`, "PATCH", { status })
    })
  const genReport = () =>
    run(`campaign:report:${campaign.id}`, async () => {
      await call(`/api/admin/partnerships/${leadId}/campaigns/${campaign.id}`, "PATCH", { action: "generate_report" })
    })

  const metricField = (label: string, v: string, set: (s: string) => void) => (
    <label className="block">
      <span className="text-[10.5px] font-medium text-slate-400">{label}</span>
      <input type="number" value={v} onChange={(e) => set(e.target.value)} className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1 text-[12.5px]" placeholder="0" />
    </label>
  )
  return (
    <SectionCard
      title={campaign.title}
      icon={Megaphone}
      action={
        <select
          value={campaign.status}
          onChange={(e) => setStatus(e.target.value)}
          disabled={busy !== null}
          className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[11.5px]"
        >
          {STATUS_OPTS.map((o) => (
            <option key={o.v} value={o.v}>{o.l}</option>
          ))}
        </select>
      }
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {metricField("مشاهدات", imp, setImp)}
        {metricField("تحميلات", downloads, setDownloads)}
        {metricField("نقرات", clicks, setClicks)}
        {metricField("تحويلات", conversions, setConversions)}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={saveMetrics}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1 text-[11.5px] font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {busy === `campaign:metrics:${campaign.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
          حفظ المؤشرات
        </button>
        <button
          onClick={genReport}
          disabled={busy !== null}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-3 py-1 text-[11.5px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
        >
          {busy === `campaign:report:${campaign.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          تقرير أداء بالذكاء
        </button>
      </div>
      {campaign.performance_summary && (
        <p className="mt-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 text-[12.5px] leading-relaxed text-slate-700">
          {campaign.performance_summary}
        </p>
      )}
    </SectionCard>
  )
}

/* ─── Email tab ───────────────────────────────────────────────── */

function EmailTab({ record }: { record: PartnerRecord }) {
  if (record.emails.length === 0) return <Empty>لا توجد رسائل بعد. كل بريد تُرسله من اللوحة يُسجَّل هنا.</Empty>
  return (
    <div className="space-y-2.5">
      {record.emails.map((e) => (
        <SectionCard key={e.id} title={e.subject || "(بدون عنوان)"} icon={Mail}>
          <div className="mb-1.5 flex items-center gap-2 text-[11px] text-slate-400">
            <span>{e.direction === "outbound" ? "صادر" : "وارد"}</span>
            <span>·</span>
            <span>{fmtDate(e.sent_at)}</span>
            {e.status === "failed" && <span className="text-rose-500">· فشل الإرسال</span>}
          </div>
          {e.body && <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-600">{e.body}</p>}
        </SectionCard>
      ))}
    </div>
  )
}

/* ─── Owner editor ────────────────────────────────────────────── */

function OwnerEditor({
  leadId,
  owner,
  onSaved,
  call,
}: {
  leadId: string
  owner: string | null
  onSaved: () => void
  call: (p: string, m: string, b?: unknown) => Promise<Response>
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(owner ?? "")
  const [saving, setSaving] = useState(false)
  const save = async () => {
    setSaving(true)
    try {
      await call(`/api/admin/partnerships/${leadId}/owner`, "PATCH", { owner: val })
      setEditing(false)
      onSaved()
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="text-end">
      <p className="text-[11px] font-medium text-slate-400">المسؤول عن العلاقة</p>
      {editing ? (
        <div className="mt-1 flex items-center gap-1">
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="admin:email"
            className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-[12px]"
          />
          <button onClick={save} disabled={saving} className="rounded-lg bg-slate-900 px-2 py-1 text-[11px] text-white disabled:opacity-60">
            {saving ? "…" : "حفظ"}
          </button>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="mt-1 text-[13px] font-medium text-slate-700 hover:text-indigo-600">
          {owner ? owner.replace(/^admin:/, "") : "+ تعيين مسؤول"}
        </button>
      )}
    </div>
  )
}

/* ─── Rail: Tasks ─────────────────────────────────────────────── */

function TasksCard({
  record,
  run,
  busy,
  call,
}: {
  record: PartnerRecord
  run: (k: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  call: (p: string, m: string, b?: unknown) => Promise<Response>
}) {
  const { lead, tasks } = record
  const [title, setTitle] = useState("")
  const [adding, setAdding] = useState(false)
  const open = tasks.filter((t) => t.status === "open")
  const done = tasks.filter((t) => t.status !== "open")

  const addTask = () =>
    run("task:add", async () => {
      if (!title.trim()) return
      await call(`/api/admin/partnerships/${lead.id}/tasks`, "POST", { title: title.trim() })
      setTitle("")
      setAdding(false)
    })
  const complete = (t: CrmTask) =>
    run(`task:done:${t.id}`, async () => {
      await call(`/api/admin/partnerships/${lead.id}/tasks/${t.id}`, "PATCH", { status: "done" })
    })

  return (
    <SectionCard
      title={`المهام (${open.length})`}
      icon={CheckCircle2}
      action={
        <button onClick={() => setAdding((s) => !s)} className="text-slate-400 hover:text-indigo-600">
          <Plus className="h-4 w-4" />
        </button>
      }
    >
      {adding && (
        <div className="mb-3 flex gap-1.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            autoFocus
            placeholder="مهمة جديدة…"
            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[12.5px]"
          />
          <button onClick={addTask} disabled={busy !== null} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11.5px] text-white disabled:opacity-60">
            {busy === "task:add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "إضافة"}
          </button>
        </div>
      )}
      {open.length === 0 && done.length === 0 ? (
        <Empty>لا مهام — أضف متابعة.</Empty>
      ) : (
        <div className="space-y-1.5">
          {open.map((t) => {
            const overdue = isOverdue(t.due_at)
            const ai = t.created_by === "ai:director"
            return (
              <div key={t.id} className="flex items-start gap-2 rounded-xl border border-slate-150 bg-white p-2.5">
                <button
                  onClick={() => complete(t)}
                  disabled={busy !== null}
                  className="mt-0.5 text-slate-300 transition-colors hover:text-emerald-600"
                  title="إنجاز"
                >
                  {busy === `task:done:${t.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium leading-snug text-slate-800">{t.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                    {ai && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-primary/[0.07] px-1 py-px font-medium text-primary">
                        <Sparkles className="h-2.5 w-2.5" /> المدير
                      </span>
                    )}
                    {t.due_at && (
                      <span className={overdue ? "text-rose-600" : "text-slate-400"}>
                        {overdue ? "متأخرة · " : "تستحق "}
                        {fmtDate(t.due_at)}
                      </span>
                    )}
                  </div>
                  {t.detail && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{t.detail}</p>}
                </div>
              </div>
            )
          })}
          {done.length > 0 && (
            <p className="pt-1 text-[11px] text-slate-400">{done.length} مهمة منجزة</p>
          )}
        </div>
      )}
    </SectionCard>
  )
}

/* ─── Rail: Notes ─────────────────────────────────────────────── */

function NotesCard({
  record,
  run,
  busy,
  call,
}: {
  record: PartnerRecord
  run: (k: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  call: (p: string, m: string, b?: unknown) => Promise<Response>
}) {
  const { lead, notes } = record
  const [body, setBody] = useState("")
  const add = () =>
    run("note:add", async () => {
      if (!body.trim()) return
      await call(`/api/admin/partnerships/${lead.id}/notes`, "POST", { body: body.trim() })
      setBody("")
    })
  const pin = (n: CrmNote) =>
    run(`note:pin:${n.id}`, async () => {
      await call(`/api/admin/partnerships/${lead.id}/notes/${n.id}`, "PATCH", { pinned: !n.pinned })
    })
  const del = (n: CrmNote) =>
    run(`note:del:${n.id}`, async () => {
      await call(`/api/admin/partnerships/${lead.id}/notes/${n.id}`, "DELETE")
    })
  return (
    <SectionCard title="ملاحظات الفريق" icon={MessageSquare}>
      <div className="mb-2.5 flex gap-1.5">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="اكتب ملاحظة داخلية…"
          className="flex-1 resize-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px]"
        />
        <button onClick={add} disabled={busy !== null || !body.trim()} className="self-end rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11.5px] text-white disabled:opacity-50">
          {busy === "note:add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      </div>
      {notes.length === 0 ? (
        <Empty>لا ملاحظات.</Empty>
      ) : (
        <div className="space-y-1.5">
          {notes.map((n) => (
            <div key={n.id} className={`group rounded-xl border p-2.5 ${n.pinned ? "border-amber-200 bg-amber-50/40" : "border-slate-150 bg-white"}`}>
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-700">{n.body}</p>
              <div className="mt-1 flex items-center justify-between text-[10.5px] text-slate-400">
                <span>{(n.author || "").replace(/^admin:/, "")} · {fmtRelative(n.created_at)}</span>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => pin(n)} className={n.pinned ? "text-amber-600" : "text-slate-300 hover:text-amber-600"} title="تثبيت">
                    <Pin className="h-3 w-3" />
                  </button>
                  <button onClick={() => del(n)} className="text-slate-300 hover:text-rose-600" title="حذف">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

/* ─── Rail: Meetings ──────────────────────────────────────────── */

function MeetingsCard({
  record,
  run,
  busy,
  call,
}: {
  record: PartnerRecord
  run: (k: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  call: (p: string, m: string, b?: unknown) => Promise<Response>
}) {
  const { lead, meetings } = record
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState("")
  const [when, setWhen] = useState("")
  const [type, setType] = useState("call")
  const add = () =>
    run("meeting:add", async () => {
      if (!title.trim()) return
      await call(`/api/admin/partnerships/${lead.id}/meetings`, "POST", {
        title: title.trim(),
        type,
        scheduled_at: when || null,
      })
      setTitle("")
      setWhen("")
      setAdding(false)
    })
  const complete = (m: PartnerMeeting) =>
    run(`meeting:done:${m.id}`, async () => {
      await call(`/api/admin/partnerships/${lead.id}/meetings/${m.id}`, "PATCH", { status: "completed" })
    })
  const icon = (t: string) => (t === "video" ? Video : t === "in_person" ? Users : Phone)
  return (
    <SectionCard
      title="الاجتماعات"
      icon={Phone}
      action={
        <button onClick={() => setAdding((s) => !s)} className="text-slate-400 hover:text-indigo-600">
          <Plus className="h-4 w-4" />
        </button>
      }
    >
      {adding && (
        <div className="mb-3 space-y-1.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الاجتماع…" className="w-full rounded-lg border border-slate-200 px-2.5 py-1 text-[12.5px]" />
          <div className="flex gap-1.5">
            <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[12px]">
              <option value="call">مكالمة</option>
              <option value="video">فيديو</option>
              <option value="in_person">حضوري</option>
            </select>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-[12px]" />
            <button onClick={add} disabled={busy !== null} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11.5px] text-white disabled:opacity-60">
              {busy === "meeting:add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "حفظ"}
            </button>
          </div>
        </div>
      )}
      {meetings.length === 0 ? (
        <Empty>لا اجتماعات.</Empty>
      ) : (
        <div className="space-y-1.5">
          {meetings.map((m) => {
            const Icon = icon(m.type)
            return (
              <div key={m.id} className="flex items-start gap-2 rounded-xl border border-slate-150 bg-white p-2.5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium leading-snug text-slate-800">{m.title}</p>
                  <p className="text-[10.5px] text-slate-400">{fmtDate(m.scheduled_at)}</p>
                  {m.outcome && <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{m.outcome}</p>}
                </div>
                {m.status !== "completed" ? (
                  <button onClick={() => complete(m)} disabled={busy !== null} className="text-[10.5px] text-emerald-600 hover:underline">
                    {busy === `meeting:done:${m.id}` ? "…" : "تم"}
                  </button>
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                )}
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}

/* ─── Rail: Activity timeline ─────────────────────────────────── */

const ACTIVITY_ICON: Record<string, React.ElementType> = {
  lead_created: Sparkles,
  status_changed: TrendingUp,
  evaluation_completed: Brain,
  note_added: MessageSquare,
  task_created: CheckCircle2,
  task_completed: CheckCheck,
  meeting_logged: Phone,
  email_sent: Mail,
  offer_published: ExternalLink,
  offer_viewed: ExternalLink,
  proposal_generated: ScrollText,
  contract_updated: FileText,
  campaign_updated: Megaphone,
  owner_changed: Users,
  report_generated: Sparkles,
}

function TimelineCard({ activities }: { activities: CrmActivity[] }) {
  return (
    <SectionCard title="السجل الزمني" icon={Clock}>
      {activities.length === 0 ? (
        <Empty>لا نشاط بعد.</Empty>
      ) : (
        <div className="space-y-0">
          {activities.map((a, i) => {
            const Icon = ACTIVITY_ICON[a.type] || CircleDot
            const isAi = a.actor === "ai:director"
            return (
              <div key={a.id} className="flex gap-2.5">
                <div className="flex flex-col items-center">
                  <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${isAi ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
                    <Icon className="h-3 w-3" />
                  </div>
                  {i < activities.length - 1 && <div className="my-0.5 w-px flex-1 bg-slate-150" />}
                </div>
                <div className="min-w-0 flex-1 pb-3">
                  <p className="text-[12px] leading-snug text-slate-700">{a.summary}</p>
                  <p className="text-[10.5px] text-slate-400">
                    {(a.actor || "").replace(/^admin:/, "").replace("ai:director", "المدير الذكي").replace("system:auto-triage", "تلقائي").replace("public", "الشريك")} · {fmtRelative(a.created_at)}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </SectionCard>
  )
}
