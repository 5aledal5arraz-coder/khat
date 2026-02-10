import {
  getGuestApplications,
  getSponsorshipLeads,
  getNewsletterSubscribers,
} from "@/lib/admin/queries"
import { SubmissionsTabs } from "./submissions-tabs"

export const dynamic = "force-dynamic"

export default async function SubmissionsAdminPage() {
  const [guestApplications, sponsorshipLeads, newsletterSubscribers] =
    await Promise.all([
      getGuestApplications(),
      getSponsorshipLeads(),
      getNewsletterSubscribers(),
    ])

  return (
    <SubmissionsTabs
      guestApplications={guestApplications}
      sponsorshipLeads={sponsorshipLeads}
      newsletterSubscribers={newsletterSubscribers}
    />
  )
}
