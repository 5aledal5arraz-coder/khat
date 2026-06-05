/**
 * CTO audit — full prep_v2 dump for the only fully-prepared episode in
 * the test seasons ("تحولات الهوية: قصة كويتية", prep 2ca1fe2e).
 *
 * Also attempts a fresh hybrid generation to document the current
 * runtime path and any AI-failure shape.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodePreparations } from "@/lib/db/schema/preparation"
import type { PrepV2Payload } from "@/lib/preparation/v2/types"

async function main() {
  if (!db) {
    console.error("DB unavailable")
    process.exit(1)
  }

  const PREP_ID = "2ca1fe2e"
  const [prep] = await db
    .select()
    .from(episodePreparations)
    .where(
      eq(
        episodePreparations.id,
        "2ca1fe2e-7d75-4f63-a3a8-e16c6c569d72",
      ),
    )
    .limit(1)
  if (!prep) {
    // try by prefix
    const all = await db.select({ id: episodePreparations.id }).from(episodePreparations)
    const match = all.find((r) => r.id.startsWith(PREP_ID))
    if (!match) {
      console.error("prep not found")
      process.exit(1)
    }
    const [prep2] = await db
      .select()
      .from(episodePreparations)
      .where(eq(episodePreparations.id, match.id))
      .limit(1)
    if (!prep2) {
      console.error("re-fetch failed")
      process.exit(1)
    }
    console.log(JSON.stringify(prep2.prep_v2, null, 2))
    process.exit(0)
  }

  console.log(JSON.stringify(prep.prep_v2 as PrepV2Payload, null, 2))
  process.exit(0)
}

main().catch((err) => {
  console.error("dump failed:", err)
  process.exit(1)
})
