/**
 * Growth — packaging assets (CTR layer): thumbnail concepts + opening hook.
 *
 * These are the highest-leverage growth assets (they decide the click), so
 * they run on the editorial model.
 */

import { runAiTask } from "@/lib/ai-router"
import type { ThumbnailConcept } from "./types"
import { buildGrowthContextBlock, growthInputSnapshot, type GrowthGenInput } from "./shared"

export interface PackagingAssets {
  thumbnail_concepts: ThumbnailConcept[]
  opening_hook: {
    hook_script: string
    rationale: string
    alt_hooks: string[]
  } | null
}

interface PackagingRaw {
  thumbnail_concepts?: Array<Partial<ThumbnailConcept>>
  opening_hook?: {
    hook_script?: string
    rationale?: string
    alt_hooks?: string[]
  }
}

export async function generatePackagingAssets(
  input: GrowthGenInput,
): Promise<{ success: boolean; data?: PackagingAssets; raw?: Record<string, unknown>; error?: string; runId?: string }> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
    }

    const contextBlock = buildGrowthContextBlock(input)

    const systemPrompt = `أنت مدير تغليف (Packaging) محترف لقناة يوتيوب عربية ناجحة — مهمتك أن تجعل المشاهد يضغط ثم يبقى.

اعتمد على "فهم الحلقة الشامل" المرفق — لا تعيد قراءة الحلقة، بل استثمر الفهم الجاهز.

## المطلوب:

### 1. ثلاثة مفاهيم للصورة المصغّرة (thumbnail_concepts)
كل مفهوم بصري متكامل — ليس مجرد نص:
- concept: اسم المفهوم بكلمة أو كلمتين (مثل: "المواجهة"، "اللحظة الصادمة")
- mood: الشعور/الانفعال الذي تبثّه الصورة
- color_palette: اتجاه الألوان (مثل: "أحمر ناري + أسود عالي التباين")
- composition: التكوين والتأطير (أين الوجه، التعبير، العناصر)
- focal_text: النص الكبير على الصورة (3-5 كلمات، صادم/فضولي)
- image_prompt: وصف جاهز بالإنجليزية لأداة توليد صور (مفصّل: الإضاءة، التعبير، الخلفية، الأسلوب)

نوّع المفاهيم الثلاثة: واحد عاطفي، واحد فضولي/سؤال، واحد جريء/جدلي.

### 2. خطاف الافتتاح (opening_hook)
أول 15-30 ثانية تقرر بقاء المشاهد:
- hook_script: نص الافتتاح المقترح كما يُقال (جملتان إلى ثلاث) — يبدأ بأقوى لحظة/سؤال/تصريح في الحلقة، لا بالترحيب
- rationale: لماذا يعمل هذا الخطاف (سطر واحد)
- alt_hooks: خطافان بديلان قصيران (جملة لكل منهما)

## قواعد:
- عربية فصحى معاصرة حية — عدا image_prompt فبالإنجليزية
- استند إلى اللحظات القوية واللحظات المثيرة للجدل في الفهم المرفق
- JSON فقط بالشكل:
{
  "thumbnail_concepts": [
    {"concept":"...","mood":"...","color_palette":"...","composition":"...","focal_text":"...","image_prompt":"..."}
  ],
  "opening_hook": {"hook_script":"...","rationale":"...","alt_hooks":["...","..."]}
}`

    const userPrompt = `${contextBlock}

أنشئ مفاهيم الصورة المصغّرة وخطاف الافتتاح.`

    const result = await runAiTask<PackagingRaw>({
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
      return { success: false, error: result.errorMessage || "فشل توليد التغليف", runId: result.runId }
    }

    const parsed = result.parsed ?? {}
    const concepts: ThumbnailConcept[] = Array.isArray(parsed.thumbnail_concepts)
      ? parsed.thumbnail_concepts
          .filter((c): c is Partial<ThumbnailConcept> => Boolean(c && (c.concept || c.focal_text)))
          .map((c) => ({
            concept: c.concept || "",
            mood: c.mood || "",
            color_palette: c.color_palette || "",
            composition: c.composition || "",
            focal_text: c.focal_text || "",
            image_prompt: c.image_prompt || "",
          }))
      : []

    const hookRaw = parsed.opening_hook
    const opening_hook = hookRaw?.hook_script
      ? {
          hook_script: hookRaw.hook_script,
          rationale: hookRaw.rationale || "",
          alt_hooks: Array.isArray(hookRaw.alt_hooks)
            ? hookRaw.alt_hooks.filter((h): h is string => typeof h === "string" && h.trim().length > 0)
            : [],
        }
      : null

    return {
      success: true,
      data: { thumbnail_concepts: concepts, opening_hook },
      raw: { model: result.modelName, run_id: result.runId },
      runId: result.runId,
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "فشل توليد التغليف" }
  }
}
