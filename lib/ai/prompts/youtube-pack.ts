/**
 * Khat Brain — YouTube-pack prompt builders.
 *
 * Extracted from `lib/ai/youtube-pack.ts` in Phase 2.0 Batch 2. Two
 * prompts: full-pack and per-section. Byte-equivalent to the previous
 * inline prompts.
 */

import type { YouTubePackSection } from "@/types/youtube-pack"

export const YOUTUBE_PACK_FULL_PROMPT_VERSION = "youtube-pack-full-v1.0"
export const YOUTUBE_PACK_SECTION_PROMPT_VERSION = "youtube-pack-section-v1.0"

const TRUNCATION_CHARS = 12_000

const FULL_SYSTEM = `أنت متخصص في تسويق محتوى البودكاست على يوتيوب ومنصات التواصل الاجتماعي.

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
}`

const SECTION_INSTRUCTIONS: Record<YouTubePackSection["type"], string> = {
  titles: "أنتج 3 عناوين مقترحة جذّابة للحلقة على يوتيوب (كل عنوان في سطر منفصل)",
  description: "أنتج وصفاً كاملاً للحلقة لنشره على يوتيوب (3-5 فقرات، يتضمن ملخص الحلقة وأبرز المحاور)",
  timestamps: "أنتج فصولاً زمنية تقريبية بتنسيق (00:00 - العنوان) لأهم محاور الحلقة",
  hashtags: "أنتج 10 هاشتاقات مناسبة (بدون #، مفصولة بمسافات)",
  clips: "أنتج 5 أفكار لمقاطع قصيرة (كل فكرة تتضمن عنوان المقطع ووصف مختصر للمحتوى)",
  tweets: "أنتج 3 تغريدات مقترحة للترويج للحلقة (كل تغريدة أقل من 280 حرف، مفصولة بـ ---)",
}

export interface YoutubePackPromptInput {
  transcript: string
  episodeTitle: string
  guestName: string
}

export interface YoutubePackSectionPromptInput extends YoutubePackPromptInput {
  sectionType: YouTubePackSection["type"]
}

export interface BuiltYoutubePackPrompt {
  system: string
  user: string
  version: string
  input: Record<string, unknown>
}

export function buildYoutubePackFullPrompt(
  input: YoutubePackPromptInput,
): BuiltYoutubePackPrompt {
  const truncated = input.transcript.slice(0, TRUNCATION_CHARS)
  const user = `عنوان الحلقة: ${input.episodeTitle}
اسم الضيف: ${input.guestName}

نص الحلقة:
${truncated}`
  return {
    system: FULL_SYSTEM,
    user,
    version: YOUTUBE_PACK_FULL_PROMPT_VERSION,
    input: {
      episodeTitle: input.episodeTitle,
      guestName: input.guestName,
      transcriptChars: truncated.length,
      transcriptTruncated: input.transcript.length > TRUNCATION_CHARS,
    },
  }
}

export function buildYoutubePackSectionPrompt(
  input: YoutubePackSectionPromptInput,
): BuiltYoutubePackPrompt {
  const truncated = input.transcript.slice(0, TRUNCATION_CHARS)
  const system = `أنت متخصص في تسويق محتوى البودكاست على يوتيوب ومنصات التواصل الاجتماعي.

مهمتك: ${SECTION_INSTRUCTIONS[input.sectionType]}

أعد النتيجة بتنسيق JSON:
{
  "content": "المحتوى المطلوب هنا..."
}`
  const user = `عنوان الحلقة: ${input.episodeTitle}
اسم الضيف: ${input.guestName}

نص الحلقة:
${truncated}`
  return {
    system,
    user,
    version: YOUTUBE_PACK_SECTION_PROMPT_VERSION,
    input: {
      episodeTitle: input.episodeTitle,
      guestName: input.guestName,
      sectionType: input.sectionType,
      transcriptChars: truncated.length,
    },
  }
}
