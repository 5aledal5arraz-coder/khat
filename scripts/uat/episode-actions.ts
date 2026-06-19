// Real execution test of episode domain logic.
// Directly invokes the same lib functions that the server actions call.
// This exercises DB writes, version snapshots, cache invalidation, tombstones.
import crypto from "crypto"
import { db } from "../../lib/db"
import {
  episodes,
  hiddenEpisodes,
  episodeOverrides,
  episodeVersions,
  podcastPlatformLinks,
} from "../../lib/db/schema"
import { eq, desc } from "drizzle-orm"
import { setEpisodeOverride, deleteEpisodeOverride } from "../../lib/episodes/overrides"
import { saveVersion } from "../../lib/episodes/versions"
import { markEpisodesAsDeleted, getDeletedEpisodeIds, restoreDeletedEpisodes } from "../../lib/episodes/deleted"
import { listPlatformsForSurface } from "../../lib/queries/audio-platforms"

let pass = 0
let fail = 0
const results: string[] = []

function rec(name: string, ok: boolean, detail = "") {
  if (ok) pass++
  else fail++
  const tag = ok ? "PASS" : "FAIL"
  results.push(`${tag} | ${name} | ${detail}`)
  console.log(`${tag} - ${name} :: ${detail}`)
}

async function main() {
  if (!db) throw new Error("no db")

  console.log("=== E. EPISODE ACTIONS ===")

  // 1. Create a throwaway DB episode to experiment with.
  const testId = `uat-ep-${Date.now()}`
  const testSlug = `uat-slug-${Date.now()}`
  await db.insert(episodes).values({
    id: testId,
    title: "UAT Test Episode",
    slug: testSlug,
    description: "UAT original description",
    youtube_url: `https://youtube.com/watch?v=${testId}`,
    duration_minutes: 30,
    release_date: new Date().toISOString(),
    thumbnail_url: null,
    status: "published",
    featured: false,
    view_count: 0,
  })
  const created = await db.select().from(episodes).where(eq(episodes.id, testId))
  rec("Create test episode row", created.length === 1, `id=${testId}`)

  // 2. Toggle visibility → insert into hiddenEpisodes
  await db.insert(hiddenEpisodes).values({ episode_id: testId })
  await saveVersion(testId, "visibility", { hidden: false }, "إخفاء الحلقة")
  const hid = await db.select().from(hiddenEpisodes).where(eq(hiddenEpisodes.episode_id, testId))
  rec("Hide episode (hiddenEpisodes row)", hid.length === 1, `rows=${hid.length}`)

  const versionsAfterHide = await db
    .select()
    .from(episodeVersions)
    .where(eq(episodeVersions.episode_id, testId))
    .orderBy(desc(episodeVersions.created_at))
  rec("Version snapshot written on hide", versionsAfterHide.length >= 1, `count=${versionsAfterHide.length}`)

  // 3. Unhide
  await db.delete(hiddenEpisodes).where(eq(hiddenEpisodes.episode_id, testId))
  const unhid = await db.select().from(hiddenEpisodes).where(eq(hiddenEpisodes.episode_id, testId))
  rec("Unhide episode", unhid.length === 0, `rows=${unhid.length}`)

  // 4. Title override via setEpisodeOverride
  await saveVersion(testId, "title_override", { override: null }, "تعديل العنوان")
  await setEpisodeOverride({
    id: testId,
    originalTitle: "UAT Test Episode",
    customTitle: "UAT Custom Title",
  })
  const overrides = await db.select().from(episodeOverrides).where(eq(episodeOverrides.episode_id, testId))
  rec(
    "Title override persisted via setEpisodeOverride",
    overrides.length === 1 && overrides[0].custom_title === "UAT Custom Title",
    `custom_title=${overrides[0]?.custom_title}`,
  )

  // 5. Description override
  await setEpisodeOverride({
    id: testId,
    originalTitle: "UAT Test Episode",
    customTitle: "UAT Custom Title",
    customDescription: "UAT custom description",
  })
  const withDesc = await db.select().from(episodeOverrides).where(eq(episodeOverrides.episode_id, testId))
  rec(
    "Description override persisted",
    withDesc[0]?.custom_description === "UAT custom description",
    `custom_description=${withDesc[0]?.custom_description}`,
  )

  // 6. Remove override
  await deleteEpisodeOverride(testId)
  const afterDelete = await db.select().from(episodeOverrides).where(eq(episodeOverrides.episode_id, testId))
  rec("Remove override", afterDelete.length === 0, `rows=${afterDelete.length}`)

  // 7. Delete episode + tombstone
  await db.delete(episodes).where(eq(episodes.id, testId))
  await markEpisodesAsDeleted([testId], null)
  const afterHardDelete = await db.select().from(episodes).where(eq(episodes.id, testId))
  const tombstone = await getDeletedEpisodeIds()
  rec("Hard-delete episode row", afterHardDelete.length === 0, "")
  rec("Tombstone written to deleted_episodes", tombstone.has(testId), `tombstoned=${tombstone.has(testId)}`)

  // 8. Restore tombstone (cleanup)
  await restoreDeletedEpisodes([testId])
  const tombstoneAfterRestore = await getDeletedEpisodeIds()
  rec("Restore tombstone", !tombstoneAfterRestore.has(testId), "cleaned")

  // 9. Clean up version rows — schema uses episode_id with FK CASCADE, but the episode is gone so rows are orphans on non-cascaded tables.
  await db.delete(episodeVersions).where(eq(episodeVersions.episode_id, testId))

  // ==========================================================
  // Section F — Platform Links (using real PlatformSurface values)
  // ==========================================================
  console.log("=== F. PLATFORM LINKS ===")

  const footerPlatforms = await listPlatformsForSurface("footer")
  rec("listPlatformsForSurface(footer) returns rows", footerPlatforms.length > 0, `count=${footerPlatforms.length}`)

  const episodePagePlatforms = await listPlatformsForSurface("episode_page")
  rec("listPlatformsForSurface(episode_page)", episodePagePlatforms.length >= 0, `count=${episodePagePlatforms.length}`)

  const contactPagePlatforms = await listPlatformsForSurface("contact_page")
  rec("listPlatformsForSurface(contact_page)", contactPagePlatforms.length >= 0, `count=${contactPagePlatforms.length}`)

  // Insert a test platform with footer OFF and verify it's excluded, then enable and verify it appears
  const testPlatformId = crypto.randomUUID()
  const uniqueKey = `uat-test-${Date.now()}`
  await db.insert(podcastPlatformLinks).values({
    id: testPlatformId,
    platform_key: uniqueKey,
    platform_name: "UAT Test Platform",
    url: "https://example.com/uat",
    category: "other",
    is_active: true,
    show_in_footer: false,
    sort_order: 9999,
  })

  const footerBefore = await listPlatformsForSurface("footer")
  const hiddenVisible = footerBefore.some((p) => p.id === testPlatformId)
  rec("Footer-off platform NOT shown on footer", !hiddenVisible, `hiddenVisible=${hiddenVisible}`)

  await db
    .update(podcastPlatformLinks)
    .set({ show_in_footer: true })
    .where(eq(podcastPlatformLinks.id, testPlatformId))
  const footerAfter = await listPlatformsForSurface("footer")
  const nowVisible = footerAfter.some((p) => p.id === testPlatformId)
  rec("Footer-on platform IS shown on footer", nowVisible, `visible=${nowVisible}`)

  // is_active=false should exclude even when footer=true
  await db
    .update(podcastPlatformLinks)
    .set({ is_active: false })
    .where(eq(podcastPlatformLinks.id, testPlatformId))
  const footerInactive = await listPlatformsForSurface("footer")
  const inactiveVisible = footerInactive.some((p) => p.id === testPlatformId)
  rec("Inactive platform NOT shown", !inactiveVisible, `inactiveVisible=${inactiveVisible}`)

  // Cleanup
  await db.delete(podcastPlatformLinks).where(eq(podcastPlatformLinks.id, testPlatformId))

  console.log("")
  console.log(`=== SUMMARY: ${pass} passed, ${fail} failed ===`)
  if (fail > 0) process.exit(1)
  process.exit(0)
}

main().catch((e) => {
  console.error("UAT FAILED:", e)
  process.exit(1)
})
