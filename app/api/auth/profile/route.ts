import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getAdminAuth } from '@/lib/firebase/admin'
import { db } from '@/lib/db'
import { profiles } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  try {
    const cookieStore = await cookies()
    const session = cookieStore.get('__session')?.value
    if (!session) {
      return NextResponse.json({ profile: null })
    }

    const decoded = await getAdminAuth().verifySessionCookie(session)

    if (!db) {
      return NextResponse.json({ profile: null })
    }

    const rows = await db.select().from(profiles).where(eq(profiles.id, decoded.uid))

    return NextResponse.json({ profile: rows[0] || null })
  } catch {
    return NextResponse.json({ profile: null })
  }
}
