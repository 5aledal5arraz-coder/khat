/**
 * Casting pipeline read model — applications joined with their AI casting
 * summary for the operator's at-a-glance board.
 */

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { guestApplications } from "@/lib/db/schema/guests"
import { guestApplicationAnalysis } from "@/lib/db/schema/guest-ai"
import type { GuestApplicationStatus, GuestAnalysisRecommendation } from "@/types/database"

export interface CastingLead {
  id: string
  name: string
  country: string
  story_idea: string
  status: GuestApplicationStatus
  created_at: string
  fit_score: number | null
  recommendation: GuestAnalysisRecommendation | null
  analysis_status: string | null
}

export async function getCastingPipeline(): Promise<CastingLead[]> {
  if (!db) return []
  const rows = await db
    .select({
      id: guestApplications.id,
      name: guestApplications.name,
      country: guestApplications.country,
      story_idea: guestApplications.story_idea,
      status: guestApplications.status,
      created_at: guestApplications.created_at,
      fit_score: guestApplicationAnalysis.fit_score,
      recommendation: guestApplicationAnalysis.recommendation,
      analysis_status: guestApplicationAnalysis.status,
    })
    .from(guestApplications)
    .leftJoin(guestApplicationAnalysis, eq(guestApplicationAnalysis.application_id, guestApplications.id))
    .orderBy(desc(guestApplications.created_at))

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    story_idea: r.story_idea,
    status: (r.status as GuestApplicationStatus) ?? "new",
    created_at: (r.created_at ?? new Date()).toISOString(),
    fit_score: r.fit_score ?? null,
    recommendation: (r.recommendation as GuestAnalysisRecommendation | null) ?? null,
    analysis_status: r.analysis_status ?? null,
  }))
}
