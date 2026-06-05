/**
 * Topic fingerprint store for Khat Map v2.
 *
 * Each fingerprint is a (title + optional summary + domain) canonical
 * string + its 1536-dim embedding. When the admin accepts or rejects a
 * topic in the wizard, the batch engine writes one fingerprint to this
 * store with the matching source. Before surfacing the next batch, the
 * engine loads the season's negative fingerprints (rejected + optionally
 * imported cross-season rejections) and runs `scanAgainstNegatives`
 * from `./embeddings` on each candidate.
 *
 * Keeping the writer + the reader together lets the batch engine (PR2)
 * avoid knowing about embeddings directly — it just calls
 * `writeFingerprint` and `listNegatives`.
 */

import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { khatMapTopicFingerprints } from "@/lib/db/schema/khat-map"
import type {
  KhatMapTopicFingerprint,
  KhatMapFingerprintSource,
  KhatMapTopicDomain,
} from "@/types/khat-map"
import { EMBEDDING_MODEL, embed, buildFingerprintText } from "./embeddings"

type FingerprintRow = typeof khatMapTopicFingerprints.$inferSelect

function mapFingerprint(row: FingerprintRow): KhatMapTopicFingerprint {
  return {
    id: row.id,
    season_id: row.season_id,
    source: row.source,
    angle_code: row.angle_code,
    title_ar: row.title_ar,
    summary_ar: row.summary_ar,
    domain: row.domain,
    embedding: row.embedding,
    embedding_model: row.embedding_model,
    topic_candidate_id: row.topic_candidate_id,
    decision_id: row.decision_id,
    created_at: row.created_at.toISOString(),
  }
}

export interface WriteFingerprintInput {
  season_id: string | null
  source: KhatMapFingerprintSource
  title_ar: string
  summary_ar?: string | null
  angle_code?: string | null
  domain?: KhatMapTopicDomain | null
  topic_candidate_id?: string | null
  decision_id?: string | null
  /**
   * Caller may pre-compute the embedding (useful when batching many
   * writes). If omitted we compute it here.
   */
  precomputed_embedding?: number[] | null
}

/**
 * Write one fingerprint. Embeds the canonical text on the fly unless
 * the caller supplies a precomputed vector. Callers should always use
 * the constants exported from `./embeddings` for threshold-sensitive
 * comparisons to stay consistent with reads.
 */
export async function writeFingerprint(
  input: WriteFingerprintInput,
): Promise<KhatMapTopicFingerprint> {
  const text = buildFingerprintText(
    input.title_ar,
    input.summary_ar ?? null,
    input.domain ?? null,
  )
  const embedding =
    input.precomputed_embedding ?? (await embed(text))
  const [row] = await db!
    .insert(khatMapTopicFingerprints)
    .values({
      season_id: input.season_id,
      source: input.source,
      angle_code: input.angle_code ?? null,
      title_ar: input.title_ar,
      summary_ar: input.summary_ar ?? null,
      domain: input.domain ?? null,
      embedding,
      embedding_model: EMBEDDING_MODEL,
      topic_candidate_id: input.topic_candidate_id ?? null,
      decision_id: input.decision_id ?? null,
    })
    .returning()
  return mapFingerprint(row)
}

/**
 * All negative fingerprints a batch engine should avoid.
 *
 * By default includes the current season's `rejected` items. When
 * `include_cross_season` is true, also pulls rejected fingerprints
 * from every OTHER season (imported/cross-pollinated memory). The
 * design decision from the v2 brief: cross-season rejections count
 * as signals unless the admin explicitly opts out — so the default
 * here is `true`, but the call site in the batch engine can turn it
 * off when the admin relaxes the filter.
 */
export async function listNegativeFingerprints(
  season_id: string,
  opts: { include_cross_season?: boolean } = {},
): Promise<KhatMapTopicFingerprint[]> {
  const includeCross = opts.include_cross_season ?? true
  const condition = includeCross
    ? or(
        and(
          eq(khatMapTopicFingerprints.season_id, season_id),
          eq(khatMapTopicFingerprints.source, "rejected"),
        ),
        and(
          sql`${khatMapTopicFingerprints.season_id} <> ${season_id}`,
          eq(khatMapTopicFingerprints.source, "rejected"),
          isNotNull(khatMapTopicFingerprints.season_id),
        ),
      )
    : and(
        eq(khatMapTopicFingerprints.season_id, season_id),
        eq(khatMapTopicFingerprints.source, "rejected"),
      )
  const rows = await db!
    .select()
    .from(khatMapTopicFingerprints)
    .where(condition)
  return rows.map(mapFingerprint)
}

/**
 * All positive fingerprints for one season — the accepted pool. Used
 * to detect if a new candidate duplicates something the admin has
 * already committed to in THIS season.
 */
export async function listPositiveFingerprints(
  season_id: string,
): Promise<KhatMapTopicFingerprint[]> {
  const rows = await db!
    .select()
    .from(khatMapTopicFingerprints)
    .where(
      and(
        eq(khatMapTopicFingerprints.season_id, season_id),
        eq(khatMapTopicFingerprints.source, "accepted"),
      ),
    )
  return rows.map(mapFingerprint)
}

/**
 * Delete fingerprints tied to undone decisions. Called after `undoDecision`
 * so the undo doesn't leave a "ghost negative" blocking future batches.
 */
export async function removeFingerprintsForDecision(
  decision_id: string,
): Promise<number> {
  const res = await db!
    .delete(khatMapTopicFingerprints)
    .where(eq(khatMapTopicFingerprints.decision_id, decision_id))
    .returning({ id: khatMapTopicFingerprints.id })
  return res.length
}

/** Bulk existence check — keeps the batch engine cheap on repeats. */
export async function fingerprintsExistForDecisions(
  decision_ids: string[],
): Promise<Set<string>> {
  if (decision_ids.length === 0) return new Set()
  const rows = await db!
    .select({ decision_id: khatMapTopicFingerprints.decision_id })
    .from(khatMapTopicFingerprints)
    .where(inArray(khatMapTopicFingerprints.decision_id, decision_ids))
  return new Set(
    rows.map((r) => r.decision_id).filter((v): v is string => v !== null),
  )
}
