import { NextRequest, NextResponse } from 'next/server'
import { pool } from '@/lib/db'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token || !pool) {
    return NextResponse.redirect(new URL('/unsubscribe?status=error', request.url))
  }

  try {
    const { rowCount } = await pool.query(
      `UPDATE newsletter_subscribers
       SET status = 'unsubscribed', unsubscribed_at = now()
       WHERE unsubscribe_token = $1 AND status = 'active'`,
      [token]
    )

    if (rowCount === 0) {
      return NextResponse.redirect(new URL('/unsubscribe?status=already', request.url))
    }

    return NextResponse.redirect(new URL('/unsubscribe?status=success&type=newsletter', request.url))
  } catch (err) {
    console.error('[unsubscribe-newsletter]', err)
    return NextResponse.redirect(new URL('/unsubscribe?status=error', request.url))
  }
}
