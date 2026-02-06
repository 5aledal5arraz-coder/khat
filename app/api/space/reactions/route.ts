import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getAuthUser,
  validateMutation,
  unauthorizedResponse,
  validationErrorResponse,
  successResponse,
  errorResponse,
} from '@/lib/api-utils'

const VALID_REACTIONS = ['clap', 'fire', 'bulb', 'heart'] as const

export async function POST(request: NextRequest) {
  const mutationError = validateMutation(request)
  if (mutationError) return mutationError

  const user = await getAuthUser()
  if (!user) return unauthorizedResponse()

  let body: { article_id: string; reaction_type: string }
  try {
    body = await request.json()
  } catch {
    return errorResponse('بيانات غير صالحة', 400)
  }

  if (!body.article_id) return validationErrorResponse('معرف المقال مطلوب')
  if (!VALID_REACTIONS.includes(body.reaction_type as typeof VALID_REACTIONS[number])) {
    return validationErrorResponse('نوع التفاعل غير صالح')
  }

  const supabase = await createClient()

  // Check if already reacted
  const { data: existing } = await supabase
    .from('hibr_reactions')
    .select('id')
    .eq('user_id', user.id)
    .eq('article_id', body.article_id)
    .eq('reaction_type', body.reaction_type)
    .single()

  if (existing) {
    await supabase.from('hibr_reactions').delete().eq('id', existing.id)
    return successResponse({ reacted: false, reaction_type: body.reaction_type })
  }

  const { error } = await supabase
    .from('hibr_reactions')
    .insert({
      user_id: user.id,
      article_id: body.article_id,
      reaction_type: body.reaction_type,
    })

  if (error) return errorResponse('حدث خطأ في التفاعل', 500)

  return successResponse({ reacted: true, reaction_type: body.reaction_type })
}
