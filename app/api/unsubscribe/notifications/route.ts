import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const VALID_TYPES = ['comments', 'replies', 'likes', 'follows', 'all'] as const

type NotifyType = typeof VALID_TYPES[number]

const NOTIFY_COLUMN_MAP: Record<Exclude<NotifyType, 'all'>, keyof typeof profiles.$inferSelect> = {
  comments: 'notify_comments',
  replies: 'notify_replies',
  likes: 'notify_likes',
  follows: 'notify_follows',
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const type = request.nextUrl.searchParams.get('type')

  if (!token || !type || !db || !VALID_TYPES.includes(type as NotifyType)) {
    return NextResponse.redirect(new URL('/unsubscribe?status=error', request.url))
  }

  try {
    let result: unknown[]

    if (type === 'all') {
      result = await db.update(profiles)
        .set({
          notify_comments: false,
          notify_replies: false,
          notify_likes: false,
          notify_follows: false,
        })
        .where(eq(profiles.notification_unsubscribe_token, token))
        .returning()
    } else {
      const column = NOTIFY_COLUMN_MAP[type as Exclude<NotifyType, 'all'>]
      result = await db.update(profiles)
        .set({ [column]: false })
        .where(eq(profiles.notification_unsubscribe_token, token))
        .returning()
    }

    if (result.length === 0) {
      return NextResponse.redirect(new URL('/unsubscribe?status=error', request.url))
    }

    return NextResponse.redirect(new URL(`/unsubscribe?status=success&type=${type}`, request.url))
  } catch (err) {
    console.error('[unsubscribe-notifications]', err)
    return NextResponse.redirect(new URL('/unsubscribe?status=error', request.url))
  }
}
