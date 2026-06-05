import { NextResponse, type NextRequest } from 'next/server'
import { getMaintenanceFlag } from '@/lib/site-settings'
import {
  checkRateLimit,
  keyForRequest,
  policyForRequest,
} from '@/lib/middleware/rate-limit'

// Node.js runtime so we can query the database (pg driver) from the proxy.
export const runtime = 'nodejs'

// ─── A6 — Content-Security-Policy ─────────────────────────────────────
//
// Built ONCE at module load. The string never changes per request, so
// computing it inside the request handler would be wasted work.
//
// Decisions (audited 2026-05; see A6 report for full rationale):
//   • `'unsafe-inline'` (script-src + style-src) — required without
//     a nonce system. Sources: theme-init <script> in app/layout.tsx,
//     JSON-LD `dangerouslySetInnerHTML` blocks on every public page,
//     Next.js hydration scripts, Tailwind + shadcn inline style attrs.
//   • `'unsafe-eval'` — gated on NODE_ENV !== 'production'. Required
//     by Next.js dev (HMR, React Fast Refresh). Excluded in prod.
//   • `data:` — required for img-src (Next blur placeholders) and
//     font-src (Next subset inlining).
//   • `blob:` — required for img-src (admin file-upload previews via
//     `URL.createObjectURL`).
//   • `frame-ancestors 'none'` — paired with the existing
//     `X-Frame-Options: DENY` header; CSP equivalent for modern
//     browsers that ignore X-Frame-Options.
//   • Localhost WebSocket/HTTP — added to connect-src in dev only
//     for Turbopack HMR.
//
// Trade-offs:
//   • `'unsafe-inline'` retained on script/style means reflected-XSS
//     can execute injected scripts. Mitigated by output escaping in
//     React (default-safe) and by the absence of user-controlled HTML
//     rendering paths in our code (every `dangerouslySetInnerHTML`
//     call site embeds known-safe values: JSON.stringify of computed
//     objects, or hand-authored theme init).
//   • Removing `'unsafe-inline'` requires a nonce system — out of
//     scope per the A6 brief. Documented for the next pass.

const IS_PROD = process.env.NODE_ENV === 'production'

const CSP_DIRECTIVES: Record<string, string[]> = {
  // Restrictive default. Anything not explicitly allowed below is
  // blocked.
  'default-src': ["'self'"],

  // Inline scripts required (Next.js hydration + theme init + JSON-LD).
  // `unsafe-eval` only in dev for HMR.
  'script-src': IS_PROD
    ? ["'self'", "'unsafe-inline'"]
    : ["'self'", "'unsafe-inline'", "'unsafe-eval'"],

  // Inline styles required (Tailwind/shadcn inline style attrs + Next
  // styled-jsx). External CSS from Google Fonts (manual <link> in
  // app/layout.tsx for Amiri + Playfair Display).
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],

  // Six remote hosts come from next.config.ts image patterns. `data:`
  // for Next blur placeholders. `blob:` for admin image-upload preview.
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https://img.youtube.com',
    'https://i.ytimg.com',
    'https://yt3.ggpht.com',
    'https://images.unsplash.com',
    'https://i.pravatar.cc',
    'https://picsum.photos',
  ],

  // Google Fonts serves font files from gstatic. `data:` for small
  // inlined subsets that next/font occasionally emits.
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],

  // Browser-side fetch targets: same-origin only in prod. Dev adds
  // localhost ws/http for Turbopack HMR + Fast Refresh.
  'connect-src': IS_PROD
    ? ["'self'"]
    : ["'self'", 'ws://localhost:*', 'http://localhost:*'],

  // YouTube embeds only. youtube-nocookie.com permitted as a
  // privacy-respecting alternative some embeds default to.
  'frame-src': [
    "'self'",
    'https://www.youtube.com',
    'https://www.youtube-nocookie.com',
  ],

  // No plugins (Flash, Java, Silverlight). Hard deny.
  'object-src': ["'none'"],

  // Prevent <base> tag injection redirects.
  'base-uri': ["'self'"],

  // CSP equivalent of X-Frame-Options: DENY. Belt + suspenders with
  // the existing header set below.
  'frame-ancestors': ["'none'"],

  // Restrict where forms can POST to. Same-origin only; no third
  // party can hijack a form's action via injection.
  'form-action': ["'self'"],
}

const CSP_HEADER_VALUE = Object.entries(CSP_DIRECTIVES)
  .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
  .join('; ')

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  // Phase 2 — surface the request pathname to server layouts so the root
  // layout can avoid mounting public-site chrome (`<Header>`, `<Footer>`,
  // `<MobileNav>`) on admin routes. Read in app/layout.tsx via
  // `headers().get('x-pathname')`. Request headers are forwarded
  // unchanged otherwise.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  const adminSession = request.cookies.get('__admin_session')?.value

  // --- Maintenance mode gate ---
  // Rewrites public page requests to /maintenance when the admin has enabled
  // maintenance mode. Admin routes, the maintenance page itself, and API
  // routes are always allowed through. Admins (with a session cookie) are
  // also allowed through so they can still access the public site to verify.
  const isAdminPath = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')
  const isApi = pathname.startsWith('/api/')
  const isMaintenancePage = pathname === '/maintenance'
  if (!isAdminPath && !isApi && !isMaintenancePage && !adminSession) {
    try {
      const maintenance = await getMaintenanceFlag()
      if (maintenance) {
        const url = request.nextUrl.clone()
        url.pathname = '/maintenance'
        return NextResponse.rewrite(url, { status: 503 })
      }
    } catch (err) {
      console.error(
        '[middleware] maintenance check failed — failing open:',
        err instanceof Error ? err.message : err,
      )
    }
  }

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

  // --- Admin dashboard auth ---

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

  // A8 — HTTP-layer rate limit on the admin API surface. Runs after
  // auth + CSRF so we don't account against unauthenticated /api/admin
  // probes (those already 401 above). The auth/login subtree is
  // intentionally INCLUDED here keyed by IP, to brake brute-force
  // login attempts before they hit the password-hash check.
  if (pathname.startsWith('/api/admin/')) {
    const decision = checkRateLimit({
      key: keyForRequest(request),
      policy: policyForRequest(request),
    })
    if (!decision.allowed) {
      return NextResponse.json(
        {
          error: 'rate_limited',
          retry_after_seconds: decision.retry_after_seconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(decision.retry_after_seconds),
            'Cache-Control': 'no-store',
          },
        },
      )
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

  // A6 — Content-Security-Policy. String computed once at module
  // init (see CSP_HEADER_VALUE above); `.set()` overwrites any
  // existing header so a downstream that previously set CSP would
  // be replaced, preventing duplicate-header injection.
  response.headers.set('Content-Security-Policy', CSP_HEADER_VALUE)

  return response
}

export const config = {
  matcher: [
    // Run on all routes except Next.js internals, static assets and files with
    // an extension (images, fonts, etc). Needed so the maintenance-mode gate
    // can catch every public page request.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.[^/]+$).*)',
  ],
}
