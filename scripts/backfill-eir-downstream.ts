/**
 * Khat Brain Phase 3 — downstream backfill.
 *
 * Walks every collaboration_room, studio_session, and episode that lacks
 * an eir_id and tries to resolve one through the chain:
 *
 *   collaboration_rooms.preparation_id → episode_preparations.eir_id
 *   studio_sessions.episode_id        → episodes.eir_id
 *                                     → preparation chain (if studio
 *                                       is bound to a prep via episode)
 *   episodes (no upstream)            → mint a fresh EIR at "published"
 *                                       (orphan — these are YouTube-
 *                                       imported episodes from before
 *                                       the spine existed)
 *
 * Reports linked / skipped / ambiguous counts. Idempotent — safe to
 * re-run; only stamps eir_id on rows that don't already have one.
 *
 * Invocation:
 *   npm run backfill:eir-downstream
 */

import { eq, isNull, and, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { collaborationRooms } from "@/lib/db/schema/collaboration"
import { studioSessions } from "@/lib/db/schema/studio"
import { episodes } from "@/lib/db/schema/episodes"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { createEpisodeIntelligenceRecord } from "@/lib/eir"

interface Counters {
  linked: number
  skipped: number
  ambiguous: number
  minted: number
}

async function backfillRooms(): Promise<Counters> {
  console.log("\n— collaboration_rooms (linking via prep):")
  const counters: Counters = { linked: 0, skipped: 0, ambiguous: 0, minted: 0 }

  const rows = await db!
    .select({
      id: collaborationRooms.id,
      preparation_id: collaborationRooms.preparation_id,
    })
    .from(collaborationRooms)
    .where(isNull(collaborationRooms.eir_id))

  for (const room of rows) {
    const prep = await db!
      .select({ eir_id: episodePreparations.eir_id })
      .from(episodePreparations)
      .where(eq(episodePreparations.id, room.preparation_id))
      .limit(1)
    const eirId = prep[0]?.eir_id ?? null
    if (!eirId) {
      counters.skipped++
      continue
    }
    await db!
      .update(collaborationRooms)
      .set({ eir_id: eirId, updated_at: new Date() })
      .where(eq(collaborationRooms.id, room.id))
    counters.linked++
  }
  console.log(
    `  walked=${rows.length}  linked=${counters.linked}  skipped (no prep eir)=${counters.skipped}`,
  )
  return counters
}

async function backfillSessions(): Promise<Counters> {
  console.log("\n— studio_sessions (linking via episode chain):")
  const counters: Counters = { linked: 0, skipped: 0, ambiguous: 0, minted: 0 }

  const rows = await db!
    .select({
      id: studioSessions.id,
      episode_id: studioSessions.episode_id,
      video_id: studioSessions.video_id,
      video_title: studioSessions.video_title,
      episode_title: studioSessions.episode_title,
      source: studioSessions.source,
      source_type: studioSessions.source_type,
    })
    .from(studioSessions)
    .where(isNull(studioSessions.eir_id))

  for (const sess of rows) {
    let eirId: string | null = null

    // 1. Linked episode wins.
    if (sess.episode_id) {
      const ep = await db!
        .select({ eir_id: episodes.eir_id })
        .from(episodes)
        .where(eq(episodes.id, sess.episode_id))
        .limit(1)
      if (ep[0]?.eir_id) eirId = ep[0].eir_id
    }

    // 2. Mint a fresh EIR for orphan/imported sessions. Phase=producing
    //    when no episode link, "published" otherwise.
    if (!eirId) {
      const phase = sess.episode_id ? "published" : "producing"
      const fresh = await createEpisodeIntelligenceRecord({
        phase,
        working_title: sess.video_title || sess.episode_title || "Studio session",
        editorial_intent: {
          source: "manual",
          source_id: sess.video_id ?? sess.episode_id ?? null,
          production_notes: `backfill:studio_session:${sess.source ?? sess.source_type ?? "unknown"}`,
        },
      })
      eirId = fresh.id
      counters.minted++
    }

    await db!
      .update(studioSessions)
      .set({ eir_id: eirId, updated_at: new Date() })
      .where(eq(studioSessions.id, sess.id))
    counters.linked++
  }
  console.log(
    `  walked=${rows.length}  linked=${counters.linked}  minted=${counters.minted}`,
  )
  return counters
}

async function backfillEpisodes(): Promise<Counters> {
  console.log("\n— episodes (linking via studio session, then minting):")
  const counters: Counters = { linked: 0, skipped: 0, ambiguous: 0, minted: 0 }

  const rows = await db!
    .select({
      id: episodes.id,
      title: episodes.title,
    })
    .from(episodes)
    .where(isNull(episodes.eir_id))

  for (const ep of rows) {
    let eirId: string | null = null

    // Try the studio session reverse: ANY session pointing at this episode
    // with an EIR already? Prefer the most recently updated.
    const candidateSessions = await db!
      .select({
        id: studioSessions.id,
        eir_id: studioSessions.eir_id,
        updated_at: studioSessions.updated_at,
      })
      .from(studioSessions)
      .where(
        and(
          eq(studioSessions.episode_id, ep.id),
          sql`${studioSessions.eir_id} IS NOT NULL`,
        ),
      )

    if (candidateSessions.length > 1) counters.ambiguous++
    if (candidateSessions[0]?.eir_id) {
      eirId = candidateSessions[0].eir_id
    }

    if (!eirId) {
      // Mint a fresh EIR at "published" — these are legacy YouTube imports.
      const fresh = await createEpisodeIntelligenceRecord({
        phase: "published",
        working_title: ep.title,
        editorial_intent: {
          source: "manual",
          source_id: ep.id,
          production_notes: "backfill:legacy_youtube_episode",
        },
      })
      eirId = fresh.id
      counters.minted++
    }

    await db!
      .update(episodes)
      .set({ eir_id: eirId, updated_at: new Date() })
      .where(eq(episodes.id, ep.id))
    counters.linked++
  }
  console.log(
    `  walked=${rows.length}  linked=${counters.linked}  minted=${counters.minted}  ambiguous=${counters.ambiguous}`,
  )
  return counters
}

async function main() {
  console.log("Khat Brain — downstream backfill\n")

  const c1 = await backfillRooms()
  const c2 = await backfillSessions()
  const c3 = await backfillEpisodes()

  console.log("\n✅ Downstream backfill complete.")
  console.log(`  rooms:    linked=${c1.linked} skipped=${c1.skipped}`)
  console.log(`  sessions: linked=${c2.linked} minted=${c2.minted}`)
  console.log(`  episodes: linked=${c3.linked} minted=${c3.minted} ambiguous=${c3.ambiguous}`)

  process.exit(0)
}

main().catch((e) => {
  console.error("❌ backfill failed:", e)
  process.exit(1)
})
