/**
 * Invasion-angle topic-bank seeder.
 *
 * The global memory of Iraqi-invasion angles lives in `khat_map_topic_bank`
 * with `category = "invasion"` and a stable `angle_code` (e.g.
 * `invasion.prisoners`). The constitution defines a canonical catalog in
 * `INVASION_ANGLE_SEEDS` — this module plants those rows idempotently.
 *
 * Idempotency rules:
 *   - If no row exists for an `angle_code`, insert a fresh row at
 *     freshness="fresh", status="active", source="admin_seeded".
 *   - If a row exists, NEVER overwrite fields that the admin may have
 *     curated (title, description, angle_notes, freshness, notes,
 *     importance_score, status). Only fill fields that are null/empty.
 *   - Tags are unioned (seed tags added if missing), not replaced.
 *
 * Returns a structured result so the UI can report "inserted N, touched M"
 * feedback to the admin.
 */

import { db } from "@/lib/db"
import { khatMapTopicBank } from "@/lib/db/schema/khat-map"
import { eq } from "drizzle-orm"
import { INVASION_ANGLE_SEEDS, DOMAIN_ANGLE_SEEDS } from "./constitution"

export interface SeedInvasionResult {
  seeds_considered: number
  inserted: number
  patched: number
  unchanged: number
  angle_codes_inserted: string[]
  angle_codes_patched: string[]
}

export async function seedInvasionAnglesIdempotent(): Promise<SeedInvasionResult> {
  if (!db) {
    throw new Error("Database client is not configured")
  }

  const result: SeedInvasionResult = {
    seeds_considered: INVASION_ANGLE_SEEDS.length,
    inserted: 0,
    patched: 0,
    unchanged: 0,
    angle_codes_inserted: [],
    angle_codes_patched: [],
  }

  for (const seed of INVASION_ANGLE_SEEDS) {
    const existing = await db
      .select()
      .from(khatMapTopicBank)
      .where(eq(khatMapTopicBank.angle_code, seed.angle_code))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(khatMapTopicBank).values({
        title: seed.title,
        description: seed.description,
        angle_code: seed.angle_code,
        episode_type: seed.episode_type,
        category: seed.category,
        tags: seed.tags,
        freshness: seed.freshness,
        source: seed.source,
        status: seed.status,
      })
      result.inserted += 1
      result.angle_codes_inserted.push(seed.angle_code)
      continue
    }

    // Row exists. Patch only fields the admin has left null/empty; never
    // overwrite curated content. Tags get unioned, not replaced.
    const row = existing[0]
    const patch: Partial<typeof khatMapTopicBank.$inferInsert> = {}

    if (!row.title || row.title.trim() === "") patch.title = seed.title
    if (!row.description || row.description.trim() === "") patch.description = seed.description
    if (!row.episode_type) patch.episode_type = seed.episode_type
    if (!row.category) patch.category = seed.category

    // Union existing + seed tags (preserve admin-added tags).
    const existingTags = Array.isArray(row.tags) ? row.tags : []
    const unionTags = [...new Set([...existingTags, ...seed.tags])]
    if (unionTags.length !== existingTags.length) {
      patch.tags = unionTags
    }

    if (Object.keys(patch).length === 0) {
      result.unchanged += 1
    } else {
      patch.updated_at = new Date()
      await db
        .update(khatMapTopicBank)
        .set(patch)
        .where(eq(khatMapTopicBank.id, row.id))
      result.patched += 1
      result.angle_codes_patched.push(seed.angle_code)
    }
  }

  return result
}

// ─── Phase D — Domain angle seeder ───────────────────────────────────────────

/**
 * Seeds domain angles (psychology, relationships, money_career, etc.) into
 * khat_map_topic_bank with category=<domain>. Same idempotency contract as
 * `seedInvasionAnglesIdempotent`: inserts missing rows, patches only
 * empty fields on existing rows, unions tags. Never overwrites admin
 * curation.
 */
export async function seedDomainAnglesIdempotent(): Promise<SeedInvasionResult> {
  if (!db) {
    throw new Error("Database client is not configured")
  }

  const result: SeedInvasionResult = {
    seeds_considered: DOMAIN_ANGLE_SEEDS.length,
    inserted: 0,
    patched: 0,
    unchanged: 0,
    angle_codes_inserted: [],
    angle_codes_patched: [],
  }

  for (const seed of DOMAIN_ANGLE_SEEDS) {
    const existing = await db
      .select()
      .from(khatMapTopicBank)
      .where(eq(khatMapTopicBank.angle_code, seed.angle_code))
      .limit(1)

    if (existing.length === 0) {
      await db.insert(khatMapTopicBank).values({
        title: seed.title,
        description: seed.description,
        angle_code: seed.angle_code,
        episode_type: seed.episode_type,
        category: seed.category,
        tags: seed.tags,
        freshness: seed.freshness,
        source: seed.source,
        status: seed.status,
      })
      result.inserted += 1
      result.angle_codes_inserted.push(seed.angle_code)
      continue
    }

    const row = existing[0]
    const patch: Partial<typeof khatMapTopicBank.$inferInsert> = {}

    if (!row.title || row.title.trim() === "") patch.title = seed.title
    if (!row.description || row.description.trim() === "") {
      patch.description = seed.description
    }
    if (!row.episode_type) patch.episode_type = seed.episode_type
    if (!row.category) patch.category = seed.category

    const existingTags = Array.isArray(row.tags) ? row.tags : []
    const unionTags = [...new Set([...existingTags, ...seed.tags])]
    if (unionTags.length !== existingTags.length) {
      patch.tags = unionTags
    }

    if (Object.keys(patch).length === 0) {
      result.unchanged += 1
    } else {
      patch.updated_at = new Date()
      await db
        .update(khatMapTopicBank)
        .set(patch)
        .where(eq(khatMapTopicBank.id, row.id))
      result.patched += 1
      result.angle_codes_patched.push(seed.angle_code)
    }
  }

  return result
}
