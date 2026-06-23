/**
 * Studio redesign (Goal 2) — backfill episode_topics + episode_relationships.
 *
 * Deterministic, no AI calls. Two passes:
 *   1. TOPICS — for each episode, derive topic names from the persisted
 *      episode_intelligence (topic_tags, via episodes.eir_id) when available,
 *      and write episode_topics (idempotent via setEpisodeTopics).
 *   2. RELATIONSHIPS — compute a scored related-episode graph from shared
 *      topics (strongest), same guest, and same category; write the top edges
 *      per episode (idempotent via setEpisodeRelationships).
 *
 * Safe to re-run; each pass fully replaces its rows per episode.
 *
 * Invocation:
 *   DATABASE_URL="postgres://..." npx tsx scripts/backfill-episode-graph.ts
 */

import { db } from "@/lib/db"
import { episodes } from "@/lib/db/schema/episodes"
import { listStudioAnalysisRecords } from "@/lib/studio/analysis-records"
import {
  setEpisodeTopics,
  setEpisodeRelationships,
  getEpisodeTopics,
  computeRelatedEpisodes,
  type EpisodeGraphNode,
} from "@/lib/episodes/episode-graph"

const MAX_RELATED_PER_EPISODE = 8

async function main() {
  if (!db) throw new Error("Database not available — set DATABASE_URL")

  const eps = await db
    .select({
      id: episodes.id,
      guest_id: episodes.guest_id,
      category_id: episodes.category_id,
      eir_id: episodes.eir_id,
    })
    .from(episodes)

  console.info(`[backfill-episode-graph] episodes: ${eps.length}`)

  // ── Pass 1: topics ───────────────────────────────────────────────────
  let topicEpisodes = 0
  for (const ep of eps) {
    if (!ep.eir_id) continue
    const recs = await listStudioAnalysisRecords({
      eir_id: ep.eir_id,
      kinds: ["episode_intelligence"],
      status: "ready",
      limit: 1,
    })
    const data = recs[0]?.data as { topic_tags?: unknown } | undefined
    const tags = Array.isArray(data?.topic_tags)
      ? (data!.topic_tags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      : []
    if (tags.length === 0) continue
    await setEpisodeTopics(ep.id, tags)
    topicEpisodes++
  }
  console.info(`[backfill-episode-graph] topics populated for ${topicEpisodes} episodes`)

  // Build graph nodes (topic ids per episode) for relationship scoring.
  const nodes: EpisodeGraphNode[] = []
  for (const ep of eps) {
    const t = await getEpisodeTopics(ep.id)
    nodes.push({
      id: ep.id,
      guestId: ep.guest_id,
      categoryId: ep.category_id,
      topicIds: t.map((x) => x.id),
    })
  }

  // ── Pass 2: relationships ────────────────────────────────────────────
  let relEpisodes = 0
  let relEdges = 0
  for (const node of nodes) {
    const top = computeRelatedEpisodes(node, nodes, MAX_RELATED_PER_EPISODE)
    await setEpisodeRelationships(node.id, top)
    if (top.length > 0) {
      relEpisodes++
      relEdges += top.length
    }
  }
  console.info(`[backfill-episode-graph] relationships: ${relEdges} edges across ${relEpisodes} episodes`)
  process.exit(0)
}

main().catch((err) => {
  console.error("[backfill-episode-graph] failed:", err)
  process.exit(1)
})
