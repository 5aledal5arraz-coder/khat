"use client"

/**
 * GuestEmpty CTA — "تشغيل اكتشاف لهذه الحلقة".
 *
 * Replaces the old static <Link href="/admin/discovery-v2">, which dumped the
 * operator on the generic discovery form and re-asked for the episode topic +
 * filters that the EIR already has. This button launches discovery for THIS
 * episode (server resolves the title + season filters from the eir id) and
 * navigates straight to the run results.
 *
 * It does NOT launch on the first click (2026-09-28): it opens a small inline
 * choice first — the guest gender (رجل / امرأة / أيّ) and where the guests
 * come from (Saudi / Gulf opt-in) — the same two choices the
 * /admin/discovery-v2 form asks. It used to launch at once with no gender and
 * no geography.
 *
 * Both are PRESELECTED to «رجل» + الكويت (Khaled, 2026-09-28: guests are men
 * from Kuwait by default). The old "pick a gender first" gate is gone — a
 * default now exists, so «ابدأ الاكتشاف» works on the first click of the
 * panel; the operator can still change either before launching.
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Telescope } from "lucide-react"
import { toast } from "@/lib/use-toast"
import { cn } from "@/lib/utils"
import { runAction } from "@/app/admin/components/run-action"
import {
  DEFAULT_DISCOVERY_GENDER,
  DEFAULT_DISCOVERY_GEOGRAPHY,
  type V2Geography,
} from "@/lib/discovery-v2/types"
import { startGuestDiscoveryForEirAction } from "./actions"

type GenderPick = "male" | "female" | "any"

const GENDERS: { id: GenderPick; label: string }[] = [
  { id: "male", label: "رجل" },
  { id: "female", label: "امرأة" },
  { id: "any", label: "أيّ" },
]

// Kuwait only by default; at least one stays selected.
const GEOS: { id: V2Geography; label: string }[] = [
  { id: "kuwait", label: "الكويت" },
  { id: "saudi", label: "السعودية" },
  { id: "gulf", label: "الخليج" },
]

const chip = (on: boolean) =>
  cn(
    "rounded-lg border px-3 py-1.5 text-[12px] transition-colors",
    on
      ? "border-primary/50 bg-primary/15 font-semibold text-primary"
      : "border-border/50 bg-background text-muted-foreground hover:text-foreground",
  )

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
  const [open, setOpen] = useState(false)
  const [gender, setGender] = useState<GenderPick>(DEFAULT_DISCOVERY_GENDER)
  const [geography, setGeography] = useState<V2Geography[]>([...DEFAULT_DISCOVERY_GEOGRAPHY])
  const toggleGeo = (g: V2Geography) =>
    setGeography((cur) =>
      cur.includes(g) ? (cur.length > 1 ? cur.filter((x) => x !== g) : cur) : [...cur, g],
    )

  const launch = () => {
    start(async () => {
      const outcome = await runAction(() =>
        startGuestDiscoveryForEirAction(eirId, {
          gender: gender === "any" ? null : gender,
          geography,
        }),
      )
      const res = outcome.ok
        ? outcome.data
        : { success: false as const, runId: undefined, error: outcome.message }
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

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      disabled={pending}
      aria-expanded={open}
      className={
        prominent
          ? "inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-[13px] font-bold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          : "inline-flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-[12px] text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
      }
    >
      <Telescope className="h-3 w-3" />
      تشغيل اكتشاف لهذه الحلقة
    </button>
  )

  if (!open) return trigger

  return (
    <div className="inline-flex flex-col items-stretch gap-3">
      {trigger}
      <div className="rounded-xl border border-border/50 bg-card p-3 text-start">
        <div className="mb-1.5 text-[11.5px] font-medium text-foreground">جنس الضيف</div>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="جنس الضيف">
          {GENDERS.map((g) => (
            <button
              key={g.id}
              type="button"
              role="radio"
              aria-checked={gender === g.id}
              onClick={() => setGender(g.id)}
              className={chip(gender === g.id)}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="mb-1.5 mt-3 text-[11.5px] font-medium text-foreground">من أين</div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="النطاق الجغرافي">
          {GEOS.map((g) => (
            <button
              key={g.id}
              type="button"
              aria-pressed={geography.includes(g.id)}
              onClick={() => toggleGeo(g.id)}
              className={chip(geography.includes(g.id))}
            >
              {g.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={launch}
          disabled={pending}
          className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[12.5px] font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              جارٍ بدء البحث…
            </>
          ) : (
            <>
              <Telescope className="h-3.5 w-3.5" />
              ابدأ الاكتشاف
            </>
          )}
        </button>
      </div>
    </div>
  )
}
