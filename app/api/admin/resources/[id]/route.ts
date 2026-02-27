import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { updateCuratedResource } from "@/lib/queries/curated-resources"

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const body = await request.json()

  if (body.status && !["pending", "approved", "rejected"].includes(body.status)) {
    return NextResponse.json({ error: "حالة غير صالحة" }, { status: 400 })
  }

  const updateData: Record<string, unknown> = { ...body }
  if (body.status === "approved") {
    updateData.approved_at = new Date()
  }

  const updated = await updateCuratedResource(id, updateData)
  if (!updated) {
    return NextResponse.json({ error: "المورد غير موجود" }, { status: 404 })
  }

  return NextResponse.json(updated)
}
