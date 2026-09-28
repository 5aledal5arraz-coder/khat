"use client"

/**
 * «رشّحه لهالحلقة» — one discovery result → the CRM candidate linked to this
 * episode. Creates or updates (no duplicates); never creates a guest. When
 * the team later links that candidate to a canonical guest, the guest is
 * assigned to this episode.
 */

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Check, Loader2, UserPlus } from "lucide-react"
import { toast } from "@/lib/use-toast"
import { runAction } from "@/app/admin/components/run-action"
import { nominateV2CandidateForEirAction } from "@/app/admin/discovery-v2/actions"

export function NominateCandidateButton({
  candidateId,
  eirId,
  nominated,
}: {
  candidateId: string
  eirId: string
  nominated: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [done, setDone] = useState(nominated)
  const [conflictEirId, setConflictEirId] = useState<string | null>(null)

  if (conflictEirId) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11.5px] text-amber-700">
        هالشخص مرشّح لحلقة ثانية —{" "}
        <Link href={`/admin/khat-brain/episodes/${conflictEirId}?tab=guest`} className="font-medium underline-offset-2 hover:underline">
          افتحها
        </Link>
      </span>
    )
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11.5px] text-emerald-700">
        <Check className="h-3 w-3" /> مرشّح لهالحلقة
      </span>
    )
  }

  return (
    <button
      type="button"
      disabled={pending}
      title="يضيفه لقائمة التواصل مربوطاً بهذه الحلقة — أو يحدّث سجلّه إن كان موجوداً. لا يُنشئ ضيفاً."
      onClick={() =>
        start(async () => {
          const outcome = await runAction(() => nominateV2CandidateForEirAction(candidateId, eirId))
          const r = outcome.ok ? outcome.data : { success: false as const, error: outcome.message }
          if (r.success) {
            setDone(true)
            toast({
              title: "تم الترشيح لهالحلقة",
              description:
                "created" in r && r.created === false
                  ? "كان في قائمة التواصل — حدّثنا سجلّه وربطناه بهالحلقة."
                  : "أُضيف لقائمة التواصل مربوطاً بهالحلقة.",
              variant: "success",
            })
            router.refresh()
          } else if ("conflictEirId" in r && r.conflictEirId) {
            setConflictEirId(r.conflictEirId)
          } else {
            toast({ title: "تعذّر الترشيح", description: r.error ?? "خطأ غير متوقع", variant: "error" })
          }
        })
      }
      className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11.5px] text-primary hover:bg-primary/20 disabled:opacity-50"
    >
      {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
      رشّحه لهالحلقة
    </button>
  )
}
