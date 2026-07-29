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
 * Falls back to legacy questions when prep_v2 is null. This is now the
 * single live-recording surface; /admin/collab/[roomId] redirects here.
 */

import { notFound } from "next/navigation"
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

  // The header carries the episode name and nothing else. The "فتح في Khat
  // Brain" jump, the raw room id and the EIR phase were all removed: they are
  // internal production vocabulary, and the people in this room during a
  // recording (director, photographer, editor) are here for the guest, not
  // for the pipeline. Operators reach the workspace from /admin, not from
  // inside a live session.
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/40 bg-background/95 px-4 py-2 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-center">
          <span className="truncate text-[12px] font-semibold">{snapshot.room.name}</span>
        </div>
      </header>

      <RecordingRoomShell initial={snapshot} userName={userName} />
    </div>
  )
}
