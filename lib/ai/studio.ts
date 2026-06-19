import type { StudioChapterItem, StudioClipItem } from "@/types/database"
import { getClient, prepareTranscript, prepareTranscriptWithPositions, formatSecondsToTimestamp, parseTimestampToSeconds } from "./client"
import { runAiTask } from "@/lib/ai-router"
import { buildStudioPackagePrompt } from "@/lib/ai/prompts/studio-package"
import type { GlobalEpisodeIntelligence } from "./episode-intelligence"
import { formatIntelligenceContext } from "./episode-intelligence"

// ---------------------------------------------------------------------------
// Studio: Generate YouTube Package from transcript
// ---------------------------------------------------------------------------

export interface StudioPackageResult {
  title_best: string
  title_alternatives: string[]
  thumbnail_text_options: string[]
  youtube_description: string
  seo_keywords: string[]
  hashtags: string[]
}

/**
 * Generate a full YouTube content package from a podcast transcript.
 * Returns structured outputs optimized for YouTube CTR + retention.
 */
export async function generateStudioPackage(
  transcript: string,
  videoTitle: string,
  channelTitle: string,
  episodeIntelligence?: GlobalEpisodeIntelligence | null,
  eirContext?: { eirId?: string | null; subjectTable?: string | null; subjectId?: string | null }
): Promise<{ success: boolean; data?: StudioPackageResult; raw?: Record<string, unknown>; error?: string; runId?: string }> {
  let openaiForPrep: ReturnType<typeof getClient>
  try {
    openaiForPrep = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    // Step 1: Prepare transcript (summarize if too long)
    const preparedText = await prepareTranscript(openaiForPrep, transcript)

    // Step 2: Generate the full package — uses EDITORIAL_MODEL for quality titles/descriptions
    const intelligenceBlock = episodeIntelligence ? `\n\n${formatIntelligenceContext(episodeIntelligence)}` : ""

    const { system: systemPrompt, user: userPrompt, version } =
      buildStudioPackagePrompt({
        videoTitle,
        channelTitle,
        intelligenceBlock,
        preparedText,
      })

    const result = await runAiTask<StudioPackageResult>({
      taskKind: "editorial",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_ai_outputs",
      subjectId: eirContext?.subjectId ?? null,
      promptVersion: version,
      input: {
        videoTitle,
        channelTitle,
        hasIntelligence: Boolean(episodeIntelligence),
        transcriptChars: preparedText.length,
      },
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.5 },
    })

    if (result.status !== "succeeded") {
      return {
        success: false,
        error: result.errorMessage || "حدث خطأ أثناء التوليد",
        runId: result.runId,
      }
    }

    const parsed = result.parsed
    if (!parsed?.title_best || !parsed?.youtube_description) {
      return { success: false, error: "استجابة OpenAI غير مكتملة", runId: result.runId }
    }

    return {
      success: true,
      data: {
        title_best: parsed.title_best,
        title_alternatives: Array.isArray(parsed.title_alternatives) ? parsed.title_alternatives : [],
        thumbnail_text_options: Array.isArray(parsed.thumbnail_text_options) ? parsed.thumbnail_text_options : [],
        youtube_description: parsed.youtube_description,
        seo_keywords: Array.isArray(parsed.seo_keywords) ? parsed.seo_keywords : [],
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
      },
      raw: {
        model: result.modelName,
        usage: { prompt_tokens: result.tokensIn, completion_tokens: result.tokensOut },
        run_id: result.runId,
      },
      runId: result.runId,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء التوليد"
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Studio: Generate YouTube Chapters
// ---------------------------------------------------------------------------

export interface StudioChaptersResult {
  chapters: StudioChapterItem[]
}

/**
 * Generate YouTube chapters from transcript + video duration.
 */
export async function generateStudioChapters(
  transcript: string,
  videoTitle: string,
  durationSeconds: number | null,
  /** Optional EIR scope for telemetry. Plumbed in Phase 2 — generators
      keep working without it for legacy callers. */
  eirContext?: { eirId?: string | null; subjectTable?: string | null; subjectId?: string | null }
): Promise<{ success: boolean; data?: StudioChaptersResult; raw?: Record<string, unknown>; error?: string; runId?: string }> {
  // Inner helper still uses the legacy client — `prepareTranscriptWithPositions`
  // will move under the router in a later phase.
  let openaiForPrep: ReturnType<typeof getClient>
  try {
    openaiForPrep = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  const durationStr = durationSeconds
    ? formatSecondsToTimestamp(durationSeconds)
    : "غير معروف"

  try {
    // Use positional transcript for chapters — preserves time awareness across full episode
    const preparedText = await prepareTranscriptWithPositions(openaiForPrep, transcript, durationSeconds)

    // Dynamic chapter targets based on episode length
    const durationMin = durationSeconds ? Math.round(durationSeconds / 60) : null
    const isLongEp = durationMin && durationMin >= 120
    const isMediumEp = durationMin && durationMin >= 60
    const chapterTarget = isLongEp ? "12-16" : isMediumEp ? "10-14" : "8-12"

    const systemPrompt = `أنت كاتب فصول يوتيوب لبودكاست خط — بودكاست عربي يتميز بالعمق الفكري والحدة والذكاء العاطفي.

الفصول الجيدة ليست مجرد فهرس — هي خريطة تجعل المشاهد يقول "أريد سماع هذا الجزء".

## مهمتك:
أنشئ ${chapterTarget} فصلاً يغطي كامل الحلقة من البداية حتى النهاية.
كل فصل = تحوّل حقيقي في القصة أو الفكرة: سؤال جديد، صراع، مفاجأة، قصة شخصية، نقطة تحول، أو خلاصة.
لا تنشئ فصولاً لمجرد ملء الزمن.

## النص:
مقسم إلى أجزاء مُعلّمة بالموقع الزمني (مثل: [الجزء 1/5 — من الدقيقة 0 إلى 18]).
يجب فصلان على الأقل من كل جزء.

## القواعد:
- JSON فقط
- أول فصل عند 00:00:00، تنسيق HH:MM:SS، ترتيب تصاعدي
${durationSeconds ? `- المدة: ${durationStr} (${durationSeconds} ثانية / ${Math.round(durationSeconds / 60)} دقيقة)` : ""}
${durationSeconds ? `- ⚠️ آخر فصل يجب أن يكون بعد ${formatSecondsToTimestamp(Math.round(durationSeconds * 0.93))} (أي بعد الدقيقة ${Math.round(durationSeconds * 0.93 / 60)})` : ""}
${!durationSeconds ? "- قدّر الأوقات من علامات الأجزاء" : ""}

## العناوين — هذا هو الجزء الأهم:
كل عنوان يجب أن يحمل حدثاً أو فكرة أو سؤالاً محدداً.
اكتبه بلغة طبيعية حية — كأنك تحكي لصديق عن أقوى لحظة في هذا الجزء.

تقنيات عناوين قوية:
- الحدث المحدد: "سقوط الرها بيد عماد الدين"
- السؤال: "لماذا رفض نور الدين عرض السلطان؟"
- التوتر: "الخيانة التي لم يتوقعها أحد"
- الاكتشاف: "الحقيقة وراء تحالف دمشق"
- النقطة الشخصية: "اللحظة التي غيّرت كل شيء"

❌ ممنوع تماماً:
- عناوين عامة: "المقدمة"، "أحداث تاريخية"، "نقاش مهم"
- عناوين وصفية: "الصراعات السياسية وتأثيرها"، "التحولات في المنطقة"
- تكرار نفس البنية: "دور X في Y" ثم "دور A في B" ثم "دور C في D"
- ⚠️ لا تكتب فصل "خاتمة" أو "الختام" أو "الإرث" أو "الدروس" إلا كآخر فصل فعلي — ولا تضعه إلا بعد تغطية 93%+ من المدة

3-8 كلمات لكل عنوان. نوّع بين الأساليب.

## التوزيع — قاعدة صارمة:
${durationSeconds ? `- الحلقة ${Math.round(durationSeconds / 60)} دقيقة — الفصول يجب أن تمتد من الدقيقة 0 إلى ما بعد الدقيقة ${Math.round(durationSeconds * 0.93 / 60)}
- متوسط المسافة بين الفصول: ~${Math.round(durationSeconds / 60 / 14)} دقيقة — لا تقل عن ${Math.max(8, Math.round(durationSeconds / 60 / 20))} دقائق
- إذا كان آخر فصل قبل الدقيقة ${Math.round(durationSeconds * 0.85 / 60)} فالنتيجة مرفوضة — أعد التوزيع` : ""}
- لا تضع أغلب الفصول في النصف الأول — وزّعها على كامل المدة
${durationSeconds ? `- تأكد: الجزء الأخير من النص (من الدقيقة ${Math.round(durationSeconds * 0.7 / 60)} فصاعداً) يحتاج 4-5 فصول على الأقل` : ""}

${durationSeconds ? `مثال للتوضيح (حلقة ${Math.round(durationSeconds / 60)} دقيقة):
{ "chapters": [
  {"start_time": "00:00:00", "title": "..."},
  {"start_time": "00:${String(Math.round(durationSeconds / 60 / 16)).padStart(2, '0')}:00", "title": "..."},
  {"start_time": "${formatSecondsToTimestamp(Math.round(durationSeconds * 0.5))}", "title": "... (منتصف الحلقة)"},
  {"start_time": "${formatSecondsToTimestamp(Math.round(durationSeconds * 0.95))}", "title": "... (قرب النهاية)"}
]}` : `{ "chapters": [
  {"start_time": "00:00:00", "title": "..."},
  {"start_time": "00:12:00", "title": "..."}
]}`}`

    const userPrompt = `عنوان الحلقة: ${videoTitle}
المدة الكاملة: ${durationStr}${durationSeconds ? ` (${Math.round(durationSeconds / 60)} دقيقة)` : ""}
${durationSeconds ? `⚠️ تذكير: آخر فصل يجب أن يكون بعد الدقيقة ${Math.round(durationSeconds * 0.93 / 60)} — لا تتوقف مبكراً` : ""}

نص الحلقة:
${preparedText}`

    const result = await runAiTask<{ chapters: StudioChapterItem[] }>({
      taskKind: "structural",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_chapters",
      subjectId: eirContext?.subjectId ?? null,
      input: {
        videoTitle,
        durationSeconds,
        chapterTarget,
        transcriptChars: preparedText.length,
      },
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.3 },
    })

    if (result.status !== "succeeded") {
      return {
        success: false,
        error: result.errorMessage || "حدث خطأ أثناء توليد الفصول",
        runId: result.runId,
      }
    }

    const parsed = result.parsed
    if (!parsed || !Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
      return { success: false, error: "لم يتم توليد أي فصول", runId: result.runId }
    }

    // Validate and clean chapters
    let chapters = parsed.chapters
      .filter((c) => c.start_time && c.title)
      .sort((a, b) => parseTimestampToSeconds(a.start_time) - parseTimestampToSeconds(b.start_time))

    // Ensure first chapter starts at 00:00:00
    if (chapters.length > 0 && parseTimestampToSeconds(chapters[0].start_time) !== 0) {
      chapters[0] = { ...chapters[0], start_time: "00:00:00" }
    }

    // Validate timestamps don't exceed duration
    if (durationSeconds) {
      chapters = chapters.filter(
        (c) => parseTimestampToSeconds(c.start_time) < durationSeconds
      )
    }

    // Post-processing: ensure end coverage reaches 93%+
    // GPT tends to write a "خاتمة" chapter too early and stop.
    // If the last chapter is below 93% of duration, relocate it closer to the end.
    if (durationSeconds && chapters.length >= 2) {
      const lastChSec = parseTimestampToSeconds(chapters[chapters.length - 1].start_time)
      const threshold = Math.round(durationSeconds * 0.93)

      if (lastChSec < threshold) {
        // Place the final chapter at ~95% of the episode
        const targetSec = Math.round(durationSeconds * 0.95)
        // Round to nearest minute for clean timestamps
        const roundedSec = Math.round(targetSec / 60) * 60
        chapters[chapters.length - 1] = {
          ...chapters[chapters.length - 1],
          start_time: formatSecondsToTimestamp(roundedSec),
        }
      }
    }

    return {
      success: true,
      data: { chapters },
      raw: {
        model: result.modelName,
        usage: { prompt_tokens: result.tokensIn, completion_tokens: result.tokensOut },
        run_id: result.runId,
      },
      runId: result.runId,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء توليد الفصول"
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Studio: Generate Viral Clips Suggestions
// ---------------------------------------------------------------------------

export interface StudioClipsResult {
  clips: StudioClipItem[]
}

/**
 * Generate viral clip/shorts suggestions from transcript.
 * Optionally enhanced with visual analysis data from Google Video Intelligence.
 */
export async function generateStudioClips(
  transcript: string,
  videoTitle: string,
  durationSeconds: number | null,
  visualAnalysis?: string | null,
  eirContext?: { eirId?: string | null; subjectTable?: string | null; subjectId?: string | null }
): Promise<{ success: boolean; data?: StudioClipsResult; raw?: Record<string, unknown>; error?: string; runId?: string }> {
  let openaiForPrep: ReturnType<typeof getClient>
  try {
    openaiForPrep = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  const durationStr = durationSeconds
    ? formatSecondsToTimestamp(durationSeconds)
    : "غير معروف"

  const visualBlock = visualAnalysis
    ? `\n\n## بيانات التحليل البصري (من Google Video Intelligence):\nاستخدم هذه البيانات لتحسين اختيار المقاطع — فضّل اللحظات التي تجمع بين محتوى قوي في النص ونشاط بصري عالٍ (كثافة تغيير لقطات).\n\n${visualAnalysis}`
    : ""

  try {
    // Use positional transcript for clips — need time awareness across full episode
    const preparedText = await prepareTranscriptWithPositions(openaiForPrep, transcript, durationSeconds)

    const systemPrompt = `أنت صانع محتوى قصير لبودكاست خط — بودكاست عربي عميق وذكي عاطفياً.

مقاطع خط القصيرة ليست مجرد "اقتطاع" من الحلقة — هي لحظات تستحق أن تعيش وحدها. تصل للقلب أو تُثير السؤال أو تكسر فكرة شائعة.

## مهمتك:
اقترح 10-20 مقطع قصير يصلح كمحتوى مستقل. وزّعها على كامل الحلقة.

## النص مقسم إلى أجزاء مُعلّمة بالموقع الزمني — استخدمها لتحديد الأوقات.

## ما يجعل مقطع خط مميزاً:
- لحظة صدق: اعتراف، ضعف، تجربة شخصية حقيقية
- مفارقة أو تناقض يكسر التوقع
- بصيرة حادة — جملة واحدة تُعيد ترتيب فهمك
- قصة قصيرة لها بداية ونهاية ومعنى
- سؤال يبقى في الذهن بعد المقطع
- مدة المقطع: 30-90 ثانية
${visualAnalysis ? "- فضّل المقاطع التي تتزامن مع نشاط بصري عالٍ (تغييرات لقطات متعددة) حيث تكون أكثر جاذبية بصرياً" : ""}

## قواعد صارمة:
- الإجابة JSON فقط
- جميع النصوص بالعربية
- الأوقات بتنسيق HH:MM:SS
- start_time < end_time دائماً
${durationSeconds ? `- end_time لا يتجاوز المدة الكاملة (${durationStr})` : ""}
${!durationSeconds ? "- قدّر الأوقات تقريبياً بناءً على موقع النص" : ""}
- المنصة: "YouTube Shorts" أو "IG Reels" أو "TikTok" أو "X"
- hook_text: أول جملة تفتح بها المقطع (تجذب الانتباه فوراً)
- caption: وصف المنشور للمنصة (2-3 جمل، مع إيموجي مناسب، بأسلوب المنصة المستهدفة)
- clip_title: عنوان قصير جذاب للمقطع (5-8 كلمات)
- hashtags: 5-8 هاشتاقات مناسبة للمنصة (عربية + إنجليزية، بدون #)
- description: نسخة وصفية أطول للمقطع (3-4 جمل، تصلح لوصف يوتيوب أو بوست مفصّل)
- viral_hook: سطر خطاف فيروسي واحد يصلح كتعليق أول أو بداية المقطع (يثير فضول أو يصدم أو يتحدى)
- why_it_works: سبب واحد لنجاح هذا المقطع
${visualAnalysis ? '- visual_note: ملاحظة بصرية مختصرة إن وُجد نشاط بصري مميز في هذا المقطع (اختياري)' : ""}

## مخطط JSON المطلوب:
{
  "clips": [
    {
      "start_time": "00:05:30",
      "end_time": "00:06:45",
      "platform": "YouTube Shorts",
      "clip_title": "عنوان المقطع القصير...",
      "hook_text": "الجملة الافتتاحية...",
      "caption": "وصف المنشور مع إيموجي \u{1F525}...",
      "hashtags": ["بودكاست_خط", "podcast", "تطوير_الذات", "motivation"],
      "description": "نسخة وصفية أطول...",
      "viral_hook": "سطر الخطاف الفيروسي...",
      "why_it_works": "سبب النجاح..."${visualAnalysis ? ',\n      "visual_note": "ملاحظة بصرية اختيارية..."' : ""}
    }
  ]
}${visualBlock}`

    const userPrompt = `عنوان الحلقة: ${videoTitle}
المدة الكاملة: ${durationStr}

نص الحلقة:
${preparedText}`

    const result = await runAiTask<{ clips: StudioClipItem[] }>({
      taskKind: "structural",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_clips",
      subjectId: eirContext?.subjectId ?? null,
      input: {
        videoTitle,
        durationSeconds,
        hasVisualAnalysis: Boolean(visualAnalysis),
        transcriptChars: preparedText.length,
      },
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.5 },
    })

    if (result.status !== "succeeded") {
      return {
        success: false,
        error: result.errorMessage || "حدث خطأ أثناء توليد المقاطع",
        runId: result.runId,
      }
    }

    const parsed = result.parsed
    if (!parsed || !Array.isArray(parsed.clips) || parsed.clips.length === 0) {
      return { success: false, error: "لم يتم توليد أي مقاطع", runId: result.runId }
    }

    // Validate and clean clips
    let clips = parsed.clips
      .filter((c) => c.start_time && c.end_time && c.hook_text)
      .map((c) => ({ ...c, used: false }))
      .filter((c) => parseTimestampToSeconds(c.start_time) < parseTimestampToSeconds(c.end_time))

    // Validate end_time doesn't exceed duration
    if (durationSeconds) {
      clips = clips.filter(
        (c) => parseTimestampToSeconds(c.end_time) <= durationSeconds
      )
    }

    // Sort by start_time
    clips.sort((a, b) => parseTimestampToSeconds(a.start_time) - parseTimestampToSeconds(b.start_time))

    return {
      success: true,
      data: { clips },
      raw: {
        model: result.modelName,
        usage: { prompt_tokens: result.tokensIn, completion_tokens: result.tokensOut },
        run_id: result.runId,
      },
      runId: result.runId,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء توليد المقاطع"
    return { success: false, error: msg }
  }
}
