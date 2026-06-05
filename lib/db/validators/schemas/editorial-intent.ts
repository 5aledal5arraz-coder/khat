/**
 * Phase 1.3 — Zod schema for episode_intelligence_records.editorial_intent.
 *
 * Source-of-truth interface: EditorialIntent in lib/db/schema/eir.ts.
 * Strict on the known core fields; `.loose()` mirrors the
 * `[key: string]: unknown` index signature so forward-compat additions
 * don't get flagged as drift.
 */

import { z } from "zod"

export const EDITORIAL_INTENT_TABLE = "episode_intelligence_records"
export const EDITORIAL_INTENT_COLUMN = "editorial_intent"

const sourceEnum = z.enum([
  "khat_map_candidate",
  "guest_application",
  "discovery_candidate",
  "manual",
])

export const editorialIntentSchema = z
  .object({
    hook: z.string().nullish(),
    why_matters: z.string().nullish(),
    why_now: z.string().nullish(),
    goal: z.string().nullish(),
    description: z.string().nullish(),
    main_axes: z.array(z.string()).optional(),
    suggested_questions: z.array(z.string()).optional(),
    production_notes: z.string().nullish(),
    source: sourceEnum.optional(),
    source_id: z.string().nullish(),
  })
  .loose()
