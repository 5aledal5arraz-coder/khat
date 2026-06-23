/**
 * Growth — distribution & timing layer: ad/sponsor placements, best publish
 * time, and audience-retention recommendations. Structured reasoning over the
 * intelligence + chapter map, so it runs on the cheaper analysis model.
 */

import { runAiTask } from "@/lib/ai-router"
import type { AdPlacement, PublishTiming, RetentionRec } from "./types"
import { buildGrowthContextBlock, growthInputSnapshot, type GrowthGenInput } from "./shared"

export interface DistributionPlan {
  sponsor_placements: AdPlacement[]
  best_publish_time: PublishTiming | null
  retention_recommendations: RetentionRec[]
}

interface DistributionRaw {
  sponsor_placements?: Array<Partial<AdPlacement>>
  best_publish_time?: Partial<PublishTiming>
  retention_recommendations?: Array<Partial<RetentionRec>>
}

const AD_TYPES: AdPlacement["type"][] = ["pre_roll", "mid_roll", "post_roll"]

export async function generateDistributionPlan(
  input: GrowthGenInput,
): Promise<{ success: boolean; data?: DistributionPlan; raw?: Record<string, unknown>; error?: string; runId?: string }> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
    }

    const contextBlock = buildGrowthContextBlock(input)

    const systemPrompt = `أنت مسؤول توزيع ونمو لقناة بودكاست عربية. مهمتك: خطة توقيت الإعلانات، أفضل وقت للنشر، وتوصيات الاحتفاظ بالمشاهدين.

استند إلى "نوافذ آمنة للإعلان" و"نقاط خطر فقدان الانتباه" وخريطة الفصول في الفهم المرفق.

## المطلوب:

### 1. مواضع الإعلانات/الرعاية (sponsor_placements)
2-4 مواضع:
- type: "pre_roll" (افتتاحي) أو "mid_roll" (منتصف) أو "post_roll" (ختامي)
- position_label: وصف الموضع بحدود الموضوع (مثل: "بعد إنهاء الحديث عن X وقبل الانتقال إلى Y")
- approx_timestamp: توقيت تقريبي HH:MM:SS مستنبط من الفصول إن أمكن، وإلا null
- why: لماذا هذا فاصل طبيعي لا يقطع لحظة مهمة
ضع mid_roll في نافذة آمنة فعلية — لا في منتصف ذروة عاطفية.

### 2. أفضل وقت للنشر (best_publish_time)
- day: اليوم المقترح (مثل: "الثلاثاء")
- time_window: نافذة الوقت (مثل: "8-10 مساءً")
- timezone: "توقيت الخليج (GMT+3)" افتراضياً
- rationale: لماذا هذا التوقيت يناسب جمهور المحتوى العربي العميق
- alternatives: بديلان

### 3. توصيات الاحتفاظ (retention_recommendations)
لكل نقطة خطر في الفهم المرفق (وأضف ما تراه):
- risk_point: موضع الخطر
- recommendation: إجراء تحريري/تغليفي ملموس (قص، إضافة نص، نقل مقطع، تشويق)

## قواعد:
- عربية فصحى معاصرة
- JSON فقط بالشكل:
{
  "sponsor_placements":[{"type":"mid_roll","position_label":"...","approx_timestamp":"00:32:00","why":"..."}],
  "best_publish_time":{"day":"...","time_window":"...","timezone":"...","rationale":"...","alternatives":["...","..."]},
  "retention_recommendations":[{"risk_point":"...","recommendation":"..."}]
}`

    const userPrompt = `${contextBlock}

أنشئ خطة التوزيع والتوقيت وتوصيات الاحتفاظ.`

    const result = await runAiTask<DistributionRaw>({
      taskKind: "analysis",
      eirId: input.eirContext?.eirId ?? null,
      subjectTable: input.eirContext?.subjectTable ?? "studio_analysis_records",
      subjectId: input.eirContext?.subjectId ?? null,
      input: growthInputSnapshot(input),
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.4 },
    })

    if (result.status !== "succeeded") {
      return { success: false, error: result.errorMessage || "فشل توليد خطة التوزيع", runId: result.runId }
    }

    const parsed = result.parsed ?? {}

    const sponsor_placements: AdPlacement[] = Array.isArray(parsed.sponsor_placements)
      ? parsed.sponsor_placements
          .filter((p): p is Partial<AdPlacement> => Boolean(p && p.position_label))
          .map((p) => ({
            type: AD_TYPES.includes(p.type as AdPlacement["type"]) ? (p.type as AdPlacement["type"]) : "mid_roll",
            position_label: p.position_label || "",
            approx_timestamp: typeof p.approx_timestamp === "string" && p.approx_timestamp.trim() ? p.approx_timestamp : null,
            why: p.why || "",
          }))
      : []

    const bt = parsed.best_publish_time
    const best_publish_time: PublishTiming | null = bt?.day || bt?.time_window
      ? {
          day: bt.day || "",
          time_window: bt.time_window || "",
          timezone: bt.timezone || "توقيت الخليج (GMT+3)",
          rationale: bt.rationale || "",
          alternatives: Array.isArray(bt.alternatives)
            ? bt.alternatives.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
            : [],
        }
      : null

    const retention_recommendations: RetentionRec[] = Array.isArray(parsed.retention_recommendations)
      ? parsed.retention_recommendations
          .filter((r): r is Partial<RetentionRec> => Boolean(r && r.recommendation))
          .map((r) => ({ risk_point: r.risk_point || "", recommendation: r.recommendation || "" }))
      : []

    return {
      success: true,
      data: { sponsor_placements, best_publish_time, retention_recommendations },
      raw: { model: result.modelName, run_id: result.runId },
      runId: result.runId,
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "فشل توليد خطة التوزيع" }
  }
}
