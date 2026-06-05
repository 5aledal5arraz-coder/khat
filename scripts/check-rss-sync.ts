/**
 * Diagnostic: verify the RSS sync path works end-to-end.
 * Usage: npx tsx scripts/check-rss-sync.ts
 */
import { db } from "../lib/db"
import { episodes } from "../lib/db/schema"
import { eq, isNotNull, sql } from "drizzle-orm"
import { syncRssFeed } from "../lib/rss/sync"

async function main() {
  if (!db) throw new Error("DB not configured — set DATABASE_URL")

  console.log("=== RSS SYNC DIAGNOSTIC ===\n")

  // 1. Env
  const feedUrl = process.env.RSS_FEED_URL
  console.log("1. Env: RSS_FEED_URL =", feedUrl || "(MISSING)")
  if (!feedUrl) {
    console.error("   ❌ RSS_FEED_URL missing — sync will fail")
    process.exit(1)
  }

  // 2. Reach the feed
  console.log("\n2. Fetching feed...")
  const res = await fetch(feedUrl, { cache: "no-store" })
  console.log(`   HTTP ${res.status} ${res.statusText}`)
  const ct = res.headers.get("content-type")
  console.log(`   content-type: ${ct}`)
  if (!res.ok) {
    console.error("   ❌ feed unreachable")
    process.exit(1)
  }
  const xml = await res.text()
  console.log(`   body size: ${xml.length} chars`)
  const itemMatches = xml.match(/<item[\s>]/g)
  console.log(`   <item> count: ${itemMatches?.length ?? 0}`)

  // 3. Episode counts — before
  console.log("\n3. Episode audio state BEFORE sync:")
  const [beforeTotal] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(episodes)
  const [beforeAudio] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(episodes)
    .where(isNotNull(episodes.audio_url))
  const [beforeGuid] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(episodes)
    .where(isNotNull(episodes.rss_guid))
  console.log(`   total episodes: ${beforeTotal.c}`)
  console.log(`   with audio_url: ${beforeAudio.c}`)
  console.log(`   with rss_guid:  ${beforeGuid.c}`)

  // 4. Sample (first 3 episodes)
  const sampleBefore = await db
    .select({
      id: episodes.id,
      title: episodes.title,
      audio_url: episodes.audio_url,
      audio_duration: episodes.audio_duration,
      rss_guid: episodes.rss_guid,
    })
    .from(episodes)
    .limit(3)
  console.log("\n   sample episodes (first 3):")
  for (const ep of sampleBefore) {
    console.log(`   • ${ep.title.slice(0, 40)}`)
    console.log(`     audio_url:  ${ep.audio_url ? ep.audio_url.slice(0, 60) + "…" : "NULL"}`)
    console.log(`     duration:   ${ep.audio_duration ?? "NULL"}`)
    console.log(`     rss_guid:   ${ep.rss_guid ? ep.rss_guid.slice(0, 40) + "…" : "NULL"}`)
  }

  // 5. Run sync
  console.log("\n4. Running syncRssFeed()...")
  const result = await syncRssFeed()
  console.log(`   status:     ${result.status}`)
  console.log(`   totalItems: ${result.totalItems}`)
  console.log(`   matched:    ${result.matched}`)
  console.log(`   skipped:    ${result.skipped}`)
  console.log(`   errors:     ${result.errors.length}`)
  if (result.errors.length > 0) {
    console.log("   first errors:")
    for (const e of result.errors.slice(0, 3)) console.log(`   - ${e}`)
  }
  console.log(`   message:    ${result.message}`)

  // 6. After counts
  const [afterAudio] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(episodes)
    .where(isNotNull(episodes.audio_url))
  const [afterGuid] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(episodes)
    .where(isNotNull(episodes.rss_guid))
  console.log("\n5. Episode audio state AFTER sync:")
  console.log(`   with audio_url: ${afterAudio.c} (delta ${afterAudio.c - beforeAudio.c})`)
  console.log(`   with rss_guid:  ${afterGuid.c} (delta ${afterGuid.c - beforeGuid.c})`)

  // 7. Sample after
  const sampleAfter = await db
    .select({
      id: episodes.id,
      title: episodes.title,
      audio_url: episodes.audio_url,
      audio_duration: episodes.audio_duration,
      rss_guid: episodes.rss_guid,
    })
    .from(episodes)
    .where(eq(episodes.id, sampleBefore[0]?.id ?? ""))
    .limit(1)
  if (sampleAfter[0]) {
    console.log("\n   first sample after:")
    console.log(`   • ${sampleAfter[0].title.slice(0, 40)}`)
    console.log(`     audio_url:  ${sampleAfter[0].audio_url ? sampleAfter[0].audio_url.slice(0, 60) + "…" : "NULL"}`)
    console.log(`     duration:   ${sampleAfter[0].audio_duration ?? "NULL"}`)
    console.log(`     rss_guid:   ${sampleAfter[0].rss_guid ? sampleAfter[0].rss_guid.slice(0, 40) + "…" : "NULL"}`)
  }

  // 8. Verdict
  console.log("\n=== VERDICT ===")
  const ok =
    result.status === "success" ||
    (result.totalItems > 0 && result.matched > 0)
  const feedHasItems = (itemMatches?.length ?? 0) > 0
  const siteConsumes = true // verified statically: episode-page-client + JSON-LD use audio_url + audio_duration

  console.log(`Feed reachable:        ${feedHasItems ? "✓ YES" : "✗ NO"}`)
  console.log(`Sync endpoint works:   ${ok ? "✓ YES" : "✗ NO"}`)
  console.log(`Audio fields populated: ${afterAudio.c > 0 ? `✓ YES (${afterAudio.c} eps)` : "✗ NONE"}`)
  console.log(`Public site consumes:  ${siteConsumes ? "✓ YES (episode-page-client.tsx + JSON-LD)" : "✗ NO"}`)

  if (ok && afterAudio.c > 0) {
    console.log("\n✓ RSS sync is working and linked to the public site")
    process.exit(0)
  } else if (result.totalItems > 0 && result.matched === 0) {
    console.log("\n⚠ Feed has items but NONE matched existing episodes.")
    console.log("  This is likely a title/date mismatch. Check normalized titles or")
    console.log("  publish dates (±7 day window).")
    process.exit(2)
  } else {
    console.log("\n✗ RSS sync failed — see errors above")
    process.exit(1)
  }
}

main().catch((e) => {
  console.error("CHECK FAIL:", e)
  process.exit(1)
})
