import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { getGuestAnalysis } from "@/lib/admin/queries"
import { runAndPersistGuestAnalysis } from "@/lib/guest-triage"

export const maxDuration = 120

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const analysis = await getGuestAnalysis(id)

  if (!analysis) {
    return NextResponse.json({ exists: false }, { status: 404 })
  }

  return NextResponse.json({ exists: true, analysis })
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const { id } = await params
  const user = await getAdminAuthUser()
  const result = await runAndPersistGuestAnalysis(id, {
    actorId: user ? `admin:${user.email}` : "admin:manual-analyze",
  })

  if (!result.ok) {
    if (result.error === "application not found") {
      return NextResponse.json({ error: "طلب الضيف غير موجود" }, { status: 404 })
    }
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  const analysis = await getGuestAnalysis(id)
  return NextResponse.json({ exists: true, analysis })
}
