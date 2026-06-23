/**
 * Studio redesign (Goal 2) — backfill episode_guests from episodes.guest_id.
 *
 * The new episode_guests junction enables multi-guest attribution. Until the
 * Studio push starts dual-writing it, the existing 1:1 episodes.guest_id is the
 * source of truth — this seeds one episode_guests row per episode that already
 * has a guest. Idempotent (ON CONFLICT DO NOTHING); safe to re-run.
 *
 * Invocation:
 *   DATABASE_URL="postgres://..." npx tsx scripts/backfill-episode-guests.ts
 */

import { isNotNull, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodes } from "@/lib/db/schema/episodes"
import { episodeGuests } from "@/lib/db/schema/episode-graph"
import { guests } from "@/lib/db/schema/guests"

async function main() {
  if (!db) throw new Error("Database not available — set DATABASE_URL")

  // Episodes with a guest_id that points at a real guest row.
  const rows = await db
    .select({ episode_id: episodes.id, guest_id: episodes.guest_id })
    .from(episodes)
    .innerJoin(guests, eq(episodes.guest_id, guests.id))
    .where(isNotNull(episodes.guest_id))

  console.info(`[backfill-episode-guests] candidates: ${rows.length}`)

  let inserted = 0
  for (const r of rows) {
    if (!r.guest_id) continue
    const res = await db
      .insert(episodeGuests)
      .values({ episode_id: r.episode_id, guest_id: r.guest_id, role: "guest", appearance_order: 0 })
      .onConflictDoNothing({ target: [episodeGuests.episode_id, episodeGuests.guest_id] })
      .returning({ id: episodeGuests.id })
    inserted += res.length
  }

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(episodeGuests)

  console.info(`[backfill-episode-guests] inserted ${inserted} new rows; episode_guests total now ${Number(total)}`)
  process.exit(0)
}

main().catch((err) => {
  console.error("[backfill-episode-guests] failed:", err)
  process.exit(1)
})
