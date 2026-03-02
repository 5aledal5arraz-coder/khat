import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request })
  const pathname = request.nextUrl.pathname

  // Set anonymous visitor ID cookie for personalization
  if (!request.cookies.get('khat_vid')) {
    response.cookies.set('khat_vid', crypto.randomUUID(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    })
  }

  // --- Hibr community auth (uses __session cookie) ---

  const hibrSession = request.cookies.get('__session')?.value

  // Protect /space/write - require auth
  if (pathname.startsWith('/space/write')) {
    if (!hibrSession) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }
  }

  // Protect mutation API routes - require auth
  if (pathname.startsWith('/api/space/') && request.method !== 'GET') {
    if (!hibrSession) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 })
    }
  }

  // --- Force password change (uses __force_pw cookie) ---

  const forcePw = request.cookies.get('__force_pw')?.value
  if (forcePw && hibrSession) {
    const allowedPaths = ['/auth/change-password', '/api/auth/change-password', '/api/auth/session']
    const isAllowed = allowedPaths.some(p => pathname === p || pathname.startsWith(p + '/'))
    if (!isAllowed) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/change-password'
      return NextResponse.redirect(url)
    }
  }

  // --- Admin dashboard auth ---

  const adminSession = request.cookies.get('__admin_session')?.value

  // Protect admin pages — redirect to login if no session
  if (pathname.startsWith('/admin') && pathname !== '/admin/login') {
    if (!adminSession) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }
  }

  // Protect admin API routes — return 401 if no session
  if (pathname.startsWith('/api/admin/') && !pathname.startsWith('/api/admin/auth/')) {
    if (!adminSession) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 })
    }

    // CSRF protection for admin API mutations
    if (request.method !== 'GET') {
      const origin = request.headers.get('origin')
      const host = request.headers.get('host')
      if (origin) {
        try {
          const originHost = new URL(origin).host
          if (originHost !== host) {
            return NextResponse.json({ error: 'طلب غير صالح' }, { status: 403 })
          }
        } catch {
          return NextResponse.json({ error: 'طلب غير صالح' }, { status: 403 })
        }
      }
    }
  }

  // Redirect /admin/login to /admin if already logged in
  if (pathname === '/admin/login' && adminSession) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin'
    return NextResponse.redirect(url)
  }

  // --- Security headers ---

  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  if (process.env.NODE_ENV === 'production') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  }

  return response
}

export const config = {
  matcher: [
    '/',
    '/auth/change-password',
    '/space/write/:path*',
    '/api/space/:path*',
    '/api/events',
    '/api/events/batch',
    '/api/personalization/:path*',
    '/admin',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
}
