/**
 * Phase X Step 4 — Preparation V2 shape.
 *
 * Stored as a single JSONB blob on episode_preparations.prep_v2. No DB
 * enforcement; types here are the contract. Validation lives in
 * validation.ts and runs before any persistence.
 */

export const PREP_V2_VERSION = "v2.1"

export const SECTION_KINDS = [
  "opening",
  "build_up",
  "conflict",
  "deep_dive",
  "emotional_peak",
  "resolution",
] as const
export type SectionKind = (typeof SECTION_KINDS)[number]

export const QUESTION_TYPES = [
  "emotional",
  "philosophical",
  "personal",
  "confrontational",
  "reflective",
  "factual",
] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

export const QUESTION_PRIORITIES = ["must_ask", "if_time"] as const
export type QuestionPriority = (typeof QUESTION_PRIORITIES)[number]

export const QUESTION_RISK_LEVELS = ["low", "medium", "high"] as const
export type QuestionRiskLevel = (typeof QUESTION_RISK_LEVELS)[number]

// ─── Pass 1 output ────────────────────────────────────────────────────

export interface PrepV2Pass1Output {
  thesis: string
  axes_of_tension: string[] // exactly 6
  guest_extraction_strategy: string
  sensitive_zones: string[]
}

// ─── Pass 2 output ────────────────────────────────────────────────────

export interface PrepV2Section {
  kind: SectionKind
  intent: string
  target_emotion: string
  estimated_minutes: number
  transition_goal: string
}

export interface PrepV2Pass2Output {
  sections: PrepV2Section[] // 6, in order
}

// ─── Pass 3 output ────────────────────────────────────────────────────

export interface PrepV2Question {
  id: string
  /** Which section the question belongs to. */
  section: SectionKind
  text: string
  /** Multiple types are allowed; at least one. */
  types: QuestionType[]
  priority: QuestionPriority
  purpose: string
  follow_up_prompt: string
  risk_level: QuestionRiskLevel
}

export interface PrepV2Pass3Output {
  questions: PrepV2Question[]
}

// ─── Pass 4 output (final critique) ───────────────────────────────────

export interface PrepV2HostGuidance {
  overall_tone: string
  do_list: string[]
  dont_list: string[]
  energy_curve: string
}

export interface PrepV2DirectorGuidance {
  shot_priorities: string[]
  silence_moments: string[]
  cut_warnings: string[]
}

export interface PrepV2OpeningOption {
  approach: string
  text: string
}

export interface PrepV2ClosingOption {
  approach: string
  text: string
}

export interface PrepV2Pass4Output {
  host_guidance: PrepV2HostGuidance
  director_guidance: PrepV2DirectorGuidance
  opening_options: PrepV2OpeningOption[] // ≥ 2
  closing_options: PrepV2ClosingOption[] // ≥ 2
  /** Any final adjustments to questions made by the critic. */
  critic_notes: string[]
}

// ─── Final stored payload ─────────────────────────────────────────────

export interface PrepV2Payload {
  thesis: string
  axes_of_tension: string[]
  guest_extraction_strategy: string
  episode_sections: PrepV2Section[]
  question_bank: PrepV2Question[]
  host_guidance: PrepV2HostGuidance
  director_guidance: PrepV2DirectorGuidance
  sensitive_zones: string[]
  opening_options: PrepV2OpeningOption[]
  closing_options: PrepV2ClosingOption[]
  total_estimated_minutes: number
  generator_version: typeof PREP_V2_VERSION
  generated_at: string
  /** AI router run ids per pass — for cost analytics + debugging. */
  ai_run_ids: {
    pass1_research: string | null
    pass2_structure: string | null
    pass3_questions: string | null
    pass4_critique: string | null
  }
}
