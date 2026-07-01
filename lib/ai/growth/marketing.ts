/**
 * Growth — marketing-strategy synthesis. Runs LAST: it reads the assets the
 * other generators produced (packaging, distribution, social) plus the shared
 * intelligence, and produces the operator's overall strategy + do-this-next
 * checklist. Editorial model (judgement + synthesis).
 */

import { env } from "@/lib/env"
import { runAiTask } from "@/lib/ai-router"
import type { GrowthPackage, MarketingStrategy } from "./types"
import { growthInputSnapshot, type GrowthGenInput } from "./shared"
import { formatIntelligenceContext } from "@/lib/ai/episode-intelligence"

interface MarketingRaw {
  summary?: string
  positioning?: string
  target_audience?: string
  priority_actions?: string[]
}

/** Compact summary of what the other generators produced, for the synthesis. */
function summarizeAssets(pkg: GrowthPackage): string {
  const lines: string[] = []
  if (pkg.thumbnail_concepts.length) {
    lines.push(`- مفاهيم الصورة المصغّرة: ${pkg.thumbnail_concepts.map((t) => t.concept).filter(Boolean).join("، ")}`)
  }
  if (pkg.opening_hook?.hook_script) {
    lines.push(`- خطاف الافتتاح: ${pkg.opening_hook.hook_script}`)
  }
  if (pkg.best_publish_time) {
    lines.push(`- أفضل وقت للنشر: ${pkg.best_publish_time.day} ${pkg.best_publish_time.time_window}`)
  }
  if (pkg.sponsor_placements.length) {
    lines.push(`- مواضع إعلانية مقترحة: ${pkg.sponsor_placements.length}`)
  }
  if (pkg.social_posts.length) {
    lines.push(`- منشورات منصات: ${pkg.social_posts.map((p) => p.platform).join("، ")}`)
  }
  if (pkg.short_form_ideas.length) {
    lines.push(`- أفكار محتوى قصير: ${pkg.short_form_ideas.length}`)
  }
  if (pkg.controversy_angles.length) {
    lines.push(`- زوايا جدلية: ${pkg.controversy_angles.join(" | ")}`)
  }
  return lines.length ? lines.join("\n") : "(لا أصول مولّدة بعد)"
}

export async function generateMarketingStrategy(
  input: GrowthGenInput,
  assembledSoFar: GrowthPackage,
): Promise<{ success: boolean; data?: MarketingStrategy; raw?: Record<string, unknown>; error?: string; runId?: string }> {
  try {
    if (!env.OPENAI_API_KEY) {
      return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
    }

    const systemPrompt = `أنت استراتيجي نمو لقناة بودكاست عربية. مهمتك: استراتيجية تسويق موحّدة لهذه الحلقة تربط كل الأصول المولّدة في خطة واحدة قابلة للتنفيذ.

## المطلوب (synthesis — لا تكرر تفاصيل الأصول، بل اربطها):
- summary: ملخص الاستراتيجية في 2-3 جمل — ما الزاوية الكبرى لإطلاق هذه الحلقة؟
- positioning: كيف نُموضِع الحلقة (الوعد الفريد للمشاهد، ما يميزها)
- target_audience: الجمهور المستهدف الأساسي لهذه الحلقة تحديداً
- priority_actions: قائمة مرتبة (5-7) بأهم الخطوات التنفيذية بالترتيب — "افعل هذا أولاً ثم هذا" (تغليف، نشر، مقاطع، منصات، تفاعل)

## قواعد:
- عربية فصحى معاصرة عملية
- الأولويات أوامر تنفيذية مباشرة قابلة للتنفيذ فوراً
- JSON فقط بالشكل:
{"summary":"...","positioning":"...","target_audience":"...","priority_actions":["...","..."]}`

    const userPrompt = `${formatIntelligenceContext(input.intelligence)}

## الأصول المولّدة لهذه الحلقة:
${summarizeAssets(assembledSoFar)}

اكتب الاستراتيجية التسويقية الموحّدة وقائمة الأولويات التنفيذية.`

    const result = await runAiTask<MarketingRaw>({
      taskKind: "editorial",
      eirId: input.eirContext?.eirId ?? null,
      subjectTable: input.eirContext?.subjectTable ?? "studio_analysis_records",
      subjectId: input.eirContext?.subjectId ?? null,
      input: growthInputSnapshot(input),
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.6 },
    })

    if (result.status !== "succeeded") {
      return { success: false, error: result.errorMessage || "فشل توليد الاستراتيجية", runId: result.runId }
    }

    const parsed = result.parsed ?? {}
    if (!parsed.summary && !Array.isArray(parsed.priority_actions)) {
      return { success: false, error: "استجابة غير مكتملة", runId: result.runId }
    }

    const data: MarketingStrategy = {
      summary: parsed.summary || "",
      positioning: parsed.positioning || "",
      target_audience: parsed.target_audience || "",
      priority_actions: Array.isArray(parsed.priority_actions)
        ? parsed.priority_actions.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
        : [],
    }

    return {
      success: true,
      data,
      raw: { model: result.modelName, run_id: result.runId },
      runId: result.runId,
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "فشل توليد الاستراتيجية" }
  }
}
