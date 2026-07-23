/**
 * Growth — distribution & timing layer: ad/sponsor placements and
 * audience-retention recommendations. Structured reasoning over the
 * intelligence + chapter map, so it runs on the cheaper analysis model.
 *
 * `best_publish_time` was intentionally dropped in Wave 2 (W2-4): the model was
 * asked to invent a day/time from inputs that carry ZERO audience analytics
 * (see growth/shared.ts), which is a fabrication, not a recommendation. It will
 * return only when real YouTube Studio audience data feeds it.
 */

import { env } from "@/lib/env"
import { runAiTask } from "@/lib/ai-router"
import type { AdPlacement, RetentionRec } from "./types"
import { buildGrowthContextBlock, growthInputSnapshot, type GrowthGenInput } from "./shared"

export interface DistributionPlan {
  sponsor_placements: AdPlacement[]
  retention_recommendations: RetentionRec[]
}

interface DistributionRaw {
  sponsor_placements?: Array<Partial<AdPlacement>>
  retention_recommendations?: Array<Partial<RetentionRec>>
}

const AD_TYPES: AdPlacement["type"][] = ["pre_roll", "mid_roll", "post_roll"]

export async function generateDistributionPlan(
  input: GrowthGenInput,
): Promise<{ success: boolean; data?: DistributionPlan; raw?: Record<string, unknown>; error?: string; runId?: string }> {
  try {
    if (!env.OPENAI_API_KEY) {
      return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
    }

    const contextBlock = buildGrowthContextBlock(input)

    const systemPrompt = `أنت مسؤول توزيع ونمو لقناة بودكاست عربية. مهمتك: خطة توقيت الإعلانات وتوصيات الاحتفاظ بالمشاهدين.

استند إلى "نوافذ آمنة للإعلان" و"نقاط خطر فقدان الانتباه" وخريطة الفصول في الفهم المرفق.

## المطلوب:

### 1. مواضع الإعلانات/الرعاية (sponsor_placements)
2-4 مواضع:
- type: "pre_roll" (افتتاحي) أو "mid_roll" (منتصف) أو "post_roll" (ختامي)
- position_label: وصف الموضع بحدود الموضوع (مثل: "بعد إنهاء الحديث عن X وقبل الانتقال إلى Y")
- approx_timestamp: توقيت تقريبي HH:MM:SS مستنبط من الفصول إن أمكن، وإلا null
- why: لماذا هذا فاصل طبيعي لا يقطع لحظة مهمة
ضع mid_roll في نافذة آمنة فعلية — لا في منتصف ذروة عاطفية.

### 2. توصيات الاحتفاظ (retention_recommendations)
لكل نقطة خطر في الفهم المرفق (وأضف ما تراه):
- risk_point: موضع الخطر
- recommendation: إجراء تحريري/تغليفي ملموس (قص، إضافة نص، نقل مقطع، تشويق)

## قواعد:
- عربية فصحى معاصرة
- لا تقترح "أفضل وقت للنشر" — لا نملك بيانات جمهور فعلية تدعم هذا الاقتراح
- JSON فقط بالشكل:
{
  "sponsor_placements":[{"type":"mid_roll","position_label":"...","approx_timestamp":"00:32:00","why":"..."}],
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

    const retention_recommendations: RetentionRec[] = Array.isArray(parsed.retention_recommendations)
      ? parsed.retention_recommendations
          .filter((r): r is Partial<RetentionRec> => Boolean(r && r.recommendation))
          .map((r) => ({ risk_point: r.risk_point || "", recommendation: r.recommendation || "" }))
      : []

    return {
      success: true,
      data: { sponsor_placements, retention_recommendations },
      raw: { model: result.modelName, run_id: result.runId },
      runId: result.runId,
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "فشل توليد خطة التوزيع" }
  }
}
