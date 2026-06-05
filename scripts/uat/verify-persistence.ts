// Verify that the POST forms actually persisted rows in DB.
import { db } from "../../lib/db"
import { sponsorshipLeads, guestApplications, newsletterSubscribers } from "../../lib/db/schema"
import { sql, like, desc } from "drizzle-orm"

async function main() {
  if (!db) throw new Error("no db")

  const sponsors = await db
    .select()
    .from(sponsorshipLeads)
    .where(like(sponsorshipLeads.email, "uat-sponsor-%@khat.test"))
    .orderBy(desc(sponsorshipLeads.created_at))
    .limit(5)
  console.log("SPONSOR_LEADS_UAT:", sponsors.length)
  if (sponsors[0]) console.log("  first:", JSON.stringify({ company: sponsors[0].company_name, email: sponsors[0].email, status: sponsors[0].status }))

  const guests = await db
    .select()
    .from(guestApplications)
    .where(like(guestApplications.email, "uat-guest-%@khat.test"))
    .orderBy(desc(guestApplications.created_at))
    .limit(5)
  console.log("GUEST_APPLICATIONS_UAT:", guests.length)
  if (guests[0]) console.log("  first:", JSON.stringify({ name: guests[0].name, email: guests[0].email, status: guests[0].status }))

  const news = await db
    .select()
    .from(newsletterSubscribers)
    .where(like(newsletterSubscribers.email, "uat-news-%@khat.test"))
    .orderBy(desc(newsletterSubscribers.created_at))
    .limit(5)
  console.log("NEWSLETTER_SUBS_UAT:", news.length)
  if (news[0]) console.log("  first:", JSON.stringify({ email: news[0].email, status: news[0].status }))

  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
