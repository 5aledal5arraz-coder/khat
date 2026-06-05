"use client"

import { useEffect, useState, useTransition } from "react"
import { Compass, Sparkles, X } from "lucide-react"
import { useRouter, useSearchParams } from "next/navigation"
import { startDiscoveryRunAction } from "./actions"

export interface StartRunFormProps {
  /** Optional pre-fill from server (e.g. when navigated from the
   *  workspace with `?eirId=...`). */
  defaultEirId?: string | null
  defaultSeedPrompt?: string | null
  defaultEpisodeTitle?: string | null
  /**
   * CR-2 — when this run inherits from a season, surface the season's
   * hard guest filters as visible chips so the operator knows the
   * filter will be applied. The values match the season's
   * `editorial_controls.guest_filters`. null = no inheritance.
   */
  inheritedGender?: "male" | "female" | null
  inheritedNationality?: "kuwaiti" | "non_kuwaiti" | null
}

export function StartRunForm({
  defaultEirId,
  defaultSeedPrompt,
  defaultEpisodeTitle,
  inheritedGender = null,
  inheritedNationality = null,
}: StartRunFormProps = {}) {
  // Auto-open the form when we arrive carrying episode context, so
  // operators don't have to hunt for the toggle.
  const [open, setOpen] = useState<boolean>(!!defaultEirId)
  const [seedPrompt, setSeedPrompt] = useState(defaultSeedPrompt ?? "")
  const [count, setCount] = useState(8)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [eirId] = useState<string | null>(defaultEirId ?? null)
  // Phase Beta — operator's hiddenness taste. "balanced" is the
  // default; the slider re-weights the recommendation_score axis
  // inside Alpha's editorial-fit module.
  const [hiddennessPreference, setHiddennessPreference] = useState<
    "famous" | "balanced" | "hidden_gems"
  >("balanced")
  const router = useRouter()
  const searchParams = useSearchParams()

  // If the URL carried `?eirId=` and a fresh seedPrompt came from the
  // server, keep them in sync when the params change (back/forward).
  useEffect(() => {
    if (defaultSeedPrompt && seedPrompt === "") {
      setSeedPrompt(defaultSeedPrompt)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultSeedPrompt])

  function clearEpisodeContext() {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("eirId")
    params.delete("episodeTitle")
    params.delete("seedPrompt")
    router.replace(`/admin/discovery${params.size > 0 ? `?${params}` : ""}`)
  }

  function submit() {
    setError(null)
    startTransition(async () => {
      const r = await startDiscoveryRunAction({
        seedPrompt: seedPrompt.trim() || null,
        count,
        eirId: eirId ?? null,
        hiddennessPreference,
      })
      if (!r.success) {
        setError(r.error)
        return
      }
      setOpen(false)
      setSeedPrompt(defaultSeedPrompt ?? "")
      // After success, scroll the new run into the recent-runs list.
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90"
      >
        <Compass className="h-4 w-4" />
        ابدأ تشغيلاً جديداً
      </button>
    )
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2 text-[12px] font-semibold">
        <span>تشغيل اكتشاف</span>
        {eirId && (
          <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-[10.5px] text-violet-200">
            <Sparkles className="h-2.5 w-2.5" />
            للحلقة
            {defaultEpisodeTitle && (
              <span className="ms-1 text-foreground/85" dir="auto">
                · {defaultEpisodeTitle.slice(0, 36)}
              </span>
            )}
            <button
              type="button"
              onClick={clearEpisodeContext}
              title="إزالة سياق الحلقة"
              className="ms-1 rounded p-0.5 hover:bg-violet-500/20"
              aria-label="إزالة سياق الحلقة"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        )}
      </div>
      <textarea
        className="w-full rounded-lg border border-border/40 bg-background/60 p-3 text-[13px]"
        rows={4}
        placeholder="نبرة، مجال، نمط قصصي مطلوب… (اختياري)"
        value={seedPrompt}
        onChange={(e) => setSeedPrompt(e.target.value)}
        dir="rtl"
      />
      <p className="mt-1 text-[10.5px] text-muted-foreground/70">
        {eirId
          ? "تمّ توليد الموجِّه تلقائياً من عنوان الحلقة وقصدها التحريري. يمكنك التعديل."
          : "النصّ يُغذّي توليد الأنماط البشرية التي يبحث عنها الذكاء الاصطناعي."}
      </p>
      {/*
        CR-2 — surface the season's hard filters so the operator sees
        the constraint that WILL be applied to every candidate. Server
        enforces these via editorial_controls.guest_filters; we make
        them visible here so trust isn't blind.
      */}
      {(inheritedGender || inheritedNationality) && (
        <div
          className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-[10.5px] text-amber-200"
          data-inherited-filters
        >
          <span className="text-amber-300/80">سيُطبَّق على كل المرشّحين:</span>
          {inheritedGender && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5">
              الجنس: {inheritedGender === "male" ? "ذكر" : "أنثى"}
            </span>
          )}
          {inheritedNationality && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5">
              الجنسية:{" "}
              {inheritedNationality === "kuwaiti" ? "كويتي" : "غير كويتي"}
            </span>
          )}
          <span className="text-amber-300/60">· يُستبعد كل ما لا يتحقق</span>
        </div>
      )}
      <div className="mt-2 flex items-center gap-3">
        <label className="text-[11px] text-muted-foreground">عدد الأنماط:</label>
        <input
          type="number"
          min={3}
          max={16}
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="w-16 rounded-md border border-border/40 bg-background/60 px-2 py-1 text-center text-[12px]"
          dir="ltr"
        />
      </div>

      {/*
        Phase Beta — hiddenness taste slider. Three-position selector;
        re-weights the recommendation_score axis in editorial-fit so
        operators choose between famous-led and niche-led surfaces.
      */}
      <div className="mt-3" data-hiddenness-slider>
        <div className="mb-1 text-[11px] text-muted-foreground">
          ميل الذوق:
        </div>
        <div
          className="grid grid-cols-3 gap-1 rounded-lg border border-border/30 bg-background/40 p-1 text-[11px]"
          dir="rtl"
        >
          {(
            [
              { id: "famous", label: "مشاهير" },
              { id: "balanced", label: "متوازن" },
              { id: "hidden_gems", label: "جواهر مخفية" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setHiddennessPreference(opt.id)}
              className={
                "rounded-md px-2 py-1 transition-colors " +
                (hiddennessPreference === opt.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-background/60")
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="mt-1 text-[10px] text-muted-foreground/70" dir="rtl">
          {hiddennessPreference === "famous"
            ? "ضيوف معروفون مع التركيز على الصلة بالمحتوى."
            : hiddennessPreference === "hidden_gems"
              ? "ضيوف نادرون بجمهور صغير، يتقدّمون على المعروفين."
              : "توازن بين الجمهور والصلة بالمحتوى."}
        </div>
      </div>
      {error && (
        <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-[11px] text-rose-400">
          {error}
        </div>
      )}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-lg border border-border/60 bg-background/50 px-3 py-1.5 text-[12px] text-muted-foreground"
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground disabled:opacity-60"
        >
          {pending ? "..." : "ابدأ"}
        </button>
      </div>
    </div>
  )
}
