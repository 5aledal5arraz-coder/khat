import { NextResponse } from 'next/server'
import { requireAdminAPI } from '@/lib/api-utils'
import { getEpisodes } from '@/lib/queries/episodes'
import { getPublishedQuotes } from '@/lib/episode-quotes'
import { generateNewsletterContent } from '@/lib/openai'

const ARABIC_MONTHS: Record<number, string> = {
  1: 'يناير',
  2: 'فبراير',
  3: 'مارس',
  4: 'أبريل',
  5: 'مايو',
  6: 'يونيو',
  7: 'يوليو',
  8: 'أغسطس',
  9: 'سبتمبر',
  10: 'أكتوبر',
  11: 'نوفمبر',
  12: 'ديسمبر',
}

export async function POST(request: Request) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  // Accept optional { year, month } or auto-detect current month
  let targetYear: number
  let targetMonth: number
  try {
    const body = await request.json().catch(() => ({}))
    const now = new Date()
    targetYear = body.year || now.getFullYear()
    targetMonth = body.month || (now.getMonth() + 1)
  } catch {
    const now = new Date()
    targetYear = now.getFullYear()
    targetMonth = now.getMonth() + 1
  }

  // Fetch all episodes
  const allEpisodes = await getEpisodes({ includeHidden: false })

  // Filter by target month
  const monthEpisodes = allEpisodes.filter((ep) => {
    if (!ep.release_date) return false
    const d = new Date(ep.release_date)
    return d.getFullYear() === targetYear && d.getMonth() + 1 === targetMonth
  })

  if (monthEpisodes.length === 0) {
    return NextResponse.json(
      { error: 'لا توجد حلقات لهذا الشهر' },
      { status: 404 }
    )
  }

  // Sort by view_count descending — highest-viewed = featured
  monthEpisodes.sort((a, b) => (b.view_count || 0) - (a.view_count || 0))
  const featured = monthEpisodes[0]
  const otherEpisodes = monthEpisodes.slice(1)

  // Fetch quotes for the featured episode
  let quotes: { text: string; theme: string | null }[] = []
  try {
    const allQuotes = await getPublishedQuotes(
      featured.id,
      featured.guest_id || featured.guest?.id || null
    )
    quotes = allQuotes.slice(0, 3).map((q) => ({
      text: q.text,
      theme: q.theme,
    }))
  } catch {
    // Quotes are optional — continue without them
  }

  const arabicMonth = ARABIC_MONTHS[targetMonth] || String(targetMonth)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://khatpodcast.com'

  const result = await generateNewsletterContent({
    monthName: arabicMonth,
    year: targetYear,
    featured: {
      title: featured.title,
      slug: featured.slug,
      thumbnail_url: featured.thumbnail_url || null,
      guest: featured.guest
        ? { name: featured.guest.name, photo_url: featured.guest.photo_url || null }
        : null,
    },
    quotes,
    otherEpisodes: otherEpisodes.map((ep) => ({
      title: ep.title,
      slug: ep.slug,
      thumbnail_url: ep.thumbnail_url || null,
      guest: ep.guest ? { name: ep.guest.name } : null,
    })),
    appUrl,
  })

  if (!result.success || !result.data) {
    return NextResponse.json(
      { error: result.error || 'فشل إنشاء النشرة' },
      { status: 500 }
    )
  }

  return NextResponse.json({ subject: result.data.subject, body: result.data.body })
}
