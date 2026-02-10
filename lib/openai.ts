import OpenAI from "openai"
import type { ConfigQuote, YouTubePackSection } from "@/types/ads"
import type { StudioChapterItem, StudioClipItem, StudioAnalyzerData, WebsiteQuoteItem, WebsiteResourceItem, WebsiteTimestampItem } from "@/types/database"

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
      id: `quote-${Date.now()}-${i}`,
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
      id: `section-${sectionType}-${Date.now()}`,
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

## مخطط JSON المطلوب:
{
  "hero_summary": "ملخص قصير...",
  "full_summary": "ملخص شامل...",
  "takeaways": ["نقطة 1", "نقطة 2", ...],
  "quotes": [{"text": "نص الاقتباس", "theme": "التصنيف", "speaker": "guest"}, ...],
  "topics": ["موضوع 1", "موضوع 2", ...],
  "resources": [{"title": "اسم المصدر", "url": "", "type": "كتاب"}, ...],
  "timestamps": [{"time_seconds": 0, "title": "المقدمة", "description": null}, ...]
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
