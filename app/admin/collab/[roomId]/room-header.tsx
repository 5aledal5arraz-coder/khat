"use client"

/**
 * RoomHeader — status bar visible to all roles.
 *
 * Displays: room name, connection status, live/paused/ended badge,
 * current phase, energy level, online participants count.
 * Host sees recording timer when live.
 */

import { useEffect, useState } from "react"
import { useRoomConnection } from "@/app/admin/preparation/[id]/room/contexts"
import { useRoomState } from "@/app/admin/preparation/[id]/room/contexts"
import { useRoomCards } from "@/app/admin/preparation/[id]/room/contexts"
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

// ─── Status badge ────────────────────────────────────────────────────

const STATUS_CONFIG = {
  waiting: { label: "في الانتظار", icon: Clock, color: "bg-muted text-muted-foreground" },
  live: { label: "مباشر", icon: Radio, color: "bg-red-500/15 text-red-400 border-red-500/30" },
  paused: { label: "متوقف", icon: Pause, color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  ended: { label: "انتهى", icon: CheckCircle2, color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
} as const

const CONN_ICON = {
  connected: Wifi,
  connecting: Loader2,
  reconnecting: Loader2,
  disconnected: WifiOff,
} as const

// ─── Energy indicator ────────────────────────────────────────────────

function EnergyDots({ level }: { level: number }) {
  return (
    <div className="flex items-center gap-1" title={`الطاقة: ${level}/5`}>
      <Zap className="h-3.5 w-3.5 text-amber-400" />
      <div className="flex gap-0.5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className={cn(
              "h-2 w-2 rounded-full transition-colors",
              i < level ? "bg-amber-400" : "bg-muted-foreground/20",
            )}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Live timer ──────────────────────────────────────────────────────

function LiveTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState("")

  useEffect(() => {
    const start = new Date(startedAt).getTime()
    const tick = () => {
      const diff = Math.floor((Date.now() - start) / 1000)
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setElapsed(
        h > 0
          ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
          : `${m}:${String(s).padStart(2, "0")}`,
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  return (
    <span className="font-mono text-xs tabular-nums text-red-400">{elapsed}</span>
  )
}

// ─── Header ──────────────────────────────────────────────────────────

export function RoomHeader() {
  const { status: connStatus } = useRoomConnection()
  const { room, onlineCount, isHost } = useRoomState()
  const { unseenNotesCount } = useRoomCards()

  if (!room) return null

  const statusCfg = STATUS_CONFIG[room.status]
  const StatusIcon = statusCfg.icon
  const ConnIcon = CONN_ICON[connStatus]
  const isSpinning = connStatus === "connecting" || connStatus === "reconnecting"

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-border/40 bg-background/80 px-4 py-2.5 backdrop-blur-sm">
      {/* Right side: room name + status */}
      <div className="flex items-center gap-3">
        <h1 className="text-sm font-bold truncate max-w-[200px]">{room.name}</h1>

        {/* Room status badge */}
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
            statusCfg.color,
          )}
        >
          <StatusIcon className={cn("h-3 w-3", room.status === "live" && "animate-pulse")} />
          {statusCfg.label}
        </div>

        {/* Live timer */}
        {room.status === "live" && room.recording_started_at && (
          <LiveTimer startedAt={room.recording_started_at} />
        )}
      </div>

      {/* Left side: indicators */}
      <div className="flex items-center gap-4">
        {/* Phase */}
        {room.phase && (
          <span className="rounded-md bg-muted/50 px-2 py-0.5 text-[11px] text-muted-foreground">
            {room.phase}
          </span>
        )}

        {/* Energy */}
        <EnergyDots level={room.energy_level} />

        {/* Unseen notes (host/director) */}
        {unseenNotesCount > 0 && (
          <div className="flex items-center gap-1 text-amber-400">
            <MessageSquare className="h-3.5 w-3.5" />
            <span className="text-[11px] font-semibold">{unseenNotesCount}</span>
          </div>
        )}

        {/* Online count */}
        <div className="flex items-center gap-1 text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          <span className="text-[11px]">{onlineCount}</span>
        </div>

        {/* Connection indicator */}
        <div
          title={
            connStatus === "connected" ? "متصل"
            : connStatus === "reconnecting" ? "إعادة الاتصال..."
            : connStatus === "disconnected" ? "غير متصل"
            : "جاري الاتصال..."
          }
        >
          <ConnIcon
            className={cn(
              "h-3.5 w-3.5",
              connStatus === "connected" && "text-emerald-400",
              connStatus === "disconnected" && "text-red-400",
              (connStatus === "reconnecting" || connStatus === "connecting") && "text-amber-400",
              isSpinning && "animate-spin",
            )}
          />
        </div>
      </div>
    </header>
  )
}
