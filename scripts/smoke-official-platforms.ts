/**
 * Smoke test for the Official Platform Links refactor.
 * Verifies: schema shape, canonical queries, per-surface filtering.
 *
 * Usage: npx tsx scripts/smoke-official-platforms.ts
 */
import { db } from "../lib/db"
import {
  listAllPlatforms,
  listActivePlatforms,
  listPlatformsForSurface,
  getPlatformByKey,
} from "../lib/queries/official-platforms"

async function main() {
  if (!db) throw new Error("DB not configured")

  let fail = 0
  const check = (name: string, cond: boolean, hint?: string) => {
    console.log(`  ${cond ? "✓" : "✗"} ${name}${!cond && hint ? ` — ${hint}` : ""}`)
    if (!cond) fail++
  }

  console.log("\n1. listAllPlatforms()")
  const all = await listAllPlatforms()
  check("returns rows", all.length > 0, `got ${all.length}`)
  check("has new columns", all[0]?.category !== undefined && all[0]?.handle !== undefined)

  console.log("\n2. listActivePlatforms({category:'audio'})")
  const audio = await listActivePlatforms({ category: "audio" })
  check("all audio", audio.every((p) => p.category === "audio"))
  check("all active", audio.every((p) => p.is_active === true))
  console.log(`    audio count: ${audio.length}`)

  console.log("\n3. listPlatformsForSurface('footer')")
  const footer = await listPlatformsForSurface("footer")
  check("all footer-visible", footer.every((p) => p.show_in_footer === true))
  check("all active", footer.every((p) => p.is_active === true))
  console.log(`    footer count: ${footer.length} (${footer.map((p) => p.platform_key).join(", ")})`)

  console.log("\n4. listPlatformsForSurface('contact_page')")
  const contact = await listPlatformsForSurface("contact_page")
  check("all contact-visible", contact.every((p) => p.show_on_contact_page === true))
  console.log(`    contact count: ${contact.length}`)

  console.log("\n5. listPlatformsForSurface('episode_page')")
  const ep = await listPlatformsForSurface("episode_page")
  check("all episode-visible", ep.every((p) => p.show_on_episode_page === true))
  console.log(`    episode count: ${ep.length}`)

  console.log("\n6. getPlatformByKey('apple_podcasts')")
  const apple = await getPlatformByKey("apple_podcasts")
  check("found apple", apple !== null)
  check("category=audio", apple?.category === "audio")

  console.log("\n7. getPlatformByKey('youtube')")
  const yt = await getPlatformByKey("youtube")
  check("found youtube", yt !== null)
  check("category=video", yt?.category === "video")
  check("has handle", !!yt?.handle)

  console.log("\n8. social filter (category='social')")
  const social = await listActivePlatforms({ category: "social" })
  console.log(`    social count: ${social.length} (${social.map((p) => p.platform_key).join(", ")})`)
  check("has at least 2", social.length >= 2)

  console.log(`\n${fail === 0 ? "✓ ALL PASSED" : `✗ ${fail} FAILURES`}`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
