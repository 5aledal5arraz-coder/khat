"use client"

import { useState, useTransition } from "react"
import { AlertTriangle, CheckCircle2, Link2, Loader2, RefreshCw, Unlink } from "lucide-react"

import { runAction } from "@/app/admin/components/run-action"

import { disconnectAction, refreshAudienceAction } from "./actions"

export interface GrantView {
  channelId: string | null
  account: string | null
  connectedBy: string | null
  connectedAt: string | null
  lastUsedAt: string | null
  lastError: string | null
  lastErrorAt: string | null
}

export interface SnapshotView {
  report: string
  periodStart: string
  periodEnd: string
  measuredAt: string
  top: { label: string; percent: number }[]
}

const WINDOWS = [
  // First, because it is the one Khalid asked for and the one a sponsor can
  // actually check: «قيس من نزلت اول حلقه بودكاست خط الى اليوم». Its start is
  // min(episodes.release_date), not a guess.
  { key: "since-first", label: "منذ أول حلقة" },
  { key: "28", label: "آخر ٢٨ يومًا" },
  { key: "90", label: "آخر ٩٠ يومًا" },
  { key: "365", label: "آخر سنة" },
  { key: "1095", label: "آخر ٣ سنوات" },
]

/**
 * The connect/measure panel.
 *
 * ── IT REPORTS THE LAST CALL, NOT THE ROW'S EXISTENCE ─────────────────────
 * "مربوط" here never means "a row exists". A grant the owner revoked inside
 * their Google account leaves the row untouched and still decrypting, so a
 * screen that reads the row would say «مربوط» over a connection that has been
 * dead for weeks — the exact silent-failure shape this codebase keeps
 * producing. `lastError` is therefore shown as loudly as the success state.
 */
export function ConnectPanel({
  configProblem,
  keyProblem,
  grant,
  snapshots,
}: {
  configProblem: string | null
  keyProblem: string | null
  grant: GrantView | null
  snapshots: SnapshotView[]
}) {
  const [pending, startTransition] = useTransition()
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const blocked = configProblem ?? keyProblem

  function refresh(windowKey: string) {
    setBusy(windowKey)
    setNotice(null)
    startTransition(async () => {
      const outcome = await runAction(() => refreshAudienceAction(windowKey))
      setBusy(null)
      if (!outcome.ok) return setNotice({ ok: false, text: outcome.message })
      setNotice(
        outcome.data.ok
          ? { ok: true, text: outcome.data.message }
          : { ok: false, text: outcome.data.error }
      )
    })
  }

  function disconnect() {
    if (!confirm("إلغاء ربط YouTube Analytics؟ ستحتاج إلى الموافقة من جديد لقياس الجمهور.")) return
    setBusy("disconnect")
    setNotice(null)
    startTransition(async () => {
      const outcome = await runAction(() => disconnectAction())
      setBusy(null)
      if (!outcome.ok) return setNotice({ ok: false, text: outcome.message })
      setNotice(
        outcome.data.ok
          ? { ok: true, text: outcome.data.message }
          : { ok: false, text: outcome.data.error }
      )
    })
  }

  return (
    <div className="space-y-6">
      {blocked ? (
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-accent-strong" />
            <div>
              <p className="font-semibold text-foreground">الإعداد غير مكتمل</p>
              <p className="mt-1 text-caption text-muted-foreground">{blocked}</p>
              <p className="mt-2 text-micro text-muted-foreground">
                أضف القيم في <code>.env.local</code> ثم أعد تشغيل الخادم.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Status ── */}
      <div className="rounded-xl border border-border bg-card p-5">
        {grant ? (
          <>
            <div className="flex items-center gap-2">
              {grant.lastError ? (
                <AlertTriangle className="h-5 w-5 text-accent-strong" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-primary" />
              )}
              <p className="font-semibold text-foreground">
                {grant.lastError ? "مربوط، لكن آخر محاولة فشلت" : "مربوط"}
              </p>
            </div>
            <dl className="mt-4 grid gap-x-6 gap-y-2 text-caption sm:grid-cols-2">
              <Row label="القناة" value={grant.account ?? grant.channelId} />
              <Row label="ربطه" value={grant.connectedBy} />
              <Row label="تاريخ الربط" value={grant.connectedAt} />
              <Row label="آخر قياس ناجح" value={grant.lastUsedAt ?? "لم يُقس بعد"} />
            </dl>
            {grant.lastError ? (
              <p className="mt-4 rounded-lg bg-accent/5 p-3 text-micro text-accent-strong">
                {grant.lastErrorAt ? `${grant.lastErrorAt} — ` : ""}
                {grant.lastError}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-caption text-muted-foreground">
            غير مربوط. الأعمار والدول لا تأتي من مفتاح API — تحتاج موافقة من حساب جوجل
            المالك للقناة.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          {/* A plain link, not a fetch: the OAuth flow is a full-page
              navigation to accounts.google.com and back. */}
          <a
            href={blocked ? undefined : "/api/admin/youtube/oauth/start"}
            aria-disabled={!!blocked}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-caption font-semibold ${
              blocked
                ? "pointer-events-none bg-muted text-muted-foreground"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
          >
            <Link2 className="h-4 w-4" />
            {grant ? "إعادة الربط" : "اربط الحساب"}
          </a>
          {grant ? (
            <button
              type="button"
              onClick={disconnect}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-caption font-semibold text-foreground hover:bg-muted/40 disabled:opacity-50"
            >
              {busy === "disconnect" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlink className="h-4 w-4" />
              )}
              إلغاء الربط
            </button>
          ) : null}
        </div>
      </div>

      {/* ── Measure ── */}
      {grant ? (
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="font-semibold text-foreground">قِس الجمهور</p>
          <p className="mt-1 text-caption text-muted-foreground">
            اختر الفترة. الرقم يُخزَّن مع فترته، وتُطبع الفترة بجانبه في صفحة الشراكات —
            «٤٠٪ من السعودية» في ٢٨ يومًا ليست نفسها في سنة.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                type="button"
                onClick={() => refresh(w.key)}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-caption font-medium text-foreground hover:border-primary/50 hover:bg-muted/40 disabled:opacity-50"
              >
                {busy === w.key ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {w.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {notice ? (
        <p
          className={`rounded-lg p-3 text-caption ${
            notice.ok ? "bg-primary/5 text-primary" : "bg-accent/5 text-accent-strong"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      {/* ── What is stored right now ── */}
      {snapshots.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {snapshots.map((s) => (
            <div key={s.report} className="rounded-xl border border-border bg-card p-5">
              <p className="font-semibold text-foreground">
                {s.report === "countries" ? "الدول" : "الفئات العمرية"}
              </p>
              <p className="mt-1 text-micro text-muted-foreground">
                {s.periodStart} ← {s.periodEnd} · قيست {s.measuredAt}
              </p>
              <ul className="mt-3 space-y-1.5">
                {s.top.map((r) => (
                  <li key={r.label} className="flex items-center justify-between text-caption">
                    <span className="text-foreground">{r.label}</span>
                    <span className="font-semibold text-muted-foreground">{r.percent}%</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="font-medium text-foreground">{value ?? "—"}</dd>
    </div>
  )
}
