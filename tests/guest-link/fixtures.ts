/**
 * «نسخة الضيف» — a prep whose every FORBIDDEN field carries a unique canary.
 * If any canary ever appears in guest-facing output, the projection leaked.
 */

import type { PrepV2Payload, PrepV2Question, SectionKind } from "@/lib/preparation/v2/types"

export const CANARY = {
  thesis: "CANARY_THESIS_7f3a",
  axis: "CANARY_AXIS_OF_TENSION_91c2",
  strategy: "CANARY_EXTRACTION_STRATEGY_44de",
  zone: "CANARY_SENSITIVE_ZONE_0b6e",
  hostTone: "CANARY_HOST_GUIDANCE_5a10",
  hostDo: "CANARY_HOST_DO_2c77",
  director: "CANARY_DIRECTOR_GUIDANCE_e812",
  opening: "CANARY_OPENING_OPTION_3f09",
  closing: "CANARY_CLOSING_OPTION_77ab",
  purpose: "CANARY_QUESTION_PURPOSE_c4d1",
  followUp: "CANARY_FOLLOW_UP_PROMPT_9e2f",
  critic: "CANARY_CRITIC_NOTE_1d8b",
  insight: "CANARY_INSIGHT_TEXT_6b3c",
  intent: "CANARY_SECTION_INTENT_ab12",
  riskyQuestion: "CANARY_HIGH_RISK_QUESTION_5f5f",
  confrontational: "CANARY_CONFRONTATIONAL_QUESTION_8a8a",
  emotional: "CANARY_EMOTIONAL_QUESTION_2b2b",
  runId: "CANARY_AI_RUN_ID_0000",
  questionId: "CANARYQID",
} as const

export const FORBIDDEN_KEYS = [
  "title",
  "thesis",
  "axes_of_tension",
  "guest_extraction_strategy",
  "sensitive_zones",
  "host_guidance",
  "director_guidance",
  "opening_options",
  "closing_options",
  "purpose",
  "follow_up_prompt",
  "risk_level",
  "priority",
  "types",
  "insights",
  "critic_notes",
  "ai_run_ids",
  "scores",
  "intent",
  "kind",
  "section",
] as const

const KINDS: SectionKind[] = ["opening", "build_up", "conflict", "deep_dive", "emotional_peak", "resolution"]

function safeQ(kind: SectionKind, i: number, must = false): PrepV2Question {
  return {
    id: `${CANARY.questionId}-${kind}-${i}`,
    section: kind,
    text: `سؤال آمن ${kind} رقم ${i}`,
    types: ["factual"],
    priority: must ? "must_ask" : "if_time",
    purpose: CANARY.purpose,
    follow_up_prompt: CANARY.followUp,
    risk_level: "low",
    insights: [
      {
        id: "ins",
        type: "fact",
        text: CANARY.insight,
        timing: "during",
        sources: [],
        confidence: "verified",
        generated_at: "2026-09-26T00:00:00Z",
      },
    ],
  }
}

export function canaryPrep(overrides: Partial<PrepV2Payload> = {}): PrepV2Payload {
  const questions: PrepV2Question[] = []
  for (const k of KINDS) {
    for (let i = 0; i < 4; i++) questions.push(safeQ(k, i, i === 3))
    questions.push({ ...safeQ(k, 90), text: CANARY.riskyQuestion, risk_level: "high" })
    questions.push({ ...safeQ(k, 91), text: CANARY.confrontational, types: ["confrontational"] })
    questions.push({ ...safeQ(k, 92), text: CANARY.emotional, types: ["reflective", "emotional"] })
  }
  return {
    thesis: CANARY.thesis,
    axes_of_tension: [CANARY.axis],
    guest_extraction_strategy: CANARY.strategy,
    episode_sections: KINDS.map((kind) => ({
      kind,
      intent: CANARY.intent,
      target_emotion: CANARY.intent,
      estimated_minutes: 12,
      transition_goal: CANARY.intent,
    })),
    question_bank: questions,
    host_guidance: {
      overall_tone: CANARY.hostTone,
      do_list: [CANARY.hostDo],
      dont_list: [CANARY.hostDo],
      energy_curve: CANARY.hostTone,
    },
    director_guidance: {
      shot_priorities: [CANARY.director],
      silence_moments: [CANARY.director],
      cut_warnings: [CANARY.director],
    },
    sensitive_zones: [CANARY.zone],
    opening_options: [{ approach: CANARY.opening, text: CANARY.opening }],
    closing_options: [{ approach: CANARY.closing, text: CANARY.closing }],
    total_estimated_minutes: 72,
    generator_version: "v2.1",
    generated_at: "2026-09-20T10:00:00.000Z",
    ai_run_ids: {
      pass1_research: CANARY.runId,
      pass2_structure: CANARY.runId,
      pass3_questions: CANARY.runId,
      pass4_critique: CANARY.runId,
      pass5_insights: [CANARY.runId],
    },
    // Not on PrepV2Payload's type, but present on real rows / plausible
    // future fields — the projection must drop them too.
    critic_notes: [CANARY.critic],
    scores: { canary: CANARY.critic },
    ...overrides,
  } as PrepV2Payload
}

/** Every canary value — the grep list. */
export const CANARY_VALUES: string[] = Object.values(CANARY)
