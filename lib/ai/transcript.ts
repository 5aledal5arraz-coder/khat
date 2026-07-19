import { env } from "@/lib/env"
import type { ConfigQuote } from "@/types/episodes"
import type { StudioTranscriptSummary, StudioTranscriptQuote } from "@/types/database"
// Phase 2.0 Batch 1 — getClient + STRUCTURE_MODEL/EDITORIAL_MODEL no longer
// needed here; every call now routes through runAiTask + builders.
import { prepareTranscript, safeParseJSON } from "./client"
import { runAiTask } from "@/lib/ai-router"
import {
  buildTranscriptQuotesPrompt,
  TRANSCRIPT_QUOTES_PROMPT_VERSION,
} from "@/lib/ai/prompts/transcript-quotes"
import type { GlobalEpisodeIntelligence } from "./episode-intelligence"
import { formatIntelligenceContext } from "./episode-intelligence"

/** Phase 2.0 Batch 1 — fallback actor id for legacy call sites that
 *  haven't been migrated to thread a real admin/cron/eval actor.
 *  Telemetry-visible so we can find unmigrated call sites later. */
const LEGACY_ACTOR = "system:legacy-callsite"

/** Optional EIR context for telemetry (kept stable; pre-existing shape). */
interface EirContext {
  eirId?: string | null
  subjectTable?: string | null
  subjectId?: string | null
}

// ---------------------------------------------------------------------------
// Transcript processing: quotes from transcript, readable article, summary
// ---------------------------------------------------------------------------

export interface TranscriptProcessingResult {
  clean_article: string
  summary: StudioTranscriptSummary
  quotes: StudioTranscriptQuote[]
}

export async function generateQuotesFromTranscript(
  transcript: string,
  episodeTitle: string,
  guestName: string,
  count: number = 10,
  options?: { actorId?: string | null } & EirContext,
): Promise<ConfigQuote[]> {
  const built = buildTranscriptQuotesPrompt({
    transcript,
    episodeTitle,
    guestName,
    count,
  })

  const result = await runAiTask<{
    quotes: { text: string; theme: string | null; speaker: string | null }[]
  }>({
    taskKind: "structural",
    eirId: options?.eirId ?? null,
    subjectTable: options?.subjectTable ?? "studio_sessions",
    subjectId: options?.subjectId ?? null,
    actorId: options?.actorId ?? LEGACY_ACTOR,
    promptVersion: TRANSCRIPT_QUOTES_PROMPT_VERSION,
    input: built.input,
    prompt: [
      { role: "system", content: built.system },
      { role: "user", content: built.user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.3 },
  })

  if (result.status !== "succeeded") return []

  // Tolerate two return-shape paths: `result.parsed` directly, or the
  // legacy safeParseJSON fallback on rawText for parity.
  const parsedFromResult = result.parsed?.quotes
  const fallback = result.rawText
    ? safeParseJSON<{
        quotes: { text: string; theme: string | null; speaker: string | null }[]
      }>(result.rawText, "generateQuotesFromTranscript")
    : null
  const quotes =
    parsedFromResult ??
    (fallback && fallback.success ? fallback.data.quotes : [])

  return (quotes || []).map((q) => ({
    id: `quote-${crypto.randomUUID()}`,
    text: q.text,
    theme: q.theme || null,
    speaker: q.speaker || null,
  }))
}

/**
 * Process a raw/clean transcript into a readable article, structured summary,
 * and extracted impactful quotes.
 *
 * When episodeIntelligence is provided, the editorial-tier model uses the
 * global understanding to produce more coherent, non-repetitive,
 * higher-quality outputs.
 */
export async function processTranscript(
  rawText: string,
  videoTitle: string,
  episodeIntelligence?: GlobalEpisodeIntelligence | null,
  eirContext?: EirContext & { actorId?: string | null },
): Promise<{ success: boolean; data?: TranscriptProcessingResult; error?: string; runId?: string }> {
  if (!env.OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    // Phase 2.0 Batch 1 — prepareTranscript no longer reads from the
    // passed client; it routes internally via runAiTask. We pass null
    // for the legacy openai parameter via type-cast (signature kept for
    // backwards compat with unmigrated callers).
    const preparedText = await prepareTranscript(null as never, rawText)
    const intelligenceBlock = episodeIntelligence ? `\n\n${formatIntelligenceContext(episodeIntelligence)}` : ""

    const systemPrompt = `أنت المحرر الأدبي لبودكاست خط — بودكاست عربي يتميز بالعمق الفكري والذكاء العاطفي والصدق الإنساني.

صوت خط: حاد لكن دافئ. يحترم ذكاء القارئ. لا يشرح الواضح. يختار الكلمة التي تبقى في الذهن.

ستتلقى نص حلقة — مهمتك تحويله إلى محتوى يستحق القراءة والمشاركة.

${episodeIntelligence ? "⚠️ لديك فهم شامل مسبق للحلقة. ابنِ على هذا الفهم بدلاً من معالجة النص من الصفر." : ""}

## المخرجات الثلاثة:

### 1. مقال مقروء (clean_article)
- أعد كتابة النص كمقال متسلسل بالعربية الفصحى المعاصرة
- فقرات منطقية (3-5 جمل لكل فقرة)، ترقيم صحيح، أخطاء مصححة
- حافظ على المعنى الأصلي — لا تحذف ولا تضف
- فقرات مفصولة بسطر فارغ، بدون Markdown أو عناوين
- شامل — يغطي كل محاور الحلقة

### 2. ملخص مُهيكل (summary)

#### overview
- فقرة واحدة (4-6 جمل) تجعل القارئ يريد الاستماع
- ❌ لا تكتب "تتحدث الحلقة عن..." — ابدأ بالتوتر أو المفارقة أو السؤال

#### key_ideas — 6-10 أفكار
- كل فكرة جملة أو جملتين — حادة ومحددة
- ❌ "أهمية القراءة"، "قيمة العمل" — هذه عناوين مدرسية
- ✅ "القائد الذي يُصلح المحكمة قبل الجيش يكسب ولاء الناس قبل المعركة"
- كل فكرة يجب أن تصلح كتغريدة مستقلة — مفهومة بدون سياق
- رتّب من الأقوى إلى الأقل
${episodeIntelligence ? "- ⚠️ استخدم 'الأفكار الجوهرية' من الفهم الشامل — لا تكرر نفس الفكرة بصياغات مختلفة" : ""}

#### lessons — 4-7 دروس عملية
- قابلة للتنفيذ فعلاً — ليست حكماً عامة
- اكتبها كنصيحة لصديق: واضحة، مباشرة، محفّزة
- ❌ "يجب أن نفهم أنفسنا" — ❌ "اعمل بجد وستنجح"
- ✅ "قبل أن تواجه عدوك الخارجي، تأكد أن بيتك الداخلي متماسك"

### 3. اقتباسات (quotes) — 10-18 اقتباس
هذا هو الجزء الأهم. كل اقتباس يجب أن يمر باختبار: "هل سأتوقف عن التمرير لو رأيت هذا؟"

الاقتباس القوي:
- يحمل معنى يستحق أن يُعلّق على حائط أو يُشارك كصورة
- مكتمل المعنى بدون سياق
- يُثير شعوراً: دهشة، تأمل، إلهام، أو يتحدى فكرة شائعة
- جملة إلى جملتين — لا أقصر ولا أطول

❌ ممنوع: جمل وصفية ("تحدثنا عن...")، حكم مبتذلة ("الحياة مليئة بالتحديات")، تكرار نفس الفكرة

✅ مسموح: إعادة صياغة لتقوية الجملة، تكثيف فكرة مبعثرة، إكمال معنى ناقص — بشرط أن تبقى أمينة لروح الحلقة وتبدو طبيعية
${episodeIntelligence ? "\n- ⚠️ استخدم 'أقوى اللحظات' من الفهم الشامل كقائمة مرجعية للاقتباسات" : ""}

أجب بتنسيق JSON فقط:
{
  "clean_article": "الفقرة الأولى...\\n\\nالفقرة الثانية...",
  "summary": {
    "overview": "...",
    "key_ideas": ["بصيرة حادة 1", ...],
    "lessons": ["درس عملي 1", ...]
  },
  "quotes": [
    { "text": "اقتباس مكتمل المعنى", "theme": "التصنيف" }
  ]
}`

    const userPrompt = `عنوان الحلقة: ${videoTitle}
${intelligenceBlock}
نص الحلقة الخام:
${preparedText}`

    const result = await runAiTask<TranscriptProcessingResult>({
      taskKind: "editorial",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_sessions",
      subjectId: eirContext?.subjectId ?? null,
      actorId: eirContext?.actorId ?? LEGACY_ACTOR,
      input: {
        videoTitle,
        hasIntelligence: Boolean(episodeIntelligence),
        transcriptChars: preparedText.length,
      },
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.55 },
    })

    if (result.status !== "succeeded") {
      return { success: false, error: result.errorMessage || "حدث خطأ", runId: result.runId }
    }

    const data = result.parsed
    if (!data?.clean_article || !data?.summary) {
      return { success: false, error: "استجابة OpenAI غير مكتملة", runId: result.runId }
    }

    return {
      success: true,
      runId: result.runId,
      data: {
        clean_article: data.clean_article,
        summary: {
          overview: data.summary.overview || "",
          key_ideas: Array.isArray(data.summary.key_ideas) ? data.summary.key_ideas : [],
          lessons: Array.isArray(data.summary.lessons) ? data.summary.lessons : [],
        },
        quotes: Array.isArray(data.quotes)
          ? data.quotes.filter((q) => q.text && q.theme)
          : [],
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء معالجة النص"
    return { success: false, error: msg }
  }
}

/**
 * Regenerate only quotes from a transcript.
 *
 * Migrated to AI Router (Khat Brain Phase 2). The transcript-prep helper
 * still calls the legacy client directly; that nested call moves under
 * the router in a later phase.
 */
export async function regenerateQuotes(
  rawText: string,
  videoTitle: string,
  episodeIntelligence?: GlobalEpisodeIntelligence | null,
  eirContext?: EirContext & { actorId?: string | null },
): Promise<{ success: boolean; data?: StudioTranscriptQuote[]; error?: string; runId?: string }> {
  if (!env.OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const preparedText = await prepareTranscript(null as never, rawText)
    const intelligenceBlock = episodeIntelligence ? `\n\n${formatIntelligenceContext(episodeIntelligence)}` : ""

    const systemPrompt = `أنت محرر اقتباسات لبودكاست خط — بودكاست عربي حاد وعميق وذكي عاطفياً.

## مهمتك:
أنتج 12-20 اقتباساً يستحق أن يُشارك كصورة اقتباس أو تغريدة.

${episodeIntelligence ? "⚠️ لديك فهم شامل مسبق للحلقة مع أقوى اللحظات. استخدمها كمرجع أساسي." : ""}

## اختبار الاقتباس: "هل سأتوقف عن التمرير لو رأيت هذا؟"
- نعم = يتحدى فكرة شائعة، يكشف حقيقة إنسانية، يلخص تجربة بعمق
- لا = جملة وصفية، حكمة مبتذلة، كلام يمكن أن يُقال في أي سياق

## المواصفات:
- جملة إلى جملتين — مكتمل المعنى بدون سياق
- يُثير شعوراً: دهشة، تأمل، إلهام، أو تحدي
- وزّع على كامل الحلقة — لا تأخذها كلها من الربع الأول

## مسموح: إعادة صياغة لتقوية الجملة، تكثيف فكرة مبعثرة — بشرط الأمانة للمعنى والطبيعية

## ممنوع: "تحدثنا عن..."، "الحياة صعبة"، تكرار نفس الفكرة، جمل بدون معنى مكتمل

## theme: كلمة أو كلمتين تعكس الجوهر (مثل: صراع داخلي، قيادة، تجربة شخصية)

{ "quotes": [{ "text": "...", "theme": "..." }] }`

    const userPrompt = `عنوان الحلقة: ${videoTitle}
${intelligenceBlock}
نص الحلقة:
${preparedText}

أجب بتنسيق JSON فقط.`

    const result = await runAiTask<{ quotes: StudioTranscriptQuote[] }>({
      taskKind: "editorial",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_sessions",
      subjectId: eirContext?.subjectId ?? null,
      actorId: eirContext?.actorId ?? LEGACY_ACTOR,
      input: {
        videoTitle,
        hasIntelligence: Boolean(episodeIntelligence),
        transcriptChars: preparedText.length,
      },
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.65 },
    })

    if (result.status !== "succeeded") {
      return {
        success: false,
        error: result.errorMessage || "حدث خطأ",
        runId: result.runId,
      }
    }

    const parsed = result.parsed
    const quotes = parsed && Array.isArray(parsed.quotes)
      ? parsed.quotes.filter((q) => q.text && q.theme)
      : []
    return { success: true, data: quotes, runId: result.runId }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "حدث خطأ" }
  }
}

/**
 * Regenerate only key ideas from a transcript.
 */
export async function regenerateKeyIdeas(
  rawText: string,
  videoTitle: string,
  episodeIntelligence?: GlobalEpisodeIntelligence | null,
  eirContext?: EirContext & { actorId?: string | null },
): Promise<{ success: boolean; data?: string[]; error?: string; runId?: string }> {
  if (!env.OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const preparedText = await prepareTranscript(null as never, rawText)
    const intelligenceBlock = episodeIntelligence ? `\n\n${formatIntelligenceContext(episodeIntelligence)}` : ""

    const systemPrompt = `أنت محرر أفكار لبودكاست خط — بودكاست عربي حاد وعميق.

## مهمتك:
استخرج 8-12 فكرة رئيسية — كل فكرة بصيرة تستحق أن تُشارك وحدها.

${episodeIntelligence ? "⚠️ لديك الأفكار الجوهرية المستخرجة مسبقاً. حسّنها واصقلها — لا تكرر." : ""}

## الفكرة القوية:
- محددة — تحمل رؤية أو زاوية من هذه الحلقة تحديداً
- تصلح كتغريدة مستقلة — مفهومة بدون سياق
- جملة أو جملتين — مكثفة وحادة
- رتّب من الأقوى إلى الأقل

## ✅ أمثلة جيدة:
"القائد الذي يُصلح المحكمة قبل الجيش يكسب ولاء الناس قبل المعركة"
"الانقسام الداخلي أخطر من أي عدو خارجي — لأنه يُسلّم المفاتيح بدون قتال"

## ❌ ممنوع:
"أهمية القراءة"، "قيمة الوقت"، "تحدث الضيف عن..."، تكرار نفس الفكرة

{ "key_ideas": ["...", ...] }`

    const userPrompt = `عنوان الحلقة: ${videoTitle}
${intelligenceBlock}
نص الحلقة:
${preparedText}

أجب بتنسيق JSON فقط.`

    const result = await runAiTask<{ key_ideas: string[] }>({
      taskKind: "editorial",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_sessions",
      subjectId: eirContext?.subjectId ?? null,
      actorId: eirContext?.actorId ?? LEGACY_ACTOR,
      input: { videoTitle, transcriptChars: preparedText.length },
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.55 },
    })

    if (result.status !== "succeeded") {
      return { success: false, error: result.errorMessage || "حدث خطأ", runId: result.runId }
    }
    return {
      success: true,
      runId: result.runId,
      data: Array.isArray(result.parsed?.key_ideas) ? result.parsed.key_ideas : [],
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "حدث خطأ" }
  }
}

/**
 * Regenerate only lessons from a transcript.
 */
export async function regenerateLessons(
  rawText: string,
  videoTitle: string,
  episodeIntelligence?: GlobalEpisodeIntelligence | null,
  eirContext?: EirContext & { actorId?: string | null },
): Promise<{ success: boolean; data?: string[]; error?: string; runId?: string }> {
  if (!env.OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const preparedText = await prepareTranscript(null as never, rawText)
    const intelligenceBlock = episodeIntelligence ? `\n\n${formatIntelligenceContext(episodeIntelligence)}` : ""

    const systemPrompt = `أنت محرر دروس عملية لبودكاست خط.

## مهمتك:
استخرج 5-8 دروس يمكن للمستمع تطبيقها في حياته — ليست حكماً عامة.

## الدرس القوي:
- يجيب على "ماذا أفعل؟" أو "كيف أطبق هذا؟"
- مستوحى من تجربة أو رؤية وردت في الحلقة فعلاً
- مكتوب كنصيحة لصديق: واضح، مباشر، محفّز
- جملة أو جملتين

## ✅ مثال: "قبل أن تواجه خصمك، تأكد أن فريقك الداخلي موحّد — الانقسام يهزمك قبل المعركة"
## ❌ ممنوع: "اعمل بجد وستنجح"، "يجب أن نفهم أنفسنا"، تكرار نفس المعنى

{ "lessons": ["...", ...] }`

    const userPrompt = `عنوان الحلقة: ${videoTitle}
${intelligenceBlock}
نص الحلقة:
${preparedText}

أجب بتنسيق JSON فقط.`

    const result = await runAiTask<{ lessons: string[] }>({
      taskKind: "editorial",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_sessions",
      subjectId: eirContext?.subjectId ?? null,
      actorId: eirContext?.actorId ?? LEGACY_ACTOR,
      input: { videoTitle, transcriptChars: preparedText.length },
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.55 },
    })

    if (result.status !== "succeeded") {
      return { success: false, error: result.errorMessage || "حدث خطأ", runId: result.runId }
    }
    return {
      success: true,
      runId: result.runId,
      data: Array.isArray(result.parsed?.lessons) ? result.parsed.lessons : [],
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "حدث خطأ" }
  }
}
