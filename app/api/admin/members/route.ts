import { NextRequest } from 'next/server'
import { requireRole, successResponse, errorResponse, validationErrorResponse } from '@/lib/api-utils'
import { getMembers, createMember } from '@/lib/admin/queries'

export async function GET(request: NextRequest) {
  const auth = await requireRole('admin')
  if (auth.error) return auth.error

  const url = request.nextUrl
  const search = url.searchParams.get('search') || undefined
  const role = url.searchParams.get('role') || undefined
  const banParam = url.searchParams.get('is_banned')
  const is_banned = banParam === 'true' ? true : banParam === 'false' ? false : null
  const limit = parseInt(url.searchParams.get('limit') || '50', 10)
  const offset = parseInt(url.searchParams.get('offset') || '0', 10)

  const { members, total } = await getMembers({ search, role, is_banned, limit, offset })

  return successResponse({ members, total })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole('admin')
  if (auth.error) return auth.error

  let body: { display_name?: string; email?: string; password?: string; username?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!body.display_name?.trim()) {
    return validationErrorResponse('الاسم مطلوب')
  }
  if (!body.email?.trim()) {
    return validationErrorResponse('البريد الإلكتروني مطلوب')
  }
  if (!body.password || body.password.length < 6) {
    return validationErrorResponse('كلمة المرور مطلوبة (٦ أحرف على الأقل)')
  }

  const validRoles = ['admin', 'editor', 'moderator', 'user']
  if (body.role && !validRoles.includes(body.role)) {
    return validationErrorResponse('صلاحية غير صالحة')
  }

  const result = await createMember({
    display_name: body.display_name.trim(),
    email: body.email.trim(),
    password: body.password,
    username: body.username?.trim(),
    role: body.role,
  })

  if (!result.success) {
    return errorResponse(result.error || 'فشل إنشاء العضو', 400)
  }

  return successResponse({ member: result.member }, 201)
}
