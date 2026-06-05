import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, validateMutation, errorResponse } from "@/lib/api-utils"
import { getPreparationById, archivePreparation } from "@/lib/preparation/queries"

export const dynamic = "force-dynamic"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const mutErr = validateMutation(request)
  if (mutErr) return mutErr

  const { id } = await params
  const prep = await getPreparationById(id)
  if (!prep) return errorResponse("غير موجود", 404)
  if (prep.archived_at) return errorResponse("مؤرشف بالفعل", 409)

  const updated = await archivePreparation(id)
  if (!updated) return errorResponse("فشل الأرشفة", 500)
  return NextResponse.json({ preparation: updated })
}
