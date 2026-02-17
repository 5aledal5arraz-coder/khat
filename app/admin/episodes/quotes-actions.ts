"use server"

import { revalidatePath } from "next/cache"
import { getQuotesConfig, saveQuotesConfig } from "@/lib/episode-quotes"
import { fetchTranscript } from "@/lib/youtube/transcript"
import { generateQuotesFromTranscript } from "@/lib/openai"
import { getYouTubeId } from "@/lib/utils"
import { requireAdmin } from "@/lib/api-utils"
import { saveVersion } from "@/lib/episode-versions"

function revalidateAll(episodeId?: string) {
  revalidatePath("/")
  revalidatePath("/episodes")
  revalidatePath("/admin/episodes")
  if (episodeId) revalidatePath(`/admin/episodes/${episodeId}`)
}

export async function generateEpisodeQuotes(
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

  let quotes
  try {
    quotes = await generateQuotesFromTranscript(
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
    return { success: false, error: `فشل في توليد الاقتباسات: ${message}` }
  }

  if (!quotes || quotes.length === 0) {
    return { success: false, error: "لم يتم استخراج أي اقتباسات" }
  }

  const config = await getQuotesConfig()
  // Save version snapshot before overwriting quotes
  if (config[episodeId]) {
    await saveVersion(episodeId, "quotes", { quotesEntry: config[episodeId] }, "قبل إعادة توليد الاقتباسات")
  }
  config[episodeId] = {
    episodeId,
    episodeTitle: title,
    quotes,
    transcript: result.text,
    status: "draft",
    generatedAt: new Date().toISOString(),
    publishedAt: null,
  }
  await saveQuotesConfig(config)

  revalidateAll(episodeId)
  return { success: true }
}

export async function regenerateEpisodeQuotes(
  episodeId: string,
  youtubeUrl: string,
  title: string,
  guestName: string
) {
  await requireAdmin()
  // Re-fetch transcript and regenerate
  return generateEpisodeQuotes(episodeId, youtubeUrl, title, guestName)
}

export async function updateQuoteText(
  episodeId: string,
  quoteId: string,
  newText: string
) {
  await requireAdmin()
  const config = await getQuotesConfig()
  const entry = config[episodeId]
  if (!entry) return { success: false, error: "لا توجد اقتباسات لهذه الحلقة" }

  const quote = entry.quotes.find((q) => q.id === quoteId)
  if (!quote) return { success: false, error: "الاقتباس غير موجود" }

  quote.text = newText.trim()
  await saveQuotesConfig(config)

  revalidateAll(episodeId)
  return { success: true }
}

export async function deleteQuote(episodeId: string, quoteId: string) {
  await requireAdmin()
  const config = await getQuotesConfig()
  const entry = config[episodeId]
  if (!entry) return { success: false, error: "لا توجد اقتباسات لهذه الحلقة" }

  entry.quotes = entry.quotes.filter((q) => q.id !== quoteId)
  await saveQuotesConfig(config)

  revalidateAll(episodeId)
  return { success: true }
}

export async function publishEpisodeQuotes(episodeId: string) {
  await requireAdmin()
  const config = await getQuotesConfig()
  const entry = config[episodeId]
  if (!entry) return { success: false, error: "لا توجد اقتباسات لهذه الحلقة" }
  await saveVersion(episodeId, "quotes", { quotesEntry: entry }, "نشر الاقتباسات")

  entry.status = "published"
  entry.publishedAt = new Date().toISOString()
  await saveQuotesConfig(config)

  revalidateAll(episodeId)
  return { success: true }
}

export async function unpublishEpisodeQuotes(episodeId: string) {
  await requireAdmin()
  const config = await getQuotesConfig()
  const entry = config[episodeId]
  if (!entry) return { success: false, error: "لا توجد اقتباسات لهذه الحلقة" }

  entry.status = "draft"
  entry.publishedAt = null
  await saveQuotesConfig(config)

  revalidateAll(episodeId)
  return { success: true }
}

export async function bulkDeleteQuotes(episodeId: string, quoteIds: string[]) {
  await requireAdmin()
  const config = await getQuotesConfig()
  const entry = config[episodeId]
  if (!entry) return { success: false, error: "لا توجد اقتباسات لهذه الحلقة" }

  entry.quotes = entry.quotes.filter((q) => !quoteIds.includes(q.id))
  await saveQuotesConfig(config)

  revalidateAll(episodeId)
  return { success: true }
}

export async function bulkToggleQuotesVisibility(
  episodeId: string,
  quoteIds: string[],
  hidden: boolean
) {
  await requireAdmin()
  const config = await getQuotesConfig()
  const entry = config[episodeId]
  if (!entry) return { success: false, error: "لا توجد اقتباسات لهذه الحلقة" }

  for (const quote of entry.quotes) {
    if (quoteIds.includes(quote.id)) {
      quote.hidden = hidden
    }
  }
  await saveQuotesConfig(config)

  revalidateAll(episodeId)
  return { success: true }
}

export async function deleteAllEpisodeQuotes(episodeId: string) {
  await requireAdmin()
  const config = await getQuotesConfig()
  delete config[episodeId]
  await saveQuotesConfig(config)

  revalidateAll(episodeId)
  return { success: true }
}
