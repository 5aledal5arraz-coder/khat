"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Sparkles, Loader2 } from "lucide-react"
import { startV2DiscoveryAction } from "./actions"

const TASTES: { id: "famous" | "balanced" | "hidden_gems"; label: string }[] = [
  { id: "famous", label: "مشاهير" },
  { id: "balanced", label: "متوازن" },
  { id: "hidden_gems", label: "أصوات عميقة" },
]

export function StartV2Form() {
  const router = useRouter()
  const [topic, setTopic] = useState("")
  const [gender, setGender] = useState<"" | "male" | "female">("")
  const [nationality, setNationality] = useState<"" | "kuwaiti" | "non_kuwaiti">("")
  const [taste, setTaste] = useState<"famous" | "balanced" | "hidden_gems">("balanced")
  const [limit, setLimit] = useState(12)
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const submit = () => {
    setError(null)
    start(async () => {
      const r = await startV2DiscoveryAction({
        topic,
        gender: gender || null,
        nationality: nationality || null,
        taste,
        limit,
      })
      if (r.success && r.runId) router.push(`/admin/discovery-v2/${r.runId}`)
      else setError(r.error ?? "تعذّر بدء التشغيل")
    })
  }

  return (
    <div className="rounded-2xl border border-violet-500/30 bg-violet-500/5 p-4">
      <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700">
        <Sparkles className="h-3 w-3" /> اكتشاف v2 — مرجعيّ وموثوق
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
          <label className="mb-1 block text-[10.5px] text-muted-foreground">الجنسية</label>
          <select value={nationality} onChange={(e) => setNationality(e.target.value as never)} className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12px]">
            <option value="">أيّ</option>
            <option value="kuwaiti">كويتي</option>
            <option value="non_kuwaiti">غير كويتي</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-muted-foreground">العدد</label>
          <input type="number" min={3} max={24} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-full rounded-lg border border-border/40 bg-background/40 p-2 text-[12px]" />
        </div>
        <div>
          <label className="mb-1 block text-[10.5px] text-muted-foreground">الميل</label>
          <div className="flex gap-1">
            {TASTES.map((t) => (
              <button key={t.id} type="button" onClick={() => setTaste(t.id)} className={"flex-1 rounded-lg border px-1.5 py-2 text-[10.5px] " + (taste === t.id ? "border-violet-500/50 bg-violet-500/15 text-violet-700" : "border-border/40 bg-background/40 text-muted-foreground")}>
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
