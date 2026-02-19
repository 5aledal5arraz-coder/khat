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

  const session = request.cookies.get('__session')?.value

  // Protect /space/write - require auth
  if (pathname.startsWith('/space/write')) {
    if (!session) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }
  }

  // Protect mutation API routes - require auth
  if (pathname.startsWith('/api/space/') && request.method !== 'GET') {
    if (!session) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 })
    }
  }

  // Protect /admin/* - require auth (admin role checked in route handlers)
  const bypassAdminAuth = process.env.NODE_ENV === 'development' && process.env.ADMIN_AUTH_BYPASS === 'true'

  if (pathname.startsWith('/admin') && !bypassAdminAuth) {
    if (!session) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirect', pathname)
      return NextResponse.redirect(url)
    }
  }

  // Protect /api/admin/* - require auth (admin role checked in route handlers)
  if (pathname.startsWith('/api/admin/') && !bypassAdminAuth) {
    if (!session) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 })
    }
  }

  return response
}

export const config = {
  matcher: [
    '/',
    '/space/write/:path*',
    '/api/space/:path*',
    '/api/events',
    '/api/events/batch',
    '/api/personalization/:path*',
    '/admin/:path*',
    '/api/admin/:path*',
  ],
}
