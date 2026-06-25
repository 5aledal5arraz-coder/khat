"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Cpu, Loader2, RotateCcw, Gauge } from "lucide-react"
import { cn } from "@/lib/utils"
import { updateAiRuntimeConfig } from "./actions"

export interface AiControlsInitial {
  mode: "off" | "report" | "enforce"
  modeOverridden: boolean
  limits: {
    light: { maxConcurrent: number; maxDailyCostUsd: number }
    expensive: { maxConcurrent: number; maxDailyCostUsd: number }
  }
  lightOverridden: boolean
  expensiveOverridden: boolean
  envMode: "off" | "report" | "enforce"
  envLimits: {
    light: { maxConcurrent: number; maxDailyCostUsd: number }
    expensive: { maxConcurrent: number; maxDailyCostUsd: number }
  }
}

const MODES: { value: "off" | "report" | "enforce"; label: string; description: string }[] = [
  { value: "off", label: "معطّل", description: "بلا حدود وبلا تسجيل — للتطوير فقط" },
  { value: "report", label: "مراقبة", description: "يُسجّل التجاوزات دون منعها (الوضع الافتراضي)" },
  { value: "enforce", label: "إلزام", description: "يمنع الطلبات التي تتجاوز الحدود فعلياً" },
]

export function AiControlsForm({ initial }: { initial: AiControlsInitial }) {
  const router = useRouter()
  const [mode, setMode] = useState(initial.mode)
  const [lightConc, setLightConc] = useState(String(initial.limits.light.maxConcurrent))
  const [lightCost, setLightCost] = useState(String(initial.limits.light.maxDailyCostUsd))
  const [expConc, setExpConc] = useState(String(initial.limits.expensive.maxConcurrent))
  const [expCost, setExpCost] = useState(String(initial.limits.expensive.maxDailyCostUsd))
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)

  const num = (s: string) => Number(s)
  const valid =
    num(lightConc) > 0 && num(lightCost) > 0 && num(expConc) > 0 && num(expCost) > 0

  function handleSave() {
    if (!valid) {
      setMessage({ type: "error", text: "كل القيم يجب أن تكون أرقاماً أكبر من صفر" })
      return
    }
    setMessage(null)
    startTransition(async () => {
      try {
        await updateAiRuntimeConfig({
          mode,
          light: { maxConcurrent: Math.floor(num(lightConc)), maxDailyCostUsd: num(lightCost) },
          expensive: { maxConcurrent: Math.floor(num(expConc)), maxDailyCostUsd: num(expCost) },
        })
        setMessage({ type: "ok", text: "تم الحفظ — يُطبَّق على موجّه الذكاء فوراً" })
        router.refresh()
      } catch {
        setMessage({ type: "error", text: "تعذّر الحفظ" })
      }
    })
  }

  function handleReset() {
    setMessage(null)
    startTransition(async () => {
      try {
        await updateAiRuntimeConfig({ mode: null, light: null, expensive: null })
        setMode(initial.envMode)
        setLightConc(String(initial.envLimits.light.maxConcurrent))
        setLightCost(String(initial.envLimits.light.maxDailyCostUsd))
        setExpConc(String(initial.envLimits.expensive.maxConcurrent))
        setExpCost(String(initial.envLimits.expensive.maxDailyCostUsd))
        setMessage({ type: "ok", text: "تمت العودة إلى إعدادات البيئة" })
        router.refresh()
      } catch {
        setMessage({ type: "error", text: "تعذّرت العودة للإعدادات الافتراضية" })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Mode */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
            <Gauge className="h-5 w-5" />
            وضع حدّ المعدل
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[12px] text-muted-foreground">
            يتحكم في كيفية تعامل موجّه الذكاء الاصطناعي مع تجاوز الحدود. يظهر أثره مباشرة في{" "}
            <span className="font-medium text-foreground">مركز التشغيل</span>.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={cn(
                  "rounded-xl border p-3 text-start transition-colors",
                  mode === m.value
                    ? "border-primary bg-primary/5"
                    : "border-border/60 hover:border-border",
                )}
              >
                <div className="text-[13px] font-semibold">{m.label}</div>
                <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {m.description}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Tier caps */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
            <Cpu className="h-5 w-5" />
            حدود الميزانية والتزامن
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <TierFields
            title="المستوى الخفيف"
            hint="مهام بنماذج رخيصة (هيكلة، تحقّق، تحليل)"
            conc={lightConc}
            setConc={setLightConc}
            cost={lightCost}
            setCost={setLightCost}
            envConc={initial.envLimits.light.maxConcurrent}
            envCost={initial.envLimits.light.maxDailyCostUsd}
          />
          <div className="border-t border-border/40" />
          <TierFields
            title="المستوى المكلف"
            hint="مهام بنماذج متقدّمة (تحرير، اكتشاف، بحث)"
            conc={expConc}
            setConc={setExpConc}
            cost={expCost}
            setCost={setExpCost}
            envConc={initial.envLimits.expensive.maxConcurrent}
            envCost={initial.envLimits.expensive.maxDailyCostUsd}
          />

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button size="sm" disabled={isPending} onClick={handleSave}>
              {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              حفظ وتطبيق
            </Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={handleReset}>
              <RotateCcw className="me-2 h-3.5 w-3.5" />
              العودة لإعدادات البيئة
            </Button>
            {message && (
              <span className={message.type === "ok" ? "text-sm text-green-700" : "text-sm text-destructive"}>
                {message.text}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function TierFields({
  title,
  hint,
  conc,
  setConc,
  cost,
  setCost,
  envConc,
  envCost,
}: {
  title: string
  hint: string
  conc: string
  setConc: (v: string) => void
  cost: string
  setCost: (v: string) => void
  envConc: number
  envCost: number
}) {
  return (
    <div>
      <div className="mb-2">
        <div className="text-[13px] font-medium">{title}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-[12px]">أقصى تزامن</Label>
          <Input
            type="number"
            min={1}
            value={conc}
            onChange={(e) => setConc(e.target.value)}
            dir="ltr"
          />
          <p className="text-[10.5px] text-muted-foreground">الافتراضي من البيئة: {envConc}</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-[12px]">سقف الكلفة اليومية (دولار)</Label>
          <Input
            type="number"
            min={0}
            step="0.5"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            dir="ltr"
          />
          <p className="text-[10.5px] text-muted-foreground">الافتراضي من البيئة: ${envCost}</p>
        </div>
      </div>
    </div>
  )
}
