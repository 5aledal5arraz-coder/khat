import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import { runGuestKnowledgeForGuest, getGuestPublicKnowledge } from "@/lib/guests/knowledge"
import { invalidate } from "@/lib/cache"

export const maxDuration = 120

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  const data = await getGuestPublicKnowledge(id)
  return NextResponse.json({ data })
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  const startTime = Date.now()
  console.info(`[guest-knowledge] [${id}] started`)

  const result = await runGuestKnowledgeForGuest(id)

  if (!result.success) {
    console.error(`[guest-knowledge] [${id}] failed: ${result.error}, duration_ms=${Date.now() - startTime}`)
    return NextResponse.json({ error: result.error || "فشل توليد معرفة الضيف" }, { status: 500 })
  }

  console.info(`[guest-knowledge] [${id}] success, duration_ms=${Date.now() - startTime}`)
  // Refresh the public guest pages.
  invalidate("guests")
  return NextResponse.json({ data: result.data })
}
