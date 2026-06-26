/**
 * Partnership pipeline read model — leads joined with their AI triage summary
 * for the operator's at-a-glance board.
 */

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { sponsorshipLeads } from "@/lib/db/schema/system"
import { sponsorshipAnalysis } from "@/lib/db/schema/sponsorship-ai"
import type {
  SponsorshipStatus,
  PartnershipFitVerdict,
  PartnershipNextAction,
} from "@/types/database"

export interface PipelineLead {
  id: string
  company_name: string
  industry: string
  budget_range: string
  status: SponsorshipStatus
  created_at: string
  fit_score: number | null
  fit_verdict: PartnershipFitVerdict | null
  recommended_action: PartnershipNextAction | null
  analysis_status: string | null
}

export async function getPipelineLeads(): Promise<PipelineLead[]> {
  if (!db) return []
  const rows = await db
    .select({
      id: sponsorshipLeads.id,
      company_name: sponsorshipLeads.company_name,
      industry: sponsorshipLeads.industry,
      budget_range: sponsorshipLeads.budget_range,
      status: sponsorshipLeads.status,
      created_at: sponsorshipLeads.created_at,
      fit_score: sponsorshipAnalysis.fit_score,
      fit_verdict: sponsorshipAnalysis.fit_verdict,
      recommended_action: sponsorshipAnalysis.recommended_action,
      analysis_status: sponsorshipAnalysis.status,
    })
    .from(sponsorshipLeads)
    .leftJoin(sponsorshipAnalysis, eq(sponsorshipAnalysis.lead_id, sponsorshipLeads.id))
    .orderBy(desc(sponsorshipLeads.created_at))

  return rows.map((r) => ({
    id: r.id,
    company_name: r.company_name,
    industry: r.industry,
    budget_range: r.budget_range,
    status: (r.status as SponsorshipStatus) ?? "new",
    created_at: (r.created_at ?? new Date()).toISOString(),
    fit_score: r.fit_score ?? null,
    fit_verdict: (r.fit_verdict as PartnershipFitVerdict | null) ?? null,
    recommended_action: (r.recommended_action as PartnershipNextAction | null) ?? null,
    analysis_status: r.analysis_status ?? null,
  }))
}
