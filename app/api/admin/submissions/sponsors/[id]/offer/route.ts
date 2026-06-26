import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { getOfferByLead, getOrCreateOfferForLead } from "@/lib/partnership-offers"

// GET — fetch the lead's offer (if any).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const offer = await getOfferByLead(id)
  return NextResponse.json({ exists: !!offer, offer })
}

// POST — create the offer (seeded from the latest AI proposal) or return the
// existing one. Never overwrites edits.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params
  const offer = await getOrCreateOfferForLead(id)
  if (!offer) {
    return NextResponse.json({ error: "تعذّر إنشاء العرض — تأكد من وجود الطلب." }, { status: 404 })
  }
  return NextResponse.json({ exists: true, offer })
}
