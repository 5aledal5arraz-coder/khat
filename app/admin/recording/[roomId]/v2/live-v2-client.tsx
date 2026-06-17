"use client"

/**
 * Phase X Step 5 — Live Recording V2 client surface.
 *
 * Owns:
 *   - in-page timer ticking (re-renders every second) so the page is
 *     readable during filming without server polls
 *   - section navigation transitions
 *   - debounced director-notes autosave
 *   - quick-tag dispatch
 *
 * All persistence flows through the server actions in actions.ts.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { Empty } from "../../../components/ui-kit"
import {
  Play,
  Pause,
  RotateCcw,
  Square,
  ChevronLeft,
  ChevronRight,
  Check,
  Sparkles,
  Heart,
  Scissors,
  Star,
  Bookmark,
  Quote,
} from "lucide-react"
import type { LiveV2Snapshot, LiveV2Marker } from "@/lib/recording-v2/load"
import {
  startTimerAction,
  pauseTimerAction,
  resumeTimerAction,
  resetTimerAction,
  endTimerAction,
  setCurrentSectionAction,
  saveDirectorNotesAction,
  createMarkerAction,
} from "./actions"
import type { SectionKind, PrepV2Question } from "@/lib/preparation/v2/types"

const SECTION_LABEL_AR: Record<SectionKind, string> = {
  opening: "افتتاحية",
  build_up: "بناء التوتر",
  conflict: "المواجهة",
  deep_dive: "الغوص العميق",
  emotional_peak: "الذروة العاطفية",
  resolution: "الخاتمة",
}

const TYPE_LABEL_AR: Record<string, string> = {
  emotional: "عاطفي",
  philosophical: "فلسفي",
  personal: "شخصي",
  confrontational: "مواجهة",
  reflective: "تأملي",
  factual: "سياقي",
}

export function LiveV2Client({ initial }: { initial: LiveV2Snapshot }) {
  const room = initial.room
  const prep = initial.preparation
  const sections = prep.prep_v2?.episode_sections ?? null

  // ── Local state mirrors the snapshot; server actions revalidate. ──
  const [status, setStatus] = useState<typeof room.status>(room.status)
  const [elapsedMsAtBaseline, setElapsedMsAtBaseline] = useState<number>(
    room.recording_elapsed_ms,
  )
  const [windowStartedAt, setWindowStartedAt] = useState<number | null>(
    room.recording_started_at && !room.recording_paused_at
      ? Date.parse(room.recording_started_at)
      : null,
  )
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (status !== "live") return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [status])

  const liveElapsedMs = useMemo(() => {
    void tick // re-evaluated on each tick
    if (windowStartedAt && status === "live") {
      return Math.max(0, Date.now() - windowStartedAt)
    }
    return 0
  }, [windowStartedAt, status, tick])

  const totalElapsedMs = elapsedMsAtBaseline + liveElapsedMs

  // ── Section index ─────────────────────────────────────────────────
  const [sectionIndex, setSectionIndex] = useState<number>(
    room.current_section_index ?? 0,
  )
  const currentSection: SectionKind | null = sections
    ? (sections[sectionIndex]?.kind ?? null)
    : null
  const [completedSections, setCompletedSections] = useState<Set<number>>(
    new Set(
      Array.from({ length: sectionIndex }, (_, i) => i),
    ),
  )

  // ── Notes ─────────────────────────────────────────────────────────
  const [notes, setNotes] = useState(room.director_notes)
  const [, startNotesTransition] = useTransition()
  const noteSaveTimer = useRef<NodeJS.Timeout | null>(null)
  function onNotesChange(value: string) {
    setNotes(value)
    if (noteSaveTimer.current) clearTimeout(noteSaveTimer.current)
    noteSaveTimer.current = setTimeout(() => {
      startNotesTransition(async () => {
        await saveDirectorNotesAction({ roomId: room.id, notes: value })
      })
    }, 750)
  }

  // ── Markers (latest-first) ────────────────────────────────────────
  const [markers, setMarkers] = useState<LiveV2Marker[]>(initial.markers)

  // ── Timer actions ─────────────────────────────────────────────────
  const [busy, startTransition] = useTransition()
  function withBusy(fn: () => Promise<void>) {
    return () => startTransition(fn)
  }

  const onStart = withBusy(async () => {
    await startTimerAction(room.id)
    setElapsedMsAtBaseline(0)
    setWindowStartedAt(Date.now())
    setStatus("live")
  })
  const onPause = withBusy(async () => {
    await pauseTimerAction(room.id)
    setElapsedMsAtBaseline(totalElapsedMs)
    setWindowStartedAt(null)
    setStatus("paused")
  })
  const onResume = withBusy(async () => {
    await resumeTimerAction(room.id)
    setWindowStartedAt(Date.now())
    setStatus("live")
  })
  const onReset = withBusy(async () => {
    await resetTimerAction(room.id)
    setElapsedMsAtBaseline(0)
    setWindowStartedAt(null)
    setStatus("waiting")
  })
  const onEnd = withBusy(async () => {
    await endTimerAction(room.id)
    setElapsedMsAtBaseline(totalElapsedMs)
    setWindowStartedAt(null)
    setStatus("ended")
  })

  // ── Flow actions ─────────────────────────────────────────────────
  async function moveTo(idx: number) {
    if (!sections) return
    const clamped = Math.max(0, Math.min(sections.length - 1, idx))
    setSectionIndex(clamped)
    await setCurrentSectionAction({
      roomId: room.id,
      index: clamped,
      key: sections[clamped].kind,
    })
  }
  function toggleCompleted(idx: number) {
    setCompletedSections((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  // ── Marker dispatch ──────────────────────────────────────────────
  async function tag(
    type:
      | "deep_moment"
      | "emotional"
      | "highlight"
      | "quote"
      | "revisit"
      | "cut",
    label: string,
  ) {
    const r = await createMarkerAction({
      roomId: room.id,
      markerType: type,
      label,
      sectionKey: currentSection,
    })
    if (r.ok) {
      setMarkers((prev) => [
        {
          id: r.marker_id ?? crypto.randomUUID(),
          marker_type: type,
          label,
          note: null,
          recording_ms: r.recording_ms ?? totalElapsedMs,
          section_key: currentSection,
          created_at: new Date().toISOString(),
          author_name: "you",
        },
        ...prev,
      ])
    }
  }

  // ── Section question list (must_ask first) ───────────────────────
  const currentSectionQuestions: PrepV2Question[] = useMemo(() => {
    if (!prep.prep_v2 || !currentSection) return []
    const all = prep.prep_v2.question_bank.filter(
      (q) => q.section === currentSection,
    )
    return [
      ...all.filter((q) => q.priority === "must_ask"),
      ...all.filter((q) => q.priority === "if_time"),
    ]
  }, [prep.prep_v2, currentSection])

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      {/* ── Top row: timer + room status + flow ──────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <TimerPanel
          status={status}
          totalElapsedMs={totalElapsedMs}
          busy={busy}
          onStart={onStart}
          onPause={onPause}
          onResume={onResume}
          onReset={onReset}
          onEnd={onEnd}
        />
        <RoomStatusPanel
          status={status}
          eirPhase={room.eir_phase}
          markers={markers.length}
          guestName={prep.guest_name}
          title={prep.title}
        />
      </div>

      {/* ── Flow tracker ─────────────────────────────────────────── */}
      {sections ? (
        <FlowTracker
          sections={sections}
          currentIndex={sectionIndex}
          completed={completedSections}
          onSelect={moveTo}
          onToggleCompleted={toggleCompleted}
        />
      ) : (
        <div className="rounded-2xl border border-border/40 bg-background/40 p-4 text-[12px] text-muted-foreground">
          لا توجد بنية Prep V2 لهذا الإعداد — يتم عرض الأسئلة القديمة مباشرة أدناه.
        </div>
      )}

      {/* ── Mid row: section questions + quick tags ──────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <SectionQuestions
          legacy={!prep.prep_v2}
          legacyQuestions={prep.legacy_questions}
          currentSection={currentSection}
          questions={currentSectionQuestions}
        />
        <QuickTagsPanel onTag={tag} disabled={status === "waiting"} markers={markers} />
      </div>

      {/* ── Director notes ───────────────────────────────────────── */}
      <DirectorNotesPanel value={notes} onChange={onNotesChange} />
    </div>
  )
}

// ─── TimerPanel ────────────────────────────────────────────────────────

function TimerPanel(props: {
  status: "waiting" | "live" | "paused" | "ended"
  totalElapsedMs: number
  busy: boolean
  onStart: () => void
  onPause: () => void
  onResume: () => void
  onReset: () => void
  onEnd: () => void
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4 lg:col-span-7">
      <div className="mb-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        مؤقّت
      </div>
      <div
        className="mb-3 font-mono text-[44px] font-bold tabular-nums leading-none text-foreground"
        dir="ltr"
      >
        {formatHms(props.totalElapsedMs)}
      </div>
      <div className="flex flex-wrap gap-2">
        {props.status === "waiting" && (
          <Button onClick={props.onStart} disabled={props.busy} icon={<Play />}>
            بدء
          </Button>
        )}
        {props.status === "live" && (
          <>
            <Button onClick={props.onPause} disabled={props.busy} icon={<Pause />}>
              إيقاف مؤقت
            </Button>
            <Button
              onClick={props.onEnd}
              disabled={props.busy}
              variant="danger"
              icon={<Square />}
            >
              إنهاء
            </Button>
          </>
        )}
        {props.status === "paused" && (
          <>
            <Button onClick={props.onResume} disabled={props.busy} icon={<Play />}>
              استئناف
            </Button>
            <Button
              onClick={props.onEnd}
              disabled={props.busy}
              variant="danger"
              icon={<Square />}
            >
              إنهاء
            </Button>
          </>
        )}
        {props.status === "ended" && (
          <Button onClick={props.onReset} disabled={props.busy} icon={<RotateCcw />}>
            إعادة ضبط
          </Button>
        )}
        {props.status !== "ended" && (
          <Button
            onClick={props.onReset}
            disabled={props.busy}
            variant="ghost"
            icon={<RotateCcw />}
          >
            إعادة ضبط
          </Button>
        )}
      </div>
      <div className="mt-2 text-[10.5px] text-muted-foreground" dir="ltr">
        status: {props.status}
      </div>
    </div>
  )
}

// ─── RoomStatusPanel ──────────────────────────────────────────────────

function RoomStatusPanel(props: {
  status: string
  eirPhase: string | null
  markers: number
  guestName: string | null
  title: string
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4 lg:col-span-5">
      <div className="mb-1 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        الحلقة
      </div>
      <div className="mb-1 text-[14px] font-semibold leading-tight">{props.title}</div>
      {props.guestName && (
        <div className="text-[11.5px] text-muted-foreground">ضيف: {props.guestName}</div>
      )}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="حالة" value={props.status} />
        <Stat label="EIR" value={props.eirPhase ?? "—"} />
        <Stat label="علامات" value={String(props.markers)} />
      </div>
    </div>
  )
}

// ─── FlowTracker ──────────────────────────────────────────────────────

function FlowTracker(props: {
  sections: NonNullable<LiveV2Snapshot["preparation"]["prep_v2"]>["episode_sections"]
  currentIndex: number
  completed: Set<number>
  onSelect: (idx: number) => void
  onToggleCompleted: (idx: number) => void
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          هيكل الحلقة
        </div>
        <div className="flex gap-1.5">
          <IconBtn
            icon={<ChevronRight />}
            onClick={() => props.onSelect(props.currentIndex - 1)}
            disabled={props.currentIndex <= 0}
            label="السابق"
          />
          <IconBtn
            icon={<ChevronLeft />}
            onClick={() => props.onSelect(props.currentIndex + 1)}
            disabled={props.currentIndex >= props.sections.length - 1}
            label="التالي"
          />
        </div>
      </div>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {props.sections.map((s, i) => {
          const state =
            i === props.currentIndex
              ? "current"
              : props.completed.has(i)
                ? "completed"
                : "upcoming"
          return (
            <li
              key={s.kind}
              className={
                "rounded-xl border p-2.5 " +
                (state === "current"
                  ? "border-violet-500/40 bg-violet-500/10"
                  : state === "completed"
                    ? "border-emerald-500/30 bg-emerald-500/10 opacity-80"
                    : "border-border/40 bg-background/30")
              }
            >
              <button
                type="button"
                onClick={() => props.onSelect(i)}
                className="block w-full text-start"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11.5px] font-semibold">
                    {SECTION_LABEL_AR[s.kind] ?? s.kind}
                  </span>
                  <span
                    className="text-[10px] tabular-nums text-muted-foreground"
                    dir="ltr"
                  >
                    {s.estimated_minutes}m
                  </span>
                </div>
                <div className="mt-1 line-clamp-2 text-[10.5px] leading-snug text-muted-foreground/85">
                  {s.target_emotion} · {s.intent.slice(0, 80)}
                </div>
              </button>
              <button
                type="button"
                onClick={() => props.onToggleCompleted(i)}
                className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              >
                <Check className="h-2.5 w-2.5" />
                {props.completed.has(i) ? "مكتمل" : "تحديد كمكتمل"}
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// ─── SectionQuestions ─────────────────────────────────────────────────

function SectionQuestions(props: {
  legacy: boolean
  legacyQuestions: string[]
  currentSection: SectionKind | null
  questions: PrepV2Question[]
}) {
  if (props.legacy) {
    return (
      <div className="rounded-2xl border border-border/40 bg-background/40 p-4 lg:col-span-8">
        <div className="mb-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
          أسئلة (نسخة قديمة)
        </div>
        {props.legacyQuestions.length === 0 ? (
          <Empty text="لا توجد أسئلة قديمة لهذا الإعداد." />
        ) : (
          <ul className="space-y-2">
            {props.legacyQuestions.map((q, i) => (
              <li
                key={i}
                className="rounded-xl border border-border/40 bg-background/30 p-3 text-[14px] leading-relaxed"
              >
                {q}
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4 lg:col-span-8">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="text-[10.5px] uppercase tracking-wider text-muted-foreground">
          أسئلة القسم
        </div>
        <div className="text-[10.5px] text-muted-foreground">
          {props.currentSection
            ? SECTION_LABEL_AR[props.currentSection] ?? props.currentSection
            : "—"}
        </div>
      </div>
      {props.questions.length === 0 ? (
        <Empty text="لا توجد أسئلة في هذا القسم." />
      ) : (
        <ul className="space-y-3">
          {props.questions.map((q) => (
            <li
              key={q.id}
              className={
                "rounded-xl border p-3 " +
                (q.priority === "must_ask"
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-border/40 bg-background/30")
              }
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <PriorityChip priority={q.priority} />
                {q.types.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {TYPE_LABEL_AR[t] ?? t}
                  </span>
                ))}
                <RiskChip risk={q.risk_level} />
              </div>
              <div className="text-[16px] font-medium leading-snug text-foreground">
                {q.text}
              </div>
              {q.purpose && (
                <div className="mt-1 text-[12px] text-muted-foreground/85">
                  {q.purpose}
                </div>
              )}
              {q.follow_up_prompt && (
                <div className="mt-1 text-[12px] text-foreground/75">
                  ↳ {q.follow_up_prompt}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── QuickTagsPanel ───────────────────────────────────────────────────

function QuickTagsPanel(props: {
  onTag: (type: "deep_moment" | "emotional" | "highlight" | "quote" | "revisit" | "cut", label: string) => void
  disabled?: boolean
  markers: LiveV2Marker[]
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4 lg:col-span-4">
      <div className="mb-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        علامات سريعة
      </div>
      <div className="grid grid-cols-2 gap-2">
        <TagBtn icon={<Sparkles />} disabled={props.disabled} onClick={() => props.onTag("deep_moment", "deep moment")}>
          عميق
        </TagBtn>
        <TagBtn icon={<Heart />} disabled={props.disabled} onClick={() => props.onTag("emotional", "emotional moment")}>
          عاطفي
        </TagBtn>
        <TagBtn icon={<Star />} disabled={props.disabled} onClick={() => props.onTag("highlight", "highlight")}>
          إبراز
        </TagBtn>
        <TagBtn icon={<Quote />} disabled={props.disabled} onClick={() => props.onTag("quote", "quote")}>
          اقتباس
        </TagBtn>
        <TagBtn icon={<Bookmark />} disabled={props.disabled} onClick={() => props.onTag("revisit", "revisit later")}>
          راجع لاحقاً
        </TagBtn>
        <TagBtn icon={<Scissors />} disabled={props.disabled} onClick={() => props.onTag("cut", "cut")}>
          قطع
        </TagBtn>
      </div>
      <div className="mt-3 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        آخر العلامات
      </div>
      {props.markers.length === 0 ? (
        <Empty text="لم تُسجّل علامات بعد." />
      ) : (
        <ul className="mt-1 space-y-1.5">
          {props.markers.slice(0, 6).map((m) => (
            <li
              key={m.id}
              className="flex items-center justify-between rounded-lg border border-border/40 bg-background/30 px-2 py-1 text-[10.5px]"
              dir="ltr"
            >
              <span className="text-muted-foreground">{m.marker_type}</span>
              <span className="font-mono text-foreground/80">
                {formatHms(m.recording_ms)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ─── DirectorNotesPanel ───────────────────────────────────────────────

function DirectorNotesPanel(props: {
  value: string
  onChange: (s: string) => void
}) {
  return (
    <div className="rounded-2xl border border-border/40 bg-background/40 p-4">
      <div className="mb-2 text-[10.5px] uppercase tracking-wider text-muted-foreground">
        ملاحظات المخرج
      </div>
      <textarea
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder="اكتب ملاحظاتك هنا. يحفظ تلقائياً."
        className="min-h-[120px] w-full resize-y rounded-xl border border-border/40 bg-background/40 p-3 text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground/50 focus:border-violet-500/40 focus:outline-none"
      />
    </div>
  )
}

// ─── Subcomponents ────────────────────────────────────────────────────

function Button(props: {
  onClick: () => void
  disabled?: boolean
  icon?: React.ReactNode
  children: React.ReactNode
  variant?: "default" | "ghost" | "danger"
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[12.5px] font-medium transition disabled:opacity-50"
  const variant =
    props.variant === "danger"
      ? "border border-rose-500/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20"
      : props.variant === "ghost"
        ? "text-muted-foreground hover:text-foreground"
        : "border border-violet-500/30 bg-violet-500/10 text-violet-200 hover:bg-violet-500/20"
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className={`${base} ${variant}`}
    >
      {props.icon && <span className="h-3.5 w-3.5">{props.icon}</span>}
      {props.children}
    </button>
  )
}

function IconBtn(props: {
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.label}
      className="rounded-lg border border-border/50 p-1.5 text-muted-foreground hover:bg-background/60 disabled:opacity-40"
    >
      <span className="block h-3 w-3">{props.icon}</span>
    </button>
  )
}

function TagBtn(props: {
  icon: React.ReactNode
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border/40 bg-background/40 px-3 py-2 text-[12px] font-medium text-foreground/85 transition hover:bg-violet-500/10 hover:text-violet-200 disabled:opacity-40"
    >
      <span className="h-3.5 w-3.5">{props.icon}</span>
      {props.children}
    </button>
  )
}

function PriorityChip({ priority }: { priority: "must_ask" | "if_time" }) {
  if (priority === "must_ask") {
    return (
      <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
        must_ask
      </span>
    )
  }
  return (
    <span className="rounded-full bg-muted/30 px-1.5 py-0.5 text-[10px] text-muted-foreground">
      if_time
    </span>
  )
}

function RiskChip({ risk }: { risk: "low" | "medium" | "high" }) {
  const cls =
    risk === "high"
      ? "bg-rose-500/10 text-rose-300"
      : risk === "medium"
        ? "bg-amber-500/10 text-amber-300"
        : "bg-sky-500/10 text-sky-300"
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${cls}`} dir="ltr">
      risk: {risk}
    </span>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/40 bg-background/30 p-2">
      <div className="text-[9.5px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="text-[12.5px] font-semibold tabular-nums" dir="ltr">
        {value}
      </div>
    </div>
  )
}

function formatHms(ms: number): string {
  const s = Math.floor(ms / 1000)
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`
}
function pad(n: number) {
  return n.toString().padStart(2, "0")
}
