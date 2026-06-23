import { NextRequest, NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import {
  getGrowthPackageForSession,
  runGrowthPackageForSession,
  revalidateStudio,
} from "@/lib/studio"

export const maxDuration = 300

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdminAPI()
  if (authError) return authError
  const { id } = await params

  const data = await getGrowthPackageForSession(id)
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
  console.info(`[Studio:growth-package] [${id}] started`)

  const result = await runGrowthPackageForSession(id)

  if (!result.success) {
    console.error(`[Studio:growth-package] [${id}] failed: ${result.error}, duration_ms=${Date.now() - startTime}`)
    return NextResponse.json({ error: result.error || "فشل في توليد حزمة النمو" }, { status: 500 })
  }

  console.info(`[Studio:growth-package] [${id}] success, duration_ms=${Date.now() - startTime}`)
  revalidateStudio(id)

  // Return the freshly persisted record so the client hydrates the full shape.
  const saved = await getGrowthPackageForSession(id)
  return NextResponse.json({ data: saved })
}
