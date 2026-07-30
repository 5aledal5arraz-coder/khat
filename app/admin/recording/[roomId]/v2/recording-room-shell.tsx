"use client"

/**
 * RecordingRoomShell — Phase 1 of folding the V1 collab room into V2.
 *
 * Wraps the V2 recording cockpit in the shared real-time room contexts
 * (RoomProvider: Connection → State → Cards → Timer → Markers), auto-joins
 * the operator, and surfaces live presence + connection status. This makes
 * the V2 page a genuine multi-participant room (others can join and are seen
 * live over SSE) without changing the cockpit body. Non-host participants get
 * role-specific live views on the prep_v2 model (ParticipantRoomView). This is
 * the single live-recording surface — the legacy /admin/collab room redirects
 * here.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import {
  RoomProvider,
  useRoomConnection,
  useRoomState,
} from "@/app/admin/preparation/[id]/room/contexts"
import { LiveV2Client } from "./live-v2-client"
import { ParticipantRoomView } from "./participant-room-view"
import type { LiveV2Snapshot } from "@/lib/recording-v2/load"
import type { ParticipantRole } from "@/types/collaboration"
import { isJobTitle, jobTitleLabel } from "@/lib/admin/team-identity"
import { Loader2, Users, Wifi, WifiOff, Zap } from "lucide-react"
import { cn } from "@/lib/utils"

export function RecordingRoomShell({
  initial,
  userName,
  initialRole,
  jobTitle,
}: {
  initial: LiveV2Snapshot
  userName: string
  /**
   * Room role resolved during the server render from the admin identity — the
   * same deterministic mapping the join route applies. Present so the shell
   * never has to guess which view to mount while the SSE participant list is
   * still in flight.
   */
  initialRole?: ParticipantRole | null
  /**
   * The member's صفحة (`admin_users.job_title`), for the "أنت: …" badge only.
   * Seven titles map onto five room screens, so `initialRole` alone cannot name
   * a مهندس صوت or a منتج — both of them follow along on the viewer screen and
   * would otherwise be greeted as "مشاهد". Label, never permission.
   */
  jobTitle?: string | null
}) {
  return (
    <RoomProvider
      prepId={initial.room.preparation_id}
      roomId={initial.room.id}
    >
      <RoomShellInner
        initial={initial}
        userName={userName}
        prepId={initial.room.preparation_id}
        roomId={initial.room.id}
        initialRole={initialRole ?? null}
        jobTitle={jobTitle ?? null}
      />
    </RoomProvider>
  )
}

function RoomShellInner({
  initial,
  userName,
  prepId,
  roomId,
  initialRole,
  jobTitle,
}: {
  initial: LiveV2Snapshot
  userName: string
  prepId: string
  roomId: string
  initialRole: ParticipantRole | null
  jobTitle: string | null
}) {
  const { status: connStatus } = useRoomConnection()
  const {
    joinRoom, leaveRoom, myParticipant, participants, room, updateEnergy, prepV2,
  } = useRoomState()
  const autoJoinAttempted = useRef(false)

  // `initial` is a one-shot server render. Rooms are opened (and their link
  // shared) while the prep_v2 pipeline is still running, so that render can
  // hold a `null` prep_v2 that is stale minutes later — and nothing below
  // re-reads it. `prepV2` is the room's live copy (SSE snapshot on every
  // connect + `prep_update` when generation lands); prefer it as soon as the
  // server has spoken, and hand the healed snapshot to both view branches.
  const snapshot = useMemo(
    () =>
      prepV2 && prepV2 !== initial.preparation.prep_v2
        ? { ...initial, preparation: { ...initial.preparation, prep_v2: prepV2 } }
        : initial,
    [initial, prepV2],
  )

  // Auto-join once the SSE connection is live (mirrors the collab room).
  //
  // The latch is set only AFTER a successful join. Setting it before the await
  // meant a failed join was permanent: no participant row, so no participant id,
  // so the heartbeat effect never armed, so `sweepStaleParticipants` never ran
  // for this room — and any stale `is_online = true` row stayed online forever,
  // which the checklist gate reads as "a director is connected".
  const [joinFailed, setJoinFailed] = useState(false)
  useEffect(() => {
    if (connStatus !== "connected" || autoJoinAttempted.current) return
    let cancelled = false
    void (async () => {
      try {
        const p = await joinRoom(userName)
        if (cancelled) return
        if (p) {
          autoJoinAttempted.current = true
          setJoinFailed(false)
        } else {
          // Swallowing this was the bug: presence silently never worked.
          setJoinFailed(true)
        }
      } catch {
        if (!cancelled) setJoinFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [connStatus, joinRoom, userName])

  // Best-effort leave on unmount / tab close so presence stays accurate.
  useEffect(() => {
    const onUnload = () => {
      // `leaveRoom` issues a DELETE with `keepalive`, which survives the unload.
      // This previously used `navigator.sendBeacon` — but sendBeacon is ALWAYS
      // POST, and POST on this route is JOIN, so closing the tab re-registered
      // the leaver as freshly online.
      void leaveRoom()
    }
    window.addEventListener("beforeunload", onUnload)
    return () => {
      window.removeEventListener("beforeunload", onUnload)
      void leaveRoom()
    }
  }, [leaveRoom, prepId, roomId])

  // The host drives the cockpit; everyone else gets the role-based live
  // follow-along on prep_v2.
  //
  // `initialRole` comes from the server render (same deterministic mapping the
  // join route uses), so the role is known on the first paint and the SSE
  // participant list only ever confirms it. This used to read
  // `!role || role === "host"` — i.e. an UNKNOWN role fell through to the host
  // branch, so every director saw the host cockpit, with a live "ابدأ التسجيل"
  // button, for as long as the participant list took to arrive (measured at
  // ~50s on a loaded dev server). An unknown role must never resolve to the
  // most privileged view: prefer the live value, fall back to the server's,
  // and only if BOTH are absent show a neutral resolving state.
  const role = myParticipant?.role ?? initialRole
  const isHost = role === "host"

  return (
    <>
      <PresenceStrip
        connStatus={connStatus}
        online={participants.filter((p) => p.is_online).length}
        joinFailed={joinFailed}
        // Raw catalog KEYS, not labels — PresenceStrip does the one lookup, so
        // the string is never transformed twice. The صفحة is what he calls
        // himself; the room role is only the screen he landed on, so prefer the
        // former and fall back to the latter.
        joinedAs={(isJobTitle(jobTitle) ? jobTitle : null) ?? (role ?? null)}
        energy={room?.energy_level ?? 3}
        canSetEnergy={isHost}
        onSetEnergy={updateEnergy}
        // The host cockpit's own StatusRail owns energy + connection on air, so
        // the host's top strip stays minimal (presence only) — no duplication.
        compact={isHost}
      />
      {role == null ? (
        <RoleResolving />
      ) : isHost ? (
        // The host cockpit owns its own team surface now: the on-air StatusRail
        // shows a quiet team indicator (counts + an amber pulse only when an
        // unseen urgent note exists) that opens a TeamDrawer on demand — so
        // team notes/markers never pop over the host mid-answer.
        <LiveV2Client initial={snapshot} />
      ) : (
        <ParticipantRoomView initial={snapshot} role={role} />
      )}
    </>
  )
}

/**
 * Neutral state for the sliver of time when neither the server render nor the
 * SSE snapshot has given us a role. Deliberately shows NO cockpit and no
 * "ابدأ التسجيل" button: the old code defaulted an unknown role to the host
 * view, which is the one surface that can start a take.
 */
function RoleResolving() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 p-10 text-center" dir="rtl">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      <p className="text-[12.5px] text-muted-foreground">جارٍ تحديد دورك في الغرفة…</p>
    </div>
  )
}

/**
 * One vocabulary for the "أنت: …" badge, from the صفحة catalog.
 *
 * There used to be a local map here ("المضيف"/"المخرج"/…) used for the room-role
 * fallback while the صفحة path used the catalog ("مقدم"/"مخرج"/…), so the same
 * person was greeted differently depending on which branch resolved — and the
 * local map was internally inconsistent too ("المخرج" with the article,
 * "مشاهد" without).
 *
 * This works because every `ParticipantRole` is also a `JobTitle` (the room's
 * five screens are five of the seven صفحات) — pinned by a test in
 * tests/team-identity.test.ts so a future rename cannot silently break it.
 */
function roomRoleLabel(role: string): string {
  return jobTitleLabel(role) ?? role
}

function PresenceStrip({
  connStatus,
  online,
  joinFailed,
  joinedAs,
  energy,
  canSetEnergy,
  onSetEnergy,
  compact = false,
}: {
  connStatus: string
  online: number
  /** Join never succeeded — presence is unreliable, so say so out loud. */
  joinFailed: boolean
  joinedAs: string | null
  energy: number
  canSetEnergy: boolean
  onSetEnergy: (level: number) => void
  /** Host cockpit: hide energy + connection here (the on-air rail owns them). */
  compact?: boolean
}) {
  const connected = connStatus === "connected"
  const connecting = connStatus === "connecting" || connStatus === "reconnecting"
  return (
    <div className="border-b border-border/40 bg-muted/20 px-4 py-1.5">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <Users className="h-3 w-3" />
          {joinFailed ? "تعذّر تسجيل حضورك" : `${online} متصل الآن`}
          {joinedAs && (
            <span className="rounded-full bg-violet-500/10 px-1.5 py-0.5 text-violet-700">
              أنت: {roomRoleLabel(joinedAs)}
            </span>
          )}
        </span>
        {!compact && (
          <EnergyControl level={energy} interactive={canSetEnergy} onSet={onSetEnergy} />
        )}
        {!compact && (
          <span
            className={
              "inline-flex items-center gap-1 " +
              (connected ? "text-emerald-700" : connecting ? "text-amber-700" : "text-rose-700")
            }
          >
            {connecting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : connected ? (
              <Wifi className="h-3 w-3" />
            ) : (
              <WifiOff className="h-3 w-3" />
            )}
            {connected ? "مباشر" : connecting ? "يتّصل…" : "غير متّصل"}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Room energy (0–5). The host clicks to set it; everyone else sees it
 * read-only. Changes broadcast over SSE (room_update) so all views sync.
 */
function EnergyControl({
  level,
  interactive,
  onSet,
}: {
  level: number
  interactive: boolean
  onSet: (level: number) => void
}) {
  const n = Math.max(0, Math.min(5, level))
  return (
    <span
      className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground"
      title="مستوى الطاقة"
    >
      <Zap className="h-3 w-3 text-amber-600" />
      <span className="inline-flex gap-0.5">
        {Array.from({ length: 5 }).map((_, i) =>
          interactive ? (
            <button
              key={i}
              type="button"
              onClick={() => i + 1 !== level && onSet(i + 1)}
              aria-label={`ضبط الطاقة على ${i + 1}`}
              className={cn(
                "h-2 w-2 rounded-full transition",
                i < n ? "bg-amber-500" : "bg-muted-foreground/25 hover:bg-amber-500/40",
              )}
            />
          ) : (
            <span
              key={i}
              className={cn(
                "h-2 w-2 rounded-full",
                i < n ? "bg-amber-500" : "bg-muted-foreground/25",
              )}
            />
          ),
        )}
      </span>
    </span>
  )
}
