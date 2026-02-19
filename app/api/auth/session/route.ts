import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'
import { pool } from '@/lib/db'
import { fireWelcomeEmail } from '@/lib/email/notifications'

const SESSION_EXPIRY = 60 * 60 * 24 * 14 * 1000 // 14 days in ms

export async function POST(request: NextRequest) {
  try {
    const { idToken } = await request.json()
    if (!idToken || typeof idToken !== 'string') {
      return NextResponse.json({ error: 'Missing idToken' }, { status: 400 })
    }

    // Verify the ID token
    const decoded = await getAdminAuth().verifyIdToken(idToken)

    // Create a session cookie
    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY,
    })

    // Upsert profile in DB
    await ensureProfile(decoded.uid, decoded.email, decoded.name, decoded.picture)

    const response = NextResponse.json({ status: 'ok' })
    response.cookies.set('__session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_EXPIRY / 1000, // seconds
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Session creation error:', error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ status: 'ok' })
  response.cookies.set('__session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}

async function ensureProfile(
  uid: string,
  email: string | undefined,
  displayName: string | undefined,
  avatarUrl: string | undefined
) {
  if (!pool) return

  const name = displayName || (email ? email.split('@')[0] : 'مستخدم')

  // Upsert profile — store email, generate unsubscribe token for new users
  // xmax = 0 means the row was inserted (new user), not updated
  const { rows } = await pool.query(
    `INSERT INTO profiles (id, display_name, avatar_url, email, notification_unsubscribe_token)
     VALUES ($1, $2, $3, $4, encode(gen_random_bytes(16), 'hex'))
     ON CONFLICT (id) DO UPDATE SET email = COALESCE(profiles.email, EXCLUDED.email)
     RETURNING (xmax = 0) AS is_new`,
    [uid, name, avatarUrl || null, email || null]
  )

  const isNew = rows[0]?.is_new
  if (isNew && email) {
    fireWelcomeEmail(uid, email, name)
  }
}
