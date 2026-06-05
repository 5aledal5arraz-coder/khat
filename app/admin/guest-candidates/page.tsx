import { listCandidates, getCandidateStats } from "@/lib/guest-candidates"
import { CandidatesListClient } from "./candidates-list-client"

export const dynamic = "force-dynamic"

export default async function GuestCandidatesPage() {
  const [candidates, stats] = await Promise.all([
    listCandidates({ includeArchived: false }),
    getCandidateStats(),
  ])

  // Serialize Date fields for client component
  const serialized = candidates.map((c) => ({
    ...c,
    ai_generated_at: c.ai_generated_at ? new Date(c.ai_generated_at as unknown as Date).toISOString() : null,
    last_contacted_at: c.last_contacted_at ? new Date(c.last_contacted_at as unknown as Date).toISOString() : null,
    prep_link_last_sent_at: c.prep_link_last_sent_at ? new Date(c.prep_link_last_sent_at as unknown as Date).toISOString() : null,
    archived_at: c.archived_at ? new Date(c.archived_at as unknown as Date).toISOString() : null,
    deleted_at: c.deleted_at ? new Date(c.deleted_at as unknown as Date).toISOString() : null,
    created_at: new Date(c.created_at as unknown as Date).toISOString(),
    updated_at: new Date(c.updated_at as unknown as Date).toISOString(),
    social_links: c.social_links.map((s) => ({
      ...s,
      created_at: new Date(s.created_at as unknown as Date).toISOString(),
      updated_at: new Date(s.updated_at as unknown as Date).toISOString(),
    })),
  }))

  return <CandidatesListClient initialCandidates={serialized} stats={stats} />
}
