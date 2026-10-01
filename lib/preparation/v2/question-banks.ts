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
import {
  COURSE_PROMPT_VERSION,
  courseSafeTypes,
  STORY_PROMPT_VERSION,
  type PrepFormat,
} from "./format"

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
  /** Episode format. Absent/"story" ⇒ the original arc prompt, unchanged. */
  format?: PrepFormat
  /** Course only — the goal text, verbatim. */
  episode_goal?: string | null
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
  const isCourse = input.format === "course"

  const system = isCourse ? courseQuestionSystem(langLabel, input.pass2.sections) : [
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
    "9. The emotional_peak section MUST contain at least 2 questions tagged 'emotional' — this holds for EVERY guest, including a business, founder or success story. There, 'emotional' means the human cost behind the milestones: the doubt or fear he did not show, what the work cost his family or health, the night before a decision he could not undo, the moment of selling or handing over what he built, who he let down or who stood by him. A question about strategy, numbers or lessons is NOT emotional even at the peak — tag it reflective/factual and add emotional ones.",
    "10. The conflict section MUST contain at least 2 questions tagged 'confrontational' OR 'philosophical'.",
  ].join("\n")

  const sectionsBlock = isCourse ? courseModulesBlock(input.pass2.sections) : input.pass2.sections
    .map(
      (s) =>
        `- ${s.kind} (${s.estimated_minutes}m, target: ${s.target_emotion}): ${s.intent}\n  transition_goal: ${s.transition_goal}`,
    )
    .join("\n")

  const user = [
    ...(isCourse
      ? [
          "EPISODE GOAL (the syllabus):",
          input.episode_goal?.trim() || "(none)",
          "",
        ]
      : []),
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
    isCourse ? "Course modules (section id = the slot to put the question in):" : "Episode sections:",
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
      target_section_count: isCourse ? input.pass2.sections.length : SECTION_KINDS.length,
      ...(isCourse ? { format: "course" } : {}),
    },
    promptVersion: isCourse ? COURSE_PROMPT_VERSION : STORY_PROMPT_VERSION,
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

  // Course: a question may only land in a slot this course actually uses.
  const allowedSections = isCourse
    ? new Set<string>(input.pass2.sections.map((s) => s.kind))
    : null
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
    if (allowedSections && !allowedSections.has(section)) continue
    const types = isCourse ? courseSafeTypes(coerceTypes(raw["types"])) : coerceTypes(raw["types"])
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

// ─── Course format ────────────────────────────────────────────────────

function courseModulesBlock(sections: PrepV2Section[]): string {
  return sections
    .map((s, i) =>
      [
        `- section id "${s.kind}" = MODULE ${i}: «${s.title ?? s.kind}» (${s.estimated_minutes}m)`,
        `  teaches: ${s.intent}`,
        `  learning objective: ${s.learning_objective ?? ""}`,
        `  key concepts: ${(s.key_concepts ?? []).join(" | ")}`,
        `  takeaway tool: ${s.takeaway_tool ?? ""}`,
        `  guest experience as example: ${s.guest_experience_fit ?? ""}`,
      ].join("\n"),
    )
    .join("\n")
}

/**
 * The story prompt demands ≥2 emotional questions at the peak and ≥2
 * confrontational ones in the conflict — quotas that turn an expert into a
 * confession. The course prompt replaces them with method quotas: every
 * module must yield concepts, steps and a tool, with the guest's experience
 * as the worked example.
 */
function courseQuestionSystem(langLabel: string, sections: PrepV2Section[]): string {
  const ids = sections.map((s) => s.kind).join("|")
  const perModule = sections
    .map((s) => `${s.kind}: ${Math.max(3, Math.round(s.estimated_minutes / 3.5))}`)
    .join(", ")
  return [
    `You write questions for a serious ${langLabel}-language podcast episode run as a MINI-COURSE / TRAINING SESSION with an expert guest. The host needs a question bank usable LIVE that walks the listener through the modules IN ORDER and leaves them with method and tools.`,
    "",
    "Output JSON only. Shape:",
    "{ \"questions\": [ {",
    `  \"section\": one of ${ids},`,
    "  \"text\": string,",
    "  \"types\": string[],                           // ≥1 of: factual, reflective, philosophical, personal",
    "  \"priority\": \"must_ask\" | \"if_time\",",
    "  \"purpose\": string,                           // one sentence: which concept / step / tool this extracts",
    "  \"follow_up_prompt\": string,                  // a single prompt asking for a concrete example, step or number",
    "  \"risk_level\": \"low\" | \"medium\" | \"high\"",
    "} ] }",
    "",
    "RULES:",
    "1. CRITICAL — the `questions` array MUST have between 30 and 38 items. Count before returning.",
    `2. Distribution follows each module's minutes (about one question per 3–4 minutes): ${perModule}. Every module gets at least 3. A topic module is NEVER reduced to one or two questions.`,
    "3. At least 14 questions must be priority=must_ask, spread across ALL modules — each topic module needs ≥2 must_ask.",
    "4. Anchor, then extract: each question opens on a concrete situation (a case he lived, or a scene the listener will face — 'you walk into an organisation where…') and asks how he reads or acts in it. The step list or checklist belongs in follow_up_prompt, never as the question itself.",
    "5. The guest's experience is the worked example INSIDE each module: at least one question per topic module asks for a real case that illustrates the concept.",
    "6. Module 0 covers who the guest is + successes and failures. Ask about failures as LESSONS ('what did it teach you, what would you do differently'), never as confession.",
    "7. BANNED: confrontational or 'gotcha' questions, questions whose purpose is regret, pain or emotional exposure, and report-style questions that only ask for a list. Do not use the types 'confrontational' or 'emotional'. Exception: failures, regrets or doors the EPISODE GOAL explicitly names are IN scope for module 0. Ask each once, gently, as an open door the guest may decline (risk_level medium; state 'only if he wishes' in follow_up_prompt when the goal says so), and turn the answer toward the lesson it taught.",
    "8. Types: factual (concepts, steps, data), reflective (lessons, judgement), philosophical (principles, what stays human), personal (only for the guest's own example).",
    "9. Each question must serve its module's learning objective, key concepts or takeaway tool — name which one in the purpose.",
    "10. Respect every instruction in the goal about topics to avoid or to raise only if the guest wishes — including topics the goal says a previous episode already covered.",
    "11. Banned filler: 'tell me about yourself', 'any final thoughts', anything you would ask any guest.",
    "12. The last module's questions consolidate: the toolkit, the first step, the one mistake to avoid.",
    "13. Section ids are opaque slot labels — ignore their literal meaning; the module title defines the content.",
  ].join("\n")
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
