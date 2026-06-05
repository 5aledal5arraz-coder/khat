"use client"

/**
 * UX — Assign guest to EIR.
 *
 * Renders inside the Guest tab when no guest is linked, and on the
 * Preparation tab when conversion is blocked by missing guest identity.
 * One server action; no redesign.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, UserPlus } from "lucide-react"
import { toast } from "@/lib/use-toast"
import { assignEirGuestAction } from "./actions"

interface GuestOption {
  id: string
  name: string
}

export function AssignGuestForm({
  eirId,
  guests,
  currentGuestId,
}: {
  eirId: string
  guests: GuestOption[]
  currentGuestId: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [selected, setSelected] = useState<string>(currentGuestId ?? "")

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    startTransition(async () => {
      const r = await assignEirGuestAction(eirId, selected)
      toast({
        title: r.ok ? "تم تعيين الضيف" : "تعذّر تعيين الضيف",
        description: r.message,
        variant: r.ok ? "success" : "error",
      })
      if (r.ok) router.refresh()
    })
  }

  if (guests.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-[12px] text-amber-200">
        لا يوجد ضيوف مسجّلين بعد. أضف ضيفاً من صفحة الضيوف ثم عد إلى هنا.
      </div>
    )
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-wrap items-center justify-center gap-2"
    >
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        disabled={pending}
        className="rounded-xl border border-border/50 bg-background/40 px-3 py-1.5 text-[12px] disabled:opacity-50"
      >
        <option value="" disabled>
          اختر ضيفاً…
        </option>
        {guests.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending || !selected || selected === currentGuestId}
        className="inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-200 hover:bg-violet-500/20 disabled:opacity-50"
      >
        {pending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            جارٍ التعيين…
          </>
        ) : (
          <>
            <UserPlus className="h-3 w-3" />
            تعيين الضيف
          </>
        )}
      </button>
    </form>
  )
}
