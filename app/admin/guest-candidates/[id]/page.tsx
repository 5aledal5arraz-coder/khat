import { notFound } from "next/navigation"
import {
  getCandidate,
  listStatusHistory,
  listOutreachMessages,
  listPrepLinks,
  listResponses,
  listTemplates,
  listPrepMeetings,
  getEirForCandidate,
  getCandidateGuestId,
} from "@/lib/guest-candidates"
import { CandidateDetailClient } from "./candidate-detail-client"

export const dynamic = "force-dynamic"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function CandidateDetailPage({ params }: PageProps) {
  const { id } = await params

  const candidate = await getCandidate(id)
  if (!candidate) notFound()

  const [statusHistory, outreachMessages, prepLinks, prepResponses, templates, prepMeetings, productionEir, linkedGuestId] = await Promise.all([
    listStatusHistory(id),
    listOutreachMessages(id),
    listPrepLinks(id),
    listResponses(id),
    listTemplates(),
    listPrepMeetings(id),
    getEirForCandidate(id),
    getCandidateGuestId(id),
  ])

  // Serialize Date fields
  const serializedCandidate = {
    ...candidate,
    ai_generated_at: candidate.ai_generated_at ? new Date(candidate.ai_generated_at as unknown as Date).toISOString() : null,
    last_contacted_at: candidate.last_contacted_at ? new Date(candidate.last_contacted_at as unknown as Date).toISOString() : null,
    prep_link_last_sent_at: candidate.prep_link_last_sent_at ? new Date(candidate.prep_link_last_sent_at as unknown as Date).toISOString() : null,
    archived_at: candidate.archived_at ? new Date(candidate.archived_at as unknown as Date).toISOString() : null,
    deleted_at: candidate.deleted_at ? new Date(candidate.deleted_at as unknown as Date).toISOString() : null,
    created_at: new Date(candidate.created_at as unknown as Date).toISOString(),
    updated_at: new Date(candidate.updated_at as unknown as Date).toISOString(),
    social_links: candidate.social_links.map((s) => ({
      ...s,
      created_at: new Date(s.created_at as unknown as Date).toISOString(),
      updated_at: new Date(s.updated_at as unknown as Date).toISOString(),
    })),
  }

  const serializedHistory = statusHistory.map((h) => ({
    ...h,
    created_at: new Date(h.created_at as unknown as Date).toISOString(),
  }))

  const serializedOutreach = outreachMessages.map((m) => ({
    ...m,
    created_at: new Date(m.created_at as unknown as Date).toISOString(),
    updated_at: new Date(m.updated_at as unknown as Date).toISOString(),
  })) as unknown as import("@/types/database").GuestCandidateOutreachMessage[]

  const serializedPrepLinks = prepLinks.map((l) => ({
    ...l,
    expires_at: l.expires_at ? new Date(l.expires_at as unknown as Date).toISOString() : null,
    first_opened_at: l.first_opened_at ? new Date(l.first_opened_at as unknown as Date).toISOString() : null,
    last_opened_at: l.last_opened_at ? new Date(l.last_opened_at as unknown as Date).toISOString() : null,
    submitted_at: l.submitted_at ? new Date(l.submitted_at as unknown as Date).toISOString() : null,
    created_at: new Date(l.created_at as unknown as Date).toISOString(),
    updated_at: new Date(l.updated_at as unknown as Date).toISOString(),
  })) as unknown as import("@/types/database").PrepFormLink[]

  const serializedResponses = prepResponses.map((r) => ({
    ...r,
    submitted_at: r.submitted_at ? new Date(r.submitted_at as unknown as Date).toISOString() : null,
    created_at: new Date(r.created_at as unknown as Date).toISOString(),
    updated_at: new Date(r.updated_at as unknown as Date).toISOString(),
  })) as unknown as import("@/types/database").PrepFormResponse[]

  const serializedTemplates = templates.map((t) => ({
    ...t,
    created_at: new Date(t.created_at as unknown as Date).toISOString(),
    updated_at: new Date(t.updated_at as unknown as Date).toISOString(),
  })) as unknown as import("@/types/database").PrepFormTemplate[]

  return (
    <CandidateDetailClient
      candidate={serializedCandidate}
      statusHistory={serializedHistory}
      outreachMessages={serializedOutreach}
      prepLinks={serializedPrepLinks}
      prepResponses={serializedResponses}
      templates={serializedTemplates}
      prepMeetings={prepMeetings}
      productionEir={productionEir}
      hasCanonicalLink={!!linkedGuestId}
    />
  )
}
