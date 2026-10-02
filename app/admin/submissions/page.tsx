import {
  getGuestApplications,
  getSponsorshipLeads,
  getNewsletterSubscribers,
} from "@/lib/admin/queries"
import { listContactMessages } from "@/lib/contact/messages"
import { SubmissionsTabs } from "./submissions-tabs"

export const dynamic = "force-dynamic"

export default async function SubmissionsAdminPage() {
  const [guestApplications, sponsorshipLeads, newsletterSubscribers, contactMessages] =
    await Promise.all([
      getGuestApplications(),
      getSponsorshipLeads(),
      getNewsletterSubscribers(),
      // /contact form inbox. A failed read degrades to an empty tab rather than
      // taking the whole submissions page down.
      listContactMessages().catch((e) => {
        console.error("[submissions] contact messages read failed:", e)
        return []
      }),
    ])

  return (
    <SubmissionsTabs
      guestApplications={guestApplications}
      sponsorshipLeads={sponsorshipLeads}
      newsletterSubscribers={newsletterSubscribers}
      contactMessages={contactMessages}
    />
  )
}
