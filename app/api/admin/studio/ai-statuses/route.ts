import { NextResponse } from "next/server"
import { getSessionAiStatuses } from "@/lib/studio"
import { requireAdminAPI } from "@/lib/api-utils"

/**
 * GET /api/admin/studio/ai-statuses — fetch latest AI statuses for all sessions
 */
export async function GET() {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const statuses = await getSessionAiStatuses()
  return NextResponse.json(statuses)
}
