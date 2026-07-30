"use client"

/**
 * PreflightGate — the host's "ابدأ التسجيل" bar, gated on the director's checklist.
 *
 * Colour choice matters here: **locked is AMBER, not rose.** On this page rose
 * already means "press me to go live" (the CTA itself), so reusing it for "you
 * cannot go live" would make the same colour mean both things. Ready state keeps
 * the original rose CTA completely unchanged — the host's muscle memory for the
 * one button that starts a shoot must not move.
 *
 * The locked bar shows the COUNT and the blocking GROUP, never the 17 rows: those
 * are the director's job, and the host is here reading the thesis with a guest
 * sitting down. It also shows who last touched it and when, so the host shouts
 * across the studio instead of walking over to read someone else's tablet.
 *
 * Transition to ready is quiet — no animation, no sound. The host may be
 * mid-sentence rehearsing an opening.
 */

import { useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Lock,
  Radio,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  OVERRIDE_REASONS,
  allowsOverride,
  isRecordingUnlocked,
  type ChecklistModel,
  type HostGateState,
} from "@/lib/recording-v2/preflight-checklist"

export function PreflightGate({
  gateState,
  model,
  overridden,
  directorLabel,
  onStart,
  onSelfComplete,
  onOverride,
  onReconnect,
  busy,
  children,
}: {
  gateState: HostGateState
  model: ChecklistModel
  /** Already overridden for this take — derived from the audit marker. */
  overridden: boolean
  /** e.g. "فهد (المخرج) متصل · آخر تحديث ١٤:٣٢" */
  directorLabel: string | null
  onStart: () => void
  /** Open the same checklist on the host's own screen. */
  onSelfComplete: () => void
  onOverride: (reason: string) => Promise<boolean>
  onReconnect: () => void
  busy: boolean
  /** The energy control that already lived beside the CTA. */
  children?: React.ReactNode
}) {
  const unlocked = overridden || isRecordingUnlocked(gateState)

  // Flash the reason line when the locked button is pressed, so the tap gets an
  // acknowledgement instead of feeling like a dead control. Declared before the
  // early return below — hooks must not sit behind a conditional.
  const [nudge, setNudge] = useState(false)
  function nudgeReason() {
    setNudge(true)
    window.setTimeout(() => setNudge(false), 600)
  }

  if (unlocked) {
    // Positioning belongs to PreflightView's BottomBar — this stays purely
    // presentational so the bar can't end up sticky-with-no-travel-room.
    return (
      <div className="space-y-2">
        {/* Quiet confirmation line — no animation, no sound. */}
        <div className="flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[12px] font-medium text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {overridden && gateState !== "ready" ? (
            <span>
              تم التجاوز — التسجيل مفتوح، والتجاوز مسجّل في علامات الحلقة
            </span>
          ) : (
            <span>
              {/* Neutral about WHO confirmed: the host may have completed the
                  checklist themselves via "أكمل التشك-ليست بنفسي", in which case
                  crediting "المخرج" would be a plain lie. */}
              الاستوديو جاهز {model.resolvedCount} من {model.total} — مؤكّدة
            </span>
          )}
        </div>
        {/* The rose CTA, byte-for-byte the same as before the gate existed. */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 p-3 backdrop-blur">
          {children}
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

  return (
    // Presentational only — PreflightView's BottomBar owns the pinning.
    <div>
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 backdrop-blur">
        {gateState === "offline" ? (
          <OfflineBody onReconnect={onReconnect} />
        ) : gateState === "connecting" ? (
          <ConnectingBody />
        ) : (
          <LockedBody
            model={model}
            directorLabel={directorLabel}
            noDirector={gateState === "no_director"}
            nudge={nudge}
          />
        )}

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          {/* The energy dots grow their own hit area now (see
              CompactEnergyControl) — padding on this wrapper did nothing for
              them, which is why they measured 8×8px after the first attempt. */}
          <span>{children}</span>
          <div className="flex flex-wrap items-center gap-2">
            {/* `aria-disabled` rather than `disabled`: a truly disabled button is
                removed from the tab order, so a keyboard user never lands on it
                and never hears the aria-describedby reason — the whole point of
                wiring it. So the button stays focusable and activation is
                suppressed in the handler instead. The icon is a Lock, not the
                Radio icon the live CTA uses — the same glyph for "go live" and
                "cannot go live" was the thing that read as broken. */}
            <button
              type="button"
              aria-disabled="true"
              aria-describedby="khat-gate-reason"
              onClick={(e) => {
                e.preventDefault()
                nudgeReason()
              }}
              onPointerDown={nudgeReason}
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-amber-500/40 px-5 py-3 text-[14px] font-semibold text-amber-800 opacity-70"
            >
              <Lock className="h-4 w-4" /> ابدأ التسجيل
            </button>
          </div>
        </div>

        {/* Escape hatches ONLY where the normal path is genuinely unavailable —
            never in `blocked` (a director is right there) and never in
            `connecting` (that is every page load). */}
        {allowsOverride(gateState) && (
          <EscapeHatches
            model={model}
            onSelfComplete={onSelfComplete}
            onOverride={onOverride}
            busy={busy}
          />
        )}
      </div>
    </div>
  )
}

function ConnectingBody() {
  return (
    <div id="khat-gate-reason">
      <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> جارٍ الاتصال…
      </div>
      <p className="mt-0.5 text-[12px] text-foreground/80">
        نقرأ حالة التشك-ليست الآن. ثانية وتبيّن.
      </p>
    </div>
  )
}

function LockedBody({
  model,
  directorLabel,
  noDirector,
  nudge,
}: {
  model: ChecklistModel
  directorLabel: string | null
  noDirector: boolean
  /** Briefly emphasised after the locked button is pressed. */
  nudge: boolean
}) {
  return (
    <div id="khat-gate-reason">
      <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800">
        <ClipboardCheck className="h-3.5 w-3.5" />
        جاهزية الاستوديو {model.resolvedCount} من {model.total}
      </div>
      <p
        className={cn(
          "mt-0.5 text-[12px] transition-colors duration-200",
          nudge ? "font-semibold text-amber-900" : "text-foreground/80",
        )}
      >
        الناقص: <strong className="font-semibold">{model.blockingGroupLabel}</strong>
      </p>
      {noDirector ? (
        <p className="mt-1 inline-flex items-center gap-1.5 text-[11.5px] text-amber-800">
          <AlertTriangle className="h-3 w-3 shrink-0" /> ما فيه مخرج متصل الآن
        </p>
      ) : (
        directorLabel && (
          <p className="mt-1 text-[11.5px] text-muted-foreground">{directorLabel}</p>
        )
      )}
    </div>
  )
}

function OfflineBody({ onReconnect }: { onReconnect: () => void }) {
  return (
    <div id="khat-gate-reason">
      <div className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-800">
        <WifiOff className="h-3.5 w-3.5" /> الاتصال مقطوع — ما نقدر نتأكد من التشك-ليست
      </div>
      <p className="mt-0.5 text-[12px] text-foreground/80">
        القائمة ممكن تكون خلصت وما وصلنا الخبر. جرّب تعيد الاتصال أول.
      </p>
      <button
        type="button"
        onClick={onReconnect}
        className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-amber-500/50 bg-background/60 px-3.5 py-2 text-[12.5px] font-semibold text-amber-800"
      >
        <RefreshCw className="h-3.5 w-3.5" /> إعادة الاتصال
      </button>
    </div>
  )
}

function EscapeHatches({
  model,
  onSelfComplete,
  onOverride,
  busy,
}: {
  model: ChecklistModel
  onSelfComplete: () => void
  onOverride: (reason: string) => Promise<boolean>
  busy: boolean
}) {
  // Two steps on purpose: pick a reason, then confirm. An override is a decision
  // that shows up in post, not a button you brush past.
  const [step, setStep] = useState<"idle" | "reason" | "confirm">("idle")
  const [reason, setReason] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  return (
    <div className="mt-2.5 border-t border-amber-500/30 pt-2.5">
      <button
        type="button"
        onClick={onSelfComplete}
        disabled={busy}
        className="inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-[13px] font-semibold text-emerald-700 disabled:opacity-50"
      >
        <ClipboardCheck className="h-4 w-4" /> أكمل التشك-ليست بنفسي
      </button>
      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        نفس القائمة، وتتأكّد بنفسك — الأفضل لو ما فيه مخرج.
      </p>

      {step === "idle" && (
        <button
          type="button"
          onClick={() => setStep("reason")}
          disabled={busy}
          className="mt-2 inline-flex min-h-[40px] w-full items-center justify-center gap-1.5 text-[12px] font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50"
        >
          <ShieldAlert className="h-3.5 w-3.5" /> تجاوز وابدأ
        </button>
      )}

      {step === "reason" && (
        <div className="mt-2 space-y-1.5">
          <p className="text-[11.5px] font-medium text-amber-800">ليش نتجاوز؟</p>
          <div className="flex flex-wrap gap-1.5">
            {OVERRIDE_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setReason(r)
                  setStep("confirm")
                }}
                className="min-h-[44px] rounded-xl border border-amber-500/40 bg-background/60 px-3 py-2 text-[12px] font-medium text-amber-800"
              >
                {r}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStep("idle")}
            className="inline-flex min-h-[44px] items-center rounded-xl border border-border/50 px-3 text-[11.5px] text-muted-foreground"
          >
            إلغاء
          </button>
        </div>
      )}

      {step === "confirm" && reason && (
        <div className="mt-2 space-y-2 rounded-xl border border-amber-500/40 bg-background/60 p-2.5">
          <p className="text-[12px] leading-relaxed text-foreground/85">
            بتبدأ التسجيل و{model.resolvedCount} من {model.total} بند بس مؤكّد. بنسجّل
            إنك تجاوزت، والسبب «{reason}»، والوقت — ويطلع في علامات الحلقة للمونتاج.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                const ok = await onOverride(reason)
                setSaving(false)
                if (!ok) setStep("reason")
              }}
              className={cn(
                "inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-[12.5px] font-semibold text-white",
                saving && "opacity-60",
              )}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldAlert className="h-3.5 w-3.5" />
              )}
              أكّد التجاوز
            </button>
            <button
              type="button"
              onClick={() => setStep("idle")}
              className="min-h-[44px] rounded-xl border border-border/50 px-4 py-2 text-[12.5px] font-medium"
            >
              رجوع
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
