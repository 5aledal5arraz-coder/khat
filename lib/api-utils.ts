import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
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
 * Require admin access for server actions. Throws redirect if not authenticated.
 */
export async function requireAdmin(): Promise<void> {
  const user = await getAdminAuthUser()
  if (!user) {
    const { redirect } = await import('next/navigation')
    redirect('/admin/login')
  }
}

/**
 * Require admin for API routes. Returns 401 response if not authenticated, null if OK.
 */
export async function requireAdminAPI(): Promise<NextResponse | null> {
  const user = await getAdminAuthUser()
  if (!user) return unauthorizedResponse()
  return null
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
