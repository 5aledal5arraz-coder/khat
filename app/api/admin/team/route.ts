import { NextRequest } from 'next/server'
import { requireRole, successResponse, errorResponse, validationErrorResponse } from '@/lib/api-utils'
import { db } from '@/lib/db'
import { adminUsers } from '@/lib/db/schema'
import { desc, eq } from 'drizzle-orm'
import {
  hashPassword,
  validateAdminPassword,
  logAuditEvent,
  type AdminRole,
} from '@/lib/admin/auth'
import { validateEmail } from '@/lib/validation/forms'

/**
 * GET /api/admin/team — List all admin users (OWNER only)
 */
export async function GET() {
  const auth = await requireRole('OWNER')
  if (auth.error) return auth.error

  if (!db) return errorResponse('قاعدة البيانات غير متوفرة', 500)

  const users = await db
    .select({
      id: adminUsers.id,
      email: adminUsers.email,
      role: adminUsers.role,
      is_active: adminUsers.is_active,
      last_login_at: adminUsers.last_login_at,
      created_at: adminUsers.created_at,
    })
    .from(adminUsers)
    .orderBy(desc(adminUsers.created_at))

  return successResponse({ users })
}

/**
 * POST /api/admin/team — Create new admin user (OWNER only)
 */
export async function POST(request: NextRequest) {
  const auth = await requireRole('OWNER')
  if (auth.error) return auth.error

  if (!db) return errorResponse('قاعدة البيانات غير متوفرة', 500)

  let body: { email?: string; password?: string; role?: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  // Validate email
  const emailVal = validateEmail(body.email || '')
  if (!emailVal.valid) return validationErrorResponse(emailVal.error!)

  // Validate password
  const pwVal = validateAdminPassword(body.password || '')
  if (!pwVal.valid) return validationErrorResponse(pwVal.error!)

  // Validate role — cannot create OWNER
  const validRoles: AdminRole[] = ['ADMIN', 'EDITOR', 'VIEWER']
  const role = (body.role || 'VIEWER') as AdminRole
  if (!validRoles.includes(role)) {
    return validationErrorResponse('صلاحية غير صالحة')
  }

  const email = body.email!.trim().toLowerCase()

  // Check duplicate
  const existing = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(eq(adminUsers.email, email))
    .limit(1)

  if (existing.length > 0) {
    return errorResponse('البريد الإلكتروني مستخدم بالفعل', 409)
  }

  // Hash password and insert
  const passwordHash = await hashPassword(body.password!)
  const rows = await db
    .insert(adminUsers)
    .values({
      email,
      password_hash: passwordHash,
      role,
      is_active: true,
      created_by: auth.user.id,
    })
    .returning({
      id: adminUsers.id,
      email: adminUsers.email,
      role: adminUsers.role,
      is_active: adminUsers.is_active,
      created_at: adminUsers.created_at,
    })

  const newUser = rows[0]

  // Audit log
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim()
    || request.headers.get('x-real-ip') || 'unknown'

  await logAuditEvent({
    actorId: auth.user.id,
    action: 'USER_CREATED',
    targetId: newUser.id,
    ip,
    metadata: { email, role },
  })

  return successResponse({ user: newUser }, 201)
}
