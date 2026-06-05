import { db } from "../../lib/db"
import {
  sponsorshipLeads,
  guestApplications,
  newsletterSubscribers,
  guests,
  adminUsers,
  adminSessions,
} from "../../lib/db/schema"
import { like, inArray } from "drizzle-orm"

async function main() {
  if (!db) throw new Error("no db")

  // Delete UAT sponsor leads
  const spDeleted = await db
    .delete(sponsorshipLeads)
    .where(like(sponsorshipLeads.email, "uat-sponsor-%@khat.test"))
    .returning({ id: sponsorshipLeads.id })
  console.log("deleted sponsor leads:", spDeleted.length)

  // Delete UAT guest apps
  const gaDeleted = await db
    .delete(guestApplications)
    .where(like(guestApplications.email, "uat-guest-%@khat.test"))
    .returning({ id: guestApplications.id })
  console.log("deleted guest applications:", gaDeleted.length)

  // Delete UAT newsletter subs
  const nsDeleted = await db
    .delete(newsletterSubscribers)
    .where(like(newsletterSubscribers.email, "uat-sub-%@khat.test"))
    .returning({ id: newsletterSubscribers.id })
  console.log("deleted newsletter subs:", nsDeleted.length)

  // Delete UAT guests
  const gDeleted = await db
    .delete(guests)
    .where(like(guests.name, "UAT%"))
    .returning({ id: guests.id, name: guests.name })
  console.log("deleted UAT guests:", gDeleted.length)

  // Delete UAT editor admin user + their sessions
  const uatAdmins = await db
    .select({ id: adminUsers.id, email: adminUsers.email })
    .from(adminUsers)
    .where(like(adminUsers.email, "uat-editor-%@khat.test"))
  if (uatAdmins.length > 0) {
    const ids = uatAdmins.map((a) => a.id)
    await db.delete(adminSessions).where(inArray(adminSessions.user_id, ids))
    await db.delete(adminUsers).where(inArray(adminUsers.id, ids))
    console.log("deleted uat admin users:", uatAdmins.length)
  }

  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
