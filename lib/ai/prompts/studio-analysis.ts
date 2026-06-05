/**
 * Khat Brain — Studio YouTube performance-analysis prompt builder.
 *
 * Extracted from `lib/ai/analysis.ts::generateStudioAnalysis` in Phase
 * 2.0 Batch 1. Byte-equivalent to the previous inline prompt; the call
 * site now uses this builder + VERSION constant so
 * `ai_runs.prompt_version` becomes meaningful for this feature.
 *
 * Do NOT edit the prompt body without bumping VERSION. The snapshot
 * test in `tests/prompts/snapshots.test.ts` enforces this contract.
 */

export const STUDIO_ANALYSIS_PROMPT_VERSION = "studio-analysis-v1.0"

export interface StudioAnalysisStatsInput {
  title: string
  description: string
  publishDate: string
  duration: string
  viewCount: string
  likeCount: string
  commentCount: string
}

export interface StudioAnalysisPromptInput {
  preparedTranscript: string
  stats: StudioAnalysisStatsInput
}

export interface BuiltStudioAnalysisPrompt {
  system: string
  user: string
  version: string
  input: Record<string, unknown>
}

const SYSTEM_PROMPT = `أنت محلل أداء محتوى يوتيوب متخصص في البودكاست العربي.

ستتلقى نص حلقة بودكاست مع إحصائيات الأداء الفعلية من يوتيوب.
مهمتك: تحليل الأداء وتقديم تقرير شامل من 4 أقسام.

## قواعد صارمة:
- جميع المخرجات باللغة العربية
- لا تستخدم Markdown — فقط نص عادي
- الإجابة JSON فقط بالمخطط المحدد
- استخدم البيانات المقدمة كمصدر وحيد — لا تختلق أرقاماً
- كن صريحاً وبنّاءً في التشخيص

## المطلوب:

### 1. تشخيص الأداء (diagnosis)
- **classification**: تصنيف واحد من: "ممتاز" | "جيد" | "متوسط" | "ضعيف" | "بحاجة لإنعاش"
- **reasoning**: تحليل مفصل (3-5 جمل) يشرح لماذا هذا التصنيف، بناءً على نسبة المشاهدات/الإعجابات/التعليقات
- **key_metrics_summary**: ملخص مختصر للأرقام الرئيسية والنسب المهمة

### 2. اقتراحات التحسين (improvements)
- **alt_titles**: 5 عناوين بديلة أفضل من العنوان الحالي (كل عنوان أقل من 70 حرف)
- **optimized_description**: وصف محسّن كامل (3-5 فقرات) مع خطاف قوي في البداية
- **chapters**: فصول زمنية مقترحة بتنسيق (00:00 - العنوان) — قدّر الأوقات من النص
- **pinned_comment**: تعليق مثبت مقترح يحفز التفاعل والنقاش
- **thumbnail_concepts**: 3-5 أفكار للصورة المصغرة (نص قصير 3-5 كلمات لكل فكرة)

### 3. خطة إنعاش (revival)
- قائمة خطوات مرتبة (5-8 خطوات) لإعادة إحياء الحلقة وزيادة المشاهدات
- كل خطوة: order (الترتيب)، action (الإجراء بكلمتين)، detail (التفاصيل بجملة أو جملتين)

### 4. مقاطع قصيرة (clips)
- 5-10 مقاطع قصيرة مقترحة من الحلقة
- كل مقطع: start_time (HH:MM:SS)، end_time (HH:MM:SS)، platform، hook_text، caption، why_it_works
- المنصات: "YouTube Shorts" أو "IG Reels" أو "TikTok" أو "X"

## مخطط JSON المطلوب:
{
  "diagnosis": {
    "classification": "التصنيف",
    "reasoning": "التحليل المفصل...",
    "key_metrics_summary": "ملخص الأرقام..."
  },
  "improvements": {
    "alt_titles": ["عنوان 1", "عنوان 2", ...],
    "optimized_description": "الوصف المحسّن...",
    "chapters": "00:00 - المقدمة\\n03:00 - ...",
    "pinned_comment": "التعليق المثبت...",
    "thumbnail_concepts": ["فكرة 1", "فكرة 2", ...]
  },
  "revival": {
    "steps": [
      { "order": 1, "action": "إعادة العنوان", "detail": "التفاصيل..." }
    ]
  },
  "clips": [
    {
      "start_time": "00:05:00",
      "end_time": "00:06:15",
      "platform": "YouTube Shorts",
      "hook_text": "...",
      "caption": "...",
      "why_it_works": "..."
    }
  ]
}`

export function buildStudioAnalysisPrompt(
  input: StudioAnalysisPromptInput,
): BuiltStudioAnalysisPrompt {
  const user = `## إحصائيات الفيديو:
- العنوان الحالي: ${input.stats.title}
- تاريخ النشر: ${input.stats.publishDate}
- المدة: ${input.stats.duration}
- المشاهدات: ${input.stats.viewCount}
- الإعجابات: ${input.stats.likeCount}
- التعليقات: ${input.stats.commentCount}

## الوصف الحالي:
${input.stats.description || "(لا يوجد وصف)"}

## نص الحلقة:
${input.preparedTranscript}`

  return {
    system: SYSTEM_PROMPT,
    user,
    version: STUDIO_ANALYSIS_PROMPT_VERSION,
    input: {
      title: input.stats.title,
      publishDate: input.stats.publishDate,
      duration: input.stats.duration,
      viewCount: input.stats.viewCount,
      likeCount: input.stats.likeCount,
      commentCount: input.stats.commentCount,
      transcriptChars: input.preparedTranscript.length,
      hasDescription: input.stats.description.length > 0,
    },
  }
}
