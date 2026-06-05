/**
 * Khat Brain — studio session EIR resolver.
 *
 * When a studio session is created, we want exactly one EIR backing it.
 * This resolver implements the rules from Phase 3:
 *
 *   1. If a preparation_id is supplied AND the prep has eir_id → reuse
 *   2. Else if the session is keyed to an existing episode AND that
 *      episode has eir_id → reuse
 *   3. Else mint a fresh EIR. Phase depends on origin:
 *        - YouTube/upload of an already-published episode → "published"
 *        - Otherwise (raw recording, manual upload) → "producing"
 *      Editorial intent records the source so we can trace back later.
 *
 * Returning `null` is allowed — the caller decides whether to fail.
 * We only return null if a hard error occurred upstream.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { episodes } from "@/lib/db/schema/episodes"
import {
  createEpisodeIntelligenceRecord,
  type EpisodePhase,
} from "@/lib/eir"

export interface StudioResolverInput {
  preparationId: string | null
  episodeId: string | null
  youtubeVideoId: string | null
  videoTitle: string | null
  sourceType: string | null
  createdBy: string | null
}

export async function resolveEirForStudioSession(
  input: StudioResolverInput,
): Promise<string | null> {
  // 1. Preparation provenance is the strongest signal — use it.
  if (input.preparationId) {
    const rows = await db!
      .select({ eir_id: episodePreparations.eir_id })
      .from(episodePreparations)
      .where(eq(episodePreparations.id, input.preparationId))
      .limit(1)
    if (rows[0]?.eir_id) return rows[0].eir_id
  }

  // 2. Episode-keyed session (e.g. a re-process of an existing episode).
  if (input.episodeId) {
    const rows = await db!
      .select({ eir_id: episodes.eir_id, status: episodes.status })
      .from(episodes)
      .where(eq(episodes.id, input.episodeId))
      .limit(1)
    if (rows[0]?.eir_id) return rows[0].eir_id

    // Episode exists but has no EIR yet — mint a fresh one.
    if (rows[0]) {
      const phase: EpisodePhase =
        rows[0].status === "published" ? "published" : "producing"
      const fresh = await createEpisodeIntelligenceRecord({
        phase,
        working_title: input.videoTitle ?? "Studio session",
        editorial_intent: {
          source: "manual",
          source_id: input.episodeId,
          production_notes: input.sourceType
            ? `studio:${input.sourceType}`
            : null,
        },
        created_by: input.createdBy,
      })
      return fresh.id
    }
  }

  // 3. Orphan import (YouTube/upload with no upstream record).
  // Mint a fresh EIR at producing — admin can advance manually.
  const fresh = await createEpisodeIntelligenceRecord({
    phase: "producing",
    working_title: input.videoTitle ?? "Studio session (orphan)",
    editorial_intent: {
      source: "manual",
      source_id: input.youtubeVideoId,
      production_notes: input.sourceType
        ? `studio:${input.sourceType}`
        : null,
    },
    created_by: input.createdBy,
  })
  return fresh.id
}
