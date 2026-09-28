"use client"

/**
 * ThumbBar — the host's fixed bottom bar on air: «طُرِح» + the flags.
 *
 * It is FIXED to the bottom edge (safe-area aware) so the targets never move:
 * they used to sit in normal flow under the question, and their position
 * shifted with every question's length — a thumb reaching for «علّم لحظة» hit
 * whatever had slid under it. Every target is ≥44px.
 *
 * Each flag answers. The flag action used to swallow its own failure and show
 * nothing on success either, so the host could not tell a flag that landed
 * from one that did not. Now the tapped button reads «✓ عُلّمت 00:12:34» for
 * 1.5s, or says it did not land. And the button is blurred after the tap, so a
 * Bluetooth keyboard's Space does not re-fire it.
 *
 * The primary flag is `highlight` («علّم لحظة»), clip/quote are one tap, the
 * other editing/flow flags expand above the bar.
 */

import { useEffect, useRef, useState } from "react"
import { Star, MoreHorizontal, X, Check, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  QUICK_MARKER_META,
  type QuickMarkerType,
} from "@/lib/recording-v2/marker-types"
import {
  markerStyle,
  formatHms,
  HOST_PRIMARY_MARKER,
  HOST_QUICK_MARKERS,
  HOST_OVERFLOW_MARKERS,
} from "./recording-shared"
import { useBottomBarHeight } from "./cockpit-bits"

export type TagResult = { ok: true; ms: number } | { ok: false; message: string }

/** How long a flag's receipt stays on its button. */
export const FLAG_RECEIPT_MS = 1_500

type Receipt = { type: QuickMarkerType; state: "pending" } | { type: QuickMarkerType; state: "ok"; ms: number } | { type: QuickMarkerType; state: "error"; message: string }

export function ThumbBar({
  onTag,
  onAsked,
  askedDisabled,
  disabled,
}: {
  onTag: (type: QuickMarkerType, label: string) => Promise<TagResult>
  /** Mark the question on screen as asked. */
  onAsked: () => void
  askedDisabled?: boolean
  disabled?: boolean
}) {
  const [overflowOpen, setOverflowOpen] = useState(false)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const clearTimer = useRef<number | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  useBottomBarHeight(barRef)

  useEffect(
    () => () => {
      if (clearTimer.current) window.clearTimeout(clearTimer.current)
    },
    [],
  )

  const fire = async (type: QuickMarkerType, el?: HTMLElement | null) => {
    el?.blur()
    if (clearTimer.current) window.clearTimeout(clearTimer.current)
    setReceipt({ type, state: "pending" })
    const r = await onTag(type, QUICK_MARKER_META[type].defaultLabel)
    setReceipt(r.ok ? { type, state: "ok", ms: r.ms } : { type, state: "error", message: r.message })
    clearTimer.current = window.setTimeout(
      () => setReceipt(null),
      r.ok ? FLAG_RECEIPT_MS : FLAG_RECEIPT_MS * 2,
    )
  }

  const receiptFor = (type: QuickMarkerType) => (receipt?.type === type ? receipt : null)

  return (
    <div
      ref={barRef}
      className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      dir="rtl"
    >
      <div className="mx-auto max-w-3xl rounded-2xl border border-border/60 bg-card/95 p-2 shadow-lg backdrop-blur lg:max-w-5xl">
        {overflowOpen && (
          <div className="mb-2 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {HOST_OVERFLOW_MARKERS.map((type) => {
              const st = markerStyle(type)
              const Icon = st.icon
              const r = receiptFor(type)
              return (
                <button
                  key={type}
                  type="button"
                  disabled={disabled}
                  onClick={(e) => {
                    void fire(type, e.currentTarget)
                    setOverflowOpen(false)
                  }}
                  title={QUICK_MARKER_META[type].hint}
                  className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl border border-border/50 bg-background/60 px-1.5 py-1.5 text-[12px] font-medium text-foreground transition hover:bg-background disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon className={"h-4 w-4 " + st.text} />
                  <span className="text-center leading-tight">
                    {r ? <ReceiptText r={r} /> : QUICK_MARKER_META[type].label}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Fits 375px: tighter gaps and a short primary label on phones, so
            «المزيد» keeps the same gutter as «طُرِح» instead of being pushed
            flush against the left edge. */}
        <div className="flex items-stretch gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur()
              onAsked()
            }}
            disabled={askedDisabled}
            className="inline-flex min-h-[52px] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 text-[15px] sm:px-4 font-semibold text-emerald-700 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check className="h-5 w-5" /> طُرِح
          </button>

          <button
            type="button"
            disabled={disabled}
            onClick={(e) => void fire(HOST_PRIMARY_MARKER, e.currentTarget)}
            title={QUICK_MARKER_META[HOST_PRIMARY_MARKER].hint}
            aria-live="polite"
            className={cn(
              "flex min-h-[52px] min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border px-2 text-[15px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 sm:gap-2 sm:px-3",
              receiptFor(HOST_PRIMARY_MARKER)?.state === "error"
                ? "border-rose-500/50 bg-rose-500/10 text-rose-700"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20",
            )}
          >
            {receiptFor(HOST_PRIMARY_MARKER) ? (
              <ReceiptText r={receiptFor(HOST_PRIMARY_MARKER)!} />
            ) : (
              <>
                <Star className="h-5 w-5 shrink-0" />
                <span className="sm:hidden">علّم</span>
                <span className="hidden sm:inline">علّم لحظة</span>
              </>
            )}
          </button>

          {HOST_QUICK_MARKERS.map((type) => {
            const st = markerStyle(type)
            const Icon = st.icon
            const r = receiptFor(type)
            return (
              <button
                key={type}
                type="button"
                disabled={disabled}
                onClick={(e) => void fire(type, e.currentTarget)}
                title={QUICK_MARKER_META[type].hint}
                aria-label={QUICK_MARKER_META[type].label}
                aria-live="polite"
                className={cn(
                  "inline-flex min-h-[52px] min-w-[48px] shrink-0 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[14px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 sm:min-w-[52px] sm:px-3",
                  r?.state === "error"
                    ? "border-rose-500/50 bg-rose-500/10 text-rose-700"
                    : "border-border/60 bg-background/60 text-foreground hover:bg-background",
                )}
              >
                {r ? (
                  <ReceiptText r={r} />
                ) : (
                  <>
                    <Icon className={"h-4 w-4 " + st.text} />
                    <span className="hidden sm:inline">{QUICK_MARKER_META[type].label}</span>
                  </>
                )}
              </button>
            )
          })}

          <button
            type="button"
            onClick={() => setOverflowOpen((o) => !o)}
            aria-label="المزيد من العلامات"
            aria-expanded={overflowOpen}
            className="inline-flex min-h-[52px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-border/60 bg-background/60 text-foreground transition hover:bg-background"
          >
            {overflowOpen ? <X className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function ReceiptText({ r }: { r: Receipt }) {
  if (r.state === "pending") return <Loader2 className="h-4 w-4 animate-spin" aria-label="يسجّل" />
  if (r.state === "ok") {
    return (
      <span className="inline-flex items-center gap-1 text-emerald-700">
        <Check className="h-4 w-4" /> عُلّمت{" "}
        <span className="tabular-nums" dir="ltr">
          {formatHms(r.ms)}
        </span>
      </span>
    )
  }
  return <span className="text-rose-700">{r.message}</span>
}
