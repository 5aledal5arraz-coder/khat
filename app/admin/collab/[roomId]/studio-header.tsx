"use client"

/**
 * StudioHeader — thin top bar visible to all roles.
 *
 * Room name, status badge, online participants, phase, energy,
 * unseen notes indicator, and SSE connection indicator.
 */

import {
  useRoomConnection,
  useRoomState,
  useRoomCards,
  useRoomTimer,
} from "@/app/admin/preparation/[id]/room/contexts"
import {
  Radio,
  Pause,
  CheckCircle2,
  Clock,
  Users,
  Zap,
  WifiOff,
  Wifi,
  Loader2,
  MessageSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"

const STATUS_CONFIG = {
  waiting: { label: "في الانتظار", icon: Clock, color: "bg-muted/50 text-muted-foreground border-border/30" },
  live: { label: "مباشر", icon: Radio, color: "bg-red-500/15 text-red-700 border-red-500/30" },
  paused: { label: "متوقف", icon: Pause, color: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
  ended: { label: "انتهى", icon: CheckCircle2, color: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30" },
} as const

const CONN_ICON = {
  connected: Wifi,
  connecting: Loader2,
  reconnecting: Loader2,
  disconnected: WifiOff,
} as const

export function StudioHeader() {
  const { status: connStatus } = useRoomConnection()
  const { room, onlineCount } = useRoomState()
  const { unseenNotesCount } = useRoomCards()
  const { formattedTime, timerStatus } = useRoomTimer()

  if (!room) return null

  const statusCfg = STATUS_CONFIG[room.status]
  const StatusIcon = statusCfg.icon
  const ConnIcon = CONN_ICON[connStatus]
  const isSpinning = connStatus === "connecting" || connStatus === "reconnecting"

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-border/20 bg-background/60 px-4 py-2 backdrop-blur-sm">
      {/* Right: room name + status + timer */}
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-bold truncate max-w-[180px]">{room.name}</h1>

        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold",
            statusCfg.color,
          )}
        >
          <StatusIcon className={cn("h-3 w-3", room.status === "live" && "animate-pulse")} />
          {statusCfg.label}
        </div>

        {/* Timer in header (compact) */}
        {timerStatus !== "idle" && (
          <span
            className={cn(
              "font-mono text-sm tabular-nums tracking-wider",
              timerStatus === "running" && "text-red-700",
              timerStatus === "paused" && "text-amber-700",
              timerStatus === "stopped" && "text-emerald-700/60",
            )}
          >
            {formattedTime}
          </span>
        )}
      </div>

      {/* Left: indicators */}
      <div className="flex items-center gap-3.5">
        {/* Phase */}
        {room.phase && (
          <span className="rounded-md bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground">
            {room.phase}
          </span>
        )}

        {/* Energy */}
        <div className="flex items-center gap-1" title={`الطاقة: ${room.energy_level}/5`}>
          <Zap className="h-3 w-3 text-amber-700/60" />
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  i < room.energy_level ? "bg-amber-400" : "bg-muted-foreground/15",
                )}
              />
            ))}
          </div>
        </div>

        {/* Unseen notes */}
        {unseenNotesCount > 0 && (
          <div className="flex items-center gap-1 text-amber-700">
            <MessageSquare className="h-3 w-3" />
            <span className="text-[10px] font-semibold">{unseenNotesCount}</span>
          </div>
        )}

        {/* Online count */}
        <div className="flex items-center gap-1 text-muted-foreground">
          <Users className="h-3 w-3" />
          <span className="text-[10px]">{onlineCount}</span>
        </div>

        {/* Connection */}
        <ConnIcon
          className={cn(
            "h-3 w-3",
            connStatus === "connected" && "text-emerald-700/60",
            connStatus === "disconnected" && "text-red-700",
            (connStatus === "reconnecting" || connStatus === "connecting") && "text-amber-700",
            isSpinning && "animate-spin",
          )}
        />
      </div>
    </header>
  )
}
