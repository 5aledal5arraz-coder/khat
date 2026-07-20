import { NextRequest, NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { verifyAdminSession, type AdminRole, type AdminUser, ROLE_LEVELS as ADMIN_ROLE_LEVELS } from '@/lib/admin/auth'

/**
 * Validate request origin (same-origin check)
 */
export function validateOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')

  // Allow requests without origin (same-origin navigations, server-side)
  if (!origin) return true

  // Check that origin matches host
  try {
    const originUrl = new URL(origin)
    return originUrl.host === host
  } catch {
    return false
  }
}

/**
 * Validate custom header for CSRF protection on mutations
 */
export function validateCustomHeader(request: NextRequest): boolean {
  return request.headers.get('x-requested-with') === 'khat'
}

/**
 * Get authenticated admin user from __admin_session cookie.
 * Validates hashed session token against admin_sessions DB table.
 * Used by all admin-facing routes (requireAdmin, requireAdminAPI, requireRole, etc.)
 */
export async function getAdminAuthUser(): Promise<AdminUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get('__admin_session')?.value
    if (!token) return null

    return await verifyAdminSession(token)
  } catch {
    return null
  }
}


/**
 * Require admin access for server actions / RSC reads. Redirects (throws) when
 * there is no valid, active admin session.
 *
 * `!user.is_active` is defense in depth: getAdminAuthUser() → verifyAdminSession()
 * already filters `is_active = true` in SQL, so a disabled account yields
 * `user = null` and is caught by `!user` today. Keeping the explicit check makes
 * this guard correct even if that SQL filter is ever relaxed, and aligns it with
 * requireActionRole / requireAdminAPI / requireRole, which all check is_active.
 * It does NOT weaken the active case: an active EDITOR/VIEWER reads exactly as before.
 *
 * Redirect target mirrors app/admin/layout.tsx: a stale/disabled session still
 * carries a valid-looking `__admin_session` cookie, and the middleware bounces
 * `/admin/login` → `/admin` whenever that cookie is present (existence-only
 * check, no DB lookup). Sending such a request straight to `/admin/login` would
 * trap the browser in a login↔admin loop, so we route it through
 * `/admin/clear-session` (deletes the DB session + clears the cookie, then lands
 * on `/admin/login`). A genuinely unauthenticated request (no cookie) has
 * nothing to clear and goes directly to `/admin/login`.
 */
export async function requireAdmin(): Promise<void> {
  const user = await getAdminAuthUser()
  if (!user || !user.is_active) {
    const token = (await cookies()).get('__admin_session')?.value
    const { redirect } = await import('next/navigation')
    redirect(token ? '/admin/clear-session' : '/admin/login')
  }
}

/**
 * Require admin for API routes. Returns a 401/403 response on failure, null if OK.
 *
 * Pass `minRole` to require a minimum role (and an active account) — use an
 * explicit role on destructive endpoints (e.g. 'ADMIN' for deletes).
 *
 * Without `minRole` the default depends on the HTTP method:
 *   • GET/HEAD/OPTIONS → authentication only (unchanged — VIEWER can read).
 *   • anything else    → minimum EDITOR. Write handlers historically called
 *     this bare, which meant a read-only VIEWER could mutate content.
 *
 * The method comes from the `x-request-method` header the middleware sets
 * on every request via `.set()`, which overwrites any client-supplied value.
 * This is only unforgeable while the request actually passes through the
 * middleware — the guarantee therefore depends on `config.matcher` in
 * middleware.ts covering the path. The explicit `/api/:path*` matcher entry
 * exists precisely so dotted [id] segments (e.g. `/api/admin/x/a.b`) can't
 * skip the middleware and smuggle a forged `x-request-method: GET`. If the
 * header is missing — i.e. the handler ran outside the middleware pipeline —
 * we fail CLOSED and treat the request as a write.
 */
export async function requireAdminAPI(minRole?: AdminRole): Promise<NextResponse | null> {
  const user = await getAdminAuthUser()
  if (!user) return unauthorizedResponse()

  let effectiveMinRole: AdminRole | undefined = minRole
  if (!effectiveMinRole) {
    const method = (await headers()).get('x-request-method')
    const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
    if (!isRead) effectiveMinRole = 'EDITOR'
  }

  if (effectiveMinRole) {
    if (!user.is_active) return forbiddenResponse()
    if (!hasRole(user.role, effectiveMinRole)) return forbiddenResponse()
  }
  return null
}

/**
 * Require a minimum admin role for SERVER ACTIONS. Returns the user on success,
 * or an `{ error }` the action can surface in its Result shape on failure.
 * (Server actions can't redirect cleanly on a role failure mid-mutation.)
 */
export async function requireActionRole(
  minRole: AdminRole,
): Promise<{ ok: true; user: AdminUser } | { ok: false; error: string }> {
  const user = await getAdminAuthUser()
  if (!user || !user.is_active) return { ok: false, error: "يجب تسجيل الدخول أولاً" }
  if (!hasRole(user.role, minRole)) {
    return { ok: false, error: "ليس لديك صلاحية لهذا الإجراء" }
  }
  return { ok: true, user }
}

// -- Admin Role hierarchy --

export function hasRole(userRole: string | null | undefined, requiredRole: AdminRole): boolean {
  const level = ADMIN_ROLE_LEVELS[(userRole as AdminRole)] ?? -1
  return level >= ADMIN_ROLE_LEVELS[requiredRole]
}

/**
 * Require minimum admin role for API routes.
 * Returns { error } on failure, or { error: null, user } on success.
 */
export async function requireRole(minRole: AdminRole): Promise<
  { error: NextResponse } | { error: null; user: AdminUser }
> {
  const user = await getAdminAuthUser()
  if (!user) return { error: unauthorizedResponse() }
  if (!user.is_active) return { error: forbiddenResponse() }
  if (!hasRole(user.role, minRole)) return { error: forbiddenResponse() }
  return { error: null, user }
}

// -- Error response helpers (Arabic messages) --

export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function unauthorizedResponse() {
  return errorResponse('يجب تسجيل الدخول أولاً', 401)
}

export function forbiddenResponse() {
  return errorResponse('ليس لديك صلاحية للوصول إلى هذه الصفحة. يرجى التواصل مع مدير النظام إذا كنت تعتقد أن هذا خطأ.', 403)
}

export function notFoundResponse() {
  return errorResponse('المحتوى غير موجود', 404)
}

export function rateLimitResponse() {
  return errorResponse('لقد تجاوزت الحد المسموح. حاول لاحقاً', 429)
}

export function bannedResponse() {
  return errorResponse('تم حظر حسابك. تواصل مع الإدارة للمزيد', 403)
}

export function validationErrorResponse(message: string) {
  return errorResponse(message, 422)
}

/**
 * Standard API pipeline: validate origin + custom header for mutations
 */
export function validateMutation(request: NextRequest): NextResponse | null {
  if (!validateOrigin(request)) {
    return errorResponse('طلب غير صالح', 403)
  }
  if (!validateCustomHeader(request)) {
    return errorResponse('طلب غير صالح', 403)
  }
  return null
}

/**
 * Success response helper
 */
export function successResponse(data: unknown, status: number = 200) {
  return NextResponse.json(data, { status })
}
