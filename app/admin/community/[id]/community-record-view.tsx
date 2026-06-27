"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowRight, Sparkles, Brain, Lightbulb, ShieldAlert, Mail, Loader2, Send, CheckCircle2,
  AlertTriangle, Plus, Trash2, Pin, MessageSquare, Clock, CircleDot, Trash, Eye, Award,
} from "lucide-react"
import type { CommunityRecord } from "@/lib/community/record"
import type { CommunityContributionStatus, CrmTask, CrmNote, CrmActivity } from "@/types/database"

const TYPE_LABEL: Record<string, string> = {
  guest: "اقتراح ضيف", topic: "فكرة حلقة", question: "سؤال للنقاش", concept: "فكرة محتوى", improvement: "تحسين لخط",
}
const ACTION_LABEL: Record<string, string> = {
  advance: "المضي قدمًا", request_info: "اطلب تفاصيل", nurture: "احتفظ بها", decline: "اعتذر",
}
const ROUTE_TARGET: Record<string, { label: string; href: (id: string | null) => string | null }> = {
  guest_candidate: { label: "مرشّح ضيف", href: (id) => (id ? `/admin/guest-candidates/${id}` : null) },
  market_signal: { label: "إشارة سوق", href: () => "/admin/khat-brain/market/signals" },
  eir: { label: "فكرة حلقة", href: (id) => (id ? `/admin/khat-brain/episodes/${id}` : null) },
}

function fmtRel(iso: string | null): string {
  if (!iso) return ""
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return "الآن"
  if (m < 60) return `قبل ${m} د`
  const h = Math.round(m / 60)
  return h < 24 ? `قبل ${h} س` : `قبل ${Math.round(h / 24)} ي`
}

export function CommunityRecordView({ record, reference }: { record: CommunityRecord; reference: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const c = record.contribution
  const routable = c.type !== "improvement"
  const routeTarget = c.routed_kind ? ROUTE_TARGET[c.routed_kind] : null

  async function call(path: string, method: string, body?: unknown) {
    return fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body !== undefined ? JSON.stringify(body) : undefined })
  }
  const refresh = () => startTransition(() => router.refresh())
  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key)
    try { await fn(); refresh() } finally { setBusy(null) }
  }

  const setStatus = (status: CommunityContributionStatus) =>
    run(`status:${status}`, async () => { await call(`/api/admin/community/${c.id}`, "PATCH", { status }) })
  const routeToBrain = () =>
    run("route", async () => {
      const res = await call(`/api/admin/community/${c.id}/route-to-brain`, "POST")
      if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || "تعذّر التوجيه") }
    })
  const toggleCredit = () =>
    run("credit", async () => { await call(`/api/admin/community/${c.id}`, "PATCH", { public_credit: !c.public_credit }) })

  return (
    <div className="space-y-5">
      <Link href="/admin/community" className="inline-flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-slate-800">
        <ArrowRight className="h-3.5 w-3.5" /> مساهمات المجتمع
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{TYPE_LABEL[c.type] || c.type}</span>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">{c.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px]">{reference}</span>
              {c.contributor_name && <span>{c.contributor_name}</span>}
              {c.contributor_email && <a href={`mailto:${c.contributor_email}`} className="inline-flex items-center gap-1 hover:text-slate-800"><Mail className="h-3 w-3" /> {c.contributor_email}</a>}
              <span>· {fmtRel(c.created_at)}</span>
            </div>
          </div>
          <button onClick={() => run("delete", async () => { if (confirm("حذف المساهمة نهائيًا؟")) { await call(`/api/admin/community/${c.id}`, "DELETE"); router.push("/admin/community") } })} className="text-slate-300 hover:text-rose-600" title="حذف">
            <Trash className="h-4 w-4" />
          </button>
        </div>

        {/* Status + route controls */}
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {(["reviewing", "accepted", "declined"] as CommunityContributionStatus[]).map((s) => (
            <button key={s} onClick={() => setStatus(s)} disabled={busy !== null}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-all disabled:opacity-60 ${
                c.status === s ? "border-indigo-300 bg-indigo-600 text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}>
              {busy === `status:${s}` ? <Loader2 className="h-3 w-3 animate-spin" /> : s === "accepted" ? <CheckCircle2 className="h-3 w-3" /> : s === "declined" ? <AlertTriangle className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {s === "reviewing" ? "قيد المراجعة" : s === "accepted" ? "مقبولة" : "مرفوضة"}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          {c.status === "routed" && routeTarget ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[12px] font-medium text-indigo-700">
              <Send className="h-3 w-3" /> وُجّهت — {routeTarget.label}
              {routeTarget.href(c.routed_id) && (
                <Link href={routeTarget.href(c.routed_id)!} className="underline">فتح</Link>
              )}
            </span>
          ) : routable ? (
            <button onClick={routeToBrain} disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3.5 py-1 text-[12px] font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
              {busy === "route" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
              وجّه إلى خط برين
            </button>
          ) : (
            <span className="text-[11px] text-slate-400">للمراجعة فقط — لا توجد وجهة في خط برين</span>
          )}
          <span className="mx-1 h-4 w-px bg-slate-200" />
          <button
            onClick={toggleCredit}
            disabled={busy !== null}
            title="اعرض هذه المساهمة على حائط «صُنع مع المجتمع» العام"
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-all disabled:opacity-60 ${
              c.public_credit ? "border-amber-300 bg-amber-50 text-amber-700" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
          >
            {busy === "credit" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Award className="h-3 w-3" />}
            {c.public_credit ? "على حائط المجتمع" : "أضِف إلى الحائط"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* AI triage */}
          <SectionCard title="فرز الذكاء الاصطناعي" icon={Brain}>
            {c.triage_status === "ready" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[12px] font-semibold text-slate-700">الجودة {c.quality_score}/100</span>
                  {c.category && <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-[12px] text-indigo-700">{c.category}</span>}
                  {c.recommended_action && <span className="rounded-lg bg-primary/[0.07] px-2.5 py-1 text-[12px] font-medium text-primary">{ACTION_LABEL[c.recommended_action]}</span>}
                  {c.spam && <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-[12px] font-medium text-rose-600">مُعلّمة كعبثية</span>}
                </div>
                {c.ai_summary && <p className="text-[13px] leading-relaxed text-slate-700">{c.ai_summary}</p>}
                {c.action_rationale && <p className="text-[12px] text-slate-500">↳ {c.action_rationale}</p>}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {c.highlights.length > 0 && (
                    <div><p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-emerald-600"><Lightbulb className="h-3 w-3" /> نقاط القوة</p>
                      <ul className="space-y-1">{c.highlights.map((h, i) => <li key={i} className="text-[12.5px] leading-relaxed text-slate-700">• {h}</li>)}</ul></div>
                  )}
                  {c.concerns.length > 0 && (
                    <div><p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-rose-600"><ShieldAlert className="h-3 w-3" /> مخاوف</p>
                      <ul className="space-y-1">{c.concerns.map((h, i) => <li key={i} className="text-[12.5px] leading-relaxed text-slate-700">• {h}</li>)}</ul></div>
                  )}
                </div>
              </div>
            ) : c.triage_status === "generating" ? (
              <Empty>الفرز قيد التشغيل…</Empty>
            ) : (
              <Empty>تعذّر الفرز{c.error_message ? `: ${c.error_message}` : ""}.</Empty>
            )}
          </SectionCard>

          {/* The submission */}
          <SectionCard title="المساهمة" icon={MessageSquare}>
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{c.body}</p>
            {Object.entries(c.details || {}).filter(([, v]) => typeof v === "string" && v).length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                {Object.entries(c.details || {}).map(([k, v]) =>
                  typeof v === "string" && v ? (
                    <div key={k} className="text-[12.5px]"><span className="text-slate-400">{k}: </span><span className="text-slate-700">{v}</span></div>
                  ) : null,
                )}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Rail */}
        <div className="space-y-4">
          <TasksCard record={record} run={run} busy={busy} call={call} />
          <NotesCard record={record} run={run} busy={busy} call={call} />
          <TimelineCard activities={record.activities} />
        </div>
      </div>
    </div>
  )
}

function SectionCard({ title, icon: Icon, children, action }: { title: string; icon?: React.ElementType; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">{Icon && <Icon className="h-4 w-4 text-slate-400" />}{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-[12px] text-slate-400">{children}</p>
}

type RunFn = (k: string, fn: () => Promise<void>) => Promise<void>
type CallFn = (p: string, m: string, b?: unknown) => Promise<Response>

function TasksCard({ record, run, busy, call }: { record: CommunityRecord; run: RunFn; busy: string | null; call: CallFn }) {
  const id = record.contribution.id
  const [title, setTitle] = useState("")
  const open = record.tasks.filter((t) => t.status === "open")
  const add = () => run("task:add", async () => { if (!title.trim()) return; await call(`/api/admin/crm/community/${id}/tasks`, "POST", { title: title.trim() }); setTitle("") })
  const done = (t: CrmTask) => run(`task:done:${t.id}`, async () => { await call(`/api/admin/crm/community/${id}/tasks/${t.id}`, "PATCH", { status: "done" }) })
  return (
    <SectionCard title={`المهام (${open.length})`} icon={CheckCircle2}>
      <div className="mb-2.5 flex gap-1.5">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="مهمة…" className="flex-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[12.5px]" />
        <button onClick={add} disabled={busy !== null} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[11.5px] text-white disabled:opacity-60">{busy === "task:add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}</button>
      </div>
      {open.length === 0 ? <Empty>لا مهام.</Empty> : (
        <div className="space-y-1.5">{open.map((t) => (
          <div key={t.id} className="flex items-start gap-2 rounded-xl border border-slate-150 bg-white p-2.5">
            <button onClick={() => done(t)} disabled={busy !== null} className="mt-0.5 text-slate-300 hover:text-emerald-600">{busy === `task:done:${t.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}</button>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-medium leading-snug text-slate-800">{t.title}</p>
              {t.created_by === "ai:community" && <span className="mt-0.5 inline-flex items-center gap-0.5 rounded bg-primary/[0.07] px-1 py-px text-[10px] font-medium text-primary"><Sparkles className="h-2.5 w-2.5" /> الفرز الذكي</span>}
            </div>
          </div>
        ))}</div>
      )}
    </SectionCard>
  )
}

function NotesCard({ record, run, busy, call }: { record: CommunityRecord; run: RunFn; busy: string | null; call: CallFn }) {
  const id = record.contribution.id
  const [body, setBody] = useState("")
  const add = () => run("note:add", async () => { if (!body.trim()) return; await call(`/api/admin/crm/community/${id}/notes`, "POST", { body: body.trim() }); setBody("") })
  const pin = (n: CrmNote) => run(`note:pin:${n.id}`, async () => { await call(`/api/admin/crm/community/${id}/notes/${n.id}`, "PATCH", { pinned: !n.pinned }) })
  const del = (n: CrmNote) => run(`note:del:${n.id}`, async () => { await call(`/api/admin/crm/community/${id}/notes/${n.id}`, "DELETE") })
  return (
    <SectionCard title="ملاحظات الفريق" icon={MessageSquare}>
      <div className="mb-2.5 flex gap-1.5">
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="ملاحظة…" className="flex-1 resize-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px]" />
        <button onClick={add} disabled={busy !== null || !body.trim()} className="self-end rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11.5px] text-white disabled:opacity-50">{busy === "note:add" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}</button>
      </div>
      {record.notes.length === 0 ? <Empty>لا ملاحظات.</Empty> : (
        <div className="space-y-1.5">{record.notes.map((n) => (
          <div key={n.id} className={`group rounded-xl border p-2.5 ${n.pinned ? "border-amber-200 bg-amber-50/40" : "border-slate-150 bg-white"}`}>
            <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate-700">{n.body}</p>
            <div className="mt-1 flex items-center justify-between text-[10.5px] text-slate-400">
              <span>{(n.author || "").replace(/^admin:/, "")} · {fmtRel(n.created_at)}</span>
              <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => pin(n)} className={n.pinned ? "text-amber-600" : "text-slate-300 hover:text-amber-600"}><Pin className="h-3 w-3" /></button>
                <button onClick={() => del(n)} className="text-slate-300 hover:text-rose-600"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
          </div>
        ))}</div>
      )}
    </SectionCard>
  )
}

const ICON: Record<string, React.ElementType> = {
  contribution_created: Sparkles, triage_completed: Brain, status_changed: CircleDot, routed_to_brain: Send,
  note_added: MessageSquare, task_created: CheckCircle2, task_completed: CheckCircle2,
  outcome_emailed: Mail, credit_changed: Award,
}
function TimelineCard({ activities }: { activities: CrmActivity[] }) {
  return (
    <SectionCard title="السجل الزمني" icon={Clock}>
      {activities.length === 0 ? <Empty>لا نشاط.</Empty> : (
        <div className="space-y-0">{activities.map((a, i) => {
          const Icon = ICON[a.type] || CircleDot
          const ai = a.actor === "ai:community"
          return (
            <div key={a.id} className="flex gap-2.5">
              <div className="flex flex-col items-center">
                <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ai ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}><Icon className="h-3 w-3" /></div>
                {i < activities.length - 1 && <div className="my-0.5 w-px flex-1 bg-slate-150" />}
              </div>
              <div className="min-w-0 flex-1 pb-3">
                <p className="text-[12px] leading-snug text-slate-700">{a.summary}</p>
                <p className="text-[10.5px] text-slate-400">{(a.actor || "").replace(/^admin:/, "").replace("ai:community", "الفرز الذكي").replace("system:community-triage", "تلقائي").replace("public", "المساهم")} · {fmtRel(a.created_at)}</p>
              </div>
            </div>
          )
        })}</div>
      )}
    </SectionCard>
  )
}
