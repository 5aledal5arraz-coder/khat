/**
 * Phase X Step 3 — CLI for the Hybrid Topic Generator.
 *
 *   npm run hybrid:generate -- ar 10
 *   npm run hybrid:generate -- en 8
 *   npm run hybrid:generate -- ar 10 <seasonId>
 *
 * Defaults: language=ar, count=10, no season (no candidate persistence).
 *
 * Without a seasonId, accepted topics are still saved to
 * hybrid_topic_generations (the audit log) but NOT inserted into
 * khat_map_episode_candidates (which requires season_id NOT NULL).
 * Pass a seasonId as the 3rd arg to land them on a season.
 */

import { generateHybridTopics } from "@/lib/hybrid-topics/generate"
import { db } from "@/lib/db"
import { khatMapSeasons } from "@/lib/db/schema/khat-map"
import { desc } from "drizzle-orm"

async function pickLatestSeasonId(): Promise<string | null> {
  if (!db) return null
  const rows = await db
    .select({ id: khatMapSeasons.id, name: khatMapSeasons.name })
    .from(khatMapSeasons)
    .orderBy(desc(khatMapSeasons.created_at))
    .limit(1)
  return rows[0]?.id ?? null
}

async function main() {
  const language = (process.argv[2] as "ar" | "en") ?? "ar"
  const count = Number(process.argv[3] ?? "10")
  let seasonId: string | null = process.argv[4] ?? null

  // If the caller didn't pass a seasonId, try the latest. We still allow
  // running with no season — the topics just aren't persisted to candidates.
  if (!seasonId) {
    seasonId = await pickLatestSeasonId()
    if (seasonId) {
      console.log(`(no seasonId given; using latest: ${seasonId})`)
    } else {
      console.log("(no seasons exist; running without persistence)")
    }
  }

  const r = await generateHybridTopics({
    seasonId,
    language,
    count,
    allowKuwaitBias: false,
    createdBy: null,
  })

  console.log("\n— Hybrid Generation —")
  console.log(`  ok=${r.ok} reason=${r.reason ?? "—"}`)
  console.log(`  asked=${r.asked} accepted=${r.accepted.length} rejected=${r.rejected.length}`)
  if (r.generation_id) console.log(`  generation_id=${r.generation_id}`)
  if (r.ai_run_id) console.log(`  ai_run_id=${r.ai_run_id}`)
  console.log(`  persisted_candidates=${r.persisted.length}`)
  if (r.accepted.length > 0) {
    console.log("\nAccepted titles:")
    for (const t of r.accepted) {
      console.log(`  · ${t.title} (lens=${t.original_lens}, score=${t.estimated_strength_score?.toFixed(2)})`)
    }
  }
  if (Object.keys(r.rejection_summary).length > 0) {
    console.log("\nRejection summary:")
    for (const [k, n] of Object.entries(r.rejection_summary)) {
      console.log(`  · ${k}: ${n}`)
    }
  }
  process.exit(0)
}

main().catch((err) => {
  console.error("\n💥 hybrid:generate failed:", err)
  process.exit(1)
})
