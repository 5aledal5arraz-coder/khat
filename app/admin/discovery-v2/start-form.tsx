"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Loader2 } from "lucide-react"
import { startV2DiscoveryAction } from "./actions"
import { runAction } from "@/app/admin/components/run-action"
import type { V2Geography } from "@/lib/discovery-v2/types"

// Kuwait only by default (Khaled, 2026-09-26); Saudi and the rest of the
// Gulf are opt-in. At least one stays selected.
const GEOS: { id: V2Geography; label: string }[] = [
  { id: "kuwait", label: "الكويت" },
  { id: "saudi", label: "السعودية" },
  { id: "gulf", label: "الخليج" },
]

const TASTES: { id: "famous" | "balanced" | "hidden_gems"; label: string }[] = [
  { id: "famous", label: "مشاهير" },
  { id: "balanced", label: "متوازن" },
  { id: "hidden_gems", label: "أصوات عميقة" },
]

export function StartV2Form() {
  const router = useRouter()
  const [topic, setTopic] = useState("")
  const [gender, setGender] = useState<"" | "male" | "female">("")
  const [geography, setGeography] = useState<V2Geography[]>(["kuwait"])
  const toggleGeo = (g: V2Geography) =>
    setGeography((cur) =>
      cur.includes(g) ? (cur.length > 1 ? cur.filter((x) => x !== g) : cur) : [...cur, g],
    )
  const [taste, setTaste] = useState<"famous" | "balanced" | "hidden_gems">("balanced")
  const [limit, setLimit] = useState(12)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    start(async () => {
      const outcome = await runAction(() =>
        startV2DiscoveryAction({
          topic,
          gender: gender || null,
          geography,
          taste,
          limit,
        }),
      )
      if (!outcome.ok) return setError(outcome.message)
      const r = outcome.data
      if (r.success && r.runId) router.push(`/admin/discovery-v2/${r.runId}`)
      else setError(r.error ?? "تعذّر بدء التشغيل")
    })
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
        <Sparkles className="h-3 w-3" /> اكتشاف v2 — القصة أولاً
      </div>
      <label className="mb-1 block text-[11px] text-muted-foreground">موضوع الحلقة / المجال</label>
      <textarea
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        rows={2}
        dir="rtl"
        placeholder="مثال: علم النفس وتطوير الذات · أو: ريادة الأعمال في الخليج"
        className="mb-3 w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[13px]"
      />
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-[10.5px] text-muted-foreground">الجنس</label>
          <select value={gender} onChange={(e) => setGender(e.target.value as never)} className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12px]">
            <option value="">أيّ</option>
            <option value="male">ذكر</option>
            <option value="female">أنثى</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-muted-foreground">من أين</label>
          <div className="flex gap-1" role="group" aria-label="النطاق الجغرافي">
            {GEOS.map((g) => (
              <button key={g.id} type="button" aria-pressed={geography.includes(g.id)} onClick={() => toggleGeo(g.id)} className={"flex-1 rounded-lg border px-1.5 py-2 text-[10.5px] " + (geography.includes(g.id) ? "border-primary/50 bg-primary/15 text-primary" : "border-border/40 bg-background/40 text-muted-foreground")}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-muted-foreground">العدد</label>
          <input type="number" min={3} max={24} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12px]" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-muted-foreground">الميل</label>
          <div className="flex gap-1">
            {TASTES.map((t) => (
              <button key={t.id} type="button" onClick={() => setTaste(t.id)} className={"flex-1 rounded-lg border px-1.5 py-2 text-[10.5px] " + (taste === t.id ? "border-primary/50 bg-primary/15 text-primary" : "border-border/40 bg-background/40 text-muted-foreground")}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {error && <p className="mb-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-2 text-[11.5px] text-rose-700">{error}</p>}
      <button type="button" disabled={pending || !topic.trim()} onClick={submit} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/90 px-4 py-2 text-[13px] font-semibold text-black hover:bg-amber-500 disabled:opacity-40">
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        ابدأ الاكتشاف
      </button>
    </div>
  )
}
