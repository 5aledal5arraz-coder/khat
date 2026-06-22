/**
 * Phase 1.3 — Zod schema for episode_preparations.prep_v2.
 *
 * Source-of-truth interface: PrepV2Payload in lib/preparation/v2/types.ts.
 * Strict shape; `generator_version` must be the current version literal.
 *
 * Enum values are duplicated from the source file rather than imported
 * so that an accidental edit on one side doesn't silently shift the
 * validator's contract.
 */

import { z } from "zod"

export const PREP_V2_TABLE = "episode_preparations"
export const PREP_V2_COLUMN = "prep_v2"

const SECTION_KIND = z.enum([
  "opening",
  "build_up",
  "conflict",
  "deep_dive",
  "emotional_peak",
  "resolution",
])
const QUESTION_TYPE = z.enum([
  "emotional",
  "philosophical",
  "personal",
  "confrontational",
  "reflective",
  "factual",
])
const QUESTION_PRIORITY = z.enum(["must_ask", "if_time"])
const QUESTION_RISK_LEVEL = z.enum(["low", "medium", "high"])

const sectionSchema = z.object({
  kind: SECTION_KIND,
  intent: z.string(),
  target_emotion: z.string(),
  estimated_minutes: z.number(),
  transition_goal: z.string(),
})

const INSIGHT_TYPE = z.enum([
  "fact",
  "stat",
  "research",
  "date",
  "reference",
  "correction",
  "levity",
])
const INSIGHT_TIMING = z.enum(["before", "during", "after"])
const INSIGHT_CONFIDENCE = z.enum(["verified", "partial", "weak"])

const insightSourceSchema = z.object({
  title: z.string(),
  url: z.string(),
  publisher: z.string().optional(),
  published_at: z.string().optional(),
})

const insightSchema = z.object({
  id: z.string(),
  type: INSIGHT_TYPE,
  text: z.string(),
  timing: INSIGHT_TIMING,
  sources: z.array(insightSourceSchema),
  confidence: INSIGHT_CONFIDENCE,
  correction: z
    .object({ inaccuracy: z.string(), accurate: z.string() })
    .optional(),
  generated_at: z.string(),
})

const questionSchema = z.object({
  id: z.string(),
  section: SECTION_KIND,
  text: z.string(),
  types: z.array(QUESTION_TYPE),
  priority: QUESTION_PRIORITY,
  purpose: z.string(),
  follow_up_prompt: z.string(),
  risk_level: QUESTION_RISK_LEVEL,
  // Pass-5 support cards. Optional + additive (older preps omit it).
  insights: z.array(insightSchema).optional(),
})

const hostGuidanceSchema = z.object({
  overall_tone: z.string(),
  do_list: z.array(z.string()),
  dont_list: z.array(z.string()),
  energy_curve: z.string(),
})

const directorGuidanceSchema = z.object({
  shot_priorities: z.array(z.string()),
  silence_moments: z.array(z.string()),
  cut_warnings: z.array(z.string()),
})

const openingOptionSchema = z.object({
  approach: z.string(),
  text: z.string(),
})

const closingOptionSchema = z.object({
  approach: z.string(),
  text: z.string(),
})

/**
 * Per-pass run-id object. AI router writes null when a pass was skipped.
 */
const aiRunIdsSchema = z.object({
  pass1_research: z.string().nullable(),
  pass2_structure: z.string().nullable(),
  pass3_questions: z.string().nullable(),
  pass4_critique: z.string().nullable(),
  // Pass 5 makes one drafting call per section → array of run ids. Optional so
  // payloads written before the insights pass shipped still validate.
  pass5_insights: z.array(z.string()).nullable().optional(),
})

export const prepV2Schema = z
  .object({
    thesis: z.string(),
    axes_of_tension: z.array(z.string()),
    guest_extraction_strategy: z.string(),
    episode_sections: z.array(sectionSchema),
    question_bank: z.array(questionSchema),
    host_guidance: hostGuidanceSchema,
    director_guidance: directorGuidanceSchema,
    sensitive_zones: z.array(z.string()),
    opening_options: z.array(openingOptionSchema),
    closing_options: z.array(closingOptionSchema),
    total_estimated_minutes: z.number(),
    /**
     * Generator version literal. If we bump PREP_V2_VERSION in
     * lib/preparation/v2/types.ts, this validator must move in lockstep
     * (with a deliberate edit, not a silent drift).
     */
    generator_version: z.literal("v2.1"),
    generated_at: z.string(),
    ai_run_ids: aiRunIdsSchema,
  })
  .loose()
