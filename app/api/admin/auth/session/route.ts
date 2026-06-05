import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { checkIpRateLimit } from '@/lib/rate-limit'
import {
  getAdminUserByEmail,
  verifyPassword,
  createAdminSession,
  deleteAdminSession,
  updateLastLogin,
  logAuditEvent,
  SESSION_EXPIRY_MS,
} from '@/lib/admin/auth'

/**
 * GET /api/admin/auth/session — Return current user info
 */
export async function GET() {
  const cookieStore = await cookies()
  const token = cookieStore.get('__admin_session')?.value

  if (!token) {
    return NextResponse.json({ error: 'غير مسجل الدخول' }, { status: 401 })
  }

  const { verifyAdminSession } = await import('@/lib/admin/auth')
  const user = await verifyAdminSession(token)

  if (!user) {
    return NextResponse.json({ error: 'الجلسة غير صالحة أو منتهية' }, { status: 401 })
  }

  return NextResponse.json({ user: { email: user.email, role: user.role } })
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

/**
 * POST /api/admin/auth/session — Login
 */
export async function POST(request: NextRequest) {
  const ip = getClientIp(request)

  // Rate limit per IP: 5 attempts per 10 minutes
  const ipLimit = checkIpRateLimit(request, 'admin_login', 5, 10 * 60 * 1000)
  if (!ipLimit.allowed) {
    return NextResponse.json(
      { error: 'عدد محاولات كثيرة. يرجى المحاولة لاحقاً.' },
      { status: 429 },
    )
  }

  let body: { email?: string; password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const email = body.email?.trim().toLowerCase()
  const password = body.password

  if (!email || !password) {
    return NextResponse.json({ error: 'البريد الإلكتروني وكلمة المرور مطلوبان' }, { status: 400 })
  }

  // Rate limit per email: 5 attempts per 10 minutes
  const emailLimit = checkIpRateLimit(request, `admin_login_email_${email}`, 5, 10 * 60 * 1000)
  if (!emailLimit.allowed) {
    return NextResponse.json(
      { error: 'عدد محاولات كثيرة لهذا البريد. يرجى المحاولة لاحقاً.' },
      { status: 429 },
    )
  }

  // Look up user
  const user = await getAdminUserByEmail(email)

  if (!user) {
    await logAuditEvent({
      action: 'LOGIN_FAILURE',
      ip,
      metadata: { email, reason: 'user_not_found' },
    })
    return NextResponse.json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, { status: 401 })
  }

  if (!user.is_active) {
    await logAuditEvent({
      actorId: user.id,
      action: 'LOGIN_FAILURE',
      ip,
      metadata: { email, reason: 'account_disabled' },
    })
    return NextResponse.json({ error: 'الحساب معطل. تواصل مع المالك.' }, { status: 403 })
  }

  // Verify password
  const passwordValid = await verifyPassword(password, user.password_hash)
  if (!passwordValid) {
    await logAuditEvent({
      actorId: user.id,
      action: 'LOGIN_FAILURE',
      ip,
      metadata: { email, reason: 'wrong_password' },
    })
    return NextResponse.json({ error: 'البريد الإلكتروني أو كلمة المرور غير صحيحة' }, { status: 401 })
  }

  // Create session
  const userAgent = request.headers.get('user-agent') || ''
  const token = await createAdminSession(user.id, ip, userAgent)

  // Update last login
  await updateLastLogin(user.id)

  // Log success
  await logAuditEvent({
    actorId: user.id,
    action: 'LOGIN_SUCCESS',
    ip,
    metadata: { email },
  })

  // Set cookie
  const response = NextResponse.json({
    status: 'ok',
    user: { email: user.email, role: user.role },
  })

  response.cookies.set('__admin_session', token, {
    httpOnly: true,
    // A5 — always secure. Browsers exempt localhost from the
    // Secure-over-HTTP restriction (Chrome 89+, Firefox 75+, Safari 14+),
    // so dev still works. Production sits behind an HTTPS-terminating
    // reverse proxy on the droplet, so the cookie attribute is honored
    // by the browser. Removing the NODE_ENV gate eliminates the
    // "env var unset or typo'd → cookie transmitted plaintext" hijack
    // vector.
    secure: true,
    sameSite: 'strict',
    maxAge: SESSION_EXPIRY_MS / 1000,
    path: '/',
  })

  return response
}

/**
 * DELETE /api/admin/auth/session — Logout
 */
export async function DELETE() {
  const cookieStore = await cookies()
  const token = cookieStore.get('__admin_session')?.value

  if (token) {
    await deleteAdminSession(token)
  }

  const response = NextResponse.json({ status: 'ok' })
  response.cookies.set('__admin_session', '', {
    httpOnly: true,
    // A5 — see comment on the login set-cookie above.
    secure: true,
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  })

  return response
}
