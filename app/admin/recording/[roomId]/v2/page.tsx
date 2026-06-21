/**
 * Phase X Step 5 — Live Recording V2 page.
 *
 *   /admin/recording/[roomId]/v2
 *
 * Server-rendered shell. Loads the room + preparation + prep_v2 +
 * markers, then mounts a single client component (LiveV2Client) that
 * owns the timer ticking + autosave + button transitions. All
 * mutations route through the server actions in actions.ts.
 *
 * Falls back to legacy questions when prep_v2 is null. Does NOT remove
 * the existing /admin/collab/[roomId] route.
 */

import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Brain } from "lucide-react"
import { requireAdmin, getAdminAuthUser } from "@/lib/api-utils"
import { loadLiveV2 } from "@/lib/recording-v2/load"
import { RecordingRoomShell } from "./recording-room-shell"

export const dynamic = "force-dynamic"

export default async function RecordingV2Page({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  await requireAdmin()
  const user = await getAdminAuthUser()
  const { roomId } = await params
  const snapshot = await loadLiveV2(roomId)
  if (!snapshot) notFound()
  const userName = user?.email?.split("@")[0] ?? "operator"

  // UX-3b — when this room is linked to an EIR, surface a one-click
  // jump to the Episode Workspace's Recording tab so operators have a
  // way back into the unified workspace from the standalone live page.
  const eirId = snapshot.room.eir_id

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href={`/admin/collab/${roomId}`}
              className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 text-[11px] text-muted-foreground hover:bg-background/60"
            >
              <ArrowLeft className="h-3 w-3" /> الإصدار القديم
            </Link>
            {eirId && (
              <Link
                href={`/admin/khat-brain/episodes/${eirId}?tab=recording`}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-700 hover:bg-violet-500/20"
              >
                <Brain className="h-3 w-3" /> فتح في Khat Brain
              </Link>
            )}
            <span className="text-[12px] font-semibold">{snapshot.room.name}</span>
            <span className="text-[10.5px] text-muted-foreground" dir="ltr">
              {roomId.slice(0, 8)}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground">
            EIR phase: <span dir="ltr">{snapshot.room.eir_phase ?? "—"}</span>
          </div>
        </div>
      </header>

      <RecordingRoomShell initial={snapshot} userName={userName} />
    </div>
  )
}
