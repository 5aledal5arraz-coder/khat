"use client"

/**
 * OnAirView — the LIVE/PAUSED mode and the centerpiece of the redesign.
 *
 * A focus deck, not a dashboard. One focal point: the current question, large
 * and centered, with its follow-up + approved insights inline. Everything the
 * host needs in their periphery (time, section position, energy, connection,
 * team) is compressed into one thin StatusRail; everything else (full question
 * bank, timeline, notes, team) is one tap away in collapsed drawers. Flagging
 * is one thumb. The host's eyes stay on the guest.
 */

import { useState } from "react"
import {
  Check,
  Circle,
  ChevronRight,
  ChevronLeft,
  CornerDownLeft,
  ArrowLeft,
  List,
  GanttChartSquare,
  NotebookPen,
  LayoutGrid,
  CheckCircle2,
} from "lucide-react"
import type { LiveV2Marker, LiveV2Snapshot } from "@/lib/recording-v2/load"
import type { PrepV2Question, SectionKind } from "@/lib/preparation/v2/types"
import { isLiveInsight } from "@/lib/preparation/v2/types"
import { matchesEnergy, type EnergyBand } from "@/lib/recording-v2/energy"
import { Zap } from "lucide-react"
import { SECTION_LABEL_AR, computeElapsedMs } from "./recording-shared"
import { Timeline, type EnergyPoint } from "./recording-clock"
import { StatusRail } from "./status-rail"
import { FlagControl } from "./flag-control"
import { TeamDrawer } from "./team-drawer"
import {
  CoachHintBanner,
  Drawer,
  InsightStrip,
  PriorityChip,
  RiskChip,
  TypeChips,
} from "./cockpit-bits"
import type { QuickMarkerType } from "@/lib/recording-v2/marker-types"

type Sections = NonNullable<LiveV2Snapshot["preparation"]["prep_v2"]>["episode_sections"]

export function OnAirView(props: {
  status: "live" | "paused"
  elapsedMsAtBaseline: number
  windowStartedAt: number | null
  busy: boolean
  onPause: () => void
  onResume: () => void
  onEnd: () => void
  sections: Sections | null
  sectionIndex: number
  currentSection: SectionKind | null
  moveTo: (idx: number) => void
  questions: PrepV2Question[]
  completedIds: Set<string>
  onToggleDone: (id: string) => void
  band: EnergyBand
  usedInsightIds: Set<string>
  onUseInsight: (insight: import("@/lib/preparation/v2/types").PrepV2Insight) => void
  energy: number
  canSetEnergy: boolean
  onSetEnergy: (level: number) => void
  contentMarkers: LiveV2Marker[]
  energyHistory: EnergyPoint[]
  hint: string | null
  notes: string
  onNotesChange: (s: string) => void
  onTag: (type: QuickMarkerType, label: string) => void
}) {
  const [teamOpen, setTeamOpen] = useState(false)
  const [heroId, setHeroId] = useState<string | null>(null)

  // The live clock + per-frame ticking is fully isolated inside <CompactClock>
  // (its own rAF re-renders only itself, never this view). So OnAirView derives
  // a one-time elapsed snapshot here purely for the (collapsed) Timeline drawer —
  // a static playhead is fine for a review surface, and there's no per-frame
  // cost since nothing here ticks.
  const timelineElapsed = computeElapsedMs(
    props.elapsedMsAtBaseline,
    props.windowStartedAt,
    props.status === "live",
  )

  const open = props.questions.filter((q) => !props.completedIds.has(q.id))
  const hero =
    open.find((q) => q.id === heroId) ?? open[0] ?? null
  const nextUp = open.filter((q) => q.id !== hero?.id).slice(0, 2)

  const sectionLabel = props.currentSection
    ? SECTION_LABEL_AR[props.currentSection] ?? props.currentSection
    : null
  const sectionTotal = props.sections?.length ?? 0

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <StatusRail
        status={props.status}
        elapsedMsAtBaseline={props.elapsedMsAtBaseline}
        windowStartedAt={props.windowStartedAt}
        busy={props.busy}
        onPause={props.onPause}
        onResume={props.onResume}
        onEnd={props.onEnd}
        sectionLabel={sectionLabel}
        sectionIndex={props.sectionIndex}
        sectionTotal={sectionTotal}
        energy={props.energy}
        canSetEnergy={props.canSetEnergy}
        onSetEnergy={props.onSetEnergy}
        onOpenTeam={() => setTeamOpen((o) => !o)}
      />

      <TeamDrawer
        open={teamOpen}
        onClose={() => setTeamOpen(false)}
        sectionKey={props.currentSection ?? undefined}
      />

      {props.hint && (
        <CoachHintBanner hint={props.hint} energy={props.energy} section={props.currentSection} />
      )}

      {props.sections && (
        <SectionSwitcher
          sections={props.sections}
          currentIndex={props.sectionIndex}
          onSelect={props.moveTo}
        />
      )}

      {/* THE FOCAL POINT */}
      {hero ? (
        <QuestionHero
          key={hero.id}
          question={hero}
          band={props.band}
          done={props.completedIds.has(hero.id)}
          onToggleDone={() => props.onToggleDone(hero.id)}
          usedInsightIds={props.usedInsightIds}
          onUseInsight={props.onUseInsight}
        />
      ) : (
        <SectionCleared
          atLast={props.sectionIndex >= sectionTotal - 1}
          onNext={() => props.moveTo(props.sectionIndex + 1)}
        />
      )}

      {nextUp.length > 0 && <NextUpPeek questions={nextUp} onPick={setHeroId} />}

      <FlagControl onTag={props.onTag} />

      {/* Progressive disclosure — everything else is one tap away */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Drawer
          title="كل الأسئلة"
          icon={<List className="h-4 w-4" />}
          badge={
            <span className="text-[10.5px] text-muted-foreground" dir="ltr">
              {open.length}/{props.questions.length}
            </span>
          }
        >
          <QuestionBank
            questions={props.questions}
            completedIds={props.completedIds}
            onToggleDone={props.onToggleDone}
            onPickHero={setHeroId}
            band={props.band}
          />
        </Drawer>

        <Drawer title="الخط الزمني" icon={<GanttChartSquare className="h-4 w-4" />}>
          <Timeline
            elapsedMs={timelineElapsed}
            sections={props.sections}
            markers={props.contentMarkers}
            energyHistory={props.energyHistory}
            currentSectionIndex={props.sectionIndex}
          />
        </Drawer>

        <Drawer title="ملاحظاتي" icon={<NotebookPen className="h-4 w-4" />}>
          <textarea
            value={props.notes}
            onChange={(e) => props.onNotesChange(e.target.value)}
            placeholder="اكتب ملاحظاتك هنا. يحفظ تلقائياً."
            className="min-h-[100px] w-full resize-y rounded-xl border border-border/40 bg-background/40 p-3 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-violet-500/40 focus:outline-none"
          />
        </Drawer>
      </div>
    </div>
  )
}

// ─── Question hero (the teleprompter) ─────────────────────────────────

function QuestionHero({
  question,
  band,
  done,
  onToggleDone,
  usedInsightIds,
  onUseInsight,
}: {
  question: PrepV2Question
  band: EnergyBand
  done: boolean
  onToggleDone: () => void
  usedInsightIds: Set<string>
  onUseInsight: (insight: import("@/lib/preparation/v2/types").PrepV2Insight) => void
}) {
  const q = question
  const liveInsights = (q.insights ?? []).filter(isLiveInsight)
  return (
    <div className="rounded-2xl border border-border/40 bg-background/60 p-5" dir="rtl">
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <PriorityChip priority={q.priority} />
        <TypeChips types={q.types} />
        <RiskChip risk={q.risk_level} />
        {matchesEnergy(q, band) && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            <Zap className="h-2.5 w-2.5" /> يناسب الطاقة
          </span>
        )}
      </div>

      <div className="text-[21px] font-medium leading-[1.55] text-foreground">{q.text}</div>

      {q.purpose && (
        <div className="mt-2 text-[12.5px] text-muted-foreground/85">{q.purpose}</div>
      )}
      {q.follow_up_prompt && (
        <div className="mt-2 inline-flex items-start gap-1.5 text-[14px] text-foreground/80">
          <CornerDownLeft className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          {q.follow_up_prompt}
        </div>
      )}

      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-border/30 pt-3">
        <button
          type="button"
          onClick={onToggleDone}
          aria-pressed={done}
          className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-1.5 text-[13px] font-semibold text-emerald-700 transition hover:bg-emerald-500/20"
        >
          <Check className="h-4 w-4" /> طُرِح
        </button>
        {liveInsights.length > 0 && (
          <InsightStrip
            insights={liveInsights}
            used={usedInsightIds}
            onUse={onUseInsight}
            markDisabled={false}
          />
        )}
      </div>
    </div>
  )
}

function NextUpPeek({
  questions,
  onPick,
}: {
  questions: PrepV2Question[]
  onPick: (id: string) => void
}) {
  return (
    <div className="space-y-1.5" dir="rtl">
      {questions.map((q) => (
        <button
          key={q.id}
          type="button"
          onClick={() => onPick(q.id)}
          className="flex w-full items-center gap-2 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-start transition hover:bg-background/70"
        >
          <span className="text-[10.5px] text-muted-foreground">التالي</span>
          <span className="truncate text-[13px] text-foreground/85">{q.text}</span>
          <ArrowLeft className="ms-auto h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      ))}
    </div>
  )
}

function SectionCleared({ atLast, onNext }: { atLast: boolean; onNext: () => void }) {
  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6 text-center" dir="rtl">
      <CheckCircle2 className="mx-auto h-6 w-6 text-emerald-600" />
      <div className="mt-2 text-[13.5px] font-medium text-emerald-700">تمت تغطية أسئلة هذا القسم</div>
      {!atLast && (
        <button
          type="button"
          onClick={onNext}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-4 py-1.5 text-[12.5px] font-medium text-violet-700 transition hover:bg-violet-500/20"
        >
          القسم التالي <ChevronLeft className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

// ─── Section switcher (compact) ───────────────────────────────────────

function SectionSwitcher({
  sections,
  currentIndex,
  onSelect,
}: {
  sections: Sections
  currentIndex: number
  onSelect: (idx: number) => void
}) {
  const [jumpOpen, setJumpOpen] = useState(false)
  return (
    <div dir="rtl">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onSelect(currentIndex - 1)}
          disabled={currentIndex <= 0}
          aria-label="القسم السابق"
          className="rounded-lg border border-border/50 p-1.5 text-muted-foreground transition hover:bg-background/70 disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setJumpOpen((o) => !o)}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border/40 bg-background/40 px-3 py-1.5 text-[12.5px] font-medium text-foreground/85 transition hover:bg-background/70"
        >
          <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
          {SECTION_LABEL_AR[sections[currentIndex]?.kind] ?? "—"}
          <span className="text-[10.5px] text-muted-foreground" dir="ltr">
            {currentIndex + 1}/{sections.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onSelect(currentIndex + 1)}
          disabled={currentIndex >= sections.length - 1}
          aria-label="القسم التالي"
          className="rounded-lg border border-border/50 p-1.5 text-muted-foreground transition hover:bg-background/70 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
      {jumpOpen && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 rounded-xl border border-border/40 bg-background/40 p-2 sm:grid-cols-3">
          {sections.map((s, i) => (
            <button
              key={s.kind}
              type="button"
              onClick={() => {
                onSelect(i)
                setJumpOpen(false)
              }}
              className={
                "rounded-lg px-2 py-1.5 text-[11.5px] font-medium transition " +
                (i === currentIndex
                  ? "bg-violet-500/15 text-violet-700"
                  : "text-foreground/80 hover:bg-background/70")
              }
            >
              {SECTION_LABEL_AR[s.kind] ?? s.kind}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Question bank (the full ranked list, in a drawer) ────────────────

function QuestionBank({
  questions,
  completedIds,
  onToggleDone,
  onPickHero,
  band,
}: {
  questions: PrepV2Question[]
  completedIds: Set<string>
  onToggleDone: (id: string) => void
  onPickHero: (id: string) => void
  band: EnergyBand
}) {
  if (questions.length === 0) {
    return <p className="text-[12px] text-muted-foreground">لا توجد أسئلة في هذا القسم.</p>
  }
  return (
    <ul className="space-y-2" dir="rtl">
      {questions.map((q) => {
        const done = completedIds.has(q.id)
        return (
          <li
            key={q.id}
            className={
              "rounded-xl border p-2.5 " +
              (done
                ? "border-emerald-500/40 bg-emerald-500/5 opacity-70"
                : q.priority === "must_ask"
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-border/40 bg-background/30")
            }
          >
            <div className="flex items-start gap-2">
              <button
                type="button"
                onClick={() => onToggleDone(q.id)}
                aria-pressed={done}
                title={done ? "تراجع عن الإكمال" : "تحديد كمطروح"}
                className={
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition " +
                  (done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : "border-border/60 text-transparent hover:border-emerald-500/60")
                }
              >
                {done ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2" />}
              </button>
              <button
                type="button"
                onClick={() => onPickHero(q.id)}
                disabled={done}
                className="min-w-0 flex-1 text-start disabled:cursor-default"
              >
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <PriorityChip priority={q.priority} />
                  <RiskChip risk={q.risk_level} />
                  {!done && matchesEnergy(q, band) && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                      <Zap className="h-2.5 w-2.5" /> يناسب الطاقة
                    </span>
                  )}
                </div>
                <div
                  className={
                    "text-[13.5px] font-medium leading-snug " +
                    (done ? "text-muted-foreground line-through" : "text-foreground")
                  }
                >
                  {q.text}
                </div>
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
