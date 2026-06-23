"use client"

/**
 * PreflightView — the WAITING mode. Before the take, this is where the host
 * reads in: the thesis, the planned tone + do/don't, the pre-written opening
 * options (pick + copy), the section arc, and the sensitive zones — all of
 * which the prep generated but the room never showed. Ends in a big GO-LIVE.
 */

import { Sparkles, Mic, Compass, AlertTriangle, Radio, PlayCircle } from "lucide-react"
import type {
  PrepV2HostGuidance,
  PrepV2OpeningOption,
  PrepV2Section,
} from "@/lib/preparation/v2/types"
import { SECTION_TARGET_LEVEL } from "@/lib/recording-v2/energy"
import { SECTION_LABEL_AR } from "./recording-shared"
import { GuidanceList, OptionList, CompactEnergyControl } from "./cockpit-bits"

export function PreflightView({
  title,
  guestName,
  thesis,
  axes,
  hostGuidance,
  openingOptions,
  sensitiveZones,
  sections,
  energy,
  canSetEnergy,
  onSetEnergy,
  onStart,
  busy,
}: {
  title: string
  guestName: string | null
  thesis: string | null
  axes: string[]
  hostGuidance: PrepV2HostGuidance | null
  openingOptions: PrepV2OpeningOption[]
  sensitiveZones: string[]
  sections: PrepV2Section[] | null
  energy: number
  canSetEnergy: boolean
  onSetEnergy: (level: number) => void
  onStart: () => void
  busy: boolean
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4" dir="rtl">
      {/* Header */}
      <div>
        <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-violet-700">
          <Radio className="h-3.5 w-3.5" /> قبل البدء
        </div>
        <h2 className="text-[17px] font-semibold leading-tight text-foreground">{title}</h2>
        {guestName && (
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">ضيف: {guestName}</div>
        )}
      </div>

      {/* Thesis + axes */}
      {thesis && (
        <Panel title="الأطروحة" icon={<Sparkles className="h-3.5 w-3.5" />}>
          <p className="text-[14px] font-medium leading-relaxed text-foreground">{thesis}</p>
          {axes.length > 0 && (
            <ul className="mt-2.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {axes.slice(0, 6).map((a, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-border/40 bg-background/40 px-2.5 py-1.5 text-[12px] text-foreground/85"
                >
                  <span className="me-1 text-muted-foreground" dir="ltr">
                    {i + 1}.
                  </span>
                  {a}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {/* Tone + do/don't */}
      {hostGuidance && (
        <Panel title="النبرة والإرشاد" icon={<Mic className="h-3.5 w-3.5" />}>
          {hostGuidance.overall_tone && (
            <p className="mb-1.5 text-[13px] text-foreground/85">
              <strong className="font-semibold">النبرة:</strong> {hostGuidance.overall_tone}
            </p>
          )}
          {hostGuidance.energy_curve && (
            <p className="mb-3 text-[12.5px] italic text-muted-foreground">
              {hostGuidance.energy_curve}
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <GuidanceList label="افعل" items={hostGuidance.do_list} tone="good" />
            <GuidanceList label="تجنّب" items={hostGuidance.dont_list} tone="bad" />
          </div>
        </Panel>
      )}

      {/* Opening options */}
      {openingOptions.length > 0 && (
        <Panel title="افتتاحيات جاهزة" icon={<PlayCircle className="h-3.5 w-3.5" />}>
          <OptionList items={openingOptions} />
        </Panel>
      )}

      {/* Section roadmap */}
      {sections && sections.length > 0 && (
        <Panel title="مسار الحلقة" icon={<Compass className="h-3.5 w-3.5" />}>
          <ol className="space-y-1.5">
            {sections.map((s, i) => (
              <li
                key={s.kind}
                className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-background/40 px-3 py-2"
              >
                <span className="text-[10.5px] tabular-nums text-muted-foreground" dir="ltr">
                  {i + 1}
                </span>
                <span className="text-[12.5px] font-medium text-foreground">
                  {SECTION_LABEL_AR[s.kind] ?? s.kind}
                </span>
                <span className="text-[11px] text-muted-foreground/85 truncate">
                  {s.target_emotion}
                </span>
                <span className="ms-auto inline-flex items-center gap-2 text-[10.5px] text-muted-foreground" dir="ltr">
                  <TargetDots level={SECTION_TARGET_LEVEL[s.kind] ?? 3} />
                  {s.estimated_minutes}m
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      {/* Sensitive zones */}
      {sensitiveZones.length > 0 && (
        <Panel
          title="مناطق حسّاسة"
          icon={<AlertTriangle className="h-3.5 w-3.5 text-amber-600" />}
          accent
        >
          <GuidanceList label="" items={sensitiveZones} tone="warn" />
        </Panel>
      )}

      {/* GO LIVE */}
      <div className="sticky bottom-3 flex items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3 backdrop-blur">
        <span className="inline-flex items-center gap-2 text-[11.5px] text-muted-foreground">
          الطاقة المبدئية:
          <CompactEnergyControl level={energy} interactive={canSetEnergy} onSet={onSetEnergy} />
        </span>
        <button
          type="button"
          onClick={onStart}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-xl bg-rose-700 px-6 py-3 text-[15px] font-semibold text-white transition hover:bg-rose-800 disabled:opacity-50"
        >
          <Radio className="h-5 w-5" /> ابدأ التسجيل
        </button>
      </div>
    </div>
  )
}

function TargetDots({ level }: { level: number }) {
  const n = Math.max(0, Math.min(5, level))
  return (
    <span className="inline-flex gap-0.5" title={`الطاقة المستهدفة ${n}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={"h-1.5 w-1.5 rounded-full " + (i < n ? "bg-amber-500" : "bg-muted-foreground/25")}
        />
      ))}
    </span>
  )
}

function Panel({
  title,
  icon,
  accent,
  children,
}: {
  title: string
  icon?: React.ReactNode
  accent?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={
        "rounded-2xl border p-4 " +
        (accent ? "border-amber-500/30 bg-amber-500/5" : "border-border/40 bg-background/40")
      }
    >
      <div className="mb-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  )
}
