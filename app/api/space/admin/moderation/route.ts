import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAuthUser,
  getUserProfile,
  unauthorizedResponse,
  forbiddenResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'

export async function GET(request: NextRequest) {
  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const profile = await getUserProfile(user.id)
  if (!profile?.is_admin) return forbiddenResponse()

  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const tab = searchParams.get('tab') || 'pending' // pending | flagged | reports
  const page = Math.max(1, parseInt(searchParams.get('page') || '1') || 1)
  const limit = 20
  const offset = (page - 1) * limit

  if (tab === 'reports') {
    const { data, count, error } = await supabase
      .from('hibr_reports')
      .select('*, profiles!hibr_reports_reporter_id_fkey(id, display_name, avatar_url)', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (error) return errorResponse('حدث خطأ', 500)
    return successResponse({ items: data || [], total: count || 0, tab })
  }

  // Fetch pending/flagged articles, thoughts, comments, and replies
  const status = tab === 'flagged' ? 'auto_flagged' : 'pending'

  const [articles, thoughts, comments, replies] = await Promise.all([
    supabase
      .from('hibr_articles')
      .select('*, profiles!hibr_articles_user_id_fkey(id, display_name, avatar_url)', { count: 'exact' })
      .eq('moderation_status', status)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from('hibr_thoughts')
      .select('*, profiles!hibr_thoughts_user_id_fkey(id, display_name, avatar_url)', { count: 'exact' })
      .eq('moderation_status', status)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from('hibr_comments')
      .select('*, profiles!hibr_comments_user_id_fkey(id, display_name, avatar_url)', { count: 'exact' })
      .eq('moderation_status', status)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
    supabase
      .from('hibr_replies')
      .select('*, profiles!hibr_replies_user_id_fkey(id, display_name, avatar_url)', { count: 'exact' })
      .eq('moderation_status', status)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1),
  ])

  const items = [
    ...(articles.data || []).map((a) => ({ ...a, _type: 'article' })),
    ...(thoughts.data || []).map((t) => ({ ...t, _type: 'thought' })),
    ...(comments.data || []).map((c) => ({ ...c, _type: 'comment' })),
    ...(replies.data || []).map((r) => ({ ...r, _type: 'reply' })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return successResponse({
    items,
    total: (articles.count ?? 0) + (thoughts.count ?? 0) + (comments.count ?? 0) + (replies.count ?? 0),
    tab,
  })
}
