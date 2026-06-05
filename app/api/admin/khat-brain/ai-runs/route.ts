/**
 * Khat Brain — recent AI run list.
 *
 * GET /api/admin/khat-brain/ai-runs?limit=50
 */

import { NextResponse } from "next/server"
import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { aiRuns, type AiRunStatus, AI_RUN_STATUSES } from "@/lib/db/schema/ai-runs"
import { requireAdminAPI } from "@/lib/api-utils"

export async function GET(request: Request): Promise<NextResponse> {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const url = new URL(request.url)
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
    500,
  )
  const statusParam = url.searchParams.get("status")
  let status: AiRunStatus | undefined
  if (statusParam) {
    if (!(AI_RUN_STATUSES as readonly string[]).includes(statusParam)) {
      return NextResponse.json(
        { error: `Unknown status "${statusParam}"` },
        { status: 400 },
      )
    }
    status = statusParam as AiRunStatus
  }

  const rows = await db!
    .select({
      id: aiRuns.id,
      eir_id: aiRuns.eir_id,
      subject_table: aiRuns.subject_table,
      subject_id: aiRuns.subject_id,
      task_kind: aiRuns.task_kind,
      provider: aiRuns.provider,
      model_name: aiRuns.model_name,
      status: aiRuns.status,
      started_at: aiRuns.started_at,
      completed_at: aiRuns.completed_at,
      latency_ms: aiRuns.latency_ms,
      tokens_in: aiRuns.tokens_in,
      tokens_out: aiRuns.tokens_out,
      cost_usd: aiRuns.cost_usd,
      error_class: aiRuns.error_class,
    })
    .from(aiRuns)
    .where(status ? eq(aiRuns.status, status) : undefined)
    .orderBy(desc(aiRuns.started_at))
    .limit(limit)

  return NextResponse.json({ runs: rows, total: rows.length })
}
