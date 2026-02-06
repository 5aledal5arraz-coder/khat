import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAuthUser,
  getUserProfile,
  validateMutation,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('hibr_thoughts')
    .select('*, profiles!hibr_thoughts_user_id_fkey(id, display_name, avatar_url, bio)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error || !data) return notFoundResponse()

  // Also fetch replies
  const { data: replies } = await supabase
    .from('hibr_replies')
    .select('*, profiles!hibr_replies_user_id_fkey(id, display_name, avatar_url)')
    .eq('thought_id', id)
    .is('deleted_at', null)
    .in('moderation_status', ['approved', 'pending'])
    .order('created_at', { ascending: true })

  return successResponse({ thought: data, replies: replies || [] })
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('hibr_thoughts')
    .select('user_id')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (!existing) return notFoundResponse()

  const profile = await getUserProfile(user.id)
  if (existing.user_id !== user.id && !profile?.is_admin) return forbiddenResponse()

  const { error } = await supabase
    .from('hibr_thoughts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return errorResponse('حدث خطأ في حذف الخاطرة', 500)

  return successResponse({ deleted: true })
}
