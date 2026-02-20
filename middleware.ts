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

  // --- Admin dashboard auth (uses __admin_session cookie) ---

  const adminSession = request.cookies.get('__admin_session')?.value

  // /admin/login — allow without session; redirect to /admin if already has session
  if (pathname === '/admin/login') {
    if (adminSession) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin'
      return NextResponse.redirect(url)
    }
    return response
  }

  // Protect /admin/* (except login) - require admin session
  if (pathname.startsWith('/admin')) {
    if (!adminSession) {
      const url = request.nextUrl.clone()
      url.pathname = '/admin/login'
      return NextResponse.redirect(url)
    }
  }

  // Protect /api/admin/* (except /api/admin/auth/*) - require admin session
  if (pathname.startsWith('/api/admin/') && !pathname.startsWith('/api/admin/auth/')) {
    if (!adminSession) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 })
    }
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
    '/admin/:path*',
    '/api/admin/:path*',
  ],
}
