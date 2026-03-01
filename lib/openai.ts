import OpenAI from "openai"
import type { ConfigQuote } from "@/types/episodes"
import type { YouTubePackSection } from "@/types/youtube-pack"
import type { StudioChapterItem, StudioClipItem, StudioAnalyzerData, WebsiteQuoteItem, WebsiteResourceItem, WebsiteTimestampItem, StudioTranscriptSummary, StudioTranscriptQuote, AudioEditSuggestion } from "@/types/database"

// ---------------------------------------------------------------------------
// Prompt versioning
// ---------------------------------------------------------------------------
export const STUDIO_PROMPT_VERSION = "v1"

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set")
    }
    client = new OpenAI({ apiKey })
  }
  return client
}

/* ─── AI Content Moderation ─── */

export type AIModerationVerdict = "clean" | "suspicious" | "harmful"

export interface AIModerationResult {
  verdict: AIModerationVerdict
  reason: string | null
  categories: string[]
}

// Category labels in Arabic for the admin dashboard
const CATEGORY_LABELS: Record<string, string> = {
  hate: "خطاب كراهية",
  "hate/threatening": "تهديد كراهية",
  harassment: "تحرش",
  "harassment/threatening": "تهديد",
  "self-harm": "إيذاء النفس",
  "self-harm/intent": "نية إيذاء النفس",
  "self-harm/instructions": "تعليمات إيذاء النفس",
  sexual: "محتوى جنسي",
  "sexual/minors": "محتوى جنسي للقاصرين",
  violence: "عنف",
  "violence/graphic": "عنف صريح",
}

// Score thresholds
const HARMFUL_THRESHOLD = 0.7
const SUSPICIOUS_THRESHOLD = 0.3

/**
 * Check content against OpenAI's moderation API.
 * Returns: clean, suspicious, or harmful verdict.
 * Falls back to "clean" if the API key is missing or the call fails,
 * so local moderation still protects the platform.
 */
export async function moderateWithAI(content: string): Promise<AIModerationResult> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    // No API key → skip AI moderation, rely on local checks
    return { verdict: "clean", reason: null, categories: [] }
  }

  try {
    const response = await openai.moderations.create({
      input: content,
    })

    const result = response.results[0]
    if (!result) {
      return { verdict: "clean", reason: null, categories: [] }
    }

    // If OpenAI flags it outright
    if (result.flagged) {
      const flaggedCategories = Object.entries(result.categories)
        .filter(([, flagged]) => flagged)
        .map(([cat]) => cat)

      const labels = flaggedCategories
        .map((cat) => CATEGORY_LABELS[cat] || cat)

      // Check if scores are very high → harmful, otherwise suspicious
      const maxScore = Math.max(...Object.values(result.category_scores))

      if (maxScore >= HARMFUL_THRESHOLD) {
        return {
          verdict: "harmful",
          reason: labels.join("، "),
          categories: flaggedCategories,
        }
      }

      return {
        verdict: "suspicious",
        reason: labels.join("، "),
        categories: flaggedCategories,
      }
    }

    // Not flagged, but check for borderline scores
    const borderlineCategories = Object.entries(result.category_scores)
      .filter(([, score]) => score >= SUSPICIOUS_THRESHOLD)
      .map(([cat]) => cat)

    if (borderlineCategories.length > 0) {
      const labels = borderlineCategories
        .map((cat) => CATEGORY_LABELS[cat] || cat)

      return {
        verdict: "suspicious",
        reason: labels.join("، "),
        categories: borderlineCategories,
      }
    }

    return { verdict: "clean", reason: null, categories: [] }
  } catch {
    // API error → fail open, rely on local moderation
    return { verdict: "clean", reason: null, categories: [] }
  }
}

export async function generateQuotesFromTranscript(
  transcript: string,
  episodeTitle: string,
  guestName: string,
  count: number = 10
): Promise<ConfigQuote[]> {
  const openai = getClient()

  // Truncate transcript to ~12,000 chars to stay within token budget
  const truncated = transcript.slice(0, 12000)

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `أنت محلل محتوى متخصص في استخراج اقتباسات قوية من نصوص البودكاست العربية.

مهمتك:
- استخرج ${count} اقتباسات قوية وقصيرة (جملة أو جملتين، لا تتجاوز 150 حرفاً لكل اقتباس)
- يجب أن تكون الاقتباسات حرفية أو شبه حرفية من النص
- ركّز على الجمل المؤثرة والملهمة والحكم والتجارب الشخصية
- حدد المتحدث لكل اقتباس: "guest" للضيف أو "host" للمقدم أو null إذا غير واضح
- أضف تصنيف موضوعي قصير (كلمة أو كلمتين) لكل اقتباس

أعد النتيجة بتنسيق JSON:
{
  "quotes": [
    {
      "text": "نص الاقتباس",
      "theme": "التصنيف",
      "speaker": "guest"
    }
  ]
}`,
      },
      {
        role: "user",
        content: `عنوان الحلقة: ${episodeTitle}
اسم الضيف: ${guestName}

نص الحلقة:
${truncated}`,
      },
    ],
  })

  const content = response.choices[0]?.message?.content
  if (!content) return []

  try {
    const parsed = JSON.parse(content) as { quotes: { text: string; theme: string | null; speaker: string | null }[] }
    return (parsed.quotes || []).map((q, i) => ({
      id: `quote-${crypto.randomUUID()}`,
      text: q.text,
      theme: q.theme || null,
      speaker: q.speaker || null,
    }))
  } catch {
    return []
  }
}

const SECTION_LABELS: Record<YouTubePackSection["type"], string> = {
  titles: "عناوين مقترحة",
  description: "وصف يوتيوب",
  timestamps: "الفصول الزمنية",
  hashtags: "هاشتاقات",
  clips: "أفكار مقاطع قصيرة",
  tweets: "تغريدات مقترحة",
}

export async function generateYoutubePackFromTranscript(
  transcript: string,
  episodeTitle: string,
  guestName: string
): Promise<YouTubePackSection[]> {
  const openai = getClient()

  const truncated = transcript.slice(0, 12000)

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `أنت متخصص في تسويق محتوى البودكاست على يوتيوب ومنصات التواصل الاجتماعي.

مهمتك: إنتاج حزمة نشر كاملة لحلقة بودكاست على يوتيوب، بناءً على نص الحلقة المقدم.

أنتج التالي:
1. **titles**: 3 عناوين مقترحة جذّابة للحلقة على يوتيوب (كل عنوان في سطر منفصل)
2. **description**: وصف كامل للحلقة لنشره على يوتيوب (3-5 فقرات، يتضمن ملخص الحلقة وأبرز المحاور)
3. **timestamps**: فصول زمنية تقريبية بتنسيق (00:00 - العنوان) لأهم محاور الحلقة
4. **hashtags**: 10 هاشتاقات مناسبة (بدون #، مفصولة بمسافات)
5. **clips**: 5 أفكار لمقاطع قصيرة (كل فكرة تتضمن عنوان المقطع ووصف مختصر للمحتوى)
6. **tweets**: 3 تغريدات مقترحة للترويج للحلقة (كل تغريدة أقل من 280 حرف)

أعد النتيجة بتنسيق JSON:
{
  "titles": "العنوان الأول\\nالعنوان الثاني\\nالعنوان الثالث",
  "description": "وصف الحلقة الكامل...",
  "timestamps": "00:00 - المقدمة\\n02:30 - المحور الأول...",
  "hashtags": "هاشتاق1 هاشتاق2 هاشتاق3...",
  "clips": "1. عنوان المقطع: وصف مختصر\\n2. ...",
  "tweets": "التغريدة الأولى\\n---\\nالتغريدة الثانية\\n---\\nالتغريدة الثالثة"
}`,
      },
      {
        role: "user",
        content: `عنوان الحلقة: ${episodeTitle}
اسم الضيف: ${guestName}

نص الحلقة:
${truncated}`,
      },
    ],
  })

  const content = response.choices[0]?.message?.content
  if (!content) return []

  try {
    const parsed = JSON.parse(content) as Record<string, string>
    const now = Date.now()
    const types: YouTubePackSection["type"][] = [
      "titles",
      "description",
      "timestamps",
      "hashtags",
      "clips",
      "tweets",
    ]

    return types
      .filter((type) => parsed[type])
      .map((type) => ({
        id: `section-${type}-${now}`,
        type,
        label: SECTION_LABELS[type],
        content: parsed[type],
      }))
  } catch {
    return []
  }
}

export async function generateYoutubePackSectionFromTranscript(
  transcript: string,
  episodeTitle: string,
  guestName: string,
  sectionType: YouTubePackSection["type"]
): Promise<YouTubePackSection | null> {
  const openai = getClient()

  const truncated = transcript.slice(0, 12000)

  const sectionInstructions: Record<YouTubePackSection["type"], string> = {
    titles: "أنتج 3 عناوين مقترحة جذّابة للحلقة على يوتيوب (كل عنوان في سطر منفصل)",
    description: "أنتج وصفاً كاملاً للحلقة لنشره على يوتيوب (3-5 فقرات، يتضمن ملخص الحلقة وأبرز المحاور)",
    timestamps: "أنتج فصولاً زمنية تقريبية بتنسيق (00:00 - العنوان) لأهم محاور الحلقة",
    hashtags: "أنتج 10 هاشتاقات مناسبة (بدون #، مفصولة بمسافات)",
    clips: "أنتج 5 أفكار لمقاطع قصيرة (كل فكرة تتضمن عنوان المقطع ووصف مختصر للمحتوى)",
    tweets: "أنتج 3 تغريدات مقترحة للترويج للحلقة (كل تغريدة أقل من 280 حرف، مفصولة بـ ---)",
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.4,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `أنت متخصص في تسويق محتوى البودكاست على يوتيوب ومنصات التواصل الاجتماعي.

مهمتك: ${sectionInstructions[sectionType]}

أعد النتيجة بتنسيق JSON:
{
  "content": "المحتوى المطلوب هنا..."
}`,
      },
      {
        role: "user",
        content: `عنوان الحلقة: ${episodeTitle}
اسم الضيف: ${guestName}

نص الحلقة:
${truncated}`,
      },
    ],
  })

  const responseContent = response.choices[0]?.message?.content
  if (!responseContent) return null

  try {
    const parsed = JSON.parse(responseContent) as { content: string }
    if (!parsed.content) return null

    return {
      id: `section-${sectionType}-${crypto.randomUUID()}`,
      type: sectionType,
      label: SECTION_LABELS[sectionType],
      content: parsed.content,
    }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Studio: Generate YouTube Package from transcript
// ---------------------------------------------------------------------------

// Token-safe transcript limit (~8000 words ≈ ~12000 tokens for Arabic)
const MAX_TRANSCRIPT_CHARS = 24000

export interface StudioPackageResult {
  title_best: string
  title_alternatives: string[]
  thumbnail_text_options: string[]
  youtube_description: string
  seo_keywords: string[]
  hashtags: string[]
}

/**
 * If the transcript exceeds the safe limit, ask GPT to summarize it first.
 * Returns either the original text or a condensed summary.
 */
async function prepareTranscript(
  openai: OpenAI,
  transcript: string
): Promise<string> {
  if (transcript.length <= MAX_TRANSCRIPT_CHARS) {
    return transcript
  }

  // Summarize in Arabic, keeping key topics, quotes, and structure
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `أنت مساعد متخصص في تلخيص نصوص بودكاست طويلة.

لخّص النص التالي مع الحفاظ على:
- أهم المحاور والأفكار الرئيسية
- الاقتباسات والجمل المؤثرة كما هي (حرفياً)
- ترتيب المواضيع الزمني
- أسماء الأشخاص والأماكن المذكورة

اكتب الملخص بالعربية في حدود 3000 كلمة.`,
      },
      {
        role: "user",
        content: transcript.slice(0, 48000), // safety cap for context window
      },
    ],
  })

  return response.choices[0]?.message?.content || transcript.slice(0, MAX_TRANSCRIPT_CHARS)
}

/**
 * Generate a full YouTube content package from a podcast transcript.
 * Returns structured outputs optimized for YouTube CTR + retention.
 */
export async function generateStudioPackage(
  transcript: string,
  videoTitle: string,
  channelTitle: string
): Promise<{ success: boolean; data?: StudioPackageResult; raw?: Record<string, unknown>; error?: string }> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    // Step 1: Prepare transcript (summarize if too long)
    const preparedText = await prepareTranscript(openai, transcript)

    // Step 2: Generate the full package
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `أنت خبير في تسويق محتوى يوتيوب وتحسين محركات البحث للبودكاست العربي.

ستحلل نص حلقة بودكاست وتنتج حزمة محتوى كاملة لنشرها على يوتيوب ومنصات التواصل الاجتماعي.

## قواعد صارمة:
- جميع المخرجات باللغة العربية
- لا تستخدم Markdown — فقط نص عادي
- الإجابة يجب أن تكون JSON فقط بالمخطط المحدد أدناه
- استخدم النص المقدم كمصدر وحيد للحقائق — لا تختلق معلومات

## المطلوب:

### 1. عنوان رئيسي (title_best)
- عنوان واحد أفضل عنوان لليوتيوب
- يفضل أقل من 70 حرف
- يجذب النقر: يثير الفضول أو يعد بقيمة واضحة
- يتضمن كلمة مفتاحية أساسية

### 2. عناوين بديلة (title_alternatives)
- 5 عناوين بديلة بأساليب مختلفة
- كل عنوان أقل من 70 حرف
- أساليب متنوعة: سؤال، رقم، تحدي، اقتباس، إثارة

### 3. نص الصورة المصغرة (thumbnail_text_options)
- 5 خيارات لنص الثمبنيل
- كل خيار 3-5 كلمات فقط
- كلمات قوية تثير الفضول أو المشاعر

### 4. وصف يوتيوب (youtube_description)
- ابدأ بخطاف قوي (2-3 أسطر) يشد المشاهد
- ثم ملخص الحلقة (فقرة واحدة)
- ثم أبرز المحاور (نقاط مرقمة)
- نص عادي فقط، بدون Markdown

### 5. كلمات مفتاحية SEO (seo_keywords)
- 10-20 كلمة/عبارة مفتاحية
- مزيج بين عامة ومتخصصة
- تشمل: اسم الضيف، مواضيع الحلقة، مصطلحات البحث الشائعة

### 6. هاشتاقات (hashtags)
- 10-15 هاشتاق (بدون رمز #)
- مناسبة ليوتيوب وانستاقرام وتيك توك
- مزيج بين عامة ومتخصصة

## مخطط JSON المطلوب:
{
  "title_best": "العنوان الأفضل",
  "title_alternatives": ["عنوان 1", "عنوان 2", "عنوان 3", "عنوان 4", "عنوان 5"],
  "thumbnail_text_options": ["خيار 1", "خيار 2", "خيار 3", "خيار 4", "خيار 5"],
  "youtube_description": "الوصف الكامل...",
  "seo_keywords": ["كلمة1", "كلمة2", ...],
  "hashtags": ["هاشتاق1", "هاشتاق2", ...]
}`,
        },
        {
          role: "user",
          content: `عنوان الفيديو الحالي: ${videoTitle}
القناة: ${channelTitle}

نص الحلقة:
${preparedText}`,
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { success: false, error: "لم يتم الحصول على استجابة من OpenAI" }
    }

    const parsed = JSON.parse(content) as StudioPackageResult

    // Validate required fields exist
    if (!parsed.title_best || !parsed.youtube_description) {
      return { success: false, error: "استجابة OpenAI غير مكتملة" }
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
        model: response.model,
        usage: response.usage,
        response_id: response.id,
        parsed_content: parsed,
      },
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
 * Format seconds to HH:MM:SS string.
 */
function formatSecondsToTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

/**
 * Parse HH:MM:SS or MM:SS to total seconds.
 */
function parseTimestampToSeconds(ts: string): number {
  const parts = ts.split(":").map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

/**
 * Generate YouTube chapters from transcript + video duration.
 */
export async function generateStudioChapters(
  transcript: string,
  videoTitle: string,
  durationSeconds: number | null
): Promise<{ success: boolean; data?: StudioChaptersResult; raw?: Record<string, unknown>; error?: string }> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  const durationStr = durationSeconds
    ? formatSecondsToTimestamp(durationSeconds)
    : "غير معروف"

  try {
    const preparedText = await prepareTranscript(openai, transcript)

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `أنت خبير في إنشاء فصول يوتيوب (YouTube Chapters) لحلقات البودكاست العربي.

## مهمتك:
حلل نص الحلقة وأنشئ 8-20 فصلاً زمنياً يغطي كامل الحلقة.

## قواعد صارمة:
- الإجابة JSON فقط بالمخطط المحدد
- جميع العناوين بالعربية
- أول فصل يبدأ عند 00:00:00 دائماً
- الأوقات بتنسيق HH:MM:SS
- الفصول مرتبة تصاعدياً
${durationSeconds ? `- آخر فصل يجب أن يبدأ قبل المدة الكاملة (${durationStr})` : ""}
${!durationSeconds ? "- قدّر الأوقات بناءً على موقع النص في الحلقة (تقريبي)" : ""}
- العناوين يجب أن تكون جذابة ووصفية (لا عناوين عامة مثل "المقدمة" أو "الخاتمة" إلا إذا لزم)
- كل عنوان يصف القيمة أو الفكرة في هذا الجزء
- عناوين قصيرة: 3-8 كلمات

## مخطط JSON المطلوب:
{
  "chapters": [
    { "start_time": "00:00:00", "title": "عنوان الفصل" },
    { "start_time": "00:03:42", "title": "..." }
  ]
}`,
        },
        {
          role: "user",
          content: `عنوان الحلقة: ${videoTitle}
المدة الكاملة: ${durationStr}

نص الحلقة:
${preparedText}`,
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { success: false, error: "لم يتم الحصول على استجابة من OpenAI" }
    }

    const parsed = JSON.parse(content) as { chapters: StudioChapterItem[] }
    if (!Array.isArray(parsed.chapters) || parsed.chapters.length === 0) {
      return { success: false, error: "لم يتم توليد أي فصول" }
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

    return {
      success: true,
      data: { chapters },
      raw: { model: response.model, usage: response.usage, response_id: response.id },
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
 */
export async function generateStudioClips(
  transcript: string,
  videoTitle: string,
  durationSeconds: number | null
): Promise<{ success: boolean; data?: StudioClipsResult; raw?: Record<string, unknown>; error?: string }> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  const durationStr = durationSeconds
    ? formatSecondsToTimestamp(durationSeconds)
    : "غير معروف"

  try {
    const preparedText = await prepareTranscript(openai, transcript)

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `أنت خبير في إنشاء محتوى قصير فيروسي (Shorts/Reels/TikTok/X) من حلقات البودكاست العربي.

## مهمتك:
حلل نص الحلقة واقترح 10-20 مقطع قصير يصلح للنشر كمحتوى مستقل على المنصات المختلفة.

## معايير اختيار المقاطع:
- خطاف عاطفي قوي (مفاجأة، تناقض، رأي جريء)
- بصيرة أو رؤية مفاجئة
- نصيحة عملية واضحة
- قصة شخصية مؤثرة
- لحظة فكاهية أو إنسانية
- مدة المقطع: 30-90 ثانية

## قواعد صارمة:
- الإجابة JSON فقط
- جميع النصوص بالعربية
- الأوقات بتنسيق HH:MM:SS
- start_time < end_time دائماً
${durationSeconds ? `- end_time لا يتجاوز المدة الكاملة (${durationStr})` : ""}
${!durationSeconds ? "- قدّر الأوقات تقريبياً بناءً على موقع النص" : ""}
- المنصة: "YouTube Shorts" أو "IG Reels" أو "TikTok" أو "X"
- hook_text: أول جملة تفتح بها المقطع (تجذب الانتباه فوراً)
- caption: وصف قصير للمنشور (1-2 جملة)
- why_it_works: سبب واحد لنجاح هذا المقطع

## مخطط JSON المطلوب:
{
  "clips": [
    {
      "start_time": "00:05:30",
      "end_time": "00:06:45",
      "platform": "YouTube Shorts",
      "hook_text": "الجملة الافتتاحية...",
      "caption": "الوصف القصير...",
      "why_it_works": "سبب النجاح..."
    }
  ]
}`,
        },
        {
          role: "user",
          content: `عنوان الحلقة: ${videoTitle}
المدة الكاملة: ${durationStr}

نص الحلقة:
${preparedText}`,
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { success: false, error: "لم يتم الحصول على استجابة من OpenAI" }
    }

    const parsed = JSON.parse(content) as { clips: StudioClipItem[] }
    if (!Array.isArray(parsed.clips) || parsed.clips.length === 0) {
      return { success: false, error: "لم يتم توليد أي مقاطع" }
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
      raw: { model: response.model, usage: response.usage, response_id: response.id },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء توليد المقاطع"
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Studio: Generate Website Package (summary, takeaways, quotes, etc.)
// ---------------------------------------------------------------------------

export interface WebsitePackageResult {
  hero_summary: string
  full_summary: string
  takeaways: string[]
  quotes: WebsiteQuoteItem[]
  topics: string[]
  resources: WebsiteResourceItem[]
  timestamps: WebsiteTimestampItem[]
  guest_name: string | null
  guest_bio: string | null
}

export async function generateWebsitePackage(
  transcript: string,
  videoTitle: string,
  durationSeconds: number | null
): Promise<{ success: boolean; data?: WebsitePackageResult; raw?: Record<string, unknown>; error?: string }> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const preparedText = await prepareTranscript(openai, transcript)

    const durationMin = durationSeconds ? Math.round(durationSeconds / 60) : null

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `أنت محرر محتوى متخصص في إعداد صفحات حلقات البودكاست العربية لموقع إلكتروني.

ستحلل نص حلقة بودكاست وتنتج حزمة محتوى شاملة لعرضها في صفحة الحلقة على الموقع.

## قواعد صارمة:
- جميع المخرجات باللغة العربية
- لا تستخدم Markdown — فقط نص عادي
- الإجابة JSON فقط بالمخطط المحدد أدناه
- استخدم النص المقدم كمصدر وحيد للحقائق — لا تختلق معلومات أو روابط

## المطلوب:

### 1. ملخص قصير (hero_summary)
- جملتان أو ثلاث تصف جوهر الحلقة
- يظهر في أعلى صفحة الحلقة كبطاقة تعريفية
- أقل من 200 حرف

### 2. ملخص شامل (full_summary)
- 3-5 فقرات تلخص محتوى الحلقة بالتفصيل
- يتضمن أبرز المحاور والأفكار الرئيسية
- أسلوب سردي جذاب ومناسب للقراءة

### 3. أبرز الأفكار (takeaways)
- 5-10 نقاط مفتاحية يخرج بها المستمع من الحلقة
- كل نقطة جملة واحدة واضحة ومباشرة
- ابدأ كل نقطة بفعل أو فكرة قوية

### 4. اقتباسات مميزة (quotes)
- 8-12 اقتباس قوي ومؤثر من الحلقة
- كل اقتباس يتضمن: text (النص)، theme (التصنيف الموضوعي بكلمة أو كلمتين)، speaker ("guest" أو "host" أو null)
- اختر الجمل الأكثر تأثيراً وإلهاماً

### 5. المواضيع (topics)
- 3-7 كلمات مفتاحية تصف مواضيع الحلقة
- مثال: "تطوير الذات"، "ريادة الأعمال"، "الصحة النفسية"

### 6. المصادر والمراجع (resources)
- استخرج أي كتب أو مراجع أو أدوات أو أشخاص مذكورين في الحلقة
- كل مصدر: title (الاسم)، url (رابط إن أمكن تخمينه وإلا "")، type ("كتاب" أو "شخصية" أو "أداة" أو "مقال" أو null)
- إذا لم تُذكر مصادر واضحة، أعد مصفوفة فارغة

### 7. الطوابع الزمنية (timestamps)
- 8-15 نقطة زمنية تغطي أهم محاور الحلقة
- كل نقطة: time_seconds (الوقت بالثواني)، title (عنوان قصير)، description (وصف مختصر أو null)
${durationMin ? `- المدة الكاملة: ~${durationMin} دقيقة — وزّع النقاط بتناسب` : "- قدّر الأوقات تقريبياً بناءً على موقع النص"}
- أول نقطة تبدأ عند 0 ثانية

### 8. الضيف (guest_name و guest_bio)
- استخرج الاسم الكامل لضيف الحلقة من النص أو العنوان
- لا تذكر اسم المقدّم/المحاور — فقط الضيف
- إذا كان هناك أكثر من ضيف، اختر الضيف الرئيسي
- guest_bio: نبذة قصيرة عن الضيف (جملة أو جملتان) مستخلصة من النص
- إذا لم يكن هناك ضيف واضح، أعد null لكلا الحقلين

## مخطط JSON المطلوب:
{
  "hero_summary": "ملخص قصير...",
  "full_summary": "ملخص شامل...",
  "takeaways": ["نقطة 1", "نقطة 2", ...],
  "quotes": [{"text": "نص الاقتباس", "theme": "التصنيف", "speaker": "guest"}, ...],
  "topics": ["موضوع 1", "موضوع 2", ...],
  "resources": [{"title": "اسم المصدر", "url": "", "type": "كتاب"}, ...],
  "timestamps": [{"time_seconds": 0, "title": "المقدمة", "description": null}, ...],
  "guest_name": "الاسم الكامل للضيف (string) أو null إذا لم يوجد ضيف — لا تكتب كلمة null كنص، استخدم JSON null",
  "guest_bio": "نبذة قصيرة عن الضيف (string) أو null — لا تكتب كلمة null كنص، استخدم JSON null"
}`,
        },
        {
          role: "user",
          content: `عنوان الحلقة: ${videoTitle}
${durationMin ? `المدة: ~${durationMin} دقيقة` : ""}

نص الحلقة:
${preparedText}`,
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { success: false, error: "لم يتم الحصول على استجابة من OpenAI" }
    }

    const parsed = JSON.parse(content) as WebsitePackageResult

    // Validate required fields
    if (!parsed.hero_summary || !parsed.full_summary) {
      return { success: false, error: "استجابة OpenAI غير مكتملة" }
    }

    return {
      success: true,
      data: {
        hero_summary: parsed.hero_summary,
        full_summary: parsed.full_summary,
        takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways : [],
        quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
        topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        resources: Array.isArray(parsed.resources) ? parsed.resources : [],
        timestamps: Array.isArray(parsed.timestamps)
          ? parsed.timestamps
              .filter((t) => typeof t.time_seconds === "number" && t.title)
              .sort((a, b) => a.time_seconds - b.time_seconds)
          : [],
        guest_name: typeof parsed.guest_name === "string" && parsed.guest_name.toLowerCase() !== "null" && parsed.guest_name.trim() ? parsed.guest_name : null,
        guest_bio: typeof parsed.guest_bio === "string" && parsed.guest_bio.toLowerCase() !== "null" && parsed.guest_bio.trim() ? parsed.guest_bio : null,
      },
      raw: { model: response.model, usage: response.usage, response_id: response.id },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء توليد حزمة الموقع"
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Studio: Post-Publish YouTube Performance Analyzer
// ---------------------------------------------------------------------------

export interface YouTubeVideoStats {
  title: string
  description: string
  publishDate: string
  duration: string
  viewCount: string
  likeCount: string
  commentCount: string
}

export const ANALYZER_PROMPT_VERSION = "v1"

/**
 * Analyze a published YouTube episode's performance and generate
 * actionable improvement suggestions.
 */
export async function generateStudioAnalysis(
  transcript: string,
  stats: YouTubeVideoStats
): Promise<{ success: boolean; data?: StudioAnalyzerData; raw?: Record<string, unknown>; error?: string }> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const preparedText = await prepareTranscript(openai, transcript)

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `أنت محلل أداء محتوى يوتيوب متخصص في البودكاست العربي.

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
}`,
        },
        {
          role: "user",
          content: `## إحصائيات الفيديو:
- العنوان الحالي: ${stats.title}
- تاريخ النشر: ${stats.publishDate}
- المدة: ${stats.duration}
- المشاهدات: ${stats.viewCount}
- الإعجابات: ${stats.likeCount}
- التعليقات: ${stats.commentCount}

## الوصف الحالي:
${stats.description || "(لا يوجد وصف)"}

## نص الحلقة:
${preparedText}`,
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { success: false, error: "لم يتم الحصول على استجابة من OpenAI" }
    }

    const parsed = JSON.parse(content) as StudioAnalyzerData

    if (!parsed.diagnosis || !parsed.improvements) {
      return { success: false, error: "استجابة OpenAI غير مكتملة" }
    }

    // Ensure clips have used: false
    const clips = Array.isArray(parsed.clips)
      ? parsed.clips.map((c) => ({ ...c, used: false }))
      : []

    return {
      success: true,
      data: {
        diagnosis: parsed.diagnosis,
        improvements: {
          alt_titles: Array.isArray(parsed.improvements.alt_titles) ? parsed.improvements.alt_titles : [],
          optimized_description: parsed.improvements.optimized_description || "",
          chapters: parsed.improvements.chapters || "",
          pinned_comment: parsed.improvements.pinned_comment || "",
          thumbnail_concepts: Array.isArray(parsed.improvements.thumbnail_concepts) ? parsed.improvements.thumbnail_concepts : [],
        },
        revival: {
          steps: Array.isArray(parsed.revival?.steps)
            ? parsed.revival.steps.sort((a, b) => a.order - b.order)
            : [],
        },
        clips,
      },
      raw: { model: response.model, usage: response.usage, response_id: response.id },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء تحليل الأداء"
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Studio: Process Transcript into readable article, summary & quotes
// ---------------------------------------------------------------------------

export interface TranscriptProcessingResult {
  clean_article: string
  summary: StudioTranscriptSummary
  quotes: StudioTranscriptQuote[]
}

/**
 * Process a raw/clean transcript into a readable article, structured summary,
 * and extracted impactful quotes — all in a single GPT call.
 */
export async function processTranscript(
  rawText: string,
  videoTitle: string
): Promise<{ success: boolean; data?: TranscriptProcessingResult; error?: string }> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const preparedText = await prepareTranscript(openai, rawText)

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `أنت محرر محتوى عربي محترف متخصص في تحويل نصوص البودكاست الخام إلى محتوى مقروء وجاهز للنشر.

ستتلقى نص حلقة بودكاست خام (من ترجمة تلقائية أو تفريغ صوتي). النص قد يحتوي على أخطاء إملائية وعلامات ترقيم مفقودة وجمل مبتورة.

## مهمتك — أنتج 3 مخرجات:

### 1. مقال مقروء (clean_article)
- أعد كتابة النص كمقال مقروء ومتسلسل باللغة العربية الفصحى السهلة
- قسّم النص إلى فقرات منطقية (كل فقرة 3-5 جمل)
- أضف علامات الترقيم الصحيحة
- صحّح الأخطاء الإملائية والنحوية
- حافظ على المعنى الأصلي والأفكار كما وردت — لا تحذف محتوى ولا تضف معلومات جديدة
- افصل بين الفقرات بسطر فارغ
- لا تستخدم Markdown أو عناوين فرعية — فقط نص عادي مقسّم إلى فقرات
- يجب أن يكون المقال شاملاً ويغطي كل محاور الحلقة

### 2. ملخص مُهيكل (summary)
- **overview**: فقرة واحدة (3-5 جمل) تلخص جوهر الحلقة
- **key_ideas**: 5-8 أفكار رئيسية — كل فكرة جملة واحدة واضحة ومباشرة
- **lessons**: 3-5 دروس عملية يمكن للمستمع تطبيقها — كل درس جملة واحدة

### 3. اقتباسات مؤثرة (quotes)
- 8-15 اقتباس قوي ومؤثر من الحلقة
- كل اقتباس: text (النص الحرفي أو شبه الحرفي) و theme (تصنيف بكلمة أو كلمتين)
- ركّز على: الحكم، التجارب الشخصية، الآراء الجريئة، النصائح العملية

## مخطط JSON المطلوب:
{
  "clean_article": "الفقرة الأولى...\\n\\nالفقرة الثانية...\\n\\nالفقرة الثالثة...",
  "summary": {
    "overview": "ملخص عام...",
    "key_ideas": ["فكرة 1", "فكرة 2", ...],
    "lessons": ["درس 1", "درس 2", ...]
  },
  "quotes": [
    { "text": "نص الاقتباس", "theme": "التصنيف" }
  ]
}`,
        },
        {
          role: "user",
          content: `عنوان الحلقة: ${videoTitle}

نص الحلقة الخام:
${preparedText}`,
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { success: false, error: "لم يتم الحصول على استجابة من OpenAI" }
    }

    const parsed = JSON.parse(content) as TranscriptProcessingResult

    if (!parsed.clean_article || !parsed.summary) {
      return { success: false, error: "استجابة OpenAI غير مكتملة" }
    }

    return {
      success: true,
      data: {
        clean_article: parsed.clean_article,
        summary: {
          overview: parsed.summary.overview || "",
          key_ideas: Array.isArray(parsed.summary.key_ideas) ? parsed.summary.key_ideas : [],
          lessons: Array.isArray(parsed.summary.lessons) ? parsed.summary.lessons : [],
        },
        quotes: Array.isArray(parsed.quotes)
          ? parsed.quotes.filter((q) => q.text && q.theme)
          : [],
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء معالجة النص"
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Studio: Suggest Best 30-Second Intro for Audio Episodes
// ---------------------------------------------------------------------------

export interface BestIntroResult {
  start_seconds: number
  end_seconds: number
  reason: string
  transcript_excerpt: string
}

/**
 * Analyze a transcript and suggest the best ~30-second segment to use as
 * the episode opening. Looks for the most compelling, hook-worthy portion.
 */
export async function suggestBestIntro(
  transcript: string,
  videoTitle: string,
  durationSeconds: number | null
): Promise<{ success: boolean; data?: BestIntroResult; error?: string }> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const preparedText = await prepareTranscript(openai, transcript)
    const durationMin = durationSeconds ? Math.round(durationSeconds / 60) : null

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `أنت خبير في إنتاج البودكاست العربي ومتخصص في اختيار المقاطع الافتتاحية الجذابة.

## مهمتك:
حلل نص حلقة بودكاست واقترح أفضل مقطع مدته ~30 ثانية يمكن استخدامه كافتتاحية (تيزر) للحلقة.

## معايير الاختيار:
- يثير فضول المستمع فوراً ويجعله يريد سماع الحلقة كاملة
- يحتوي على فكرة مفاجئة، رأي جريء، سؤال محفز، أو قصة مشوقة
- مفهوم بدون سياق — يعمل كمقطع مستقل
- عاطفي أو فكري — يحرك شعوراً أو يطرح تساؤلاً
- ليس من أول 60 ثانية (المقدمة عادة عامة وغير جذابة)

## قواعد:
- الإجابة JSON فقط
- start_seconds و end_seconds بالثواني (الفرق ~30 ثانية)
${durationSeconds ? `- لا يتجاوز end_seconds المدة الكاملة (${durationSeconds} ثانية)` : "- قدّر الأوقات تقريبياً من موقع النص"}
- reason: جملتان تشرحان لماذا هذا المقطع هو الأفضل
- transcript_excerpt: النص الحرفي للمقطع المقترح (3-5 جمل)

## مخطط JSON:
{
  "start_seconds": 180,
  "end_seconds": 210,
  "reason": "سبب الاختيار...",
  "transcript_excerpt": "النص المقتبس..."
}`,
        },
        {
          role: "user",
          content: `عنوان الحلقة: ${videoTitle}
${durationMin ? `المدة: ~${durationMin} دقيقة` : ""}

نص الحلقة:
${preparedText}`,
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { success: false, error: "لم يتم الحصول على استجابة من OpenAI" }
    }

    const parsed = JSON.parse(content) as BestIntroResult

    if (typeof parsed.start_seconds !== "number" || typeof parsed.end_seconds !== "number") {
      return { success: false, error: "استجابة OpenAI غير مكتملة" }
    }

    return {
      success: true,
      data: {
        start_seconds: Math.max(0, Math.round(parsed.start_seconds)),
        end_seconds: Math.round(parsed.end_seconds),
        reason: parsed.reason || "",
        transcript_excerpt: parsed.transcript_excerpt || "",
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء تحليل الافتتاحية"
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Studio: Generate Audio Edit/Cut Suggestions
// ---------------------------------------------------------------------------

export interface EditSuggestionsResult {
  suggestions: AudioEditSuggestion[]
  total_cut_seconds: number
}

/**
 * Analyze a podcast transcript and suggest segments that should be
 * edited out: long pauses, repetitive talk, off-topic rambling, filler.
 */
export async function generateEditSuggestions(
  transcript: string,
  videoTitle: string,
  durationSeconds: number | null
): Promise<{ success: boolean; data?: EditSuggestionsResult; error?: string }> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const preparedText = await prepareTranscript(openai, transcript)
    const durationMin = durationSeconds ? Math.round(durationSeconds / 60) : null

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `أنت مهندس صوت محترف ومحرر بودكاست عربي متخصص في تحسين جودة الحلقات بعد التسجيل.

## مهمتك:
حلل نص حلقة بودكاست واقترح المقاطع التي يجب حذفها أو قصها أثناء المونتاج لتحسين جودة الحلقة.

## أنواع المقاطع المطلوب اكتشافها:

### 1. صمت طويل / توقف (long_pause)
- فترات صمت طويلة أو تردد واضح في الكلام
- علامات: "آآآ"، "إممم"، تكرار بدايات جمل بشكل متقطع

### 2. كلام مكرر (repetitive)
- إعادة نفس الفكرة أو الجملة بصياغات مختلفة دون إضافة قيمة جديدة
- تكرار نفس القصة أو المثال

### 3. خارج الموضوع (off_topic)
- استطرادات لا علاقة لها بمحور الحلقة
- أحاديث جانبية أو تعليقات تقنية (مشاكل الصوت، طلب ماء، إلخ)

### 4. حشو وكلام زائد (filler)
- مقدمات طويلة بلا محتوى فعلي
- تكرار عبارات مثل "يعني"، "بشكل عام"، "كما قلت سابقاً" بشكل مفرط
- تلخيصات زائدة عن الحاجة

## قواعد صارمة:
- الإجابة JSON فقط بالمخطط المحدد
- start_seconds و end_seconds بالثواني
- start_seconds < end_seconds دائماً
${durationSeconds ? `- لا يتجاوز end_seconds المدة الكاملة (${durationSeconds} ثانية)` : "- قدّر الأوقات تقريبياً بناءً على موقع النص في الحلقة"}
- reason: جملة واحدة واضحة تشرح سبب الحذف
- category: أحد القيم التالية فقط: "long_pause" | "repetitive" | "off_topic" | "filler" | "other"
- رتّب الاقتراحات تصاعدياً حسب start_seconds
- اقترح فقط المقاطع التي حذفها سيحسّن الحلقة فعلاً — لا تبالغ

## مخطط JSON المطلوب:
{
  "suggestions": [
    {
      "start_seconds": 120,
      "end_seconds": 145,
      "category": "long_pause",
      "reason": "توقف طويل مع تردد وإعادة بداية الجملة عدة مرات"
    }
  ],
  "total_cut_seconds": 180
}`,
        },
        {
          role: "user",
          content: `عنوان الحلقة: ${videoTitle}
${durationMin ? `المدة الكاملة: ~${durationMin} دقيقة` : ""}

نص الحلقة:
${preparedText}`,
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { success: false, error: "لم يتم الحصول على استجابة من OpenAI" }
    }

    const parsed = JSON.parse(content) as EditSuggestionsResult

    if (!Array.isArray(parsed.suggestions)) {
      return { success: false, error: "استجابة OpenAI غير مكتملة" }
    }

    // Validate and clean suggestions
    const validCategories = new Set(["long_pause", "repetitive", "off_topic", "filler", "other"])
    let suggestions = parsed.suggestions
      .filter((s) =>
        typeof s.start_seconds === "number" &&
        typeof s.end_seconds === "number" &&
        s.start_seconds < s.end_seconds &&
        s.reason &&
        validCategories.has(s.category)
      )
      .sort((a, b) => a.start_seconds - b.start_seconds)

    // Validate timestamps don't exceed duration
    if (durationSeconds) {
      suggestions = suggestions.filter((s) => s.end_seconds <= durationSeconds)
    }

    const totalCut = suggestions.reduce((sum, s) => sum + (s.end_seconds - s.start_seconds), 0)

    return {
      success: true,
      data: {
        suggestions,
        total_cut_seconds: totalCut,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء تحليل المقاطع"
    return { success: false, error: msg }
  }
}


// ---------------------------------------------------------------------------
// Auto-detect guests & generate bios (batch)
// ---------------------------------------------------------------------------

export interface GuestDetectionInput {
  episode_id: string
  title: string
  description: string | null
  transcript_snippet: string | null
}

export interface GuestDetectionResult {
  episode_id: string
  guest_name: string | null
  guest_bio: string | null
  confidence: "high" | "medium" | "low"
  needs_review: boolean
}

/**
 * Batch detect guest names and generate bios from episode data.
 * Processes episodes in chunks to stay within token limits.
 * Optionally calls `onChunkProgress` after each chunk completes.
 */
export async function detectGuestsForEpisodes(
  episodes: GuestDetectionInput[],
  onChunkProgress?: (chunkIndex: number, totalChunks: number) => void
): Promise<{ success: boolean; data?: GuestDetectionResult[]; error?: string }> {
  const openai = getClient()

  // Process in chunks of 15 episodes per API call
  const CHUNK_SIZE = 15
  const allResults: GuestDetectionResult[] = []
  const totalChunks = Math.ceil(episodes.length / CHUNK_SIZE)

  for (let i = 0; i < episodes.length; i += CHUNK_SIZE) {
    const chunkIndex = Math.floor(i / CHUNK_SIZE)
    const chunk = episodes.slice(i, i + CHUNK_SIZE)

    const episodesData = chunk.map((ep) => ({
      episode_id: ep.episode_id,
      title: ep.title,
      description: (ep.description || "").slice(0, 500),
      transcript_snippet: (ep.transcript_snippet || "").slice(0, 800) || undefined,
    }))

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `أنت محلل بودكاست عربي. مهمتك استخراج اسم الضيف من بيانات الحلقة وكتابة نبذة مختصرة عنه.

المصادر المتاحة لكل حلقة:
- العنوان (title): أهم مصدر — غالباً يذكر اسم الضيف
- الوصف (description): قد يحتوي معلومات إضافية عن الضيف
- مقتطف النص (transcript_snippet): أول 800 حرف من نص الحلقة — قد يكشف اسم الضيف أو تعريفه

القواعد:
- استخرج اسم الضيف الحقيقي الكامل (ليس لقب أو كنية فقط)
- اكتب نبذة مختصرة (2-4 أسطر) بالعربية تصف من هو الضيف ومجاله
- استخدم المقتطف النصي لتحسين النبذة إذا توفر
- إذا كانت الحلقة لا تحتوي على ضيف (مونولوج/المقدم فقط) ضع guest_name: null
- إذا لم تكن متأكداً من الاسم أو هوية الضيف (ثقة أقل من 80%) ضع needs_review: true
- الثقة: "high" = متأكد جداً (الاسم واضح في العنوان)، "medium" = محتمل جداً، "low" = غير متأكد

أنماط شائعة في عناوين البودكاست العربي:
- "مع [اسم الضيف]"
- "[اسم الضيف] |"
- "[اسم الضيف] -"

أرجع النتائج بصيغة JSON:
{
  "results": [
    {
      "episode_id": "...",
      "guest_name": "الاسم الكامل" أو null,
      "guest_bio": "نبذة مختصرة" أو null,
      "confidence": "high" | "medium" | "low",
      "needs_review": true | false
    }
  ]
}`,
          },
          {
            role: "user",
            content: JSON.stringify(episodesData),
          },
        ],
      })

      const raw = completion.choices[0]?.message?.content
      if (!raw) continue

      const parsed = JSON.parse(raw) as { results: GuestDetectionResult[] }
      if (Array.isArray(parsed.results)) {
        allResults.push(...parsed.results)
      }
    } catch (error) {
      console.error(`Guest detection chunk error (offset ${i}):`, error)
      // Mark failed chunk episodes as needs_review
      for (const ep of chunk) {
        allResults.push({
          episode_id: ep.episode_id,
          guest_name: null,
          guest_bio: null,
          confidence: "low",
          needs_review: true,
        })
      }
    }

    onChunkProgress?.(chunkIndex, totalChunks)
  }

  return { success: true, data: allResults }
}

// ---------------------------------------------------------------------------
// Newsletter: AI-generated monthly newsletter content
// ---------------------------------------------------------------------------

export async function generateNewsletterContent(params: {
  monthName: string
  year: number
  featured: { title: string; slug: string; thumbnail_url: string | null; guest: { name: string; photo_url: string | null } | null }
  quotes: { text: string; theme: string | null }[]
  otherEpisodes: { title: string; slug: string; thumbnail_url: string | null; guest: { name: string } | null }[]
  appUrl: string
}): Promise<{ success: boolean; data?: { subject: string; body: string }; error?: string }> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  const { monthName, year, featured, quotes, otherEpisodes, appUrl } = params

  const episodeDataBlock = JSON.stringify({
    featured: {
      title: featured.title,
      slug: featured.slug,
      thumbnail_url: featured.thumbnail_url,
      guest: featured.guest,
      link: `${appUrl}/episodes/${featured.slug}`,
    },
    quotes: quotes.slice(0, 3),
    otherEpisodes: otherEpisodes.map((ep) => ({
      title: ep.title,
      slug: ep.slug,
      thumbnail_url: ep.thumbnail_url,
      guest: ep.guest,
      link: `${appUrl}/episodes/${ep.slug}`,
    })),
  }, null, 2)

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `أنت مصمم نشرات بريدية محترف لبودكاست عربي اسمه "خط".

## مهمتك:
اكتب نشرة بريدية شهرية بتنسيق HTML جاهز للإرسال عبر البريد الإلكتروني.

## قواعد HTML الصارمة (للتوافق مع عملاء البريد):
- استخدم جداول HTML للتخطيط (<table>) وليس CSS grid أو flexbox
- جميع الأنماط inline فقط (style="...")
- لا تستخدم <style> tags أو CSS خارجي
- الاتجاه RTL: dir="rtl" على الجدول الرئيسي
- أقصى عرض: 600px للجدول الرئيسي مع margin: 0 auto
- الخطوط: font-family: 'Segoe UI', Tahoma, Arial, sans-serif

## ألوان الثيم الداكن:
- خلفية الصفحة: #0a0a0a
- خلفية المحتوى: #141414
- خلفية البطاقات: #1a1a1a
- نص رئيسي: #e5e5e5
- نص ثانوي: #a3a3a3
- حدود: #525252
- نص باهت: #737373

## البنية المطلوبة:
1. **هيدر**: شعار خط + عنوان النشرة (نشرة خط — {الشهر} {السنة})
2. **الحلقة المميزة**: صورة مصغرة (إذا متوفرة كـ <img>)، عنوان الحلقة، اسم الضيف (إذا متوفر)، زر "استمع الآن" يوجه للرابط
3. **اقتباسات مميزة**: 1-3 اقتباسات في صناديق مميزة بخلفية مختلفة قليلاً
4. **حلقات أخرى**: قائمة بباقي حلقات الشهر (إذا وُجدت) مع روابط
5. **فوتر**: رسالة ودية + رابط إلغاء الاشتراك (استخدم {{unsubscribe_url}} كـ placeholder)

## تعليمات:
- اجعل النشرة مختصرة وجذابة — لا تكتب فقرات طويلة
- أضف personality عربية دافئة
- أزرار CTA: خلفية بيضاء (#e5e5e5) مع نص داكن (#0a0a0a)، padding مناسب، border-radius
- الصور تظهر فقط إذا كان الرابط موجوداً (ليس null)
- لا تضف صور من عندك — استخدم فقط الروابط المقدمة

## مخطط JSON المطلوب:
{
  "subject": "نشرة خط — {الشهر} {السنة}",
  "body": "<table>...HTML الكامل...</table>"
}`,
        },
        {
          role: "user",
          content: `الشهر: ${monthName} ${year}

بيانات الحلقات:
${episodeDataBlock}`,
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { success: false, error: "لم يتم الحصول على استجابة من OpenAI" }
    }

    const parsed = JSON.parse(content) as { subject: string; body: string }
    if (!parsed.subject || !parsed.body) {
      return { success: false, error: "استجابة OpenAI غير مكتملة" }
    }

    return {
      success: true,
      data: {
        subject: parsed.subject || `نشرة خط — ${monthName} ${year}`,
        body: parsed.body,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء إنشاء النشرة"
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Home Page AI Analysis — Batch analyze episodes for topic/theme extraction
// ---------------------------------------------------------------------------

import type { EmotionalPathSlug } from "@/lib/episode-knowledge"

export interface HomeAnalysisInput {
  episode_id: string
  title: string
  slug: string
  season: number | null
  guest_name: string | null
  description: string | null
  enrichment_summary: string | null
  enrichment_takeaways: string[] | null
  enrichment_topics: string[] | null
  transcript_snippet: string | null
}

export interface HomeAnalysisResult {
  episode_id: string
  main_topic: string
  secondary_topics: string[]
  emotional_path: EmotionalPathSlug
  keywords: string[]
  mood: string
  best_quote: {
    text: string
    attribution: string
    theme: string
  }
  reflection: {
    short_quote: string
    reflection_text: string
    thinking_question: string
  }
}

/**
 * Batch analyze episodes for home page content generation.
 * Extracts topics, themes, emotional paths, quotes, and reflections.
 * Processes in chunks of 5 episodes per API call.
 */
export async function analyzeEpisodesForHome(
  episodes: HomeAnalysisInput[],
  onChunkProgress?: (chunkIndex: number, totalChunks: number) => void
): Promise<{ success: boolean; data?: HomeAnalysisResult[]; error?: string }> {
  const openai = getClient()

  const CHUNK_SIZE = 5
  const allResults: HomeAnalysisResult[] = []
  const totalChunks = Math.ceil(episodes.length / CHUNK_SIZE)

  for (let i = 0; i < episodes.length; i += CHUNK_SIZE) {
    const chunkIndex = Math.floor(i / CHUNK_SIZE)
    const chunk = episodes.slice(i, i + CHUNK_SIZE)

    const episodesData = chunk.map((ep) => ({
      episode_id: ep.episode_id,
      title: ep.title,
      guest_name: ep.guest_name,
      description: (ep.description || "").slice(0, 600),
      summary: ep.enrichment_summary || undefined,
      takeaways: ep.enrichment_takeaways || undefined,
      existing_topics: ep.enrichment_topics || undefined,
      transcript_snippet: (ep.transcript_snippet || "").slice(0, 600) || undefined,
    }))

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `أنت محلل محتوى بودكاست عربي متخصص في استخراج المواضيع والعلاقات بين الحلقات.

ستحلل مجموعة حلقات من بودكاست عربي وتستخرج لكل حلقة:

## المطلوب لكل حلقة:

### 1. الموضوع الرئيسي (main_topic)
- كلمة أو عبارة قصيرة (2-4 كلمات) تصف الموضوع الأساسي
- مثال: "ريادة الأعمال"، "الصحة النفسية"، "الهجرة والهوية"

### 2. مواضيع ثانوية (secondary_topics)
- حتى 3 مواضيع فرعية تُكمل الموضوع الرئيسي
- مختلفة عن الموضوع الرئيسي

### 3. المسار العاطفي (emotional_path)
اختر واحداً من:
- "understanding-people": حلقات عن العلاقات والتواصل والتعاطف وفهم الآخرين
- "motivation-work": حلقات عن الطموح والإنجاز والعمل والنجاح المهني
- "faith-meaning": حلقات عن الروحانيات والهدف والقيم والإيمان والمعنى
- "self-awareness": حلقات عن النمو الشخصي والتأمل الذاتي والوعي

### 4. كلمات مفتاحية (keywords)
- 5-8 كلمات/عبارات مفتاحية للبحث والربط

### 5. المزاج (mood)
- كلمة واحدة تصف الطابع العاطفي: تحفيزي، تأملي، ملهم، عاطفي، فكري، حواري، تعليمي

### 6. اقتباس مميز (best_quote)
- اكتب اقتباساً قوياً يمثل جوهر الحلقة (يمكن أن يكون مستوحى من المحتوى وليس حرفياً)
- text: نص الاقتباس (جملة أو جملتين، أقل من 150 حرف)
- attribution: اسم الضيف إذا وُجد، وإلا "بودكاست خط"
- theme: تصنيف الاقتباس بكلمة أو كلمتين

### 7. تأمل يومي (reflection)
- short_quote: جملة ملهمة قصيرة مستوحاة من الحلقة (أقل من 80 حرف)
- reflection_text: فقرة تأملية (2-3 جمل) تدعو للتفكير حول موضوع الحلقة
- thinking_question: سؤال واحد يحفز المستمع على التفكير

## قواعد:
- جميع المخرجات بالعربية
- الإجابة JSON فقط
- استخدم المعلومات المقدمة فقط — لا تختلق حقائق
- الاقتباسات والتأملات يجب أن تكون مؤثرة وجذابة

## مخطط JSON:
{
  "results": [
    {
      "episode_id": "...",
      "main_topic": "...",
      "secondary_topics": ["...", "...", "..."],
      "emotional_path": "understanding-people",
      "keywords": ["...", "..."],
      "mood": "...",
      "best_quote": { "text": "...", "attribution": "...", "theme": "..." },
      "reflection": { "short_quote": "...", "reflection_text": "...", "thinking_question": "..." }
    }
  ]
}`,
          },
          {
            role: "user",
            content: JSON.stringify(episodesData, null, 2),
          },
        ],
      })

      const raw = completion.choices[0]?.message?.content
      if (!raw) continue

      const parsed = JSON.parse(raw) as { results: HomeAnalysisResult[] }
      if (Array.isArray(parsed.results)) {
        allResults.push(...parsed.results)
      }
    } catch (error) {
      console.error(`Home analysis chunk error (offset ${i}):`, error)
      // Skip failed chunks — don't add empty results
    }

    onChunkProgress?.(chunkIndex, totalChunks)
  }

  if (allResults.length === 0) {
    return { success: false, error: "لم يتم الحصول على أي نتائج من التحليل" }
  }

  return { success: true, data: allResults }
}

// ---------------------------------------------------------------------------
// AI-Curated Resources
// ---------------------------------------------------------------------------

export interface CuratedResourceSuggestion {
  title: string
  author: string
  description: string
  url: string
  type: "book" | "article" | "link"
  topic: string
  reasoning: string
}

export async function generateCuratedResources(
  topics: { name: string; description?: string | null }[],
  existingTitles: string[]
): Promise<{ success: boolean; data?: CuratedResourceSuggestion[]; error?: string }> {
  let openai: OpenAI
  try {
    openai = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  const topicsBlock = topics
    .map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}`)
    .join("\n")

  const existingBlock =
    existingTitles.length > 0
      ? `\n\nالموارد الموجودة بالفعل (لا تكررها):\n${existingTitles.join("\n")}`
      : ""

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `أنت أمين محتوى ذكي ومبدع متخصص في اختيار موارد عربية أصيلة لبودكاست كويتي يُدعى "خط".
البودكاست يقدّم محادثات عميقة وإنسانية حول الحياة، العلاقات، التطوير الذاتي، والثقافة.

## مهمتك:
اقترح 10-15 مورداً (كتب، مقالات، روابط) ذات صلة بمواضيع البودكاست المقدمة.
يجب أن تكون الموارد جذابة، مثيرة للفضول، وقادرة على شد انتباه الزائر من أول نظرة.

## قواعد صارمة — الروابط:
- كل رابط URL يجب أن يكون حقيقياً وموجوداً فعلاً على الإنترنت
- لا تختلق روابط أو تستخدم example.com أو أرقام عشوائية
- استخدم فقط مواقع معروفة وموثوقة يمكن التحقق منها
- جميع الموارد يجب أن تكون مجانية الوصول (لا مصادر مدفوعة أو تحتاج اشتراك)

## قواعد صارمة — المحتوى:
- جميع المخرجات باللغة العربية
- الكتب يجب أن تكون عربية التأليف أو مترجمة للعربية ومتاحة مجاناً
- لا تقترح كتباً إنجليزية
- المقالات من صحف ومنصات عربية حقيقية وموثوقة
- لا تكرر موارد موجودة بالفعل
- الإجابة JSON فقط

## مصادر المقالات المعتمدة (استخدم روابط حقيقية من هذه المواقع):
### صحف كويتية:
- القبس (alqabas.com)، الراي (alrai.com)، الأنباء (alanba.com.kw)، الجريدة (aljarida.com)

### صحف خليجية وعربية:
- الشرق الأوسط (aawsat.com)، العربي الجديد (alaraby.co.uk)، الجزيرة نت (aljazeera.net)
- هافينغتون بوست عربي (huffpostarabi.com)، بي بي سي عربي (bbc.com/arabic)
- العربية نت (alarabiya.net)، سكاي نيوز عربية (skynewsarabia.com)

### مدونات ومنتديات عربية:
- حسوب (hsoub.com، io.hsoub.com)، عالم حواء، ساسة بوست (sasapost.com)
- إضاءات (ida2at.com)، مدونات الجزيرة (blogs.aljazeera.net)
- أراجيك (arageek.com)، نون بوست (noonpost.com)

### مصادر الكتب المجانية:
- هنداوي (hindawi.org) — كتب مجانية بالكامل
- مؤسسة محمد بن راشد للمعرفة (mbrf.ae)
- أبجد (abjjad.com) — كتب عربية مع ملخصات
- ويكي مصدر العربية (ar.wikisource.org)
- مكتبة نور (noor-book.com)

## أسلوب الوصف:
- اكتب الوصف بأسلوب يثير الفضول ويشد القارئ
- ابدأ بسؤال أو عبارة مفاجئة أو فكرة مضادة للتوقعات
- لا تكتب أوصافاً جافة — اجعل القارئ يشعر أنه يجب أن يقرأ هذا المورد الآن
- مثال جيد: "هل تساءلت لماذا نكرر نفس الأخطاء في علاقاتنا؟ هذا الكتاب يكشف الأنماط الخفية التي تتحكم بقراراتنا العاطفية"
- مثال سيئ: "كتاب يتحدث عن العلاقات الإنسانية وكيفية تحسينها"

## أنواع الموارد:
- "book": كتب عربية مجانية (من هنداوي، ويكي مصدر، مكتبة نور، إلخ)
- "article": مقالات من صحف ومدونات عربية حقيقية (بروابط حقيقية موجودة)
- "link": مواقع وأدوات ومحتوى رقمي عربي مجاني ومفيد

## مخطط JSON المطلوب:
{
  "resources": [
    {
      "title": "عنوان المورد بالعربية",
      "author": "اسم المؤلف أو المصدر",
      "description": "وصف جذاب ومشوّق يثير فضول القارئ (جملتان أو ثلاث)",
      "url": "رابط حقيقي وموجود فعلاً على الإنترنت",
      "type": "book",
      "topic": "اسم الموضوع المرتبط من القائمة",
      "reasoning": "لماذا اخترت هذا المورد تحديداً"
    }
  ]
}`,
        },
        {
          role: "user",
          content: `مواضيع البودكاست:\n${topicsBlock}${existingBlock}`,
        },
      ],
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return { success: false, error: "لم يتم الحصول على استجابة من الذكاء الاصطناعي" }
    }

    const parsed = JSON.parse(content) as { resources: CuratedResourceSuggestion[] }
    if (!Array.isArray(parsed.resources)) {
      return { success: false, error: "استجابة غير صالحة من الذكاء الاصطناعي" }
    }

    return { success: true, data: parsed.resources }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء إنشاء الموارد"
    console.error("generateCuratedResources error:", error)
    return { success: false, error: msg }
  }
}
