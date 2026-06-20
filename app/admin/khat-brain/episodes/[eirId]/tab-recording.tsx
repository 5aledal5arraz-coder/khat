/**
 * UX-3b — Recording tab.
 *
 *   - room exists           → embed the existing <LiveV2Client /> with
 *                              a snapshot loaded by `loadLiveV2`.
 *   - prep exists, no room  → "Create recording room" CTA (links into
 *                              the legacy collab/preparation surface
 *                              that creates rooms today; UX-4 can wrap
 *                              it as a server action).
 *   - no prep               → "Preparation required" empty state with
 *                              a link to the Preparation tab.
 *
 * The Recording V2 client is a portable client component; we already
 * mount it on /admin/recording/[roomId]/v2. Here we simply re-mount it
 * inside the workspace tab.
 */

import Link from "next/link"
import { Radio, AlertTriangle, ExternalLink, Brain } from "lucide-react"
import { loadLiveV2 } from "@/lib/recording-v2/load"
import { LiveV2Client } from "@/app/admin/recording/[roomId]/v2/live-v2-client"
import type {
  WorkspaceRoomSummary,
  WorkspacePrepSummary,
} from "@/lib/khat-brain/workspace-tabs"
import { CreateRoomButton } from "./create-room-button"
import { RecordingShareStrip } from "./recording-share-strip"

export async function RecordingTab({
  eirId,
  room,
  prep,
}: {
  eirId: string
  room: WorkspaceRoomSummary | null
  prep: WorkspacePrepSummary | null
}) {
  // No prep yet — recording is gated.
  if (!prep) {
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
        <Brain className="mx-auto h-6 w-6 text-amber-700" />
        <h3 className="mt-2 text-[13px] font-semibold">الإعداد مطلوب قبل التسجيل</h3>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-foreground/85">
          أنشئ سجلّ إعداد للحلقة أولاً. غرفة التسجيل تُربط دائماً بسجلّ
          إعداد قائم.
        </p>
        <Link
          href={`/admin/khat-brain/episodes/${eirId}?tab=preparation`}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-700 hover:bg-violet-500/20"
        >
          فتح علامة تبويب «الإعداد» <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    )
  }

  // Prep exists, no room yet — offer a workspace-native create.
  if (!room) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-6 text-center">
          <Radio className="mx-auto h-6 w-6 text-violet-700" />
          <h3 className="mt-2 text-[13px] font-semibold">
            لا توجد غرفة تسجيل لهذه الحلقة
          </h3>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-foreground/85">
            أنشئ غرفة لربط فريق التسجيل بهذا الإعداد. سيُحرَّك EIR
            تلقائياً إلى «جاهزة للتسجيل».
          </p>
          <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-2">
            <CreateRoomButton eirId={eirId} />
            <Link
              href={`/admin/preparation/${prep.id}?legacy=1`}
              className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-muted-foreground"
              data-legacy-link
            >
              الصفحة المتقدمة <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Room exists — load the full Live V2 snapshot and embed the client.
  const snapshot = await loadLiveV2(room.id)
  if (!snapshot) {
    return (
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
        <AlertTriangle className="mx-auto h-6 w-6 text-rose-700" />
        <h3 className="mt-2 text-[13px] font-semibold">تعذّر تحميل غرفة التسجيل</h3>
        <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-foreground/85">
          الغرفة موجودة لكن قراءة بياناتها فشلت. افتح الصفحة المباشرة
          مؤقتاً.
        </p>
        <Link
          href={`/admin/recording/${room.id}/v2`}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-[12px] text-rose-700 hover:bg-rose-500/20"
        >
          فتح صفحة Recording V2 <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <RecordingShareStrip
        roomId={room.id}
        roomName={room.name}
        createdAt={room.created_at}
        createdByEmail={room.created_by_email}
      />
      <LiveV2Client initial={snapshot} />
    </div>
  )
}
