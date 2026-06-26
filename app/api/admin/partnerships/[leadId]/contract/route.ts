import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI, getAdminAuthUser } from "@/lib/api-utils"
import { stripHtml } from "@/lib/sanitize"
import { getContract, upsertContract } from "@/lib/partnership-crm"
import type { PartnerContractStatus } from "@/types/database"

const STATUSES: PartnerContractStatus[] = [
  "draft",
  "sent",
  "signed",
  "active",
  "completed",
  "expired",
  "cancelled",
]

export async function GET(_req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId } = await params
  return NextResponse.json({ contract: await getContract(leadId) })
}

// PUT — create-or-update the partner's contract.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ leadId: string }> }) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { leadId } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const user = await getAdminAuthUser()
  const contract = await upsertContract(leadId, {
    title: typeof body.title === "string" ? stripHtml(body.title) : undefined,
    status: STATUSES.includes(body.status as PartnerContractStatus)
      ? (body.status as PartnerContractStatus)
      : undefined,
    value: typeof body.value === "number" ? body.value : body.value === null ? null : undefined,
    currency: typeof body.currency === "string" ? stripHtml(body.currency) : undefined,
    start_date: typeof body.start_date === "string" || body.start_date === null ? (body.start_date as string | null) : undefined,
    end_date: typeof body.end_date === "string" || body.end_date === null ? (body.end_date as string | null) : undefined,
    terms: typeof body.terms === "string" ? stripHtml(body.terms) : undefined,
    document_url: typeof body.document_url === "string" ? stripHtml(body.document_url) : undefined,
    signed_at: typeof body.signed_at === "string" || body.signed_at === null ? (body.signed_at as string | null) : undefined,
    notes: typeof body.notes === "string" ? stripHtml(body.notes) : undefined,
    created_by: user ? `admin:${user.email}` : "admin",
  })
  return NextResponse.json({ contract })
}
