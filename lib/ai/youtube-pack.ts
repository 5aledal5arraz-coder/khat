import type { YouTubePackSection } from "@/types/youtube-pack"
// Phase 2.0 Batch 2 — both AI calls now route through runAiTask.
// Prompt bodies live in `lib/ai/prompts/youtube-pack.ts`.
import { runAiTask } from "@/lib/ai-router"
import {
  buildYoutubePackFullPrompt,
  YOUTUBE_PACK_FULL_PROMPT_VERSION,
  buildYoutubePackSectionPrompt,
  YOUTUBE_PACK_SECTION_PROMPT_VERSION,
} from "@/lib/ai/prompts/youtube-pack"

const LEGACY_ACTOR = "system:legacy-callsite"

// ---------------------------------------------------------------------------
// YouTube Pack: Generate full pack or individual sections from transcript
// ---------------------------------------------------------------------------

const SECTION_LABELS: Record<YouTubePackSection["type"], string> = {
  titles: "عناوين مقترحة",
  description: "وصف يوتيوب",
  timestamps: "الفصول الزمنية",
  hashtags: "هاشتاقات",
  clips: "أفكار مقاطع قصيرة",
  tweets: "تغريدات مقترحة",
}

interface EirContext {
  eirId?: string | null
  subjectTable?: string | null
  subjectId?: string | null
  actorId?: string | null
}

export async function generateYoutubePackFromTranscript(
  transcript: string,
  episodeTitle: string,
  guestName: string,
  eirContext?: EirContext,
): Promise<YouTubePackSection[]> {
  const built = buildYoutubePackFullPrompt({ transcript, episodeTitle, guestName })

  const result = await runAiTask<Record<string, string>>({
    taskKind: "structural",
    eirId: eirContext?.eirId ?? null,
    subjectTable: eirContext?.subjectTable ?? "youtube_pack",
    subjectId: eirContext?.subjectId ?? null,
    actorId: eirContext?.actorId ?? LEGACY_ACTOR,
    promptVersion: YOUTUBE_PACK_FULL_PROMPT_VERSION,
    input: built.input,
    prompt: [
      { role: "system", content: built.system },
      { role: "user", content: built.user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.4 },
  })

  if (result.status !== "succeeded" || !result.parsed) return []

  try {
    const parsed = result.parsed
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
  sectionType: YouTubePackSection["type"],
  eirContext?: EirContext,
): Promise<YouTubePackSection | null> {
  const built = buildYoutubePackSectionPrompt({
    transcript,
    episodeTitle,
    guestName,
    sectionType,
  })

  const result = await runAiTask<{ content: string }>({
    taskKind: "structural",
    eirId: eirContext?.eirId ?? null,
    subjectTable: eirContext?.subjectTable ?? "youtube_pack",
    subjectId: eirContext?.subjectId ?? null,
    actorId: eirContext?.actorId ?? LEGACY_ACTOR,
    promptVersion: YOUTUBE_PACK_SECTION_PROMPT_VERSION,
    input: built.input,
    prompt: [
      { role: "system", content: built.system },
      { role: "user", content: built.user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.4 },
  })

  if (result.status !== "succeeded") return null
  const parsed = result.parsed
  if (!parsed?.content) return null

  return {
    id: `section-${sectionType}-${crypto.randomUUID()}`,
    type: sectionType,
    label: SECTION_LABELS[sectionType],
    content: parsed.content,
  }
}
