import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
 * Get authenticated user from request, returns null if not authenticated
 */
export async function getAuthUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

/**
 * Get user profile with admin/ban status
 */
export async function getUserProfile(userId: string) {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  return profile
}

/**
 * Get user's approved content count (for moderation decisions)
 */
export async function getUserApprovedCount(userId: string): Promise<number> {
  const supabase = await createClient()

  const { count: articlesCount } = await supabase
    .from('hibr_articles')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('moderation_status', 'approved')

  const { count: thoughtsCount } = await supabase
    .from('hibr_thoughts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('moderation_status', 'approved')

  return (articlesCount ?? 0) + (thoughtsCount ?? 0)
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
