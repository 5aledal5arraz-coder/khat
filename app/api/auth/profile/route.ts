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

    const rows = await db.select({
      id: profiles.id,
      display_name: profiles.display_name,
      username: profiles.username,
      avatar_url: profiles.avatar_url,
      bio: profiles.bio,
      email: profiles.email,
      articles_count: profiles.articles_count,
      followers_count: profiles.followers_count,
      notify_comments: profiles.notify_comments,
      notify_replies: profiles.notify_replies,
      notify_likes: profiles.notify_likes,
      notify_follows: profiles.notify_follows,
      created_at: profiles.created_at,
    }).from(profiles).where(eq(profiles.id, decoded.uid))

    return NextResponse.json({ profile: rows[0] || null })
  } catch {
    return NextResponse.json({ profile: null })
  }
}
