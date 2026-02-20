import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/api-utils'
import { getAdminAuth } from '@/lib/firebase/admin'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { validatePasswordStrength } from '@/lib/validation'

export async function POST(request: NextRequest) {
  const user = await getAuthUser()
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

  // Update password in Firebase
  try {
    await getAdminAuth().updateUser(user.id, { password })
  } catch (error: any) {
    return NextResponse.json({ error: 'فشل تحديث كلمة المرور' }, { status: 500 })
  }

  // Clear the flag in DB
  if (db) {
    await db.update(profiles)
      .set({ must_change_password: false })
      .where(eq(profiles.id, user.id))
  }

  // Clear the __force_pw cookie
  const response = NextResponse.json({ status: 'ok' })
  response.cookies.set('__force_pw', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  })

  return response
}
