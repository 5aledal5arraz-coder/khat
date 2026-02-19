import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

const VALID_TYPES = ['comments', 'replies', 'likes', 'follows', 'all'] as const

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  const type = request.nextUrl.searchParams.get('type')

  if (!token || !type || !pool || !VALID_TYPES.includes(type as typeof VALID_TYPES[number])) {
    return NextResponse.redirect(new URL('/unsubscribe?status=error', request.url))
  }

  try {
    let query: string

    if (type === 'all') {
      query = `UPDATE profiles
        SET notify_comments = false, notify_replies = false, notify_likes = false, notify_follows = false
        WHERE notification_unsubscribe_token = $1`
    } else {
      const column = `notify_${type}`
      query = `UPDATE profiles SET ${column} = false WHERE notification_unsubscribe_token = $1`
    }

    const { rowCount } = await pool.query(query, [token])

    if (rowCount === 0) {
      return NextResponse.redirect(new URL('/unsubscribe?status=error', request.url))
    }

    return NextResponse.redirect(new URL(`/unsubscribe?status=success&type=${type}`, request.url))
  } catch (err) {
    console.error('[unsubscribe-notifications]', err)
    return NextResponse.redirect(new URL('/unsubscribe?status=error', request.url))
  }
}
