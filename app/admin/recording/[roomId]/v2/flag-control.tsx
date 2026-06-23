"use client"

/**
 * FlagControl — the one-thumb live flagging surface (on-air).
 *
 * Replaces the always-on 9-button grid. The host mostly flags great moments,
 * so this is a 3-button decision: a big primary "علّم لحظة" (→ highlight) plus
 * clip/quote 1-tap. The remaining 6 editing/flow flags live behind a "⋯"
 * overflow that expands inline (no modal). All 9 stay reachable; the common
 * ones are one tap. Reuses the existing tag() handler + marker taxonomy.
 */

import { useState } from "react"
import { Star, MoreHorizontal, X } from "lucide-react"
import {
  QUICK_MARKER_META,
  type QuickMarkerType,
} from "@/lib/recording-v2/marker-types"
import {
  markerStyle,
  HOST_PRIMARY_MARKER,
  HOST_QUICK_MARKERS,
  HOST_OVERFLOW_MARKERS,
} from "./recording-shared"

export function FlagControl({
  onTag,
  disabled,
}: {
  onTag: (type: QuickMarkerType, label: string) => void
  disabled?: boolean
}) {
  const [overflowOpen, setOverflowOpen] = useState(false)
  const fire = (type: QuickMarkerType) => {
    onTag(type, QUICK_MARKER_META[type].defaultLabel)
  }

  return (
    <div>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => fire(HOST_PRIMARY_MARKER)}
          title={QUICK_MARKER_META[HOST_PRIMARY_MARKER].hint}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[15px] font-semibold text-amber-700 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Star className="h-5 w-5" /> علّم لحظة
        </button>

        {HOST_QUICK_MARKERS.map((type) => {
          const st = markerStyle(type)
          const Icon = st.icon
          return (
            <button
              key={type}
              type="button"
              disabled={disabled}
              onClick={() => fire(type)}
              title={QUICK_MARKER_META[type].hint}
              className="flex items-center gap-1.5 rounded-2xl border border-border/50 bg-background/50 px-3.5 py-3 text-[12.5px] font-medium text-foreground/85 transition hover:bg-background/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Icon className={"h-4 w-4 " + st.text} />
              {QUICK_MARKER_META[type].label}
            </button>
          )
        })}

        <button
          type="button"
          onClick={() => setOverflowOpen((o) => !o)}
          aria-label="المزيد من العلامات"
          aria-expanded={overflowOpen}
          className="rounded-2xl border border-border/50 bg-background/50 px-3.5 py-3 text-muted-foreground transition hover:bg-background/80"
        >
          {overflowOpen ? <X className="h-4 w-4" /> : <MoreHorizontal className="h-4 w-4" />}
        </button>
      </div>

      {overflowOpen && (
        <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-2xl border border-border/40 bg-background/40 p-2.5 sm:grid-cols-6">
          {HOST_OVERFLOW_MARKERS.map((type) => {
            const st = markerStyle(type)
            const Icon = st.icon
            return (
              <button
                key={type}
                type="button"
                disabled={disabled}
                onClick={() => {
                  fire(type)
                  setOverflowOpen(false)
                }}
                title={QUICK_MARKER_META[type].hint}
                className="flex flex-col items-center justify-center gap-1 rounded-xl border border-border/40 bg-background/50 px-1.5 py-2 text-[10.5px] font-medium text-foreground/85 transition hover:bg-background/80 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon className={"h-4 w-4 " + st.text} />
                <span className="text-center leading-tight">{QUICK_MARKER_META[type].label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
