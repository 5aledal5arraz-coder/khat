"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { runAction } from "@/app/admin/components/run-action"
import { formatDateCompact } from "@/lib/shared/formatters"
import type { ChannelListRow } from "@/lib/podcast-universe/queries"
import {
  incrementalSyncAction,
  initialCrawlAction,
  setPausedAction,
  setHostNameAction,
  setProgramHostAction,
  setRegistryTypeAction,
  startExtractionAction,
  verifyChannelAction,
  type PuActionResult,
} from "../actions"
import { CRAWL_LABEL, REGISTRY_TYPE_LABEL, RUN_STATUS_LABEL, VERIFY_LABEL, countryLabel } from "../labels"

export type ChannelView = Omit<ChannelListRow, "last_crawled_at" | "last_successful_crawl_at"> & {
  last_crawled_at: string | null
  last_successful_crawl_at: string | null
}

function useAction() {
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const run = (fn: () => Promise<PuActionResult>) =>
    start(async () => {
      // runAction never rejects, so a dropped request cannot leave the
      // transition (and every button disabled on it) stuck pending.
      const outcome = await runAction(fn)
      if (!outcome.ok) return setMsg({ ok: false, text: outcome.message })
      const r = outcome.data
      setMsg(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error })
    })
  return { pending, msg, run }
}

function Feedback({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null
  return (
    <p role="status" className={cn("mt-1 text-[11.5px]", msg.ok ? "text-emerald-700" : "text-destructive")}>
      {msg.text}
    </p>
  )
}

function ChannelRow({ c }: { c: ChannelView }) {
  const { pending, msg, run } = useAction()
  const exDone = c.ex_succeeded + c.ex_no_guest + c.ex_failed
  const extractable = c.registry_type === "core_interview"
  return (
    <tr className="border-t border-border/60 align-top">
      <td className="py-2.5 pe-3">
        <div className="font-semibold text-foreground">{c.name}</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground" dir="ltr">
          {c.handle ?? "—"} · {c.youtube_channel_id ?? "—"}
        </div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          {VERIFY_LABEL[c.verification_status] ?? c.verification_status}
          {c.verify_error ? <span className="text-destructive"> — {c.verify_error}</span> : null}
          {c.paused ? <span className="ms-1 rounded-md bg-amber-500/12 px-1.5 text-amber-700">موقوفة</span> : null}
        </div>
        <HostNames channelId={c.id} names={c.host_names ?? []} />
        <ProgramHostsList channelId={c.id} programs={c.program_hosts ?? []} />
      </td>
      <td className="py-2.5 pe-3">{countryLabel(c.country_code)}</td>
      <td className="py-2.5 pe-3">
        <select
          aria-label="نوع القناة في السجل"
          className="rounded-md border border-input bg-background px-2 py-1 text-[12px]"
          value={c.registry_type}
          disabled={pending}
          onChange={(e) => run(() => setRegistryTypeAction(c.id, e.target.value))}
        >
          {Object.entries(REGISTRY_TYPE_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2.5 pe-3 tabular-nums">{c.reported_video_count?.toLocaleString("en-US") ?? "—"}</td>
      <td className="py-2.5 pe-3 tabular-nums">{c.indexed.toLocaleString("en-US")}</td>
      <td className="py-2.5 pe-3 tabular-nums">{c.longform.toLocaleString("en-US")}</td>
      <td className="py-2.5 pe-3 text-[12px]">
        <div>{c.last_crawled_at ? formatDateCompact(c.last_crawled_at) : "—"}</div>
        <div className="text-muted-foreground">{CRAWL_LABEL[c.crawl_status] ?? c.crawl_status}</div>
        {c.last_run_status ? (
          <div className="text-[11px] text-muted-foreground" title={c.last_run_error ?? ""}>
            آخر تشغيل: {RUN_STATUS_LABEL[c.last_run_status] ?? c.last_run_status}
          </div>
        ) : null}
      </td>
      <td className="py-2.5 pe-3 text-[12px] tabular-nums">
        {extractable ? (
          <>
            <div>
              {exDone} / {c.longform}
            </div>
            <div className="text-[11px] text-muted-foreground">
              بانتظار {c.ex_pending} · فشل {c.ex_failed}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">لا استخراج افتراضي</span>
        )}
      </td>
      <td className="py-2.5">
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => verifyChannelAction(c.id))}>
            تحقّق
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || c.verification_status !== "verified" || c.paused}
            onClick={() => run(() => initialCrawlAction(c.id))}
          >
            زحف أولي
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !c.last_successful_crawl_at || c.paused}
            onClick={() => run(() => incrementalSyncAction(c.id))}
          >
            مزامنة
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setPausedAction(c.id, !c.paused))}>
            {c.paused ? "استئناف" : "إيقاف"}
          </Button>
        </div>
        <Feedback msg={msg} />
      </td>
    </tr>
  )
}

export function ChannelsTable({ channels }: { channels: ChannelView[] }) {
  if (channels.length === 0) {
    return <p className="text-muted-foreground">السجل فارغ — شغّل: npx tsx scripts/podcast-universe.ts seed</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-[13px]">
        <thead className="text-[11.5px] text-muted-foreground">
          <tr>
            <th className="py-2 pe-3 text-start font-medium">القناة</th>
            <th className="py-2 pe-3 text-start font-medium">الدولة</th>
            <th className="py-2 pe-3 text-start font-medium">النوع</th>
            <th className="py-2 pe-3 text-start font-medium">المعلن</th>
            <th className="py-2 pe-3 text-start font-medium">المفهرس</th>
            <th className="py-2 pe-3 text-start font-medium">طويلة (٢٠د+)</th>
            <th className="py-2 pe-3 text-start font-medium">آخر زحف</th>
            <th className="py-2 pe-3 text-start font-medium">تقدّم الاستخراج</th>
            <th className="py-2 text-start font-medium">إجراءات</th>
          </tr>
        </thead>
        <tbody>
          {channels.map((c) => (
            <ChannelRow key={c.id} c={c} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ExtractionPanel({ pending, maxBudget, spent }: { pending: number; maxBudget: number; spent: number }) {
  const { pending: busy, msg, run } = useAction()
  const [budget, setBudget] = useState(String(maxBudget))
  const value = Number(budget)
  const valid = Number.isFinite(value) && value > spent && value <= maxBudget
  const remaining = Math.max(0, maxBudget - spent)
  return (
    <div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-[12px] text-muted-foreground">
          السقف الكلي لاستخراج M1 (دولار، يشمل كل ما صُرف سابقاً)
          <input
            type="number"
            min={0.01}
            max={maxBudget}
            step={0.25}
            dir="ltr"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className="mt-1 block w-28 rounded-md border border-input bg-background px-2 py-1.5 text-[13px] text-foreground"
          />
        </label>
        <Button
          size="sm"
          disabled={busy || !valid || pending === 0 || remaining <= 0}
          onClick={() => {
            if (!window.confirm(`تشغيل مدفوع: استخراج الضيوف من ${pending} حلقة. صُرف حتى الآن $${spent.toFixed(4)} من سقف كلي $${value.toFixed(2)}. متابعة؟`)) return
            run(() => startExtractionAction(value))
          }}
        >
          ابدأ الاستخراج
        </Button>
        <span className="text-[11.5px] text-muted-foreground">
          صُرف ${spent.toFixed(4)} — المتبقي ${remaining.toFixed(4)}. يتوقف قبل أي نداء يتجاوز السقف الكلي ويترك الباقي «بانتظار».
        </span>
      </div>
      <Feedback msg={msg} />
    </div>
  )
}

/** The channel's host_names (Addendum 2 c) — manual list, excluded from extraction. */
function HostNames({ channelId, names }: { channelId: string; names: string[] }) {
  const { pending, msg, run } = useAction()
  const [value, setValue] = useState("")
  return (
    <div className="mt-1 text-[11px] text-muted-foreground">
      المقدمون:{" "}
      {names.length === 0 ? "—" : null}
      {names.map((n) => (
        <span key={n} className="me-1 inline-flex items-center gap-1 rounded-md bg-muted px-1.5">
          {n}
          <button
            type="button"
            aria-label={`إزالة ${n}`}
            className="text-destructive"
            disabled={pending}
            onClick={() => run(() => setHostNameAction(channelId, n, true))}
          >
            ×
          </button>
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="أضف مقدّماً"
          className="w-28 rounded-md border border-input bg-background px-1.5 py-0.5 text-[11px] text-foreground"
        />
        <button
          type="button"
          className="text-primary"
          disabled={pending || !value.trim()}
          onClick={() => {
            run(() => setHostNameAction(channelId, value))
            setValue("")
          }}
        >
          إضافة
        </button>
      </span>
      <Feedback msg={msg} />
    </div>
  )
}

/** Program-scoped hosts — shown and removable here; added from the candidate list or the CLI. */
function ProgramHostsList({ channelId, programs }: { channelId: string; programs: Array<{ program: string; hosts: string[] }> }) {
  const { pending, msg, run } = useAction()
  if (programs.length === 0) return null
  return (
    <div className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
      {programs.map((p) => (
        <div key={p.program}>
          مقدمو «{p.program}»:{" "}
          {p.hosts.map((h) => (
            <span key={h} className="me-1 inline-flex items-center gap-1 rounded-md bg-muted px-1.5">
              {h}
              <button
                type="button"
                aria-label={`إزالة ${h}`}
                className="text-destructive"
                disabled={pending}
                onClick={() => run(() => setProgramHostAction(channelId, p.program, h, true))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ))}
      <Feedback msg={msg} />
    </div>
  )
}

export interface HostCandidateView {
  program: string | null
  channel_id: string
  channel_name: string
  person_id: string
  canonical_name: string
  appearances: number
  extracted: number
  share: number
}

/** HOST_CANDIDATE_REVIEW — suggestions only; nothing is excluded until a human accepts. */
export function HostCandidates({ rows }: { rows: HostCandidateView[] }) {
  const { pending, msg, run } = useAction()
  if (rows.length === 0) return <p className="text-muted-foreground">لا مرشحين.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-[12.5px]">
        <thead className="text-[11.5px] text-muted-foreground">
          <tr>
            <th className="py-1.5 pe-3 text-start font-medium">الاسم</th>
            <th className="py-1.5 pe-3 text-start font-medium">القناة</th>
            <th className="py-1.5 pe-3 text-start font-medium">ظهر في</th>
            <th className="py-1.5 text-start font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.channel_id}:${r.person_id}`} className="border-t border-border/60">
              <td className="py-1.5 pe-3">
                <Link className="text-foreground hover:text-primary" href={`/admin/podcast-universe/guests/${r.person_id}`}>
                  {r.canonical_name}
                </Link>
              </td>
              <td className="py-1.5 pe-3">
                {r.channel_name}
                {r.program ? <div className="text-[11px] text-muted-foreground">{r.program}</div> : null}
              </td>
              <td className="py-1.5 pe-3 tabular-nums">
                {r.appearances} / {r.extracted} ({Math.round(r.share * 100)}٪)
              </td>
              <td className="py-1.5">
                {/* Program-scoped when the appearances share a program, so the
                    person stays a guest on the channel's OTHER programs. */}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    run(() => (r.program ? setProgramHostAction(r.channel_id, r.program, r.canonical_name) : setHostNameAction(r.channel_id, r.canonical_name)))
                  }
                >
                  {r.program ? `مقدّم «${r.program}» — أضفه` : "مقدّم القناة — أضفه"}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Feedback msg={msg} />
    </div>
  )
}
