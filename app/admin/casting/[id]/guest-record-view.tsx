"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight,
  Sparkles,
  Target,
  Mail,
  Phone,
  MapPin,
  CheckCircle2,
  Clock,
  Plus,
  Pin,
  Trash2,
  MessageSquare,
  Loader2,
  Brain,
  ShieldAlert,
  Lightbulb,
  AlertTriangle,
  CheckCheck,
  CircleDot,
  ExternalLink,
  Mic,
  ClipboardList,
  Copy,
  Send,
  Heart,
  Clapperboard,
} from "lucide-react"
import type {
  GuestRecord,
  GuestApplicationStatus,
  CrmTask,
  CrmNote,
  CrmActivity,
} from "@/types/database"
import type { GuestNextBestAction } from "@/lib/guest-crm/record"

const STAGES: { id: GuestApplicationStatus; label: string }[] = [
  { id: "new", label: "جديد" },
  { id: "under_review", label: "مراجعة" },
  { id: "accepted", label: "مقبول" },
]

const REC_LABEL: Record<string, string> = {
  strong_accept: "قبول قوي",
  accept: "قبول",
  consider_later: "للاحتفاظ",
  reject: "اعتذار",
}
const REC_COLOR: Record<string, string> = {
  strong_accept: "text-emerald-700",
  accept: "text-emerald-700",
  consider_later: "text-amber-700",
  reject: "text-rose-700",
}

const PHASE_LABEL: Record<string, string> = {
  idea: "فكرة",
  guest_discovery: "اكتشاف ضيف",
  guest_assigned: "ضيف معيّن",
  approved: "معتمدة",
  researching: "بحث",
  prepared: "جاهزة للتحضير",
  ready_to_record: "جاهزة للتسجيل",
  recording: "تسجيل",
  recorded: "مُسجّلة",
  producing: "إنتاج",
  ready_to_publish: "جاهزة للنشر",
  published: "منشورة",
  analyzing: "تحليل",
  learned: "مُستخلصة",
  archived: "مؤرشفة",
}

const TONE_STYLES: Record<GuestNextBestAction["tone"], string> = {
  advance: "from-emerald-50 to-teal-50 border-emerald-200 text-emerald-900",
  info: "from-sky-50 to-indigo-50 border-sky-200 text-sky-900",
  warn: "from-amber-50 to-orange-50 border-amber-200 text-amber-900",
  neutral: "from-slate-50 to-slate-100 border-slate-200 text-slate-700",
}

type TabId = "overview" | "brief" | "concept" | "conversation" | "prep"
const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "نظرة عامة" },
  { id: "brief", label: "ملف الترشيح" },
  { id: "concept", label: "تصور الحلقة" },
  { id: "conversation", label: "التواصل" },
  { id: "prep", label: "التحضير" },
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
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return "الآن"
  if (min < 60) return `قبل ${min} د`
  const h = Math.round(min / 60)
  if (h < 24) return `قبل ${h} س`
  return `قبل ${Math.round(h / 24)} ي`
}

export function GuestRecordView({
  record,
  nextAction,
}: {
  record: GuestRecord
  nextAction: GuestNextBestAction
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>("overview")

  const { application: app, analysis: a } = record
  const id = app.id

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

  const changeStatus = (status: GuestApplicationStatus) =>
    run(`status:${status}`, async () => {
      await call(`/api/admin/submissions/guests/${id}`, "PATCH", { status })
    })
  const runEvaluation = () =>
    run("evaluate", async () => {
      await call(`/api/admin/submissions/guests/${id}/analyze`, "POST", {})
    })

  const currentIdx = STAGES.findIndex((s) => s.id === app.status)
  const isAlt = app.status === "consider_later" || app.status === "rejected"

  return (
    <div className="space-y-5">
      <Link
        href="/admin/casting"
        className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 transition-colors hover:text-slate-800"
      >
        <ArrowRight className="h-3.5 w-3.5" />
        ترشيح الضيوف
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/15 to-orange-500/15 text-indigo-700">
            <Mic className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">{app.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
              <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {app.country}</span>
              <a href={`mailto:${app.email}`} className="inline-flex items-center gap-1 hover:text-slate-800">
                <Mail className="h-3 w-3" /> {app.email}
              </a>
              <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {app.phone}</span>
              {app.previous_podcast && (
                <span className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10.5px] text-slate-600">
                  <Mic className="h-2.5 w-2.5" /> ضيف سابق
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stage stepper */}
        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          {STAGES.map((s, i) => {
            const done = !isAlt && i < currentIdx
            const current = s.id === app.status
            return (
              <button
                key={s.id}
                onClick={() => changeStatus(s.id)}
                disabled={busy !== null}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-all disabled:opacity-60 ${
                  current
                    ? "border-indigo-300 bg-indigo-600 text-white shadow-sm"
                    : done
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                {busy === `status:${s.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : done ? <CheckCircle2 className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                {s.label}
              </button>
            )
          })}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <button
            onClick={() => changeStatus("consider_later")}
            disabled={busy !== null}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-all disabled:opacity-60 ${
              app.status === "consider_later" ? "border-amber-300 bg-amber-500 text-white" : "border-slate-200 bg-white text-slate-400 hover:border-amber-200 hover:text-amber-600"
            }`}
          >
            {busy === "status:consider_later" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Heart className="h-3 w-3" />}
            للاحتفاظ
          </button>
          <button
            onClick={() => changeStatus("rejected")}
            disabled={busy !== null}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-all disabled:opacity-60 ${
              app.status === "rejected" ? "border-rose-300 bg-rose-600 text-white" : "border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:text-rose-600"
            }`}
          >
            {busy === "status:rejected" ? <Loader2 className="h-3 w-3 animate-spin" /> : <AlertTriangle className="h-3 w-3" />}
            اعتذار
          </button>
        </div>
      </div>

      {/* Next best action */}
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

      {/* Production link — the episode this accepted story was bridged into */}
      {record.eir && (
        <Link
          href={`/admin/khat-brain/episodes/${record.eir.id}`}
          className="flex items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 transition-colors hover:bg-indigo-50"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
              <Clapperboard className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-500">في خط الإنتاج</p>
              <p className="truncate text-[14px] font-bold text-slate-900">{record.eir.working_title}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-md bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700">{PHASE_LABEL[record.eir.phase] || record.eir.phase}</span>
            <ExternalLink className="h-4 w-4 text-indigo-400" />
          </div>
        </Link>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Target} label="درجة التوافق" value={a?.fit_score != null ? `${a.fit_score}` : "—"} sub={a?.recommendation ? REC_LABEL[a.recommendation] : "بانتظار التقييم"} valueClass={a?.recommendation ? REC_COLOR[a.recommendation] : ""} />
        <Stat icon={Heart} label="العمق العاطفي" value={a?.emotional_depth_score != null ? `${a.emotional_depth_score}` : "—"} sub="" />
        <Stat icon={Brain} label="الجاهزية" value={a?.readiness_score != null ? `${a.readiness_score}` : "—"} sub={a?.risk_level ? `مخاطرة ${a.risk_level}` : ""} />
        <Stat icon={Clock} label="وصل" value={fmtRelative(app.created_at) || "—"} sub="" />
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
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

          {tab === "overview" && <OverviewTab record={record} />}
          {tab === "brief" && <BriefTab record={record} onEvaluate={runEvaluation} busy={busy} />}
          {tab === "concept" && <ConceptTab record={record} run={run} busy={busy} call={call} />}
          {tab === "conversation" && <ConversationTab record={record} run={run} busy={busy} call={call} />}
          {tab === "prep" && <PrepTab record={record} run={run} busy={busy} call={call} />}
        </div>

        <div className="space-y-4">
          <TasksCard record={record} run={run} busy={busy} call={call} />
          <NotesCard record={record} run={run} busy={busy} call={call} />
          <TimelineCard activities={record.activities} />
        </div>
      </div>
    </div>
  )
}

/* ─── Shared ───────────────────────────────────────────────────── */

function Stat({ icon: Icon, label, value, sub, valueClass }: { icon: React.ElementType; label: string; value: string; sub: string; valueClass?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className={`mt-1 truncate text-[20px] font-bold leading-tight ${valueClass || "text-slate-900"}`}>{value}</div>
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

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const v = value ?? 0
  const color = v >= 75 ? "bg-emerald-500" : v >= 45 ? "bg-amber-500" : "bg-rose-500"
  return (
    <div>
      <div className="flex items-center justify-between text-[11.5px]">
        <span className="text-slate-500">{label}</span>
        <span className="font-semibold tabular-nums text-slate-700">{value ?? "—"}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${v}%` }} />
      </div>
    </div>
  )
}

/* ─── Overview ─────────────────────────────────────────────────── */

function OverviewTab({ record }: { record: GuestRecord }) {
  const { application: app, analysis: a } = record
  const field = (label: string, v: string | null) =>
    v ? (
      <div>
        <p className="text-[11px] font-medium text-slate-400">{label}</p>
        <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{v}</p>
      </div>
    ) : null
  return (
    <div className="space-y-4">
      <SectionCard title="القصة" icon={Heart}>
        <div className="space-y-3">
          {field("القصة أو الفكرة", app.story_idea)}
          {field("من هو بعيدًا عن المسمى الوظيفي", app.beyond_job_title)}
          {field("لحظة غيّرته", app.life_changing_moment)}
          {field("ما يتمنى أن يفهمه الناس", app.hope_people_understand)}
          {field("سؤال يتمنى أن يُسأله", app.unasked_question)}
          {field("لماذا اختار خط", app.why_khat)}
        </div>
      </SectionCard>
      <SectionCard title="التسجيل والتفضيلات" icon={Mic}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field("حوار أم سرد", app.prefer_dialogue_or_story)}
          {field("قلق من التصوير", app.filming_concern === "no" ? "لا" : app.filming_concern === "a_little" ? "قليلاً" : "نعم")}
          {field("مواضيع يتجنبها", app.topics_to_avoid)}
          {field("السفر للكويت", app.can_travel_to_kuwait)}
          {field("تجربة بودكاست سابقة", app.previous_podcast ? app.previous_podcast_info || "نعم" : "لا")}
          {field("روابط", app.social_links)}
        </div>
      </SectionCard>
      {a?.status === "ready" && a.research_summary && (
        <SectionCard title="البحث الحيّ عن المتقدم" icon={Brain}>
          <div className="space-y-2">
            {field("ملخص البحث", a.research_summary)}
            {field("الحضور العلني", a.public_presence)}
            {field("المصداقية", a.credibility_note)}
            {a.research_sources.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {a.research_sources.slice(0, 8).map((s, i) => (
                  <a key={i} href={s.url} target="_blank" rel="noreferrer" className="inline-flex max-w-[200px] items-center gap-1 truncate rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-200">
                    <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                    <span className="truncate">{s.title || s.url}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

/* ─── Casting brief ────────────────────────────────────────────── */

function BriefTab({ record, onEvaluate, busy }: { record: GuestRecord; onEvaluate: () => void; busy: string | null }) {
  const a = record.analysis
  if (!a || a.status !== "ready") {
    return (
      <SectionCard title="ملف الترشيح" icon={Brain}>
        {a?.status === "generating" ? (
          <Empty>التقييم قيد التشغيل الآن…</Empty>
        ) : (
          <div className="text-center">
            <p className="mb-3 text-[13px] text-slate-500">شغّل التقييم للحصول على بحث حيّ عن المتقدم وقراءة تحريرية كاملة.</p>
            <button onClick={onEvaluate} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy === "evaluate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              شغّل تقييم الترشيح
            </button>
          </div>
        )}
      </SectionCard>
    )
  }
  return (
    <div className="space-y-4">
      <SectionCard title="درجات الترشيح" icon={Target}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ScoreBar label="التوافق العام" value={a.fit_score} />
          <ScoreBar label="العمق العاطفي" value={a.emotional_depth_score} />
          <ScoreBar label="وضوح القصة" value={a.story_clarity_score} />
          <ScoreBar label="الأصالة" value={a.originality_score} />
          <ScoreBar label="الجاهزية" value={a.readiness_score} />
        </div>
        {a.fit_summary && <p className="mt-3 border-t border-slate-100 pt-3 text-[13px] leading-relaxed text-slate-700">{a.fit_summary}</p>}
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {a.strengths.length > 0 && (
          <SectionCard title="نقاط القوة" icon={Lightbulb}>
            <Bullets items={a.strengths} tone="emerald" />
          </SectionCard>
        )}
        {a.concerns.length > 0 && (
          <SectionCard title="المخاوف" icon={ShieldAlert}>
            <Bullets items={a.concerns} tone="rose" />
          </SectionCard>
        )}
      </div>

      <SectionCard title="الزاوية التحريرية" icon={Sparkles}>
        <div className="space-y-3">
          {a.strongest_angle && <Field label="أقوى زاوية" v={a.strongest_angle} />}
          {a.why_now && <Field label="لماذا الآن" v={a.why_now} />}
          {a.audience_value && <Field label="القيمة للجمهور" v={a.audience_value} />}
          {a.suggested_direction && <Field label="الاتجاه المقترح" v={a.suggested_direction} />}
        </div>
      </SectionCard>
    </div>
  )
}

function Field({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-slate-700">{v}</p>
    </div>
  )
}

/* ─── Episode concept ──────────────────────────────────────────── */

function ConceptTab({
  record,
  run,
  busy,
  call,
}: {
  record: GuestRecord
  run: (k: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  call: (p: string, m: string, b?: unknown) => Promise<Response>
}) {
  const { application: app, concept: c } = record
  const generate = () =>
    run("concept", async () => {
      await call(`/api/admin/submissions/guests/${app.id}/concept`, "POST", {})
    })
  return (
    <SectionCard
      title="تصور الحلقة"
      icon={Mic}
      action={
        <button onClick={generate} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11.5px] font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {busy === "concept" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {c ? "إعادة توليد" : "توليد"}
        </button>
      }
    >
      {c?.status === "ready" && c.proposed_episode_title ? (
        <div className="space-y-3">
          <div>
            <p className="text-[17px] font-bold text-slate-900">{c.proposed_episode_title}</p>
            {c.title_alternatives.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {c.title_alternatives.map((t, i) => (
                  <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{t}</span>
                ))}
              </div>
            )}
          </div>
          {c.episode_hook && <p className="border-s-2 border-orange-300 ps-3 text-[13px] italic leading-relaxed text-slate-700">“{c.episode_hook}”</p>}
          {c.episode_logline && <Field label="ملخص الحلقة" v={c.episode_logline} />}
          {c.why_this_episode_matters && <Field label="لماذا تهم" v={c.why_this_episode_matters} />}
          {c.suggested_opening_question && (
            <div className="rounded-xl bg-indigo-50/60 p-3">
              <p className="text-[11px] font-medium text-indigo-500">سؤال الافتتاح</p>
              <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-slate-800">{c.suggested_opening_question}</p>
            </div>
          )}
          {c.suggested_core_questions.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-slate-400">الأسئلة الجوهرية</p>
              <ol className="space-y-1.5">
                {c.suggested_core_questions.map((q, i) => (
                  <li key={i} className="flex gap-2 text-[13px] leading-relaxed text-slate-700">
                    <span className="shrink-0 font-semibold text-indigo-400">{i + 1}.</span>
                    <span>{q}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {c.suggested_sensitive_areas.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium text-amber-500">مناطق حساسة</p>
              <Bullets items={c.suggested_sensitive_areas} tone="slate" />
            </div>
          )}
          {c.host_preparation_notes && <Field label="ملاحظات تحضيرية للمضيف" v={c.host_preparation_notes} />}
        </div>
      ) : (
        <Empty>لا يوجد تصور بعد — ولّده بعد تقييم الترشيح.</Empty>
      )}
    </SectionCard>
  )
}

/* ─── Conversation (response drafts + send) ────────────────────── */

const MSG_TYPES = [
  { key: "acceptance", label: "قبول" },
  { key: "consider_later", label: "للاحتفاظ" },
  { key: "rejection", label: "اعتذار" },
] as const

function ConversationTab({
  record,
  run,
  busy,
  call,
}: {
  record: GuestRecord
  run: (k: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  call: (p: string, m: string, b?: unknown) => Promise<Response>
}) {
  const { application: app, responses: r } = record
  const [type, setType] = useState<(typeof MSG_TYPES)[number]["key"]>("acceptance")
  const [tone, setTone] = useState<"formal" | "warm">("formal")
  const [text, setText] = useState("")
  const [dirty, setDirty] = useState(false)
  const [sent, setSent] = useState(false)

  const draftKey = `${type}_${tone}` as keyof NonNullable<typeof r>
  const draft = r && r.status === "ready" ? ((r[draftKey] as string | null) ?? "") : ""
  const shown = dirty ? text : draft

  const generate = () =>
    run("responses", async () => {
      await call(`/api/admin/submissions/guests/${app.id}/responses`, "POST", {})
    })
  const send = () =>
    run("email", async () => {
      const body = (dirty ? text : draft).trim()
      if (!body) return
      const res = await call(`/api/admin/submissions/guests/${app.id}/email`, "POST", {
        subject: "بخصوص طلبك للظهور في بودكاست خط",
        body,
      })
      if (res.ok) setSent(true)
    })

  return (
    <SectionCard
      title="رسالة الرد"
      icon={MessageSquare}
      action={
        <button onClick={generate} disabled={busy !== null} className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 px-2.5 py-1 text-[11.5px] font-medium text-indigo-700 hover:bg-indigo-50 disabled:opacity-60">
          {busy === "responses" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {r?.status === "ready" ? "إعادة توليد المسودات" : "توليد مسودات الردود"}
        </button>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1.5">
        {MSG_TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => { setType(t.key); setDirty(false) }}
            className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium ${type === t.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {t.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px self-center bg-slate-200" />
        {(["formal", "warm"] as const).map((tn) => (
          <button
            key={tn}
            onClick={() => { setTone(tn); setDirty(false) }}
            className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium ${tone === tn ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {tn === "formal" ? "رسمي" : "ودّي"}
          </button>
        ))}
      </div>
      <textarea
        value={shown}
        onChange={(e) => { setText(e.target.value); setDirty(true) }}
        rows={10}
        placeholder={r?.status === "ready" ? "" : "ولّد مسودات الردود أولًا، أو اكتب رسالتك هنا…"}
        className="w-full resize-y rounded-xl border border-slate-200 p-3 text-[12.5px] leading-relaxed"
      />
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-slate-400">يُرسَل إلى {app.email}</span>
        <button
          onClick={send}
          disabled={busy !== null || !shown.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {busy === "email" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : sent ? <CheckCheck className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
          {sent ? "أُرسل" : "إرسال بريد"}
        </button>
      </div>
    </SectionCard>
  )
}

/* ─── Prep ─────────────────────────────────────────────────────── */

const FILMING_TIME: Record<string, string> = {
  morning: "صباحًا (9–12)",
  afternoon: "ظهرًا (12–4)",
  evening: "مساءً (4–8)",
}

function PrepTab({
  record,
  run,
  busy,
  call,
}: {
  record: GuestRecord
  run: (k: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  call: (p: string, m: string, b?: unknown) => Promise<Response>
}) {
  const { application: app, prepForm: f } = record
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const create = () =>
    run("prep:create", async () => {
      const res = await call(`/api/admin/submissions/guests/${app.id}/prep-form`, "POST", {})
      const d = await res.json().catch(() => ({}))
      if (d?.token) setToken(d.token)
    })
  const regenerate = () =>
    run("prep:regen", async () => {
      const res = await call(`/api/admin/submissions/guests/${app.id}/prep-form`, "PATCH", { action: "regenerate" })
      const d = await res.json().catch(() => ({}))
      if (d?.token) setToken(d.token)
    })
  const action = (act: string, key: string) =>
    run(`prep:${key}`, async () => {
      await call(`/api/admin/submissions/guests/${app.id}/prep-form`, "PATCH", { action: act })
    })

  if (app.status !== "accepted") {
    return (
      <SectionCard title="استبيان التحضير" icon={ClipboardList}>
        <Empty>يتوفّر التحضير بعد قبول الضيف. غيّر الحالة إلى «مقبول» أولًا.</Empty>
      </SectionCard>
    )
  }

  const link = token ? `${typeof window !== "undefined" ? window.location.origin : ""}/prepare/${token}` : null
  const resp = f?.response

  return (
    <div className="space-y-4">
      <SectionCard
        title="استبيان التحضير"
        icon={ClipboardList}
        action={
          f ? (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
              {{ pending: "بانتظار التعبئة", submitted: "تم التسليم", locked: "مقفل", revoked: "ملغى" }[f.status]}
            </span>
          ) : null
        }
      >
        {!f ? (
          <div className="text-center">
            <p className="mb-3 text-[13px] text-slate-500">أنشئ رابط استبيان تحضير وشاركه مع الضيف.</p>
            <button onClick={create} disabled={busy !== null} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-[13px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
              {busy === "prep:create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              إنشاء رابط التحضير
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {link ? (
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
                <code className="min-w-0 flex-1 truncate text-[11.5px] text-slate-600" dir="ltr">{link}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="shrink-0 rounded-md bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-100"
                >
                  {copied ? <CheckCheck className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
            ) : (
              <p className="text-[12px] text-slate-500">الرابط سرّي ولا يُعرض بعد الإنشاء — أعد توليده للحصول على رابط جديد للمشاركة.</p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <button onClick={regenerate} disabled={busy !== null} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                {busy === "prep:regen" ? "…" : "إعادة توليد الرابط"}
              </button>
              {f.status !== "revoked" && f.status !== "locked" && (
                <button onClick={() => action("lock", "lock")} disabled={busy !== null} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] text-slate-700 hover:bg-slate-50 disabled:opacity-60">قفل</button>
              )}
              {f.status === "locked" && (
                <button onClick={() => action("unlock", "unlock")} disabled={busy !== null} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11.5px] text-slate-700 hover:bg-slate-50 disabled:opacity-60">فتح</button>
              )}
              {f.status !== "revoked" && (
                <button onClick={() => action("revoke", "revoke")} disabled={busy !== null} className="rounded-lg border border-rose-200 px-2.5 py-1 text-[11.5px] text-rose-600 hover:bg-rose-50 disabled:opacity-60">إلغاء</button>
              )}
            </div>
          </div>
        )}
      </SectionCard>

      {resp && (
        <SectionCard title="إجابات التحضير" icon={CheckCircle2}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="الاسم للتسجيل" v={resp.preferred_name} />
            <Field label="واتساب" v={resp.phone_whatsapp} />
            <Field label="المشروب المفضّل" v={resp.preferred_drink} />
            <Field label="أيام التصوير" v={resp.preferred_filming_days.join("، ")} />
            <Field label="وقت التصوير" v={FILMING_TIME[resp.preferred_filming_time] || resp.preferred_filming_time} />
            {resp.scheduling_restrictions && <Field label="قيود الجدولة" v={resp.scheduling_restrictions} />}
            {resp.topics_excited_about && <div className="sm:col-span-2"><Field label="مواضيع متحمّس لها" v={resp.topics_excited_about} /></div>}
            {resp.sensitivities_to_avoid && <div className="sm:col-span-2"><Field label="حساسيات يتجنّبها" v={resp.sensitivities_to_avoid} /></div>}
            {resp.technical_needs && <Field label="احتياجات تقنية" v={resp.technical_needs} />}
            {resp.team_notes && <div className="sm:col-span-2"><Field label="ملاحظات للفريق" v={resp.team_notes} /></div>}
          </div>
        </SectionCard>
      )}
    </div>
  )
}

/* ─── Rail: Tasks ──────────────────────────────────────────────── */

function TasksCard({
  record,
  run,
  busy,
  call,
}: {
  record: GuestRecord
  run: (k: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  call: (p: string, m: string, b?: unknown) => Promise<Response>
}) {
  const id = record.application.id
  const [title, setTitle] = useState("")
  const [adding, setAdding] = useState(false)
  const open = record.tasks.filter((t) => t.status === "open")
  const done = record.tasks.filter((t) => t.status !== "open")

  const addTask = () =>
    run("task:add", async () => {
      if (!title.trim()) return
      await call(`/api/admin/crm/guest/${id}/tasks`, "POST", { title: title.trim() })
      setTitle(""); setAdding(false)
    })
  const complete = (t: CrmTask) =>
    run(`task:done:${t.id}`, async () => {
      await call(`/api/admin/crm/guest/${id}/tasks/${t.id}`, "PATCH", { status: "done" })
    })

  return (
    <SectionCard
      title={`المهام (${open.length})`}
      icon={CheckCircle2}
      action={<button onClick={() => setAdding((s) => !s)} className="text-slate-400 hover:text-indigo-600"><Plus className="h-4 w-4" /></button>}
    >
      {adding && (
        <div className="mb-3 flex gap-1.5">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTask()} autoFocus placeholder="مهمة جديدة…" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[12.5px]" />
          <button onClick={addTask} disabled={busy !== null} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11.5px] text-white disabled:opacity-60">
            {busy === "task:add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "إضافة"}
          </button>
        </div>
      )}
      {open.length === 0 && done.length === 0 ? (
        <Empty>لا مهام.</Empty>
      ) : (
        <div className="space-y-1.5">
          {open.map((t) => {
            const overdue = isOverdue(t.due_at)
            const ai = t.created_by === "ai:casting"
            return (
              <div key={t.id} className="flex items-start gap-2 rounded-xl border border-slate-150 bg-white p-2.5">
                <button onClick={() => complete(t)} disabled={busy !== null} className="mt-0.5 text-slate-300 transition-colors hover:text-emerald-600" title="إنجاز">
                  {busy === `task:done:${t.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium leading-snug text-slate-800">{t.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10.5px]">
                    {ai && <span className="inline-flex items-center gap-0.5 rounded bg-primary/[0.07] px-1 py-px font-medium text-primary"><Sparkles className="h-2.5 w-2.5" /> الترشيح الذكي</span>}
                    {t.due_at && <span className={overdue ? "text-rose-600" : "text-slate-400"}>{overdue ? "متأخرة · " : "تستحق "}{fmtDate(t.due_at)}</span>}
                  </div>
                  {t.detail && <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{t.detail}</p>}
                </div>
              </div>
            )
          })}
          {done.length > 0 && <p className="pt-1 text-[11px] text-slate-400">{done.length} مهمة منجزة</p>}
        </div>
      )}
    </SectionCard>
  )
}

/* ─── Rail: Notes ──────────────────────────────────────────────── */

function NotesCard({
  record,
  run,
  busy,
  call,
}: {
  record: GuestRecord
  run: (k: string, fn: () => Promise<void>) => Promise<void>
  busy: string | null
  call: (p: string, m: string, b?: unknown) => Promise<Response>
}) {
  const id = record.application.id
  const [body, setBody] = useState("")
  const add = () =>
    run("note:add", async () => {
      if (!body.trim()) return
      await call(`/api/admin/crm/guest/${id}/notes`, "POST", { body: body.trim() })
      setBody("")
    })
  const pin = (n: CrmNote) =>
    run(`note:pin:${n.id}`, async () => {
      await call(`/api/admin/crm/guest/${id}/notes/${n.id}`, "PATCH", { pinned: !n.pinned })
    })
  const del = (n: CrmNote) =>
    run(`note:del:${n.id}`, async () => {
      await call(`/api/admin/crm/guest/${id}/notes/${n.id}`, "DELETE")
    })
  return (
    <SectionCard title="ملاحظات الفريق" icon={MessageSquare}>
      <div className="mb-2.5 flex gap-1.5">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="اكتب ملاحظة…" className="flex-1 resize-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px]" />
        <button onClick={add} disabled={busy !== null || !body.trim()} className="self-end rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11.5px] text-white disabled:opacity-50">
          {busy === "note:add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      </div>
      {record.notes.length === 0 ? (
        <Empty>لا ملاحظات.</Empty>
      ) : (
        <div className="space-y-1.5">
          {record.notes.map((n) => (
            <div key={n.id} className={`group rounded-xl border p-2.5 ${n.pinned ? "border-amber-200 bg-amber-50/40" : "border-slate-150 bg-white"}`}>
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-700">{n.body}</p>
              <div className="mt-1 flex items-center justify-between text-[10.5px] text-slate-400">
                <span>{(n.author || "").replace(/^admin:/, "")} · {fmtRelative(n.created_at)}</span>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button onClick={() => pin(n)} className={n.pinned ? "text-amber-600" : "text-slate-300 hover:text-amber-600"}><Pin className="h-3 w-3" /></button>
                  <button onClick={() => del(n)} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3 w-3" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}

/* ─── Rail: Timeline ───────────────────────────────────────────── */

const ACTIVITY_ICON: Record<string, React.ElementType> = {
  application_created: Sparkles,
  status_changed: Target,
  evaluation_completed: Brain,
  note_added: MessageSquare,
  task_created: CheckCircle2,
  task_completed: CheckCheck,
  email_sent: Mail,
  concept_generated: Mic,
  prep_form_created: ClipboardList,
  prep_submitted: ClipboardList,
  production_bridged: Clapperboard,
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
            const isAi = a.actor === "ai:casting"
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
                    {(a.actor || "").replace(/^admin:/, "").replace("ai:casting", "الترشيح الذكي").replace("system:auto-triage", "تلقائي").replace("public", "المتقدم")} · {fmtRelative(a.created_at)}
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
