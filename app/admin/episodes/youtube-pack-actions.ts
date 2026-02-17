"use server"

import { revalidatePath } from "next/cache"
import { getYoutubePackConfig, saveYoutubePackConfig } from "@/lib/youtube-pack"
import { fetchTranscript } from "@/lib/youtube/transcript"
import {
  generateYoutubePackFromTranscript,
  generateYoutubePackSectionFromTranscript,
} from "@/lib/openai"
import { getYouTubeId } from "@/lib/utils"
import type { YouTubePackSection } from "@/types/youtube-pack"
import { requireAdmin } from "@/lib/api-utils"

function revalidateAll(episodeId?: string) {
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  if (episodeId) revalidatePath(`/admin/episodes/${episodeId}`)
}

export async function generateYoutubePack(
  episodeId: string,
  youtubeUrl: string,
  title: string,
  guestName: string
) {
  await requireAdmin()
  const videoId = getYouTubeId(youtubeUrl)
  if (!videoId) {
    return { success: false, error: "رابط يوتيوب غير صالح" }
  }

  const result = await fetchTranscript(videoId)
  if (!result.success) {
    return { success: false, error: result.error || "فشل في جلب النص" }
  }

  let sections: YouTubePackSection[]
  try {
    sections = await generateYoutubePackFromTranscript(
      result.text,
      title,
      guestName
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("insufficient_quota") || message.includes("429")) {
      return { success: false, error: "رصيد OpenAI غير كافٍ. يرجى التحقق من مفتاح API." }
    }
    if (message.includes("OPENAI_API_KEY")) {
      return { success: false, error: "مفتاح OpenAI API غير مُعدّ." }
    }
    return { success: false, error: `فشل في توليد الحزمة: ${message}` }
  }

  if (!sections || sections.length === 0) {
    return { success: false, error: "لم يتم توليد أي محتوى" }
  }

  const config = await getYoutubePackConfig()
  config[episodeId] = {
    episodeId,
    episodeTitle: title,
    sections,
    transcript: result.text,
    generatedAt: new Date().toISOString(),
  }
  await saveYoutubePackConfig(config)

  revalidateAll(episodeId)
  return { success: true }
}

export async function regenerateYoutubePackSection(
  episodeId: string,
  youtubeUrl: string,
  title: string,
  guestName: string,
  sectionType: YouTubePackSection["type"]
) {
  await requireAdmin()
  const config = await getYoutubePackConfig()
  const entry = config[episodeId]

  let transcript = entry?.transcript
  if (!transcript) {
    const videoId = getYouTubeId(youtubeUrl)
    if (!videoId) {
      return { success: false, error: "رابط يوتيوب غير صالح" }
    }
    const result = await fetchTranscript(videoId)
    if (!result.success) {
      return { success: false, error: result.error || "فشل في جلب النص" }
    }
    transcript = result.text
  }

  let section
  try {
    section = await generateYoutubePackSectionFromTranscript(
      transcript,
      title,
      guestName,
      sectionType
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes("insufficient_quota") || message.includes("429")) {
      return { success: false, error: "رصيد OpenAI غير كافٍ. يرجى التحقق من مفتاح API." }
    }
    return { success: false, error: `فشل في إعادة توليد القسم: ${message}` }
  }

  if (!section) {
    return { success: false, error: "لم يتم توليد المحتوى" }
  }

  if (entry) {
    entry.sections = entry.sections.map((s) =>
      s.type === sectionType ? section : s
    )
    if (!entry.transcript) {
      entry.transcript = transcript
    }
  } else {
    config[episodeId] = {
      episodeId,
      episodeTitle: title,
      sections: [section],
      transcript,
      generatedAt: new Date().toISOString(),
    }
  }

  await saveYoutubePackConfig(config)
  revalidateAll(episodeId)
  return { success: true }
}

export async function regenerateYoutubePack(
  episodeId: string,
  youtubeUrl: string,
  title: string,
  guestName: string
) {
  await requireAdmin()
  return generateYoutubePack(episodeId, youtubeUrl, title, guestName)
}

export async function deleteYoutubePack(episodeId: string) {
  await requireAdmin()
  const config = await getYoutubePackConfig()
  delete config[episodeId]
  await saveYoutubePackConfig(config)

  revalidateAll(episodeId)
  return { success: true }
}
