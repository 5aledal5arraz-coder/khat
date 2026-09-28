"use client"

/**
 * OnAirView — the LIVE/PAUSED mode and the centerpiece of the cockpit.
 *
 * A focus deck, not a dashboard. One focal point: the current question, large,
 * with what the host needs FOR IT in the same glance — the «قبل» fact to hold
 * before asking, the follow-up, the sensitive-zone line when the question is
 * حسّاس, the chosen opening on the very first question, the closing options in
 * the last section. The periphery (time, section clock, energy, team,
 * connection, pause, end) is the sticky StatusRail; the hands live on the
 * fixed ThumbBar at the bottom. Everything else is one tap away in sheets that
 * overlay instead of pushing the question around.
 */

import { useState } from "react"
import {
  ChevronRight,
  ChevronLeft,
  CornerDownLeft,
  ArrowLeft,
  List,
  GanttChartSquare,
  NotebookPen,
  LayoutGrid,
  CheckCircle2,
  BookOpen,
  AlertTriangle,
  Mic,
  PencilLine,
  Lightbulb,
  Circle,
  Check,
} from "lucide-react"
import type { LiveV2Marker, LiveV2Snapshot } from "@/lib/recording-v2/load"
import type { PrepV2Insight, PrepV2Question, SectionKind } from "@/lib/preparation/v2/types"
import { isLiveInsight } from "@/lib/preparation/v2/types"
import {
  ENERGY_BAND_LABEL_AR,
  ENERGY_FIT_LABEL_AR,
  energyBand,
  matchesEnergy,
  type EnergyBand,
} from "@/lib/recording-v2/energy"
import { resolveHero, type EnergySuggestion } from "@/lib/recording-v2/energy-handshake"
import { relevantSensitiveZone } from "@/lib/recording-v2/live-sync"
import { Zap } from "lucide-react"
import { computeElapsedMs } from "./recording-shared"
import { sectionLabelAr, type PrepFormat } from "@/lib/preparation/v2/format"
import { Timeline, type EnergyPoint } from "./recording-clock"
import { StatusRail } from "./status-rail"
import { ThumbBar, type TagResult } from "./flag-control"
import { TeamDrawer } from "./team-drawer"
import {
  CoachHintBanner,
  Drawer,
  GuidanceList,
  InsightStrip,
  PriorityChip,
  RiskChip,
  Sheet,
  TypeChips,
} from "./cockpit-bits"
import type { QuickMarkerType } from "@/lib/recording-v2/marker-types"
import { cn } from "@/lib/utils"

type PrepV2 = NonNullable<LiveV2Snapshot["preparation"]["prep_v2"]>
type Sections = PrepV2["episode_sections"]

export function OnAirView(props: {
  status: "live" | "paused"
  elapsedMsAtBaseline: number
  windowStartedAt: number | null
  busy: boolean
  onPause: () => void
  onResume: () => void
  onEnd: () => void
  prep: PrepV2
  sections: Sections | null
  sectionIndex: number
  currentSection: SectionKind | null
  /** NET ms the current section began at (server-stamped). */
  sectionStartedMs: number | null
  moveTo: (idx: number) => void
  questions: PrepV2Question[]
  completedIds: Set<string>
  onToggleDone: (id: string) => void
  /** Mark the question ON SCREEN as asked (with its undo). */
  onAsked: (id: string) => void
  band: EnergyBand
  usedInsightIds: Set<string>
  onUseInsight: (insight: PrepV2Insight) => void
  /** The shared, live value — what everyone in the room sees. */
  energy: number
  /** What the question ranking is actually built on. Only the host moves it. */
  approvedEnergy: number
  /** The director's cue awaiting a decision, if any. */
  suggestion: EnergySuggestion | null
  /** A cue that just lapsed — shown briefly so the drop is never silent. */
  lapsedSuggestion: { level: number; at: number } | null
  onApproveEnergy: () => void
  /**
   * The pinned question, owned by the orchestrator. It pins what is DISPLAYED,
   * so the question on screen only changes by the host's hand.
   */
  heroId: string | null
  onPickHero: (id: string) => void
  /** The pinned question's wording was edited from the prep page mid-take. */
  heroEdited: boolean
  /**
   * False when NO ordering of this section's open questions changes with the
   * dial — every remaining question carries the same intensity.
   */
  energyReordersSection: boolean
  /** The host has moved the dial this take — the "flat section" line waits for it. */
  dialTouched: boolean
  canSetEnergy: boolean
  onSetEnergy: (level: number) => void
  contentMarkers: LiveV2Marker[]
  energyHistory: EnergyPoint[]
  hint: string | null
  /** Episode format — the coaching banner's planned level depends on it. */
  format: PrepFormat
  /** The opening the host picked in the read-in (or the first one). */
  openingLine: { approach: string; text: string } | null
  notes: string
  onNotesChange: (s: string) => void
  onTag: (type: QuickMarkerType, label: string) => Promise<TagResult>
  /** Keyboard legend («؟»), owned by the orchestrator's key handler. */
  legendOpen: boolean
  onCloseLegend: () => void
}) {
  const [teamOpen, setTeamOpen] = useState(false)
  const [refOpen, setRefOpen] = useState(false)

  // A one-time elapsed snapshot for the (collapsed) Timeline drawer — a static
  // playhead is fine for a review surface, and nothing here ticks per frame.
  const timelineElapsed = computeElapsedMs(
    props.elapsedMsAtBaseline,
    props.windowStartedAt,
    props.status === "live",
  )

  const open = props.questions.filter((q) => !props.completedIds.has(q.id))
  const hero = resolveHero(open, props.heroId)
  const nextUp = open.filter((q) => q.id !== hero?.id).slice(0, 2)

  const sectionTotal = props.sections?.length ?? 0
  const section = props.sections?.[props.sectionIndex] ?? null
  const sectionLabel = props.currentSection
    ? sectionLabelAr(props.currentSection, props.sections)
    : null
  const isCourse = props.format === "course"
  const atFirstSection = props.sectionIndex === 0
  const atLastSection = sectionTotal > 0 && props.sectionIndex >= sectionTotal - 1
  // «first question of section 1»: nothing in that section asked yet.
  const showOpening =
    atFirstSection && !!props.openingLine && !props.questions.some((q) => props.completedIds.has(q.id))

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4 lg:max-w-5xl" style={{ paddingBottom: "calc(var(--khat-bottom-bar, 96px) + 24px)" }}>
      <StatusRail
        status={props.status}
        elapsedMsAtBaseline={props.elapsedMsAtBaseline}
        windowStartedAt={props.windowStartedAt}
        busy={props.busy}
        onPause={props.onPause}
        onResume={props.onResume}
        onEnd={props.onEnd}
        sectionLabel={sectionLabel}
        sectionStartedMs={props.sectionStartedMs}
        sectionEstimatedMinutes={section?.estimated_minutes ?? null}
        energy={props.energy}
        approvedEnergy={props.approvedEnergy}
        canSetEnergy={props.canSetEnergy}
        onSetEnergy={props.onSetEnergy}
        onOpenTeam={() => setTeamOpen(true)}
      />

      {/*
        ONE reserved slot of a FIXED height, one line. A banner appearing or
        wrapping used to shove the question down in front of a host reading it
        aloud. Empty, it reserves the space and shows nothing. The coaching
        whisper is muted while paused — there is nothing to coach.
      */}
      <div className="h-11 overflow-hidden" aria-live="polite">
        {props.suggestion ? (
          <EnergyCueBanner
            suggestion={props.suggestion}
            approvedEnergy={props.approvedEnergy}
            onApprove={props.onApproveEnergy}
          />
        ) : props.lapsedSuggestion ? (
          <EnergyLapsedBanner level={props.lapsedSuggestion.level} />
        ) : props.hint && props.status === "live" ? (
          <CoachHintBanner
            hint={props.hint}
            energy={props.approvedEnergy}
            section={props.currentSection}
            format={props.format}
          />
        ) : null}
      </div>

      {props.sections && (
        <SectionSwitcher
          sections={props.sections}
          currentIndex={props.sectionIndex}
          onSelect={props.moveTo}
          onOpenReference={() => setRefOpen(true)}
        />
      )}

      {/* Course: what this module is FOR, under its title (the rail carries
          the title). The host teaches toward the objective and hands over the
          tool — both used to exist only in the read-in. */}
      {isCourse && section && (section.learning_objective || section.takeaway_tool) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-foreground" dir="rtl">
          {section.learning_objective && (
            <span>
              <span className="font-semibold text-primary">الهدف:</span> {section.learning_objective}
            </span>
          )}
          {section.takeaway_tool && (
            <span>
              <span className="font-semibold text-primary">الأداة:</span> {section.takeaway_tool}
            </span>
          )}
        </div>
      )}

      {/* Honesty about REACH — but only once the host has actually moved the
          dial. Before that the line answered a question nobody had asked. */}
      {props.dialTouched && !props.energyReordersSection && open.length > 0 && (
        <p className="text-[14px] text-muted-foreground" dir="rtl">
          أسئلة هذا القسم متقاربة الشدّة — المؤشّر ما يغيّر ترتيبها هنا.
        </p>
      )}

      {/* THE FOCAL POINT */}
      {hero ? (
        <QuestionHero
          key={hero.id}
          question={hero}
          band={props.band}
          edited={props.heroEdited}
          openingLine={showOpening ? props.openingLine : null}
          sensitiveLine={
            hero.risk_level === "high"
              ? relevantSensitiveZone(hero.text, props.prep.sensitive_zones)
              : null
          }
          usedInsightIds={props.usedInsightIds}
          onUseInsight={props.onUseInsight}
        />
      ) : (
        <SectionCleared
          atLast={atLastSection}
          onNext={() => props.moveTo(props.sectionIndex + 1)}
        />
      )}

      {/* Closing options surface by themselves in the last section. */}
      {atLastSection && props.prep.closing_options?.length > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3.5" dir="rtl">
          <div className="mb-1.5 inline-flex items-center gap-1.5 text-[14px] font-semibold text-primary">
            <Mic className="h-4 w-4" /> للختام
          </div>
          <ul className="space-y-1.5">
            {props.prep.closing_options.map((o, i) => (
              <li key={i} className="text-[15px] leading-relaxed text-foreground">
                <span className="font-medium text-muted-foreground">{o.approach}: </span>
                {o.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {nextUp.length > 0 && <NextUpPeek questions={nextUp} onPick={props.onPickHero} />}

      {/* Progressive disclosure — everything else is one tap away */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Drawer
          title="كل الأسئلة"
          icon={<List className="h-4 w-4" />}
          badge={
            <span className="text-[12px] text-muted-foreground" dir="ltr">
              {open.length}/{props.questions.length}
            </span>
          }
        >
          <QuestionBank
            questions={props.questions}
            completedIds={props.completedIds}
            onToggleDone={props.onToggleDone}
            onPickHero={props.onPickHero}
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
            className="min-h-[100px] w-full resize-y rounded-xl border border-border/40 bg-background/40 p-3 text-[14px] leading-relaxed text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none"
          />
        </Drawer>
      </div>

      <ThumbBar
        onTag={props.onTag}
        onAsked={() => hero && props.onAsked(hero.id)}
        askedDisabled={!hero}
      />

      <TeamDrawer
        open={teamOpen}
        onClose={() => setTeamOpen(false)}
        sectionKey={props.currentSection ?? undefined}
      />

      <Sheet open={refOpen} onClose={() => setRefOpen(false)} title="مرجع">
        <ReferenceContent prep={props.prep} section={section} sections={props.sections} isCourse={isCourse} />
      </Sheet>

      <Sheet open={props.legendOpen} onClose={props.onCloseLegend} title="اختصارات لوحة المفاتيح">
        <ShortcutLegend />
      </Sheet>
    </div>
  )
}

// ─── The director's energy cue (propose → approve) ────────────────────

/**
 * The director asks; the host decides. Until he taps «اعتمد» the question order
 * does not move — approving is the ONLY thing that re-ranks, and even then the
 * question on screen stays put (see the pin).
 *
 * One line, no wrap: it lives in the fixed-height slot above the question.
 * It pulses TWICE on arrival, then holds still — `animate-pulse` looped for as
 * long as the cue was up, a moving object in the host's eyeline.
 */
function EnergyCueBanner({
  suggestion,
  approvedEnergy,
  onApprove,
}: {
  suggestion: EnergySuggestion
  approvedEnergy: number
  onApprove: () => void
}) {
  const proposed = ENERGY_BAND_LABEL_AR[energyBand(suggestion.level)]
  const current = ENERGY_BAND_LABEL_AR[energyBand(approvedEnergy)]
  return (
    <div
      className={cn(
        "flex h-11 items-center justify-between gap-2 rounded-xl border border-primary/40 bg-primary/10 px-3",
        // One arrival pulse per window at most — a second cue inside the same
        // 90s replaces this one in place, silently.
        suggestion.pulse && "animate-[pulse_1s_ease-in-out_2]",
      )}
      dir="rtl"
    >
      <span className="inline-flex min-w-0 items-center gap-2 truncate text-[14px] font-medium text-primary">
        <Zap className="h-4 w-4 shrink-0 text-primary" />
        <span className="truncate">المخرج يقترح: {proposed} · ترتيبك الآن على {current}</span>
      </span>
      <button
        type="button"
        onClick={onApprove}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/15 px-3.5 text-[14px] font-semibold text-primary transition hover:bg-primary/25"
      >
        <Check className="h-4 w-4" /> اعتمد
      </button>
    </div>
  )
}

/** A cue that lapsed. Shown, never swallowed — silence would read as "taken". */
function EnergyLapsedBanner({ level }: { level: number }) {
  return (
    <div
      className="flex h-11 items-center gap-2 truncate rounded-xl border border-border/50 bg-background/50 px-3 text-[14px] text-muted-foreground"
      dir="rtl"
    >
      <Zap className="h-4 w-4 shrink-0 text-muted-foreground" />
      سقط اقتراح المخرج ({ENERGY_BAND_LABEL_AR[energyBand(level)]}) — ترتيبك ما تغيّر
    </div>
  )
}

// ─── Question hero (the teleprompter) ─────────────────────────────────

function QuestionHero({
  question,
  band,
  edited,
  openingLine,
  sensitiveLine,
  usedInsightIds,
  onUseInsight,
}: {
  question: PrepV2Question
  band: EnergyBand
  edited: boolean
  openingLine: { approach: string; text: string } | null
  sensitiveLine: string | null
  usedInsightIds: Set<string>
  onUseInsight: (insight: PrepV2Insight) => void
}) {
  const q = question
  const liveInsights = (q.insights ?? []).filter(isLiveInsight)
  // «قبل» cards are what to HOLD before asking — shown, not hidden behind a
  // tap. «أثناء» / «بعد» are for reacting to the answer, so they stay behind
  // «إسناد» and open full width below the question.
  const beforeCards = liveInsights.filter((i) => i.timing === "before")
  const laterCards = liveInsights.filter((i) => i.timing !== "before")
  return (
    <div className="rounded-2xl border border-border/50 bg-card p-5" dir="rtl">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <PriorityChip priority={q.priority} />
        <TypeChips types={q.types} />
        <RiskChip risk={q.risk_level} />
        {/* The badge names what the question DOES to the room, not that it
            "matches" — the ranking is corrective. */}
        {matchesEnergy(q, band) && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[12px] font-medium text-amber-700">
            <Zap className="h-3 w-3" /> {ENERGY_FIT_LABEL_AR[band]}
          </span>
        )}
        {edited && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/5 px-2 py-0.5 text-[12px] font-medium text-primary">
            <PencilLine className="h-3 w-3" /> تم تعديل هذا السؤال
          </span>
        )}
      </div>

      {openingLine && (
        <div className="mb-3 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-[15px] leading-relaxed text-foreground">
          <span className="font-semibold text-primary">افتتاحيتك ({openingLine.approach}): </span>
          {openingLine.text}
        </div>
      )}

      {beforeCards.map((ins) => (
        <div
          key={ins.id}
          className="mb-2 flex items-start gap-1.5 truncate text-[14px] text-teal-700"
          title={ins.text}
        >
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="truncate">
            <span className="font-semibold">قبل: </span>
            {ins.type === "correction" && ins.correction
              ? `إن قال «${ins.correction.inaccuracy}» — الصحيح: ${ins.correction.accurate}`
              : ins.text}
          </span>
        </div>
      ))}

      <div className="text-[26px] font-medium leading-[1.5] text-foreground lg:text-[28px]">{q.text}</div>

      {sensitiveLine && (
        <div className="mt-2 inline-flex items-start gap-1.5 text-[14px] font-medium text-amber-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          منطقة حسّاسة: {sensitiveLine}
        </div>
      )}

      {q.purpose && <div className="mt-2 text-[15px] text-muted-foreground">{q.purpose}</div>}
      {q.follow_up_prompt && (
        <div className="mt-2 flex items-start gap-1.5 text-[16px] text-foreground">
          <CornerDownLeft className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
          {q.follow_up_prompt}
        </div>
      )}

      {laterCards.length > 0 && (
        <div className="mt-3 border-t border-border/40 pt-2">
          <InsightStrip
            insights={laterCards}
            used={usedInsightIds}
            onUse={onUseInsight}
            markDisabled={false}
          />
        </div>
      )}
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
      {questions.map((q, i) => (
        <button
          key={q.id}
          type="button"
          onClick={() => onPick(q.id)}
          className="flex min-h-[44px] w-full items-center gap-2 rounded-xl border border-border/50 bg-background/50 px-3 py-2 text-start transition hover:bg-background"
        >
          {/* Two rows used to both read «التالي». The second is AFTER that. */}
          <span className="shrink-0 text-[12px] font-medium text-muted-foreground">
            {i === 0 ? "التالي" : "بعده"}
          </span>
          <span className="truncate text-[15px] text-foreground">{q.text}</span>
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
      <div className="mt-2 text-[15px] font-medium text-emerald-700">تمت تغطية أسئلة هذا القسم</div>
      {!atLast && (
        <button
          type="button"
          onClick={onNext}
          className="mt-3 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-4 text-[14px] font-medium text-primary transition hover:bg-primary/20"
        >
          القسم التالي <ChevronLeft className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

// ─── Section switcher (compact) ───────────────────────────────────────

/**
 * Prev / jump / next, plus the «مرجع» sheet. The section NAME is not repeated
 * here — the rail carries it (with its clock) — so this row is position only.
 * The jump grid is a sheet: opened inline it pushed the question off screen.
 */
function SectionSwitcher({
  sections,
  currentIndex,
  onSelect,
  onOpenReference,
}: {
  sections: Sections
  currentIndex: number
  onSelect: (idx: number) => void
  onOpenReference: () => void
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
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 text-foreground transition hover:bg-background/70 disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => setJumpOpen(true)}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-border/50 bg-background/50 px-3 text-[14px] font-medium text-foreground transition hover:bg-background"
        >
          <LayoutGrid className="h-4 w-4 text-muted-foreground" />
          الأقسام
          <span className="text-muted-foreground" dir="ltr">
            {currentIndex + 1}/{sections.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onSelect(currentIndex + 1)}
          disabled={currentIndex >= sections.length - 1}
          aria-label="القسم التالي"
          className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 text-foreground transition hover:bg-background/70 disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onOpenReference}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border/50 bg-background/50 px-3.5 text-[14px] font-medium text-foreground transition hover:bg-background"
        >
          <BookOpen className="h-4 w-4 text-muted-foreground" /> مرجع
        </button>
      </div>
      <Sheet open={jumpOpen} onClose={() => setJumpOpen(false)} title="انتقل إلى قسم">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {sections.map((s, i) => (
            <button
              key={s.kind}
              type="button"
              onClick={() => {
                onSelect(i)
                setJumpOpen(false)
              }}
              aria-current={i === currentIndex ? "step" : undefined}
              className={cn(
                "flex min-h-[48px] items-center gap-2 rounded-xl border px-3 text-start text-[15px] font-medium transition",
                i === currentIndex
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/50 text-foreground hover:bg-background/70",
              )}
            >
              <span className="text-muted-foreground" dir="ltr">
                {i + 1}
              </span>
              {sectionLabelAr(s.kind, sections)}
              <span className="ms-auto text-[13px] text-muted-foreground">~{s.estimated_minutes} د</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

// ─── «مرجع» — the read-in, reachable mid-take ─────────────────────────

function ReferenceContent({
  prep,
  section,
  sections,
  isCourse,
}: {
  prep: PrepV2
  section: Sections[number] | null
  sections: Sections | null
  isCourse: boolean
}) {
  const g = prep.host_guidance
  return (
    <div className="space-y-4 text-[14px]" dir="rtl">
      {section && (
        <div className="rounded-xl border border-border/50 bg-background/50 p-3">
          <div className="mb-1 text-[13px] font-semibold text-muted-foreground">
            {sectionLabelAr(section.kind, sections)}
          </div>
          {isCourse ? (
            <div className="space-y-1 text-foreground">
              {section.learning_objective && (
                <p>
                  <span className="font-semibold">الهدف:</span> {section.learning_objective}
                </p>
              )}
              {section.takeaway_tool && (
                <p>
                  <span className="font-semibold">الأداة:</span> {section.takeaway_tool}
                </p>
              )}
              {section.key_concepts && section.key_concepts.length > 0 && (
                <p>
                  <span className="font-semibold">المفاهيم:</span> {section.key_concepts.join("، ")}
                </p>
              )}
            </div>
          ) : (
            section.intent && <p className="text-foreground">{section.intent}</p>
          )}
        </div>
      )}
      {prep.sensitive_zones?.length > 0 && (
        <GuidanceList
          label="مناطق حسّاسة"
          items={prep.sensitive_zones}
          tone="warn"
          icon={<AlertTriangle className="h-3.5 w-3.5" />}
        />
      )}
      {g && (
        <div className="grid grid-cols-1 gap-3">
          <GuidanceList label="تجنّب" items={g.dont_list} tone="bad" />
          <GuidanceList label="افعل" items={g.do_list} tone="good" />
        </div>
      )}
      {prep.opening_options?.length > 0 && (
        <OptionsBlock label="الافتتاحيات" options={prep.opening_options} />
      )}
      {prep.closing_options?.length > 0 && (
        <OptionsBlock label="الختام" options={prep.closing_options} />
      )}
    </div>
  )
}

function OptionsBlock({ label, options }: { label: string; options: { approach: string; text: string }[] }) {
  return (
    <div>
      <div className="mb-1 text-[13px] font-semibold text-muted-foreground">{label}</div>
      <ul className="space-y-1.5">
        {options.map((o, i) => (
          <li key={i} className="rounded-lg border border-border/50 bg-background/50 px-3 py-2 leading-relaxed text-foreground">
            <span className="font-medium text-muted-foreground">{o.approach}: </span>
            {o.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ShortcutLegend() {
  const rows: [string, string][] = [
    ["مسافة", "طُرِح — السؤال اللي على الشاشة"],
    ["M", "علّم لحظة"],
    ["P", "إيقاف مؤقت / استئناف"],
    ["N", "السؤال التالي"],
    ["B", "السؤال السابق"],
    ["؟", "هذي القائمة"],
  ]
  return (
    <div className="space-y-2" dir="rtl">
      <ul className="space-y-1.5">
        {rows.map(([k, v]) => (
          <li key={k} className="flex items-center gap-3 text-[14px] text-foreground">
            <kbd className="inline-flex min-w-[56px] justify-center rounded-lg border border-border bg-background px-2 py-1 font-mono text-[13px]">
              {k}
            </kbd>
            {v}
          </li>
        ))}
      </ul>
      <p className="text-[13px] text-muted-foreground">
        «إنهاء» ما له اختصار — لازم يكون بلمستين. الاختصارات ما تشتغل وأنت تكتب في مربع نص.
      </p>
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
    return <p className="text-[14px] text-muted-foreground">لا توجد أسئلة في هذا القسم.</p>
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
                ? "border-emerald-500/40 bg-emerald-500/5"
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
                aria-label={done ? "تراجع عن الإكمال" : "تحديد كمطروح"}
                title={done ? "تراجع عن الإكمال" : "تحديد كمطروح"}
                className="flex h-11 w-11 shrink-0 items-center justify-center"
              >
                <span
                  className={
                    "flex h-6 w-6 items-center justify-center rounded-full border transition " +
                    (done
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-border text-transparent hover:border-emerald-500/60")
                  }
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-2 w-2" />}
                </span>
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
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[12px] font-medium text-amber-700">
                      <Zap className="h-3 w-3" /> {ENERGY_FIT_LABEL_AR[band]}
                    </span>
                  )}
                </div>
                <div
                  className={
                    "text-[15px] font-medium leading-snug " +
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
