"use client"

import { useEffect, useRef, useState } from "react"
import { Activity } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTimeSeconds, formatEtaApprox } from "@/lib/shared/formatters"
// Pure derivation types — imported directly (NOT via the "@/lib/studio" barrel,
// which would pull db-backed modules into the client bundle; see stage-review).
import type {
  TranscriptionProgress,
  TranscriptionStage,
} from "@/lib/studio/transcription-progress"

/**
 * The ONE shared determinate progress bar for the two transcription-dominated
 * Studio jobs (Phase 1 map + Phase 2 review). Replaces the bare elapsed counter
 * with: a filling bar (right→left for RTL), the %, the current stage, and an
 * honest ETA — while keeping the elapsed counter as a quiet secondary line.
 *
 * Server vs client split (see lib/studio/transcription-progress.ts): the server
 * hands us the semantic progress (stage / chunks / fraction / an etaSeconds
 * SNAPSHOT taken at the last chunk boundary). This component owns the smooth
 * second-by-second countdown of that snapshot using its OWN wall clock — so the
 * ETA is immune to server↔client clock skew, and it re-bases (refines) each time
 * a new chunk lands. Before the first chunk completes the server sends
 * etaSeconds=null and we show «يُحسب…» — never a fabricated number from t=0.
 */

type Accent = "emerald" | "blue"

const ACCENT: Record<
  Accent,
  { label: string; track: string; fill: string; sub: string }
> = {
  emerald: {
    label: "text-emerald-700",
    track: "bg-emerald-500/15",
    fill: "bg-emerald-600",
    sub: "text-emerald-700/70",
  },
  blue: {
    label: "text-blue-700",
    track: "bg-blue-500/15",
    fill: "bg-blue-600",
    sub: "text-blue-700/70",
  },
}

const STAGE_LABEL: Record<TranscriptionStage, string> = {
  transcribing: "التفريغ",
  detecting_breaks: "رصد القطع والصمت",
  analyzing: "التحليل",
  comparing: "المقارنة بالمرحلة الأولى",
  done: "اكتمل",
}

/** A LTR + tabular numeric span so digits never flip or jitter in the RTL line. */
function Num({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular-nums" dir="ltr">
      {children}
    </span>
  )
}

export function TranscriptionProgressBar({
  progress,
  elapsedSeconds,
  accent,
}: {
  /** Latest server progress snapshot; null before the first poll lands. */
  progress: TranscriptionProgress | null
  /** Wall-clock seconds since the run started (the honest fallback line). */
  elapsedSeconds: number
  accent: Accent
}) {
  const c = ACCENT[accent]

  const stage: TranscriptionStage = progress?.stage ?? "transcribing"
  const fraction = Math.min(1, Math.max(0, progress?.fraction ?? 0))
  const percent = Math.round(fraction * 100)
  const currentChunk = progress?.currentChunk ?? 0
  const totalChunks = progress?.totalChunks ?? 0
  const serverEta = progress?.etaSeconds ?? null
  const isTranscribing = stage === "transcribing"
  const knowsChunks = isTranscribing && totalChunks > 0

  // ── Smooth client-side ETA countdown, re-based at each chunk boundary ────────
  // The server's etaSeconds is a SNAPSHOT taken at the last chunk boundary; we
  // anchor it to the client's own clock and count it DOWN every second — immune
  // to server↔client skew, and it re-bases (refines) when a fresh chunk lands.
  // Anchor lives in a ref (updated on a boundary/eta change); the actual state
  // updates happen only inside the 1s timer callback (same shape as the elapsed
  // counter), so there's no synchronous setState-in-effect and no impure render.
  const [displayEta, setDisplayEta] = useState<number | null>(null)
  const baseRef = useRef<{ base: number; at: number } | null>(null)

  useEffect(() => {
    baseRef.current =
      isTranscribing && serverEta != null ? { base: serverEta, at: Date.now() } : null
  }, [stage, currentChunk, serverEta, isTranscribing])

  useEffect(() => {
    const id = setInterval(() => {
      const b = baseRef.current
      setDisplayEta(b ? Math.max(0, b.base - Math.floor((Date.now() - b.at) / 1000)) : null)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Show the counted-down value; fall back to the raw snapshot for the first
  // second after a chunk lands (before the timer has ticked) so there's no flash.
  const shownEta = isTranscribing ? displayEta ?? serverEta : null

  // ── ETA label: honest across all three cases ─────────────────────────────────
  let etaLabel: string
  if (!isTranscribing) {
    // Fast post-transcription tail — the label, not a number, says "almost done".
    etaLabel = "اللحظات الأخيرة"
  } else if (shownEta == null) {
    // Rough early — no honest estimate until the first chunk completes.
    etaLabel = "يُحسب…"
  } else {
    etaLabel = `يتبقّى ${formatEtaApprox(shownEta)}`
  }

  return (
    <div
      className={cn(
        "rounded-xl border p-3",
        accent === "emerald"
          ? "border-emerald-500/25 bg-emerald-500/5"
          : "border-blue-500/25 bg-blue-500/5",
      )}
    >
      {/* Headline line: stage · chunk X of Y · % · ETA */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
        <span className={cn("inline-flex items-center gap-1.5 font-semibold", c.label)}>
          <Activity className="h-3.5 w-3.5 animate-pulse" />
          {STAGE_LABEL[stage]}
        </span>
        {knowsChunks && (
          <span className="text-muted-foreground">
            · المقطع <Num>{currentChunk}</Num> من <Num>{totalChunks}</Num>
          </span>
        )}
        <span className={cn("font-semibold", c.label)}>
          · <Num>{percent}</Num>%
        </span>
        <span className="text-muted-foreground">· {etaLabel}</span>
      </div>

      {/* The determinate bar — fills from the start edge (right in RTL) leftward. */}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={STAGE_LABEL[stage]}
        className={cn(
          "relative mt-2 h-2 w-full overflow-hidden rounded-full",
          c.track,
        )}
      >
        <div
          className={cn(
            "absolute inset-y-0 start-0 rounded-full transition-[width] duration-500 ease-out",
            c.fill,
            // Unknown total (rare — duration is stored at upload) → a gentle
            // pulse so a 0%-wide bar still reads as "alive, starting".
            !knowsChunks && percent === 0 && "animate-pulse",
          )}
          style={{ width: `${Math.max(knowsChunks ? 1.5 : 0, percent)}%` }}
        />
      </div>

      {/* Quiet secondary line — the honest wall-clock fallback, always present. */}
      <p className={cn("mt-2 text-[10.5px]", c.sub)}>
        الوقت المنقضي{" "}
        <span className="tabular-nums" dir="ltr">
          {formatTimeSeconds(elapsedSeconds)}
        </span>{" "}
        · لا تغلق الصفحة · يتطلّب تشغيل عامل المهام (worker)
      </p>
    </div>
  )
}
