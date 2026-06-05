import { requireAdminAPI, successResponse, errorResponse } from "@/lib/api-utils"
import { syncRssFeed } from "@/lib/rss/sync"

export async function POST() {
  const authError = await requireAdminAPI()
  if (authError) return authError

  try {
    const result = await syncRssFeed()
    return successResponse(result)
  } catch (error: unknown) {
    console.error("RSS sync failed:", error)
    return errorResponse("فشل مزامنة RSS: " + (error instanceof Error ? error.message : "خطأ غير معروف"), 500)
  }
}
