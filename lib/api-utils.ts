import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminAuth } from '@/lib/firebase/admin'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { eq, sql, and } from 'drizzle-orm'

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
 * Get authenticated user from Firebase session cookie, returns null if not authenticated
 */
export async function getAuthUser() {
  try {
    const cookieStore = await cookies()
    const session = cookieStore.get('__session')?.value
    if (!session) return null

    const decoded = await getAdminAuth().verifySessionCookie(session)
    return { id: decoded.uid, email: decoded.email || '' }
  } catch {
    return null
  }
}

/**
 * Get authenticated admin user from __admin_session cookie.
 * Used by all admin-facing routes (requireAdmin, requireAdminAPI, requireRole, etc.)
 */
export async function getAdminAuthUser() {
  try {
    const cookieStore = await cookies()
    const session = cookieStore.get('__admin_session')?.value
    if (!session) return null

    const decoded = await getAdminAuth().verifySessionCookie(session)
    return { id: decoded.uid, email: decoded.email || '' }
  } catch {
    return null
  }
}

/**
 * Get user profile with admin/ban status
 */
export async function getUserProfile(userId: string) {
  if (!db) return null

  const rows = await db.select().from(profiles).where(eq(profiles.id, userId))
  return rows[0] || null
}

/**
 * Get user's approved content count (for moderation decisions)
 */
export async function getUserApprovedCount(userId: string): Promise<number> {
  if (!db) return 0

  const result = await db.execute(sql`
    SELECT
      (SELECT count(*) FROM hibr_articles WHERE user_id = ${userId} AND moderation_status = 'approved') +
      (SELECT count(*) FROM hibr_thoughts WHERE user_id = ${userId} AND moderation_status = 'approved') AS total
  `)
  return parseInt(String(result.rows[0]?.total || '0'), 10)
}

/**
 * Require admin access for server actions. Throws if not authenticated or not admin.
 */
export async function requireAdmin(): Promise<void> {
  const user = await getAdminAuthUser()
  if (!user) throw new Error('يجب تسجيل الدخول أولاً')
  const profile = await getUserProfile(user.id)
  if (!profile?.is_admin) throw new Error('ليس لديك صلاحية لهذا الإجراء')
}

/**
 * Require admin for API routes. Returns error response or null if authorized.
 */
export async function requireAdminAPI(): Promise<NextResponse | null> {
  const user = await getAdminAuthUser()
  if (!user) return unauthorizedResponse()
  const profile = await getUserProfile(user.id)
  if (!profile?.is_admin) return forbiddenResponse()
  return null
}

// -- Role hierarchy --

type Role = 'admin' | 'editor' | 'moderator' | 'user'

const ROLE_LEVELS: Record<Role, number> = {
  admin: 3,
  editor: 2,
  moderator: 1,
  user: 0,
}

export function hasRole(userRole: string | null | undefined, requiredRole: Role): boolean {
  const level = ROLE_LEVELS[(userRole as Role)] ?? 0
  return level >= ROLE_LEVELS[requiredRole]
}

/**
 * Get authenticated user with profile (including role)
 */
export async function getAuthUserWithRole() {
  const user = await getAdminAuthUser()
  if (!user) return null
  const profile = await getUserProfile(user.id)
  if (!profile) return null
  return { ...user, profile }
}

/**
 * Require minimum role for API routes. Returns error response or null if authorized.
 */
export async function requireRole(minRole: Role): Promise<{ error: NextResponse } | { error: null; user: { id: string; email: string }; profile: any }> {
  const user = await getAdminAuthUser()
  if (!user) return { error: unauthorizedResponse() }
  const profile = await getUserProfile(user.id)
  if (!profile) return { error: forbiddenResponse() }
  // Check both new role system and legacy is_admin
  if (!hasRole(profile.role, minRole) && !(minRole === 'admin' && profile.is_admin)) {
    return { error: forbiddenResponse() }
  }
  return { error: null, user, profile }
}

// -- Error response helpers (Arabic messages) --

export function errorResponse(message: string, status: number = 400) {
  return NextResponse.json({ error: message }, { status })
}

export function unauthorizedResponse() {
  return errorResponse('يجب تسجيل الدخول أولاً', 401)
}

export function forbiddenResponse() {
  return errorResponse('ليس لديك صلاحية لهذا الإجراء', 403)
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
