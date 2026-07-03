/**
 * Corpus novelty at SELECTION time (Phase B4, the objective mechanism).
 *
 * Rather than naming corpus themes in the prompt (which primes the model toward
 * them), we compare each generated candidate's embedding to the theme CENTROIDS:
 *   • close to a SATURATED theme → the topic is a done-to-death shape → penalize.
 *   • close to a WHITE-SPACE theme → fresh, under-explored territory → boost.
 * This never touches the model — it just makes ranking prefer fresh ground.
 *
 * Pure `corpusProximity` (testable) + a small DB loader for the centroids.
 */

import { db } from "@/lib/db"
import { corpusThemes } from "@/lib/db/schema/corpus"
import { cosineSimilarity } from "@/lib/khat-map/learning/embeddings"

export interface CorpusNoveltyRefs {
  /** Centroids of heavily-covered themes (proximity = a saturated topic). */
  saturated: number[][]
  /** Centroids of resonant-but-under-explored themes (proximity = opportunity). */
  whiteSpace: number[][]
}

/** How saturated a theme must be to count as a minefield. */
const SATURATION_CUTOFF = 0.6

/** Load theme centroids, split into saturated vs white-space. Null when no corpus. */
export async function getCorpusNoveltyRefs(): Promise<CorpusNoveltyRefs | null> {
  if (!db) return null
  const rows = await db
    .select({
      centroid: corpusThemes.centroid,
      saturation: corpusThemes.saturation_score,
      whiteSpace: corpusThemes.is_white_space,
    })
    .from(corpusThemes)
  const saturated: number[][] = []
  const whiteSpace: number[][] = []
  for (const r of rows) {
    if (!Array.isArray(r.centroid) || r.centroid.length === 0) continue
    if ((r.saturation ?? 0) >= SATURATION_CUTOFF) saturated.push(r.centroid)
    if (r.whiteSpace) whiteSpace.push(r.centroid)
  }
  if (saturated.length === 0 && whiteSpace.length === 0) return null
  return { saturated, whiteSpace }
}

/** Max cosine similarity of an embedding to any centroid in the set (0 when empty). */
export function maxSimilarity(emb: number[], centroids: number[][]): number {
  let max = 0
  for (const c of centroids) {
    if (c.length !== emb.length) continue
    const s = cosineSimilarity(emb, c)
    if (s > max) max = s
  }
  return max
}

export interface CorpusProximity {
  /** 0-1 nearest-saturated-theme similarity. */
  saturation: number
  /** 0-1 nearest-white-space-theme similarity. */
  whitespace: number
}

/** A candidate's proximity to saturated + white-space corpus territory. */
export function corpusProximity(
  emb: number[] | null | undefined,
  refs: CorpusNoveltyRefs | null,
): CorpusProximity {
  if (!refs || !emb || emb.length === 0) return { saturation: 0, whitespace: 0 }
  return {
    saturation: maxSimilarity(emb, refs.saturated),
    whitespace: maxSimilarity(emb, refs.whiteSpace),
  }
}
