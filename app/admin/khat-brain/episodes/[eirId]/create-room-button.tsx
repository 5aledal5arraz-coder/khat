"use client"

/**
 * UX-4 — Workspace-native "Create Recording Room" button.
 *
 * Calls `createRoomForEpisodeAction` and surfaces the result inline.
 * Refreshes the workspace via Next.js router so the Recording tab
 * re-renders with the embedded LiveV2Client.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Radio, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { toast } from "@/lib/use-toast"
import {
  createRoomForEpisodeAction,
  type CreateRoomActionResult,
} from "./actions"

export function CreateRoomButton({ eirId }: { eirId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<CreateRoomActionResult | null>(null)

  const onClick = () => {
    setResult(null)
    startTransition(async () => {
      const r = await createRoomForEpisodeAction(eirId)
      setResult(r)
      // UX-5.5b — toast confirms the phase transition. `existing=true`
      // is reported as a success but with neutral copy because no phase
      // walk happened.
      if (r.ok) {
        toast({
          title: r.existing
            ? "غرفة التسجيل موجودة"
            : "تم نقل الحلقة إلى مرحلة التسجيل",
          description: r.message,
          variant: "success",
        })
        // Phase B.5 — single navigation; the server action already
        // called revalidatePath, so a separate router.refresh() would
        // double-fetch and flicker.
        router.push(
          `/admin/khat-brain/episodes/${eirId}?tab=recording&success=room_created`,
        )
      } else {
        toast({
          title: "فشل إنشاء الغرفة",
          description: r.message,
          variant: "error",
        })
      }
    })
  }

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] font-medium text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            جارٍ إنشاء الغرفة…
          </>
        ) : (
          <>
            <Radio className="h-3 w-3" />
            إنشاء غرفة تسجيل
          </>
        )}
      </button>
      {result && !result.ok && (
        <div className="inline-flex items-center gap-1 rounded-md bg-rose-500/10 px-2 py-0.5 text-[10.5px] text-rose-300">
          <XCircle className="h-2.5 w-2.5" />
          {result.message}
        </div>
      )}
      {result && result.ok && result.existing && (
        <div className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[10.5px] text-emerald-300">
          <CheckCircle2 className="h-2.5 w-2.5" />
          {result.message}
        </div>
      )}
    </div>
  )
}
