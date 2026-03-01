import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuth } from '@/lib/firebase/admin'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { checkIpRateLimit } from '@/lib/rate-limit'

const SESSION_EXPIRY = 60 * 60 * 24 * 14 * 1000 // 14 days in ms

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 admin login attempts per 15 minutes per IP
    const rl = checkIpRateLimit(request, 'admin_auth_session', 5, 15 * 60 * 1000)
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

    // Check admin role in profiles table before creating session
    if (db) {
      const rows = await db.select({ is_admin: profiles.is_admin, role: profiles.role })
        .from(profiles)
        .where(eq(profiles.id, decoded.uid))
      const profile = rows[0]
      if (!profile?.is_admin && profile?.role !== 'admin') {
        return NextResponse.json({ error: 'ليس لديك صلاحية للوصول إلى لوحة التحكم' }, { status: 403 })
      }
    }

    // Create a session cookie
    const sessionCookie = await getAdminAuth().createSessionCookie(idToken, {
      expiresIn: SESSION_EXPIRY,
    })

    const response = NextResponse.json({ status: 'ok' })
    response.cookies.set('__admin_session', sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_EXPIRY / 1000,
      path: '/',
    })

    return response
  } catch (error) {
    console.error('Admin session creation error:', error)
    return NextResponse.json({ error: 'فشل التحقق من الهوية' }, { status: 401 })
  }
}

export async function DELETE() {
  const response = NextResponse.json({ status: 'ok' })
  response.cookies.set('__admin_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })
  return response
}
