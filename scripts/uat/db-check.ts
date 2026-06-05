import { db } from '../../lib/db'
import { adminUsers, episodes, guests, podcastPlatformLinks, sponsorshipLeads, guestApplications, newsletterSubscribers, guestCandidates } from '../../lib/db/schema'
import { sql } from 'drizzle-orm'

async function main() {
  if (!db) { console.log('NO DB'); process.exit(1) }
  const admins = await db.select({ id: adminUsers.id, email: adminUsers.email, role: adminUsers.role }).from(adminUsers)
  const epCount = await db.select({ c: sql<number>`count(*)::int` }).from(episodes)
  const gsCount = await db.select({ c: sql<number>`count(*)::int` }).from(guests)
  const plCount = await db.select({ c: sql<number>`count(*)::int` }).from(podcastPlatformLinks)
  const slCount = await db.select({ c: sql<number>`count(*)::int` }).from(sponsorshipLeads)
  const gaCount = await db.select({ c: sql<number>`count(*)::int` }).from(guestApplications)
  const gcCount = await db.select({ c: sql<number>`count(*)::int` }).from(guestCandidates)
  const nsCount = await db.select({ c: sql<number>`count(*)::int` }).from(newsletterSubscribers)
  console.log('ADMINS:', JSON.stringify(admins))
  console.log('COUNTS:', JSON.stringify({
    episodes: epCount[0].c,
    guests: gsCount[0].c,
    platforms: plCount[0].c,
    sponsor_leads: slCount[0].c,
    guest_applications: gaCount[0].c,
    guest_candidates: gcCount[0].c,
    newsletter_subs: nsCount[0].c,
  }))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
