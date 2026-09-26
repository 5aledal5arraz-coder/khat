/**
 * «نسخة الضيف» — removes ONLY what scripts/demo-guest-link.ts created.
 *
 * A row is demo iff it carries BOTH tags: the «[DEMO]» prefix AND
 * created_by = "demo-guest-link" (guests have no created_by, so they are
 * matched on the «[DEMO]» name AND the demo slug prefix). Links and
 * suggestions go with their EIR (FK cascade). House photos written by the
 * demo are deleted from data/guest-homes/. Local only.
 *
 *   npx tsx scripts/demo-guest-link-cleanup.ts
 */

import { loadEnvFiles } from "../lib/env-file"

loadEnvFiles()

const DEMO_TAG = "[DEMO]"
const DEMO_ACTOR = "demo-guest-link"

export async function cleanupDemo(): Promise<{ eirs: number; preps: number; guests: number; photos: number }> {
  const url = process.env.DATABASE_URL ?? ""
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
    throw new Error("REFUSED: DATABASE_URL does not point at localhost. This script is local-only.")
  }
  const { and, eq, inArray, like } = await import("drizzle-orm")
  const { unlink } = await import("node:fs/promises")
  const path = await import("node:path")
  const { db } = await import("../lib/db")
  const { guests } = await import("../lib/db/schema/guests")
  const { episodeIntelligenceRecords } = await import("../lib/db/schema/eir")
  const { episodePreparations } = await import("../lib/db/schema/preparation")
  const { guestEpisodeLinks } = await import("../lib/db/schema/guest-episode-links")
  const { HOUSE_PHOTO_DIR, isSafeHousePhotoName } = await import("../lib/guest-link/house-photo")
  if (!db) throw new Error("db unavailable")

  const eirs = await db
    .select({ id: episodeIntelligenceRecords.id })
    .from(episodeIntelligenceRecords)
    .where(
      and(
        like(episodeIntelligenceRecords.working_title, `${DEMO_TAG}%`),
        eq(episodeIntelligenceRecords.created_by, DEMO_ACTOR),
      ),
    )
  const eirIds = eirs.map((e) => e.id)

  let photos = 0
  let preps = 0
  if (eirIds.length) {
    const links = await db
      .select({ house_photo: guestEpisodeLinks.house_photo })
      .from(guestEpisodeLinks)
      .where(
        and(inArray(guestEpisodeLinks.eir_id, eirIds), eq(guestEpisodeLinks.created_by, DEMO_ACTOR)),
      )
    for (const l of links) {
      if (isSafeHousePhotoName(l.house_photo)) {
        await unlink(path.join(HOUSE_PHOTO_DIR, l.house_photo)).catch(() => undefined)
        photos++
      }
    }
    const deletedPreps = await db
      .delete(episodePreparations)
      .where(
        and(
          inArray(episodePreparations.eir_id, eirIds),
          like(episodePreparations.title, `${DEMO_TAG}%`),
          eq(episodePreparations.created_by, DEMO_ACTOR),
        ),
      )
      .returning({ id: episodePreparations.id })
    preps = deletedPreps.length
    await db
      .delete(episodeIntelligenceRecords)
      .where(inArray(episodeIntelligenceRecords.id, eirIds))
  }

  const deletedGuests = await db
    .delete(guests)
    .where(and(like(guests.name, `${DEMO_TAG}%`), like(guests.slug, "demo-guest-link-%")))
    .returning({ id: guests.id })

  return { eirs: eirIds.length, preps, guests: deletedGuests.length, photos }
}

if (require.main === module) {
  cleanupDemo()
    .then((r) => {
      console.log(
        `[DEMO] cleanup: ${r.eirs} EIR, ${r.preps} prep, ${r.guests} guest, ${r.photos} photo removed.`,
      )
      process.exit(0)
    })
    .catch((err) => {
      console.error(err)
      process.exit(1)
    })
}
