/**
 * Phase X Step 4 — Pass 3: Question Banks.
 *
 * Generates 24–40 questions across the 6 sections. Every question gets
 * a section, types[], priority, purpose, follow_up_prompt, risk_level.
 *
 * Single editorial AI call. The critic in Pass 4 cleans + balances.
 */

import { randomUUID } from "node:crypto"
import { runAiTask } from "@/lib/ai-router"
import {
  SECTION_KINDS,
  QUESTION_TYPES,
  QUESTION_PRIORITIES,
  QUESTION_RISK_LEVELS,
  type PrepV2Pass3Output,
  type PrepV2Question,
  type PrepV2Section,
  type SectionKind,
  type QuestionType,
  type QuestionPriority,
  type QuestionRiskLevel,
} from "./types"

export interface Pass3Input {
  language: "ar" | "en"
  preparation_id: string
  eir_id: string | null
  pass1: {
    thesis: string
    axes_of_tension: string[]
    guest_extraction_strategy: string
    sensitive_zones: string[]
  }
  pass2: {
    sections: PrepV2Section[]
  }
}

export interface Pass3Result {
  ok: boolean
  output: PrepV2Pass3Output | null
  ai_run_id: string | null
  error?: string
}

export async function runQuestionBankGeneration(
  input: Pass3Input,
): Promise<Pass3Result> {
  const langLabel = input.language === "ar" ? "Arabic" : "English"

  const system = [
    `You write questions for a serious ${langLabel}-language podcast. The host needs a question bank that is usable LIVE during a 60–90 minute conversation.`,
    "",
    "Output JSON only. Shape:",
    "{ \"questions\": [ {",
    "  \"section\": one of opening|build_up|conflict|deep_dive|emotional_peak|resolution,",
    "  \"text\": string,                              // the question itself",
    "  \"types\": string[],                           // ≥1 of: emotional, philosophical, personal, confrontational, reflective, factual",
    "  \"priority\": \"must_ask\" | \"if_time\",",
    "  \"purpose\": string,                           // one sentence: why ask this",
    "  \"follow_up_prompt\": string,                  // a single follow-up the host can use if the answer is short",
    "  \"risk_level\": \"low\" | \"medium\" | \"high\"",
    "} ] }",
    "",
    "RULES:",
    "1. CRITICAL — count your questions before returning. The `questions` array MUST have at least 30 items. 28 is failure. 29 is failure. Less than 30 means you didn't finish. The maximum is 38.",
    "2. Distribution: 4 in opening, 5 in build_up, 6 in conflict, 7 in deep_dive, 5 in emotional_peak, 4 in resolution = 31 baseline. Add up to 7 more wherever an axis genuinely has more to ask.",
    "3. At least 14 questions must be priority=must_ask.",
    "4. Avoid filler. Banned: 'tell me about yourself', 'how was your day', 'any final thoughts', anything you would ask any guest.",
    "5. Each question must serve the thesis or one of the axes of tension. Name the axis or the thesis line in the purpose.",
    "6. Use multiple types when accurate (e.g., personal+confrontational). At least one type per question.",
    "7. The follow_up_prompt is NOT a separate question — it's a single-sentence prompt the host says if the answer is too short.",
    "8. risk_level reflects difficulty for the guest (e.g., personal trauma = high, factual context = low). Match it to the section.",
    "9. The emotional_peak section MUST contain at least 2 questions tagged 'emotional'.",
    "10. The conflict section MUST contain at least 2 questions tagged 'confrontational' OR 'philosophical'.",
  ].join("\n")

  const sectionsBlock = input.pass2.sections
    .map(
      (s) =>
        `- ${s.kind} (${s.estimated_minutes}m, target: ${s.target_emotion}): ${s.intent}\n  transition_goal: ${s.transition_goal}`,
    )
    .join("\n")

  const user = [
    `Thesis: ${input.pass1.thesis}`,
    `Axes of tension:`,
    ...input.pass1.axes_of_tension.map((a, i) => `  ${i + 1}. ${a}`),
    "",
    `Guest extraction strategy: ${input.pass1.guest_extraction_strategy}`,
    "",
    input.pass1.sensitive_zones.length > 0
      ? `Sensitive zones: ${input.pass1.sensitive_zones.join(" | ")}`
      : "(no sensitive zones)",
    "",
    "Episode sections:",
    sectionsBlock,
    "",
    `Return JSON only. Language of output values: ${langLabel}.`,
  ].join("\n")

  const r = await runAiTask<PrepV2Pass3Output>({
    taskKind: "editorial",
    eirId: input.eir_id,
    subjectTable: "episode_preparations",
    subjectId: input.preparation_id,
    input: {
      pass: "prep_v2.question_banks",
      preparation_id: input.preparation_id,
      language: input.language,
      target_section_count: SECTION_KINDS.length,
    },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.7 },
  })

  if (r.status !== "succeeded" || !Array.isArray(r.parsed?.questions)) {
    return {
      ok: false,
      output: null,
      ai_run_id: r.runId,
      error: r.errorMessage ?? "Pass 3 returned no JSON",
    }
  }

  const questions: PrepV2Question[] = []
  // `r.parsed.questions` is typed as `PrepV2Question[]` from the AI
  // schema but the loop body treats each entry as a free-form record
  // (the AI may emit extra/missing fields). Two-step cast through
  // `unknown` per TS strict mode requirement.
  for (const raw of r.parsed.questions as unknown as Array<
    Record<string, unknown>
  >) {
    const section = coerceSection(raw["section"])
    if (!section) continue
    const types = coerceTypes(raw["types"])
    if (types.length === 0) continue
    const text = String(raw["text"] ?? "").trim()
    if (text.length < 10) continue
    questions.push({
      id: randomUUID(),
      section,
      text,
      types,
      priority: coercePriority(raw["priority"]),
      purpose: String(raw["purpose"] ?? "").trim(),
      follow_up_prompt: String(raw["follow_up_prompt"] ?? "").trim(),
      risk_level: coerceRisk(raw["risk_level"]),
    })
  }
  return { ok: true, output: { questions }, ai_run_id: r.runId }
}

// ─── Coercion helpers ─────────────────────────────────────────────────

function coerceSection(v: unknown): SectionKind | null {
  const s = String(v ?? "").trim().toLowerCase()
  return (SECTION_KINDS as readonly string[]).includes(s)
    ? (s as SectionKind)
    : null
}
function coerceTypes(v: unknown): QuestionType[] {
  const arr = Array.isArray(v) ? v : [v]
  const out: QuestionType[] = []
  for (const x of arr) {
    const s = String(x ?? "").trim().toLowerCase()
    if ((QUESTION_TYPES as readonly string[]).includes(s)) {
      if (!out.includes(s as QuestionType)) out.push(s as QuestionType)
    }
  }
  return out
}
function coercePriority(v: unknown): QuestionPriority {
  const s = String(v ?? "").trim().toLowerCase()
  return (QUESTION_PRIORITIES as readonly string[]).includes(s)
    ? (s as QuestionPriority)
    : "if_time"
}
function coerceRisk(v: unknown): QuestionRiskLevel {
  const s = String(v ?? "").trim().toLowerCase()
  return (QUESTION_RISK_LEVELS as readonly string[]).includes(s)
    ? (s as QuestionRiskLevel)
    : "medium"
}
