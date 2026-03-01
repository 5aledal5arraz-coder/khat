import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { fireWelcomeEmail } from '@/lib/email/notifications'
import { checkIpRateLimit } from '@/lib/rate-limit'

const SESSION_EXPIRY = 60 * 60 * 24 * 14 * 1000 // 14 days in ms

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 10 login attempts per 15 minutes per IP
    const rl = checkIpRateLimit(request, 'auth_session', 10, 15 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'عدد محاولات كثيرة. يرجى المحاولة لاحقاً.' },
        { status: 429 }
      )
    }

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

    // Check if user must change password
    let mustChangePassword = false
    if (db) {
      const rows = await db.select({ must_change_password: profiles.must_change_password })
        .from(profiles)
        .where(eq(profiles.id, decoded.uid))
      mustChangePassword = rows[0]?.must_change_password === true
    }

    const response = NextResponse.json({
      status: 'ok',
      ...(mustChangePassword ? { must_change_password: true } : {}),
    })
    response.cookies.set('__session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_EXPIRY / 1000, // seconds
      path: '/',
    })

    if (mustChangePassword) {
      response.cookies.set('__force_pw', '1', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_EXPIRY / 1000,
        path: '/',
      })
    } else {
      // Clear any stale __force_pw cookie from a previous session
      response.cookies.set('__force_pw', '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0,
        path: '/',
      })
    }

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
  response.cookies.set('__force_pw', '', {
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
  if (!db) return

  const name = displayName || (email ? email.split('@')[0] : 'مستخدم')

  // Upsert profile — store email, generate unsubscribe token for new users
  // xmax = 0 means the row was inserted (new user), not updated
  const rows = await db.execute(sql`
    INSERT INTO profiles (id, display_name, avatar_url, email, notification_unsubscribe_token)
    VALUES (${uid}, ${name}, ${avatarUrl || null}, ${email || null}, encode(gen_random_bytes(16), 'hex'))
    ON CONFLICT (id) DO UPDATE SET email = COALESCE(profiles.email, EXCLUDED.email)
    RETURNING (xmax = 0) AS is_new
  `)

  const isNew = (rows as unknown as { is_new: boolean }[])[0]?.is_new
  if (isNew && email) {
    fireWelcomeEmail(uid, email, name)
  }
}
