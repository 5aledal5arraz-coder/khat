/**
 * Khat Brain — recent jobs list.
 *
 * GET /api/admin/khat-brain/jobs?status=<status>&type=<type>&limit=50
 */

import { NextResponse } from "next/server"
import { listJobs, type JobStatus } from "@/lib/jobs"
import { requireAdminAPI } from "@/lib/api-utils"

const ALLOWED_STATUSES: readonly JobStatus[] = [
  "pending",
  "running",
  "succeeded",
  "failed",
  "dead",
  "cancelled",
] as const

export async function GET(request: Request): Promise<NextResponse> {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const url = new URL(request.url)
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
    500,
  )
  const statusParam = url.searchParams.get("status") as JobStatus | null
  const type = url.searchParams.get("type") ?? undefined

  if (statusParam && !ALLOWED_STATUSES.includes(statusParam)) {
    return NextResponse.json(
      { error: `Unknown status "${statusParam}"` },
      { status: 400 },
    )
  }

  const jobs = await listJobs({
    status: statusParam ?? undefined,
    type,
    limit,
  })

  return NextResponse.json({ jobs, total: jobs.length })
}
