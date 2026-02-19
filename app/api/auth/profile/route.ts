import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminAuth } from '@/lib/firebase/admin'
import { pool } from '@/lib/db'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const session = cookieStore.get('__session')?.value
    if (!session) {
      return NextResponse.json({ profile: null })
    }

    const decoded = await getAdminAuth().verifySessionCookie(session)

    if (!pool) {
      return NextResponse.json({ profile: null })
    }

    const { rows } = await pool.query(
      'SELECT * FROM profiles WHERE id = $1',
      [decoded.uid]
    )

    return NextResponse.json({ profile: rows[0] || null })
  } catch {
    return NextResponse.json({ profile: null })
  }
}
