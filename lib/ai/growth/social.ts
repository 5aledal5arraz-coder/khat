/**
 * Growth — social bundle: per-platform copy-ready captions + short-form ideas.
 * Copywriting quality matters, so this runs on the editorial model.
 */

import { runAiTask } from "@/lib/ai-router"
import type { SocialPost, ShortFormIdea } from "./types"
import { buildGrowthContextBlock, growthInputSnapshot, type GrowthGenInput } from "./shared"

export interface SocialBundle {
  social_posts: SocialPost[]
  short_form_ideas: ShortFormIdea[]
}

interface SocialRaw {
  social_posts?: Array<Partial<SocialPost>>
  short_form_ideas?: Array<Partial<ShortFormIdea>>
}

export async function generateSocialBundle(
  input: GrowthGenInput,
): Promise<{ success: boolean; data?: SocialBundle; raw?: Record<string, unknown>; error?: string; runId?: string }> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
    }

    const contextBlock = buildGrowthContextBlock(input)

    const systemPrompt = `أنت كاتب محتوى منصات اجتماعية لبودكاست عربي عميق. مهمتك: منشورات جاهزة للنسخ لكل منصة + أفكار محتوى قصير.

استند إلى أقوى اللحظات والأفكار الجوهرية واللحظات المثيرة للجدل وبذور المقاطع في الفهم المرفق.

## المطلوب:

### 1. منشورات المنصات (social_posts)
منشور لكل منصة من: "x" (تويتر/إكس)، "instagram"، "linkedin"، "youtube_community"، "tiktok".
- platform: المعرّف بالإنجليزية كما أعلاه
- caption: النص الكامل الجاهز للنسخ — بأسلوب المنصة (X: حاد ومختصر بخيط أو تغريدة؛ LinkedIn: مهني بزاوية فكرة؛ Instagram: عاطفي مع إيموجي؛ tiktok: خطافي شبابي؛ youtube_community: تشويقي للحلقة)
- hashtags: 3-6 هاشتاقات مناسبة للمنصة (بدون #)

### 2. أفكار المحتوى القصير (short_form_ideas)
3-5 أفكار Reels/Shorts مستقلة عن المقاطع الطويلة:
- title: عنوان الفكرة
- angle: الزاوية/الخطاف الذي يجعلها تعمل وحدها
- source_moment: اللحظة في الحلقة التي تستند إليها
- platforms: المنصات المستهدفة (مثل ["tiktok","instagram"])

## قواعد:
- عربية فصحى معاصرة حية، طبيعية لكل منصة
- لا تكرر نفس الصياغة عبر المنصات — لكل منصة صوتها
- JSON فقط بالشكل:
{
  "social_posts":[{"platform":"x","caption":"...","hashtags":["...","..."]}],
  "short_form_ideas":[{"title":"...","angle":"...","source_moment":"...","platforms":["tiktok"]}]
}`

    const userPrompt = `${contextBlock}

أنشئ حزمة المنصات الاجتماعية وأفكار المحتوى القصير.`

    const result = await runAiTask<SocialRaw>({
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
      providerOptions: { temperature: 0.7 },
    })

    if (result.status !== "succeeded") {
      return { success: false, error: result.errorMessage || "فشل توليد محتوى المنصات", runId: result.runId }
    }

    const parsed = result.parsed ?? {}

    const social_posts: SocialPost[] = Array.isArray(parsed.social_posts)
      ? parsed.social_posts
          .filter((p): p is Partial<SocialPost> => Boolean(p && p.platform && p.caption))
          .map((p) => ({
            platform: p.platform || "",
            caption: p.caption || "",
            hashtags: Array.isArray(p.hashtags)
              ? p.hashtags.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
              : [],
          }))
      : []

    const short_form_ideas: ShortFormIdea[] = Array.isArray(parsed.short_form_ideas)
      ? parsed.short_form_ideas
          .filter((s): s is Partial<ShortFormIdea> => Boolean(s && s.title))
          .map((s) => ({
            title: s.title || "",
            angle: s.angle || "",
            source_moment: s.source_moment || "",
            platforms: Array.isArray(s.platforms)
              ? s.platforms.filter((p): p is string => typeof p === "string" && p.trim().length > 0)
              : [],
          }))
      : []

    return {
      success: true,
      data: { social_posts, short_form_ideas },
      raw: { model: result.modelName, run_id: result.runId },
      runId: result.runId,
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "فشل توليد محتوى المنصات" }
  }
}
