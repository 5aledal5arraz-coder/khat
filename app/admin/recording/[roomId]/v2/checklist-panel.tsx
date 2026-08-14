"use client"

/**
 * ChecklistPanel — the director's pre-shoot surface.
 *
 * Built for someone STANDING, holding a tablet in one hand, in a half-lit studio:
 *   - the whole row is the touch target, min-height 56px — not a small checkbox.
 *     (Explicitly NOT the energy-dot pattern from recording-room-shell.tsx, whose
 *     8px targets are unhittable on a tablet.)
 *   - no drag, no hover-only information: every tooltip repeats something already
 *     written on screen, so nothing is lost on a touch device.
 *   - one fixed action bar at the bottom with the count, always reachable.
 *
 * Groups disclose progressively: the current group is expanded, finished groups
 * collapse to a single green line, and later groups stay VISIBLE BUT DIMMED and
 * open on tap. Visibility is not permission — studios get prepped out of order,
 * so nothing is force-closed.
 */

import { useState } from "react"
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardCheck,
  Info,
  MinusCircle,
  Radio,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  NOT_APPLICABLE_REASONS,
  type ChecklistGroupModel,
  type ChecklistItemModel,
  type ChecklistModel,
} from "@/lib/recording-v2/preflight-checklist"

export type ChecklistSetter = (
  itemKey: string,
  state: "done" | "not_applicable" | "pending",
  reason?: string,
) => Promise<void>

export function ChecklistPanel({
  model,
  onSet,
  busy,
  previousTakeWasComplete,
  takeNumber,
  selfMode = false,
  onStart,
  onBack,
}: {
  model: ChecklistModel
  onSet: ChecklistSetter
  busy: boolean
  /** Context line for a re-shoot — state is never copied between takes. */
  previousTakeWasComplete: boolean
  takeNumber: number
  /**
   * The HOST is filling this in themselves (no director was reachable).
   *
   * Two consequences, both load-bearing:
   *   1. the copy addresses the reader directly — in director mode it talks
   *      ABOUT the host, which reads as nonsense when the host is the reader;
   *   2. the panel needs a way back, because in self mode it REPLACES the gate.
   *      Without it the host completes 17/17 and has no way out — a dead end on
   *      the exact path the gate recommends when no director is around.
   *
   * It does NOT decide whether the start button appears — `onStart` does. The
   * director gets the same button on his own copy of this panel.
   */
  selfMode?: boolean
  /**
   * Start the take. Passed by BOTH screens that may start one:
   *   • the host in self mode (this panel stands in for his gate),
   *   • the director, from his own pre-shoot panel.
   *
   * The button is locked behind the SAME `model.isComplete` in both cases — the
   * director has no override path, deliberately: the two escape hatches
   * («تجاوز وابدأ» / «أكمل التشك-ليست بنفسي») exist for the host when NO
   * director is reachable, so handing them to the director would be handing him
   * a way around his own job.
   */
  onStart?: () => void
  /** Required in self mode: returns to the preflight read-in. */
  onBack?: () => void
}) {
  // Groups the director explicitly opened even though they are not current.
  const [forcedOpen, setForcedOpen] = useState<Set<string>>(new Set())

  function toggleOpen(key: string) {
    setForcedOpen((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-3 p-4 pb-28" dir="rtl">
      <header>
        <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-medium text-primary">
          <ClipboardCheck className="h-3.5 w-3.5" /> جاهزية الاستوديو
        </div>
        <h2 className="text-[17px] font-semibold leading-tight text-foreground">
          قبل «ابدأ التسجيل»
        </h2>
        {/* selfMode is the exception path — the host stepped in because no
            director was connected. Without a line saying so, this panel is
            visually identical to the director's and simply replaces the
            read-in with no explanation of why. */}
        {selfMode && (
          <p className="mt-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-800">
            ما فيه مخرج متصل بالغرفة، فأنت تأكّد جاهزية الاستوديو بنفسك. تقدر ترجع
            لصفحة التحضير في أي وقت.
          </p>
        )}
        {/* Addresses whoever is holding the tablet. The line said "المقدم ما
            يقدر يبدأ" directly above the DIRECTOR's own start button — telling
            him about someone else's lock while his was the one on screen. The
            reader is identified by having a start button, not by `selfMode`. */}
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
          {onStart
            ? "ما تقدر تبدأ التسجيل إلا لما تكمل القائمة."
            : "المقدم ما يقدر يبدأ التسجيل إلا لما تكمل القائمة."}{" "}
          أي بند مو منطبق اليوم، علّمه «غير منطبق» واذكر السبب.
        </p>
        {takeNumber > 1 && (
          <p className="mt-2 rounded-xl border border-border/40 bg-background/50 px-3 py-2 text-[12px] text-foreground/80">
            هذا التيك {takeNumber}. القائمة تبدأ من جديد لأن الاستوديو تغيّر —
            {previousTakeWasComplete
              ? " التيك السابق كان مؤكّداً بالكامل."
              : " التيك السابق ما كان مكتملاً."}
          </p>
        )}
      </header>

      {model.groups.map((group) => (
        <GroupBlock
          key={group.key}
          group={group}
          expanded={group.state === "current" || forcedOpen.has(group.key)}
          onToggleOpen={() => toggleOpen(group.key)}
          onSet={onSet}
          busy={busy}
        />
      ))}

      {/* Fixed action bar — the count is always on screen, never scrolled away.
          z-20 so it sits above the rows, and a safe-area inset so it clears the
          iPad home indicator. */}
      <div
        className="fixed bottom-0 start-0 end-0 z-20 border-t border-border/50 bg-background/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-semibold tabular-nums text-foreground">
            {model.resolvedCount} من {model.total}
          </span>

          {!model.isComplete && (
            <span className="text-[12.5px] text-muted-foreground">
              الناقص: {model.blockingGroupLabel}
            </span>
          )}

          {model.isComplete && !selfMode && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />{" "}
              {onStart
                ? "تم — تقدر تبدأ التسجيل، أو ينتظر المقدم يبدأ"
                : "تم — المقدم يقدر يبدأ التسجيل الآن"}
            </span>
          )}

          {/* The one action that starts a shoot, on whichever screen may take
              it: the same rose button as the gate's ready state, unlocked by the
              same completed checklist. Whoever presses first wins — the loser's
              screen simply moves on to the live view, never an error. */}
          {model.isComplete && onStart && (
            <button
              type="button"
              onClick={onStart}
              disabled={busy}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-rose-700 px-5 py-3 text-[14.5px] font-semibold text-white transition hover:bg-rose-800 disabled:opacity-50"
            >
              <Radio className="h-4.5 w-4.5" /> ابدأ التسجيل
            </button>
          )}

          {/* Always available in self mode — never trap the host in this panel. */}
          {selfMode && onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border/50 px-3.5 py-2 text-[12.5px] font-medium text-muted-foreground"
            >
              <ChevronRight className="h-3.5 w-3.5" /> رجوع
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function GroupBlock({
  group,
  expanded,
  onToggleOpen,
  onSet,
  busy,
}: {
  group: ChecklistGroupModel
  expanded: boolean
  onToggleOpen: () => void
  onSet: ChecklistSetter
  busy: boolean
}) {
  const done = group.state === "done"
  const upcoming = group.state === "upcoming"
  // Every camera row shares one explainer; hoist it to the group.
  const groupTooltip = group.items.find((i) => i.tooltip)?.tooltip ?? null

  // A finished group collapses to one green line — but stays openable, because a
  // director who spots a problem after confirming must be able to take it back.
  if (done && !expanded) {
    return (
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex min-h-[56px] w-full items-center gap-2.5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-start transition hover:bg-emerald-500/10"
      >
        {/* Fixed-width icon slot: the expanded header has no icon, so without a
            reserved box the two variants start their titles at different x. */}
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        </span>
        <span className="text-[13.5px] font-semibold text-emerald-700">{group.label}</span>
        <span className="ms-auto inline-flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <span className="tabular-nums">
            {group.resolvedCount} من {group.total}
          </span>
          <ChevronDown className="h-3.5 w-3.5" />
        </span>
      </button>
    )
  }

  return (
    <section
      className={cn(
        "rounded-2xl border transition",
        done
          ? "border-emerald-500/30 bg-emerald-500/5"
          : upcoming
            ? "border-border/40 bg-background/30"
            : "border-primary/30 bg-primary/5",
      )}
    >
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex min-h-[56px] w-full items-center gap-2.5 px-4 py-3 text-start"
      >
        {/* Matching empty icon slot — keeps every group title on one baseline. */}
        <span className="h-4 w-4 shrink-0" aria-hidden />
        <span
          className={cn(
            "text-[13.5px] font-semibold",
            // Dimmed, not hidden: the director can see what is coming.
            upcoming ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {group.label}
        </span>
        {/* `dir="ltr"` must NOT sit on the same element as `ms-auto`: inside an
            RTL flex row the logical margin resolves against the element's own
            direction, so the two fight and the counter lands at a different x
            for every heading length (measured: 33 / 231 / 278px). No `dir`
            override is needed at all here — "N من M" reads correctly in RTL with
            Latin numerals — so the layout element simply stays RTL. */}
        <span className="ms-auto inline-flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <span className="tabular-nums">
            {group.resolvedCount} من {group.total}
          </span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition", expanded ? "rotate-180" : "")}
          />
        </span>
      </button>

      {expanded && (
        <div className={cn("px-2 pb-2", upcoming && "opacity-70")}>
          {upcoming && (
            <p className="mb-1.5 px-2 text-[11.5px] text-muted-foreground">
              هذي المجموعة بعدها ما جاء دورها — تقدر تكملها الآن لو الاستوديو جاهز.
            </p>
          )}
          {/* Reminder lines live ABOVE the rows — they are instructions for the
              rows that follow, not a footnote about rows already read. */}
          {group.footnote && (
            <p className="mb-2 px-2 text-[11.5px] leading-relaxed text-muted-foreground">
              {group.footnote}
            </p>
          )}
          {/* The shared explainer, rendered ONCE per group instead of on each of
              the six rows that reference «الفلتر». Repeating it added ~25px to
              every camera row and made the group a 650px scroll; the rows keep it
              as a `title` so the information is still reachable per-row. */}
          {groupTooltip && (
            <p className="mb-2 inline-flex items-start gap-1 px-2 text-[11px] leading-relaxed text-muted-foreground/90">
              <Info className="mt-[2px] h-3 w-3 shrink-0" />
              {groupTooltip}
            </p>
          )}
          <ul className="space-y-1.5">
            {group.items.map((item) => (
              <ItemRow key={item.key} item={item} onSet={onSet} busy={busy} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function ItemRow({
  item,
  onSet,
  busy,
}: {
  item: ChecklistItemModel
  onSet: ChecklistSetter
  busy: boolean
}) {
  const [showReasons, setShowReasons] = useState(false)
  const [customReason, setCustomReason] = useState("")

  const done = item.state === "done"
  const na = item.state === "not_applicable"

  async function primaryTap() {
    // Tapping a resolved row takes it back to pending — this is how a director
    // un-confirms an item and re-locks the host's button.
    await onSet(item.key, done || na ? "pending" : "done")
    setShowReasons(false)
  }

  return (
    <li
      className={cn(
        "rounded-xl border transition",
        done
          ? "border-emerald-500/30 bg-emerald-500/10"
          : na
            ? "border-amber-500/30 bg-amber-500/10"
            : "border-border/40 bg-background/50",
      )}
    >
      {/* The ROW is the target, not a checkbox: ≥56px tall, full width. */}
      <button
        type="button"
        onClick={primaryTap}
        disabled={busy}
        aria-pressed={done}
        title={item.tooltip}
        className="flex min-h-[56px] w-full items-start gap-3 px-3 py-3 text-start disabled:opacity-60"
      >
        <span className="mt-0.5 shrink-0">
          {done ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          ) : na ? (
            <MinusCircle className="h-5 w-5 text-amber-600" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground/50" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block text-[13.5px] leading-snug",
              done ? "text-emerald-800" : na ? "text-amber-800" : "text-foreground",
            )}
          >
            {item.label}
          </span>
          {item.hint && (
            <span className="mt-0.5 block text-[11.5px] leading-relaxed text-muted-foreground">
              {item.hint}
            </span>
          )}
          {na && item.not_applicable_reason && (
            <span className="mt-1 block text-[11.5px] font-medium text-amber-800">
              غير منطبق: {item.not_applicable_reason}
            </span>
          )}
        </span>
      </button>

      {!done && !na && (
        <div className="border-t border-border/30 px-3 py-2">
          {!showReasons ? (
            <button
              type="button"
              onClick={() => setShowReasons(true)}
              disabled={busy}
              className="min-h-[44px] rounded-xl border border-border/40 px-3 text-[12px] font-medium text-muted-foreground disabled:opacity-50"
            >
              غير منطبق…
            </button>
          ) : (
            <div className="space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {NOT_APPLICABLE_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    disabled={busy}
                    onClick={async () => {
                      await onSet(item.key, "not_applicable", reason)
                      setShowReasons(false)
                    }}
                    className="min-h-[44px] rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[12px] font-medium text-amber-800 disabled:opacity-50"
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="سبب آخر…"
                  maxLength={200}
                  className="min-h-[44px] flex-1 rounded-xl border border-border/50 bg-background/70 px-3 py-2 text-[12.5px] text-foreground"
                />
                <button
                  type="button"
                  disabled={busy || !customReason.trim()}
                  onClick={async () => {
                    await onSet(item.key, "not_applicable", customReason.trim())
                    setShowReasons(false)
                    setCustomReason("")
                  }}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-border/50 px-3 py-2 text-[12.5px] font-medium disabled:opacity-40"
                >
                  <Check className="h-3.5 w-3.5" /> حفظ
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowReasons(false)}
                className="min-h-[44px] rounded-xl border border-border/40 px-3 text-[11.5px] text-muted-foreground"
              >
                إلغاء
              </button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
