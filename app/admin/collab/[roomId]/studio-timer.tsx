"use client"

/**
 * StudioTimer — large recording timer with controls.
 *
 * Displays: HH:MM:SS in monospace, pulsing red dot when recording.
 * Controls: Start, Pause, Resume, Stop, Reset (host only).
 */

import { useRoomTimer, type TimerStatus } from "@/app/admin/preparation/[id]/room/contexts"
import { useRoomState } from "@/app/admin/preparation/[id]/room/contexts"
import { Play, Pause, Square, RotateCcw } from "lucide-react"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<TimerStatus, string> = {
  idle: "text-muted-foreground/40",
  running: "text-red-400",
  paused: "text-amber-400",
  stopped: "text-emerald-400/60",
}

export function StudioTimer({ compact }: { compact?: boolean }) {
  const { timerStatus, formattedTime, startRecording, pauseRecording, resumeRecording, stopRecording, resetRecording } = useRoomTimer()
  const { isHost } = useRoomState()

  return (
    <div className={cn("flex items-center gap-4", compact ? "gap-3" : "gap-4")}>
      {/* Pulsing dot */}
      {timerStatus === "running" && (
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
        </span>
      )}

      {/* Time display */}
      <span
        className={cn(
          "font-mono tabular-nums tracking-wider",
          compact ? "text-2xl lg:text-3xl" : "text-4xl lg:text-6xl",
          STATUS_STYLES[timerStatus],
        )}
      >
        {formattedTime}
      </span>

      {/* Controls (host only) */}
      {isHost && (
        <div className="flex items-center gap-1.5">
          {timerStatus === "idle" && (
            <TimerButton onClick={startRecording} title="بدء التسجيل" variant="primary">
              <Play className="h-4 w-4" />
            </TimerButton>
          )}

          {timerStatus === "running" && (
            <>
              <TimerButton onClick={pauseRecording} title="إيقاف مؤقت" variant="warning">
                <Pause className="h-4 w-4" />
              </TimerButton>
              <TimerButton onClick={stopRecording} title="إنهاء التسجيل" variant="danger">
                <Square className="h-4 w-4" />
              </TimerButton>
            </>
          )}

          {timerStatus === "paused" && (
            <>
              <TimerButton onClick={resumeRecording} title="استئناف" variant="primary">
                <Play className="h-4 w-4" />
              </TimerButton>
              <TimerButton onClick={stopRecording} title="إنهاء التسجيل" variant="danger">
                <Square className="h-4 w-4" />
              </TimerButton>
            </>
          )}

          {timerStatus === "stopped" && (
            <TimerButton onClick={resetRecording} title="إعادة تعيين" variant="muted">
              <RotateCcw className="h-4 w-4" />
            </TimerButton>
          )}
        </div>
      )}
    </div>
  )
}

function TimerButton({
  onClick,
  title,
  variant,
  children,
}: {
  onClick: () => void
  title: string
  variant: "primary" | "warning" | "danger" | "muted"
  children: React.ReactNode
}) {
  const styles = {
    primary: "bg-primary/20 text-primary hover:bg-primary/30",
    warning: "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30",
    danger: "bg-red-500/20 text-red-400 hover:bg-red-500/30",
    muted: "bg-muted/30 text-muted-foreground hover:bg-muted/50",
  }

  return (
    <button
      onClick={onClick}
      title={title}
      className={cn("rounded-lg p-2 transition-colors", styles[variant])}
    >
      {children}
    </button>
  )
}
