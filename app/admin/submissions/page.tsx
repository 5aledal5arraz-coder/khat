import {
  getGuestApplications,
  getSponsorshipLeads,
  getNewsletterSubscribers,
  getThinkerSuggestions,
} from "@/lib/admin/queries"
import { SubmissionsTabs } from "./submissions-tabs"

export const dynamic = "force-dynamic"

export default async function SubmissionsAdminPage() {
  const [guestApplications, sponsorshipLeads, newsletterSubscribers, thinkerSuggestions] =
    await Promise.all([
      getGuestApplications(),
      getSponsorshipLeads(),
      getNewsletterSubscribers(),
      getThinkerSuggestions(),
    ])

  return (
    <SubmissionsTabs
      guestApplications={guestApplications}
      sponsorshipLeads={sponsorshipLeads}
      newsletterSubscribers={newsletterSubscribers}
      thinkerSuggestions={thinkerSuggestions}
    />
  )
}
