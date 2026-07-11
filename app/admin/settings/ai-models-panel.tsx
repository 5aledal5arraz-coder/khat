"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Boxes, FlaskConical, Loader2, RefreshCw, Sparkles, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"
import { updateAiModelOverride, refreshAiModelsCatalog, startModelBenchmark } from "./actions"
import type {
  AiModelsDiagnostics,
  AiModelsTaskDiagnostics,
} from "@/lib/ai-router/model-selection"
import type { AiTaskKind } from "@/lib/ai-router/types"
import type { BenchmarkListItem } from "@/lib/ai-router/benchmark/store"
import {
  DEFAULT_THRESHOLDS,
  type BenchmarkSummary,
  type BenchmarkThresholds,
  type DimensionScore,
} from "@/lib/ai-router/benchmark/scoring"
import type { BenchmarkTier } from "@/lib/db/schema/model-benchmarks"

const TASK_LABELS: Record<string, string> = {
  structural: "هيكلة (فصول، مقاطع، طوابع زمنية)",
  editorial: "تحرير (نصوص منشورة)",
  discovery: "اكتشاف الضيوف",
  verification: "تحقّق",
  research: "بحث",
  analysis: "تحليل",
}

const SOURCE_BADGES: Record<string, { label: string; className: string }> = {
  default: { label: "افتراضي", className: "bg-muted text-muted-foreground" },
  config: { label: "مخصّص (إعدادات)", className: "bg-primary/10 text-primary" },
  env: { label: "بيئة التشغيل", className: "bg-indigo-100 text-indigo-700" },
  fallback: { label: "بديل تلقائي", className: "bg-amber-100 text-amber-700" },
}

const EFFORTS = ["none", "low", "medium", "high", "xhigh"] as const

export function AiModelsPanel({
  initial,
  benchmarks,
  thresholds,
}: {
  initial: AiModelsDiagnostics
  benchmarks: BenchmarkListItem[]
  thresholds: BenchmarkThresholds
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)

  // Override editor state
  const [taskKind, setTaskKind] = useState<AiTaskKind>("editorial")
  const selectedTask = initial.tasks.find((t) => t.taskKind === taskKind)
  const [model, setModel] = useState("")
  const [effort, setEffort] = useState("")
  const [costIn, setCostIn] = useState("")
  const [costOut, setCostOut] = useState("")

  function loadTask(kind: AiTaskKind) {
    setTaskKind(kind)
    const t = initial.tasks.find((x) => x.taskKind === kind)
    setModel(t?.override?.model ?? "")
    setEffort(t?.override?.reasoningEffort ?? "")
    setCostIn(t?.override?.inputCostPer1M != null ? String(t.override.inputCostPer1M) : "")
    setCostOut(t?.override?.outputCostPer1M != null ? String(t.override.outputCostPer1M) : "")
    setMessage(null)
  }

  function handleRefresh() {
    setMessage(null)
    startTransition(async () => {
      try {
        await refreshAiModelsCatalog()
        setMessage({ type: "ok", text: "تم تحديث كتالوج النماذج من OpenAI" })
        router.refresh()
      } catch {
        setMessage({ type: "error", text: "تعذّر تحديث الكتالوج" })
      }
    })
  }

  function handleSave(clear: boolean) {
    setMessage(null)
    startTransition(async () => {
      try {
        await updateAiModelOverride(
          taskKind,
          clear
            ? null
            : {
                model: model.trim() || null,
                reasoningEffort: (effort || null) as never,
                inputCostPer1M: costIn ? Number(costIn) : null,
                outputCostPer1M: costOut ? Number(costOut) : null,
              },
        )
        setMessage({
          type: "ok",
          text: clear ? "أُزيل التخصيص — عاد الافتراضي" : "حُفظ التخصيص — يُطبَّق على النداءات فوراً",
        })
        if (clear) {
          setModel("")
          setEffort("")
          setCostIn("")
          setCostOut("")
        }
        router.refresh()
      } catch {
        setMessage({ type: "error", text: "تعذّر الحفظ" })
      }
    })
  }

  const cat = initial.catalog
  const refreshedLabel = cat.refreshedAt
    ? cat.refreshedAt.replace("T", " ").slice(0, 16) + "Z"
    : "لم يُحمَّل بعد"

  return (
    <div className="space-y-6">
      {/* Catalog status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
            <Boxes className="h-5 w-5" />
            كتالوج نماذج OpenAI (اكتشاف تلقائي)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px]">
            <span>
              آخر تحديث: <span dir="ltr" className="font-mono">{refreshedLabel}</span>
              {cat.stale && <span className="ms-2 text-amber-700">(قديم — سيُحدَّث تلقائياً)</span>}
            </span>
            <span>
              نماذج نصية متاحة لهذا المفتاح:{" "}
              <span className="font-semibold">{cat.textModelCount ?? "غير معروف"}</span>
            </span>
            <Button size="sm" variant="outline" disabled={isPending} onClick={handleRefresh}>
              {isPending ? (
                <Loader2 className="me-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="me-2 h-3.5 w-3.5" />
              )}
              تحديث الآن
            </Button>
          </div>

          {cat.lastError && (
            <p className="text-[12px] text-destructive">
              آخر خطأ في الجلب: <span dir="ltr" className="font-mono">{cat.lastError}</span>
              {" — "}يُكمل النظام بآخر قائمة معروفة (fail-open).
            </p>
          )}

          {cat.newerFamily && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-800">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                رُصد جيل أحدث: <b dir="ltr">GPT-{cat.newerFamily}</b>. يمكن اعتماده الآن — بلا أي
                تعديل كود — عبر «تخصيص نموذج مهمة» أدناه (أضف تسعيرته لتبقى تقارير الكلفة دقيقة).
              </span>
            </div>
          )}

          {cat.families.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {cat.families.map((f) => (
                <span
                  key={f.family}
                  dir="ltr"
                  className="rounded-full bg-muted px-2.5 py-0.5 font-mono text-[10.5px] text-muted-foreground"
                  title={f.models.join(", ")}
                >
                  {f.label} ×{f.models.length}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-task selection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
            <Boxes className="h-5 w-5" />
            النموذج الفعّال لكل مهمة
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[12px] text-muted-foreground">
            الترتيب: تخصيص النداء ← متغير البيئة (KHAT_AI_MODEL_*) ← التخصيص هنا ← الافتراضي. إن
            كان المختار غير متاح للمفتاح، يُعتمد أول بديل متاح من السلسلة ويُسجَّل السبب.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border/60 text-start text-muted-foreground">
                  <th className="py-2 pe-3 text-start font-medium">المهمة</th>
                  <th className="py-2 pe-3 text-start font-medium">النموذج الفعّال</th>
                  <th className="py-2 pe-3 text-start font-medium">المصدر</th>
                  <th className="py-2 pe-3 text-start font-medium">جهد التفكير</th>
                  <th className="py-2 text-start font-medium">سلسلة البدائل</th>
                </tr>
              </thead>
              <tbody>
                {initial.tasks.map((t) => (
                  <TaskRow key={t.taskKind} t={t} onEdit={() => loadTask(t.taskKind)} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Override editor */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            تخصيص نموذج مهمة (بلا تعديل كود)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[12px]">المهمة</Label>
              <select
                value={taskKind}
                onChange={(e) => loadTask(e.target.value as AiTaskKind)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]"
              >
                {initial.tasks.map((t) => (
                  <option key={t.taskKind} value={t.taskKind}>
                    {TASK_LABELS[t.taskKind] ?? t.taskKind}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">النموذج (معرّف OpenAI الرسمي)</Label>
              <Input
                dir="ltr"
                list="ai-models-datalist"
                placeholder={selectedTask?.chain[0] ?? "gpt-…"}
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <datalist id="ai-models-datalist">
                {cat.textModels.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <p className="text-[10.5px] text-muted-foreground">
                اتركه فارغاً للإبقاء على النموذج الافتراضي وتغيير جهد التفكير فقط.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">جهد التفكير (reasoning)</Label>
              <select
                value={effort}
                onChange={(e) => setEffort(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-[13px]"
                dir="ltr"
              >
                <option value="">(افتراضي المهمة)</option>
                {EFFORTS.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[12px]">$ / 1M إدخال (اختياري)</Label>
                <Input dir="ltr" type="number" min={0} step="0.05" value={costIn} onChange={(e) => setCostIn(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[12px]">$ / 1M إخراج (اختياري)</Label>
                <Input dir="ltr" type="number" min={0} step="0.05" value={costOut} onChange={(e) => setCostOut(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button size="sm" disabled={isPending || (!model.trim() && !effort)} onClick={() => handleSave(false)}>
              {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              حفظ التخصيص
            </Button>
            <Button size="sm" variant="ghost" disabled={isPending} onClick={() => handleSave(true)}>
              مسح التخصيص (عودة للافتراضي)
            </Button>
            {message && (
              <span className={message.type === "ok" ? "text-sm text-green-700" : "text-sm text-destructive"}>
                {message.text}
              </span>
            )}
          </div>
          <p className="text-[10.5px] leading-relaxed text-muted-foreground">
            التخصيص يُخزَّن في قاعدة البيانات ويقرأه الموجّه مباشرة (خادم + عامل الخلفية). عند تخصيص
            نموذج لا يعرفه السجل الثابت، أدخل تسعيرته حتى تبقى كلفة كل تشغيل في ai_runs دقيقة.
          </p>
        </CardContent>
      </Card>

      <BenchmarksCard
        benchmarks={benchmarks}
        thresholds={thresholds}
        textModels={cat.textModels}
      />
    </div>
  )
}

// ─── Benchmarks (upgrade evidence) ───────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  discovery: "اكتشاف الضيوف وترتيبهم",
  editorial: "التحرير العربي",
  research: "التوليف البحثي",
  long_context: "استدلال طويل السياق",
  extraction: "استخراج المعلومات",
  consistency: "ثبات المخرجات",
  cost: "الكلفة (للحزمة)",
  latency: "زمن الاستجابة (وسيط)",
  token_efficiency: "توكنز الإخراج",
}

const TIER_LABELS: Record<string, string> = {
  flagship: "الفئة الرائدة (تحرير/اكتشاف)",
  balanced: "الفئة المتوازنة (بحث)",
  efficient: "الفئة الاقتصادية (هيكلة)",
}

function BenchmarksCard({
  benchmarks = [],
  thresholds = DEFAULT_THRESHOLDS,
  textModels,
}: {
  benchmarks: BenchmarkListItem[]
  thresholds: BenchmarkThresholds
  textModels: string[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [candidate, setCandidate] = useState("")
  const [tier, setTier] = useState<BenchmarkTier>("flagship")
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null)

  function handleRun() {
    setMessage(null)
    startTransition(async () => {
      try {
        await startModelBenchmark({ candidate: candidate.trim(), tier })
        setMessage({
          type: "ok",
          text: "أُدرج القياس في قائمة المهام — يتطلب تشغيل عامل الخلفية (npm run worker)",
        })
        setCandidate("")
        router.refresh()
      } catch {
        setMessage({ type: "error", text: "تعذّر بدء القياس" })
      }
    })
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
          <FlaskConical className="h-5 w-5" />
          قياس النماذج — أدلة الترقية (Benchmarks)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-[12px] text-muted-foreground">
          كل نموذج جديد يُقاس على أعباء عملنا الحقيقية قبل التوصية باعتماده: اكتشاف وترتيب ضيوف،
          تحرير عربي، توليف بحثي، استدلال طويل السياق، استخراج معلومات، ثبات، كلفة، وزمن استجابة.
          التحكيم أعمى (A/B بترتيبين متعاكسين). الترقية تُوصى فقط عند تجاوز العتبات أدناه.
        </p>

        {/* Run form */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-[12px]">النموذج المرشّح</Label>
            <Input
              dir="ltr"
              className="w-56"
              list="ai-benchmark-datalist"
              placeholder="gpt-…"
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
            />
            <datalist id="ai-benchmark-datalist">
              {textModels.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px]">الفئة</Label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as BenchmarkTier)}
              className="h-9 rounded-md border border-input bg-background px-3 text-[13px]"
            >
              {Object.entries(TIER_LABELS).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" disabled={isPending || !candidate.trim()} onClick={handleRun}>
            {isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            شغّل القياس
          </Button>
          {message && (
            <span className={message.type === "ok" ? "text-[12px] text-green-700" : "text-[12px] text-destructive"}>
              {message.text}
            </span>
          )}
        </div>

        <p dir="ltr" className="font-mono text-[10px] text-muted-foreground">
          thresholds: quality_net ≥ {thresholds.minQualityNet} · accuracy ≥ +{thresholds.minAccuracyGainPp}pp
          (floor {thresholds.minAccuracyDeltaPp}pp) · cost ≤ +{thresholds.maxCostIncreasePct}% (cost-led ≤ −
          {thresholds.minCostSavingPct}%) · latency ≤ +{thresholds.maxLatencyIncreasePct}% · consistency ≥{" "}
          {thresholds.minConsistencyDeltaPp}pp · auto={String(thresholds.autoBenchmark)}
        </p>

        {/* Scorecards */}
        {benchmarks.length === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            لا قياسات بعد. عند ظهور جيل أحدث في الكتالوج سيُقاس تلقائياً (كل ١٢ ساعة من عامل
            الخلفية)، أو شغّل قياساً يدوياً أعلاه.
          </p>
        ) : (
          <div className="space-y-4">
            {benchmarks.map((b) => (
              <Scorecard key={b.id} b={b} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Scorecard({ b }: { b: BenchmarkListItem }) {
  const summary = b.summary as BenchmarkSummary | null
  const dims = (b.scores as { dimensions?: DimensionScore[] } | null)?.dimensions ?? []
  const when = (b.completed_at ?? b.created_at).replace("T", " ").slice(0, 16) + "Z"

  const fmtVal = (d: DimensionScore, v: number | null) => {
    if (v === null) return "—"
    if (d.unit === "usd") return `$${v.toFixed(4)}`
    if (d.unit === "ms") return `${Math.round(v)}ms`
    if (d.unit === "tokens") return String(Math.round(v))
    return String(Math.round(v))
  }
  const fmtDelta = (n: number | null, suffix = "") =>
    n === null ? "؟" : `${n >= 0 ? "+" : ""}${n.toFixed(1)}${suffix}`

  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span dir="ltr" className="font-mono text-[12px] font-semibold">
          {b.candidate_model} <span className="text-muted-foreground">vs</span> {b.baseline_model}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10.5px]">{TIER_LABELS[b.tier] ?? b.tier}</span>
        {b.status === "running" && (
          <span className="flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10.5px] font-medium text-indigo-700">
            <Loader2 className="h-3 w-3 animate-spin" /> قيد القياس
          </span>
        )}
        {b.status === "failed" && (
          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10.5px] font-medium text-red-700">فشل</span>
        )}
        {b.status === "completed" && summary && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold",
              summary.recommendation === "upgrade"
                ? "bg-green-100 text-green-700"
                : "bg-muted text-muted-foreground",
            )}
          >
            {summary.recommendation === "upgrade" ? "⬆ يُوصى بالترقية" : "إبقاء النموذج الحالي"}
          </span>
        )}
        <span dir="ltr" className="ms-auto font-mono text-[10px] text-muted-foreground">
          {when}
        </span>
      </div>

      {b.error && (
        <p dir="ltr" className="mt-2 font-mono text-[10.5px] text-destructive">{b.error.slice(0, 200)}</p>
      )}

      {dims.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-muted-foreground">
                <th className="py-1 pe-3 text-start font-medium">البُعد</th>
                <th className="py-1 pe-3 text-start font-medium">الحالي</th>
                <th className="py-1 pe-3 text-start font-medium">المرشّح</th>
                <th className="py-1 text-start font-medium">الفرق</th>
              </tr>
            </thead>
            <tbody>
              {dims.map((d) => (
                <tr key={d.key} className="border-t border-border/30">
                  <td className="py-1 pe-3">
                    {DIMENSION_LABELS[d.key] ?? d.key}
                    {d.note && <span className="ms-1 text-[9.5px] text-amber-700">({d.note})</span>}
                  </td>
                  <td dir="ltr" className="py-1 pe-3 font-mono">{fmtVal(d, d.baseline)}</td>
                  <td dir="ltr" className="py-1 pe-3 font-mono">{fmtVal(d, d.candidate)}</td>
                  <td
                    dir="ltr"
                    className={cn(
                      "py-1 font-mono",
                      d.delta !== null && d.delta > 0 && d.kind !== "measured" && "text-green-700",
                      d.delta !== null && d.delta < 0 && d.kind !== "measured" && "text-red-700",
                    )}
                  >
                    {fmtDelta(d.delta, d.kind === "measured" ? "%" : "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {summary && summary.reasons.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
          {summary.reasons.map((r, i) => (
            <li key={i}>• {r}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function TaskRow({ t, onEdit }: { t: AiModelsTaskDiagnostics; onEdit: () => void }) {
  const badge = SOURCE_BADGES[t.effective.source] ?? SOURCE_BADGES.default
  return (
    <tr className="border-b border-border/30 align-top">
      <td className="py-2.5 pe-3">
        <button type="button" onClick={onEdit} className="text-start font-medium hover:text-primary">
          {TASK_LABELS[t.taskKind] ?? t.taskKind}
        </button>
        {t.envModel && (
          <div dir="ltr" className="mt-0.5 font-mono text-[10px] text-indigo-700">
            env: {t.envModel}
          </div>
        )}
      </td>
      <td className="py-2.5 pe-3">
        <span dir="ltr" className="font-mono text-[11.5px] font-semibold">
          {t.effective.modelName}
        </span>
        {!t.pricingKnown && (
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-amber-700">
            <TriangleAlert className="h-3 w-3" /> تسعيرة غير معروفة — الكلفة ستُسجَّل null
          </div>
        )}
        {t.effective.fallbackReason && (
          <div dir="ltr" className="mt-0.5 max-w-72 font-mono text-[10px] leading-snug text-amber-700">
            {t.effective.fallbackReason}
          </div>
        )}
      </td>
      <td className="py-2.5 pe-3">
        <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-medium", badge.className)}>
          {badge.label}
        </span>
      </td>
      <td className="py-2.5 pe-3">
        <span dir="ltr" className="font-mono text-[11px]">
          {t.effective.reasoningEffort ?? "—"}
        </span>
      </td>
      <td className="py-2.5">
        <span dir="ltr" className="font-mono text-[10.5px] text-muted-foreground">
          {t.chain.join(" → ")}
        </span>
      </td>
    </tr>
  )
}
