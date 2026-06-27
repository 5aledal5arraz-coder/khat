import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { routeContribution } from "@/lib/community/route-to-brain"

export const maxDuration = 60

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const user = await getAdminAuthUser()
  const result = await routeContribution(id, user ? `admin:${user.email}` : "admin")
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "not_routable" ? 400 : 500
    const msg =
      result.reason === "not_routable"
        ? "هذا النوع للمراجعة فقط — لا يوجد وجهة في خط برين"
        : result.message || "تعذّر التوجيه"
    return NextResponse.json({ error: msg }, { status })
  }
  return NextResponse.json({ success: true, routed_kind: result.routed_kind, routed_id: result.routed_id })
}
