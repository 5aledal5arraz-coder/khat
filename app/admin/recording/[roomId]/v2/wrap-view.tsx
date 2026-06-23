"use client"

/**
 * WrapView — the ENDED mode. The take is done; this is a calm wrap surface:
 * a coverage recap, the CSV export promoted, the pre-written closing options
 * for reference, and a markers recap for hand-off to post.
 */

import { CheckCircle2, Download, Flag, RotateCcw, Mic } from "lucide-react"
import type { LiveV2Marker } from "@/lib/recording-v2/load"
import type { PrepV2ClosingOption } from "@/lib/preparation/v2/types"
import { markerStyle, formatHms, formatPrecise } from "./recording-shared"
import { OptionList } from "./cockpit-bits"

export function WrapView({
  roomId,
  durationMs,
  sectionsTotal,
  sectionsDone,
  questionsAsked,
  questionsTotal,
  markers,
  closingOptions,
  onReset,
  busy,
}: {
  roomId: string
  durationMs: number
  sectionsTotal: number
  sectionsDone: number
  questionsAsked: number
  questionsTotal: number
  markers: LiveV2Marker[]
  closingOptions: PrepV2ClosingOption[]
  onReset: () => void
  busy: boolean
}) {
  const hasMarkers = markers.length > 0
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" dir="rtl">
      <div className="rounded-3xl border border-emerald-500/25 bg-emerald-500/5 p-6 text-center">
        <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600" />
        <h2 className="mt-2 text-[16px] font-semibold text-emerald-700">انتهى التسجيل</h2>
        <div className="mt-1 font-mono text-[26px] font-bold tabular-nums text-foreground" dir="ltr">
          {formatHms(durationMs)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <Metric label="الأقسام" value={`${sectionsDone}/${sectionsTotal}`} />
        <Metric label="الأسئلة المطروحة" value={`${questionsAsked}/${questionsTotal}`} />
        <Metric label="العلامات" value={String(markers.length)} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="text-[12.5px] text-foreground/85">
          {hasMarkers ? `${markers.length} علامة جاهزة للمونتاج` : "لا توجد علامات لتصديرها"}
        </div>
        <a
          href={`/api/admin/recording/${roomId}/markers/export`}
          aria-disabled={!hasMarkers}
          className={
            "inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-[13px] font-semibold text-emerald-700 transition hover:bg-emerald-500/20 " +
            (hasMarkers ? "" : "pointer-events-none opacity-40")
          }
        >
          <Download className="h-4 w-4" /> تصدير العلامات (CSV)
        </a>
      </div>

      {closingOptions.length > 0 && (
        <Panel title="خيارات الختام" icon={<Mic className="h-3.5 w-3.5" />}>
          <OptionList items={closingOptions} />
        </Panel>
      )}

      {hasMarkers && (
        <Panel title="ملخّص العلامات" icon={<Flag className="h-3.5 w-3.5" />}>
          <MarkersRecap markers={markers} />
        </Panel>
      )}

      <div className="flex justify-center pt-1">
        <button
          type="button"
          onClick={onReset}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-xl border border-border/50 px-4 py-2 text-[12.5px] font-medium text-muted-foreground transition hover:bg-background/70 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" /> إعادة ضبط لتسجيل جديد
        </button>
      </div>
    </div>
  )
}

function MarkersRecap({ markers }: { markers: LiveV2Marker[] }) {
  const groups = new Map<string, LiveV2Marker[]>()
  for (const m of markers) {
    const arr = groups.get(m.marker_type) ?? []
    arr.push(m)
    groups.set(m.marker_type, arr)
  }
  return (
    <div className="space-y-2.5">
      {[...groups.entries()].map(([type, ms]) => {
        const st = markerStyle(type)
        const Icon = st.icon
        const sorted = [...ms].sort((a, b) => a.recording_ms - b.recording_ms)
        return (
          <div key={type}>
            <div className={"mb-1 inline-flex items-center gap-1.5 text-[11.5px] font-medium " + st.text}>
              <Icon className="h-3.5 w-3.5" /> {st.label}
              <span className="text-muted-foreground" dir="ltr">
                ({ms.length})
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {sorted.map((m) => (
                <span
                  key={m.id}
                  className={"inline-flex items-center gap-1 rounded-full border border-border/40 px-2 py-0.5 text-[10.5px] " + st.soft}
                >
                  <span className="font-mono tabular-nums text-foreground/70" dir="ltr">
                    {formatPrecise(m.recording_ms)}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background/50 p-3 text-center">
      <div className="text-[10.5px] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-[18px] font-semibold tabular-nums" dir="ltr">
        {value}
      </div>
    </div>
  )
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
      <div className="mb-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}
