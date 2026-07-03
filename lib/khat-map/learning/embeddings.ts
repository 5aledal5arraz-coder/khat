/**
 * Embeddings + cosine similarity for Khat Map v2 topic fingerprints.
 *
 * Uses OpenAI text-embedding-3-small (1536 dims, cheap — roughly
 * $0.00002 per topic at current pricing). Similarity is computed in-app
 * rather than via pgvector because we cannot assume the extension is
 * enabled on DigitalOcean Managed PostgreSQL. At our scale (< 200
 * fingerprints per season) cosine over jsonb arrays is trivial.
 *
 * Similarity verdicts encode the spec's two thresholds:
 *   - cos-sim ≥ 0.82 to any negative → HARD_BLOCK (never surface)
 *   - cos-sim ≥ 0.75 to any negative → SOFT_AVOID (deprioritize)
 *   - otherwise                       → OK
 *
 * Tune-points are exported as constants so we can move them with
 * confidence once we have real behavioral data.
 */

import { getClient } from "@/lib/ai/client"
import type {
  KhatMapTopicDomain,
  KhatMapTopicFingerprint,
} from "@/types/khat-map"

export const EMBEDDING_MODEL = "text-embedding-3-small"
export const EMBEDDING_DIMS = 1536

/** Tune-points. Change here; everything downstream follows. */
export const SIMILARITY_HARD_BLOCK = 0.82
export const SIMILARITY_SOFT_AVOID = 0.75

export type SimilarityVerdict = "hard_block" | "soft_avoid" | "ok"

/**
 * Canonicalize the text we embed. We include title + summary + domain so
 * two topics with identical titles but different domains (rare, but
 * possible) stay distinguishable, and paraphrased titles with the same
 * underlying idea still cluster.
 */
export function buildFingerprintText(
  title: string,
  summary: string | null,
  domain: KhatMapTopicDomain | null,
): string {
  const parts = [title.trim()]
  if (summary) parts.push(summary.trim())
  if (domain) parts.push(`#${domain}`)
  return parts.join("\n").slice(0, 2000)
}

export async function embed(text: string): Promise<number[]> {
  const client = getClient()
  const res = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  })
  const vec = res.data?.[0]?.embedding
  if (!vec || vec.length !== EMBEDDING_DIMS) {
    throw new Error(
      `Embedding API returned unexpected shape (got ${vec?.length ?? 0} dims, expected ${EMBEDDING_DIMS})`,
    )
  }
  return vec
}

/**
 * Embed many texts in chunks (the OpenAI embeddings endpoint takes an array).
 * Returns vectors in the SAME order as `texts`. Empty strings are sent as a
 * single space so the API never rejects the batch.
 */
export async function batchEmbed(texts: string[], chunkSize = 128): Promise<number[][]> {
  const client = getClient()
  const out: number[][] = new Array(texts.length)
  for (let i = 0; i < texts.length; i += chunkSize) {
    const slice = texts.slice(i, i + chunkSize).map((t) => (t.trim() ? t.slice(0, 2000) : " "))
    const res = await client.embeddings.create({ model: EMBEDDING_MODEL, input: slice })
    for (const item of res.data) out[i + item.index] = item.embedding
  }
  return out
}

/**
 * Cosine similarity of two equal-length vectors. Returns a value in
 * [-1, 1]; in practice OpenAI embeddings cluster tightly in [0, 1].
 * Throws on dimension mismatch — calling code should never pass
 * different-length vectors, and a silent 0 would mask real bugs.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `cosineSimilarity: dim mismatch (${a.length} vs ${b.length})`,
    )
  }
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  if (denom === 0) return 0
  return dot / denom
}

export function classifySimilarity(score: number): SimilarityVerdict {
  if (score >= SIMILARITY_HARD_BLOCK) return "hard_block"
  if (score >= SIMILARITY_SOFT_AVOID) return "soft_avoid"
  return "ok"
}

/**
 * Scan a candidate embedding against a pool of negative fingerprints.
 * Returns the worst verdict encountered plus the fingerprints that
 * triggered it — useful for the UI ("too similar to X, which you
 * rejected last week") and for feeding back into the generator.
 */
export interface SimilarityScan {
  verdict: SimilarityVerdict
  max_similarity: number
  triggered_by: Array<{
    fingerprint: KhatMapTopicFingerprint
    similarity: number
  }>
}

export function scanAgainstNegatives(
  candidate: number[],
  negatives: KhatMapTopicFingerprint[],
): SimilarityScan {
  let worst: SimilarityVerdict = "ok"
  let max = 0
  const triggered: SimilarityScan["triggered_by"] = []
  for (const n of negatives) {
    if (n.embedding.length !== candidate.length) continue
    const s = cosineSimilarity(candidate, n.embedding)
    if (s > max) max = s
    const v = classifySimilarity(s)
    if (v !== "ok") triggered.push({ fingerprint: n, similarity: s })
    if (v === "hard_block") worst = "hard_block"
    else if (v === "soft_avoid" && worst !== "hard_block") worst = "soft_avoid"
  }
  // Sort triggering fingerprints by similarity descending so UI shows the
  // closest match first.
  triggered.sort((a, b) => b.similarity - a.similarity)
  return { verdict: worst, max_similarity: max, triggered_by: triggered }
}
