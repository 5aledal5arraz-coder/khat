import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { newsletterSubscribers } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token || !db) {
    return NextResponse.redirect(new URL('/unsubscribe?status=error', request.url))
  }

  try {
    const result = await db.update(newsletterSubscribers)
      .set({ status: 'unsubscribed', unsubscribed_at: sql`now()` })
      .where(
        and(
          eq(newsletterSubscribers.unsubscribe_token, token),
          eq(newsletterSubscribers.status, 'active')
        )
      )
      .returning()

    if (result.length === 0) {
      return NextResponse.redirect(new URL('/unsubscribe?status=already', request.url))
    }

    return NextResponse.redirect(new URL('/unsubscribe?status=success&type=newsletter', request.url))
  } catch (err) {
    console.error('[unsubscribe-newsletter]', err)
    return NextResponse.redirect(new URL('/unsubscribe?status=error', request.url))
  }
}
