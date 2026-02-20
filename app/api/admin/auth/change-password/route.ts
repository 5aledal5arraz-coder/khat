import { NextRequest, NextResponse } from 'next/server'
import { getAdminAuthUser, requireAdminAPI } from '@/lib/api-utils'
import { getAdminAuth } from '@/lib/firebase/admin'
import { validatePasswordStrength } from '@/lib/validation'

export async function POST(request: NextRequest) {
  const denied = await requireAdminAPI()
  if (denied) return denied

  const user = await getAdminAuthUser()
  if (!user) {
    return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 })
  }

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'بيانات غير صالحة' }, { status: 400 })
  }

  const { password } = body
  if (!password) {
    return NextResponse.json({ error: 'كلمة المرور مطلوبة' }, { status: 422 })
  }

  const validation = validatePasswordStrength(password)
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: 422 })
  }

  try {
    await getAdminAuth().updateUser(user.id, { password })
  } catch {
    return NextResponse.json({ error: 'فشل تحديث كلمة المرور' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
