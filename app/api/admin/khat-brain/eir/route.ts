/**
 * Khat Brain — EIR list endpoint.
 *
 * GET /api/admin/khat-brain/eir
 *
 * Query params:
 *   phase=<EpisodePhase>          filter by phase
 *   season_id=<id>                filter by season
 *   guest_id=<id>                 filter by guest
 *   include_archived=true         include archived rows (default: false)
 *   limit=<n>                     default 100
 *
 * Phase 1 visibility — admins/devs use this to confirm EIRs are flowing.
 * No write operations here yet; creation happens through service module.
 */

import { NextResponse } from "next/server"
import { requireAdminAPI } from "@/lib/api-utils"
import {
  countByPhase,
  listEpisodeIntelligenceRecords,
} from "@/lib/eir"
import type { EpisodePhase } from "@/lib/eir"
import { EPISODE_PHASES } from "@/lib/eir"

export async function GET(request: Request): Promise<NextResponse> {
  const authError = await requireAdminAPI()
  if (authError) return authError

  const url = new URL(request.url)
  const phaseParam = url.searchParams.get("phase")
  const seasonId = url.searchParams.get("season_id") ?? undefined
  const guestId = url.searchParams.get("guest_id") ?? undefined
  const includeArchived =
    url.searchParams.get("include_archived") === "true"
  const limit = Number(url.searchParams.get("limit") ?? 100)

  let phase: EpisodePhase | undefined
  if (phaseParam) {
    if (!(EPISODE_PHASES as readonly string[]).includes(phaseParam)) {
      return NextResponse.json(
        { error: `Unknown phase "${phaseParam}"` },
        { status: 400 },
      )
    }
    phase = phaseParam as EpisodePhase
  }

  const [records, counts] = await Promise.all([
    listEpisodeIntelligenceRecords({
      phase,
      season_id: seasonId,
      guest_id: guestId,
      exclude_archived: !includeArchived,
      limit: Math.min(Math.max(1, limit), 500),
    }),
    countByPhase(),
  ])

  return NextResponse.json({
    records,
    counts,
    total: records.length,
  })
}
