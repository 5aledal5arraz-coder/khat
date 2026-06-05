import Link from "next/link"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { Sparkles } from "lucide-react"
import { verifyAdminSession } from "@/lib/admin/auth"
import { getRoomById } from "@/lib/collaboration/rooms"
import { CollabClient } from "./collab-client"

export default async function CollabRoomPage({
  params,
}: {
  params: Promise<{ roomId: string }>
}) {
  const cookieStore = await cookies()
  const token = cookieStore.get("__admin_session")?.value
  if (!token) redirect("/admin/login")

  const user = await verifyAdminSession(token)
  if (!user) redirect("/admin/login")

  const { roomId } = await params
  const room = await getRoomById(roomId)
  if (!room) notFound()

  return (
    <>
      {/* Phase X Step 5 — V2 entry point. Old page stays intact. */}
      <div className="border-b border-violet-500/20 bg-violet-500/5 px-4 py-2 text-[12px]">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-violet-200">
            <Sparkles className="h-3 w-3" />
            مُتاح: واجهة التسجيل V2 — مؤقّت + تتبّع تدفّق + علامات سريعة
          </span>
          <Link
            href={`/admin/recording/${roomId}/v2`}
            className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] font-medium text-violet-200 hover:bg-violet-500/20"
          >
            افتح Recording V2
          </Link>
        </div>
      </div>
      <CollabClient
        roomId={roomId}
        prepId={room.preparation_id}
        userName={user.email.split("@")[0]}
        userId={user.id}
      />
    </>
  )
}
