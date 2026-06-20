"use client"

/**
 * GuestEmpty CTA — "تشغيل اكتشاف لهذه الحلقة".
 *
 * Replaces the old static <Link href="/admin/discovery-v2">, which dumped the
 * operator on the generic discovery form and re-asked for the episode topic +
 * filters that the EIR already has. This button launches discovery for THIS
 * episode (server resolves the title + season filters from the eir id) and
 * navigates straight to the run results.
 */

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Telescope } from "lucide-react"
import { toast } from "@/lib/use-toast"
import { startGuestDiscoveryForEirAction } from "./actions"

export function LaunchEpisodeDiscoveryButton({
  eirId,
  prominent = false,
}: {
  eirId: string
  /** Render as the filled primary CTA (used as the hero action in GuestEmpty). */
  prominent?: boolean
}) {
  const router = useRouter()
  const [pending, start] = useTransition()

  const onClick = () => {
    start(async () => {
      const res = await startGuestDiscoveryForEirAction(eirId)
      if (res.success && res.runId) {
        toast({
          title: "بدأ البحث عن ضيف",
          description: "نعرض الاقتراحات الآن…",
          variant: "success",
        })
        router.push(`/admin/discovery-v2/${res.runId}`)
      } else {
        toast({
          title: "تعذّر بدء البحث",
          description: res.error ?? "حدث خطأ غير متوقع",
          variant: "error",
        })
      }
    })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={
        prominent
          ? "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          : "inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-700 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      {pending ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          جارٍ بدء البحث…
        </>
      ) : (
        <>
          <Telescope className="h-3 w-3" />
          تشغيل اكتشاف لهذه الحلقة
        </>
      )}
    </button>
  )
}
