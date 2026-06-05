import { db } from "../../lib/db"
import { guests } from "../../lib/db/schema"
import { like, desc } from "drizzle-orm"

async function main() {
  if (!db) throw new Error("no db")
  const rows = await db
    .select()
    .from(guests)
    .where(like(guests.name, "UAT Sync Guest%"))
    .orderBy(desc(guests.created_at))
    .limit(5)
  console.log("UAT SYNC GUESTS IN DB:", rows.length)
  rows.forEach(r => console.log("  -", JSON.stringify({ id: r.id, name: r.name, slug: r.slug })))
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
