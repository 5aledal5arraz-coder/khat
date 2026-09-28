/**
 * Phase X Step 4 — Pass 2: Episode Structure.
 *
 * Produces the 6-section spine. Each section gets an intent, target
 * emotion, estimated minutes, and transition_goal. Total minutes is
 * shaped so Pass 4 can rebalance into the [60, 90] target window.
 *
 * Single editorial AI call so the spine has narrative judgment.
 */

import { runAiTask } from "@/lib/ai-router"
import { khatConstitutionBlock } from "@/lib/khat-map/core/constitution"
import { SECTION_KINDS, type PrepV2Pass2Output, type PrepV2Section } from "./types"
import {
  assignCourseSlots,
  COURSE_MAX_MODULES,
  COURSE_MODULE_MAX_MINUTES,
  COURSE_MODULE_MIN_MINUTES,
  PREP_BACKBONE_PROMPT_VERSION,
  type CourseModuleDraft,
  type PrepFormat,
} from "./format"

export interface Pass2Input {
  language: "ar" | "en"
  preparation_id: string
  eir_id: string | null
  pass1: {
    thesis: string
    axes_of_tension: string[]
    guest_extraction_strategy: string
    sensitive_zones: string[]
  }
  /** Episode format. Absent/"story" ⇒ the original six-section arc. */
  format?: PrepFormat
  /** Course only — the goal text, verbatim: it is the syllabus. */
  episode_goal?: string | null
  /** Course only — total minutes the modules should add up to. */
  target_minutes?: number
}

export interface Pass2Result {
  ok: boolean
  output: PrepV2Pass2Output | null
  ai_run_id: string | null
  error?: string
}

export async function runStructureBuild(input: Pass2Input): Promise<Pass2Result> {
  if (input.format === "course") return runCourseStructureBuild(input)
  const langLabel = input.language === "ar" ? "Arabic" : "English"

  // «دستور خط» (compact) is the FIRST block of both formats (2026-09-28).
  const system = [
    khatConstitutionBlock("compact"),
    "",
    `You are designing the structure of a 60–90 minute ${langLabel}-language podcast episode.`,
    "",
    "Output JSON only. Shape:",
    "{",
    `  "sections": [`,
    `    { "kind": "opening",        "intent": string, "target_emotion": string, "estimated_minutes": number, "transition_goal": string },`,
    `    { "kind": "build_up",       ... },`,
    `    { "kind": "conflict",       ... },`,
    `    { "kind": "deep_dive",      ... },`,
    `    { "kind": "emotional_peak", ... },`,
    `    { "kind": "resolution",     ... }`,
    `  ]`,
    "}",
    "",
    "RULES:",
    "1. Exactly 6 sections, in the order above.",
    "2. estimated_minutes: integers; the sum should be roughly 75 (Pass 4 will rebalance into 60–90). Distribute deliberately — opening should be the shortest, deep_dive and emotional_peak the longest.",
    "3. intent: 2–3 sentences naming what this section earns. NOT a topic list.",
    "4. target_emotion: a single word/phrase (e.g., 'curiosity', 'tension', 'reverence', 'longing').",
    "5. transition_goal: how to land in the next section without it feeling forced.",
    "6. The structure must be coherent with the thesis and the 6 axes of tension below — not generic.",
  ].join("\n")

  const user = [
    `Thesis: ${input.pass1.thesis}`,
    `Axes of tension:`,
    ...input.pass1.axes_of_tension.map((a, i) => `  ${i + 1}. ${a}`),
    "",
    `Guest extraction strategy: ${input.pass1.guest_extraction_strategy}`,
    "",
    input.pass1.sensitive_zones.length > 0
      ? `Sensitive zones (handle with care): ${input.pass1.sensitive_zones.join(" | ")}`
      : "(no sensitive zones)",
    "",
    `Return JSON only. Language of output values: ${langLabel}.`,
  ].join("\n")

  const r = await runAiTask<PrepV2Pass2Output>({
    taskKind: "editorial",
    eirId: input.eir_id,
    subjectTable: "episode_preparations",
    subjectId: input.preparation_id,
    input: {
      pass: "prep_v2.structure_build",
      preparation_id: input.preparation_id,
      language: input.language,
    },
    promptVersion: PREP_BACKBONE_PROMPT_VERSION.story,
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.6 },
  })

  if (r.status !== "succeeded" || !r.parsed?.sections) {
    return {
      ok: false,
      output: null,
      ai_run_id: r.runId,
      error: r.errorMessage ?? "Pass 2 returned no JSON",
    }
  }

  const sections: PrepV2Section[] = []
  const expected = SECTION_KINDS
  for (let i = 0; i < expected.length; i++) {
    const raw = r.parsed.sections[i] ?? ({} as Partial<PrepV2Section>)
    sections.push({
      kind: expected[i], // pin the canonical order even if model drifts
      intent: String(raw.intent ?? "").trim(),
      target_emotion: String(raw.target_emotion ?? "").trim(),
      estimated_minutes: clampInt(raw.estimated_minutes, 3, 30),
      transition_goal: String(raw.transition_goal ?? "").trim(),
    })
  }
  return { ok: true, output: { sections }, ai_run_id: r.runId }
}

// ─── Course format ────────────────────────────────────────────────────
//
// ROOT CAUSE this branch exists for: the story prompt above never sees the
// episode goal — only Pass 1's thesis + axes of tension — and hard-codes six
// emotional slots at ~75 minutes. A goal that lists an ordered syllabus
// («1) من هو … 2) التشخيص … 3) أول 100 يوم … 4) الذكاء الاصطناعي») had no
// way to survive into the structure. Here the goal is passed verbatim, the
// model returns MODULES in goal order, and code pins them onto slot kinds.


async function runCourseStructureBuild(input: Pass2Input): Promise<Pass2Result> {
  const langLabel = input.language === "ar" ? "Arabic" : "English"
  const target = input.target_minutes ?? 120

  const system = [
    khatConstitutionBlock("compact"),
    "",
    `You are designing a ${target}-minute ${langLabel}-language podcast episode run as a MINI-COURSE / TRAINING SESSION with an expert guest.`,
    "",
    "Output JSON only. Shape:",
    "{",
    `  "modules": [`,
    `    { "title": string, "intent": string, "learning_objective": string, "key_concepts": string[], "takeaway_tool": string, "guest_experience_fit": string, "target_emotion": string, "estimated_minutes": number, "transition_goal": string }`,
    `  ]`,
    "}",
    "",
    "RULES:",
    "1. The EPISODE GOAL below is the syllabus. Its topics become modules IN THE EXACT ORDER the goal lists them. Never reorder, never drop a topic, never invent a topic the goal does not ask for.",
    "2. Module 0 (first) introduces the guest: who he is, his path, his successes AND failures — told as lessons. If the goal's first item already is the guest introduction, that item IS module 0; do not add a second one. Give module 0 the minutes the goal names for it, otherwise 15–20.",
    "3. Then one module per remaining goal topic, in order.",
    "4. The LAST module is always a short wrap-up (5–10 minutes): recap of the frameworks and the listener's toolkit / action plan.",
    `5. Between 3 and ${COURSE_MAX_MODULES} modules in total. If the goal has more topics than fit, combine ADJACENT topics into one module (name both in the title) — never drop one.`,
    `6. estimated_minutes: integers; the SUM must be close to ${target}. Honour any per-topic duration the goal states. Topic modules carry the weight; the wrap-up is the shortest.`,
    "7. title: the module's own short name, taken from the goal's wording.",
    "8. intent: 1–2 sentences on what the module teaches. learning_objective: what the listener can DO after it (a verb, a skill).",
    "9. key_concepts: 2–5 frameworks, models or ideas the module unpacks, named as the goal or the guest's field names them.",
    "10. takeaway_tool: ONE practical tool the listener leaves with — a checklist, a question set, a step sequence, a rule of thumb.",
    "11. guest_experience_fit: where the guest's own experience enters THIS module as a worked example. Experiences are woven into each module, not isolated.",
    "12. target_emotion: the learning tone of the module in one word (e.g., 'clarity', 'curiosity', 'confidence'). NOT tension, regret or confrontation.",
    "13. transition_goal: the bridge from this module's lesson to the next module's question.",
  ].join("\n")

  const user = [
    `EPISODE GOAL (the syllabus — follow its order):`,
    input.episode_goal?.trim() || "(no goal text — derive modules from the thesis and learning threads)",
    "",
    `Course promise (thesis): ${input.pass1.thesis}`,
    `Learning threads:`,
    ...input.pass1.axes_of_tension.map((a, i) => `  ${i + 1}. ${a}`),
    "",
    `Guest extraction strategy: ${input.pass1.guest_extraction_strategy}`,
    "",
    input.pass1.sensitive_zones.length > 0
      ? `Sensitive zones (handle with care): ${input.pass1.sensitive_zones.join(" | ")}`
      : "(no sensitive zones)",
    "",
    `Return JSON only. Language of output values: ${langLabel}.`,
  ].join("\n")

  const r = await runAiTask<{ modules?: Array<Record<string, unknown>> }>({
    taskKind: "editorial",
    eirId: input.eir_id,
    subjectTable: "episode_preparations",
    subjectId: input.preparation_id,
    input: {
      pass: "prep_v2.structure_build",
      preparation_id: input.preparation_id,
      language: input.language,
      format: "course",
      target_minutes: target,
    },
    promptVersion: PREP_BACKBONE_PROMPT_VERSION.course,
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.5 },
  })

  if (r.status !== "succeeded" || !Array.isArray(r.parsed?.modules)) {
    return {
      ok: false,
      output: null,
      ai_run_id: r.runId,
      error: r.errorMessage ?? "Pass 2 (course) returned no JSON",
    }
  }

  const sections = assignCourseSlots(
    r.parsed.modules
      .map((raw) => coerceCourseModule(raw))
      .filter((m): m is CourseModuleDraft => m !== null),
  )
  if (!sections) {
    return {
      ok: false,
      output: null,
      ai_run_id: r.runId,
      error: "Pass 2 (course) returned fewer than 3 usable modules",
    }
  }
  return { ok: true, output: { sections }, ai_run_id: r.runId }
}

/** Normalise one raw module. Exported for tests. */
export function coerceCourseModule(
  raw: Record<string, unknown> | null | undefined,
): CourseModuleDraft | null {
  if (!raw || typeof raw !== "object") return null
  const str = (v: unknown) => String(v ?? "").trim()
  const title = str(raw.title)
  if (title.length < 2) return null
  return {
    title,
    intent: str(raw.intent),
    learning_objective: str(raw.learning_objective),
    key_concepts: Array.isArray(raw.key_concepts)
      ? (raw.key_concepts as unknown[]).map(str).filter(Boolean)
      : [],
    takeaway_tool: str(raw.takeaway_tool),
    guest_experience_fit: str(raw.guest_experience_fit),
    target_emotion: str(raw.target_emotion),
    estimated_minutes: clampInt(
      raw.estimated_minutes,
      COURSE_MODULE_MIN_MINUTES,
      COURSE_MODULE_MAX_MINUTES,
    ),
    transition_goal: str(raw.transition_goal),
  }
}

function clampInt(v: unknown, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.round(n)))
}
