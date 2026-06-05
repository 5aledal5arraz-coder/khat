import { NextRequest } from "next/server"
import {
  errorResponse,
  requireAdminAPI,
  successResponse,
  validateMutation,
} from "@/lib/api-utils"
import { analyzeCandidate } from "@/lib/guest-candidates"
import { revalidatePath } from "next/cache"

export const maxDuration = 90 // seconds — AI analysis can be slow

interface RouteContext {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, ctx: RouteContext) {
  const auth = await requireAdminAPI()
  if (auth) return auth
  const csrf = validateMutation(request)
  if (csrf) return csrf

  const { id } = await ctx.params
  try {
    const outcome = await analyzeCandidate(id)
    if (!outcome.ok) {
      return errorResponse(outcome.error, 500)
    }
    revalidatePath(`/admin/guest-candidates/${id}`)
    revalidatePath("/admin/guest-candidates")
    return successResponse({ result: outcome.result, runId: outcome.runId })
  } catch (err) {
    console.error("[guest-candidates] analyze route failed:", err)
    return errorResponse("فشل تحليل المرشح", 500)
  }
}
