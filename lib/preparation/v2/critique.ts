/**
 * Phase X Step 4 — Pass 4: Critique & Compression.
 *
 * Reads the full draft (passes 1+2+3) and:
 *   - removes filler questions
 *   - strengthens weak ones
 *   - bumps must_ask priorities so total ≥ 12
 *   - ensures every section meets the 3-question floor
 *   - trims the question bank into [24, 40]
 *   - rebalances section minutes so total lands in [60, 90]
 *   - emits host_guidance, director_guidance, opening/closing options,
 *     and critic_notes
 *
 * Single editorial AI call.
 */

import { runAiTask } from "@/lib/ai-router"
import {
  SECTION_KINDS,
  type PrepV2Pass4Output,
  type PrepV2Question,
  type PrepV2Section,
} from "./types"

const TARGET_MIN = 60
const TARGET_MAX = 90
const TARGET_MID = 75

export interface Pass4Input {
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
  pass3: {
    questions: PrepV2Question[]
  }
}

export interface Pass4Result {
  ok: boolean
  output: PrepV2Pass4Output | null
  ai_run_id: string | null
  /** The critic may also revise sections + question bank — return them. */
  revised_sections: PrepV2Section[]
  revised_questions: PrepV2Question[]
  error?: string
}

export async function runCritiquePass(input: Pass4Input): Promise<Pass4Result> {
  const langLabel = input.language === "ar" ? "Arabic" : "English"

  const system = [
    `You are the critic for a ${langLabel}-language podcast preparation. You receive a draft (sections + questions). You decide what survives, what gets re-priorities, and what gets cut.`,
    "",
    "Output JSON only. Shape:",
    "{",
    "  \"sections\": [ same shape as input, possibly rebalanced ],",
    "  \"questions\": [",
    "    { \"id\": string, // SAME id from input",
    "      \"section\": SectionKind,",
    "      \"text\": string,",
    "      \"types\": string[],",
    "      \"priority\": \"must_ask\" | \"if_time\",",
    "      \"purpose\": string,",
    "      \"follow_up_prompt\": string,",
    "      \"risk_level\": \"low\" | \"medium\" | \"high\"",
    "    }",
    "  ],",
    "  \"host_guidance\": {",
    "    \"overall_tone\": string,",
    "    \"do_list\": string[],     // ≥3",
    "    \"dont_list\": string[],   // ≥3",
    "    \"energy_curve\": string   // sentence describing the arc",
    "  },",
    "  \"director_guidance\": {",
    "    \"shot_priorities\": string[],   // ≥3 specific moments to capture",
    "    \"silence_moments\": string[],   // ≥2 moments to hold",
    "    \"cut_warnings\": string[]       // can be []",
    "  },",
    "  \"opening_options\": [ { \"approach\": string, \"text\": string } ],   // ≥2",
    "  \"closing_options\": [ { \"approach\": string, \"text\": string } ],   // ≥2",
    "  \"critic_notes\": string[]                                              // ≥1 short note about what you changed",
    "}",
    "",
    "RULES:",
    "1. CRITICAL — count your final questions. The `questions` array MUST contain between 28 and 36 items inclusive. 27 is failure. 26 is failure. The simplest way to comply is to NEVER drop more than 3 input questions, and AUTHOR NEW questions (id='crit-N') for any starved section until count >= 28.",
    "   - If the input has fewer than 28 questions, you MUST AUTHOR new ones (id starts with 'crit-') to reach 28 minimum.",
    "   - If the input has more than 36, drop the weakest first.",
    "2. Ensure ≥12 questions are priority=must_ask. Bump weak must_asks to if_time before promoting strong if_times to must_ask.",
    "3. Every section needs ≥3 questions. If a section is starved, AUTHOR new questions (id starts with 'crit-') to fill it; never leave a section under-staffed.",
    "4. Adjust section.estimated_minutes so the SUM is between 60 and 90 (aim near 75). Keep relative weights: deep_dive and emotional_peak are usually the longest.",
    "5. host_guidance must be specific to THIS thesis. Generic 'be empathetic' is rejected.",
    "6. director_guidance must reference THIS arc — e.g., 'tight on hands when admitting the trade,' not 'good lighting.'",
    "7. opening_options must be CONCRETE first lines or first beats — write them out.",
    "8. closing_options must be the actual closing question or beat. Two distinct approaches.",
    "9. Do NOT invent a thesis or new axes of tension. Those are fixed.",
  ].join("\n")

  const draftBlock = JSON.stringify(
    {
      thesis: input.pass1.thesis,
      axes_of_tension: input.pass1.axes_of_tension,
      sensitive_zones: input.pass1.sensitive_zones,
      sections: input.pass2.sections,
      questions: input.pass3.questions,
    },
    null,
    2,
  ).slice(0, 14_000) // hard cap to stay inside prompt budget

  const user = [
    "Critique and finalize this preparation draft.",
    "",
    draftBlock,
    "",
    `Return JSON only. Language of output values: ${langLabel}.`,
  ].join("\n")

  const r = await runAiTask<{
    sections?: PrepV2Section[]
    questions?: Array<Record<string, unknown>>
    host_guidance?: PrepV2Pass4Output["host_guidance"]
    director_guidance?: PrepV2Pass4Output["director_guidance"]
    opening_options?: PrepV2Pass4Output["opening_options"]
    closing_options?: PrepV2Pass4Output["closing_options"]
    critic_notes?: string[]
  }>({
    taskKind: "editorial",
    eirId: input.eir_id,
    subjectTable: "episode_preparations",
    subjectId: input.preparation_id,
    input: {
      pass: "prep_v2.critique",
      preparation_id: input.preparation_id,
      language: input.language,
      input_question_count: input.pass3.questions.length,
    },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.55 },
  })

  if (r.status !== "succeeded" || !r.parsed) {
    return {
      ok: false,
      output: null,
      ai_run_id: r.runId,
      revised_sections: input.pass2.sections,
      revised_questions: input.pass3.questions,
      error: r.errorMessage ?? "Pass 4 returned no JSON",
    }
  }

  // Sections — pin canonical kind order; rebalance minutes if total drifts.
  const incomingSections = (r.parsed.sections ?? []) as PrepV2Section[]
  const revisedSections: PrepV2Section[] = SECTION_KINDS.map((kind, i) => {
    const fallback = input.pass2.sections[i]
    const found =
      incomingSections.find((s) => s.kind === kind) ?? incomingSections[i] ?? fallback
    return {
      kind,
      intent: String(found?.intent ?? fallback.intent ?? "").trim(),
      target_emotion: String(found?.target_emotion ?? fallback.target_emotion ?? "").trim(),
      estimated_minutes: clampInt(found?.estimated_minutes ?? fallback?.estimated_minutes ?? 12, 3, 30),
      transition_goal: String(found?.transition_goal ?? fallback?.transition_goal ?? "").trim(),
    }
  })
  rebalanceMinutes(revisedSections)

  // Questions — preserve ids from Pass 3 when matched; otherwise mint new.
  const seenIds = new Set<string>()
  const revisedQuestions: PrepV2Question[] = []
  for (const raw of r.parsed.questions ?? []) {
    const id = String(raw["id"] ?? "").trim()
    const fromBank = id ? input.pass3.questions.find((q) => q.id === id) : null
    const finalId =
      fromBank?.id ??
      (id && id.startsWith("crit-")
        ? id
        : `crit-${revisedQuestions.length}-${Math.random().toString(36).slice(2, 8)}`)
    if (seenIds.has(finalId)) continue
    seenIds.add(finalId)
    const text = String(raw["text"] ?? fromBank?.text ?? "").trim()
    if (text.length < 10) continue
    const section = String(raw["section"] ?? fromBank?.section ?? "").trim() as PrepV2Question["section"]
    if (!(SECTION_KINDS as readonly string[]).includes(section)) continue
    const types = Array.isArray(raw["types"])
      ? (raw["types"] as unknown[])
          .map((t) => String(t ?? "").trim().toLowerCase())
          .filter((t) =>
            ["emotional", "philosophical", "personal", "confrontational", "reflective", "factual"].includes(t),
          )
      : fromBank?.types ?? []
    if (types.length === 0) continue
    const priorityRaw = String(raw["priority"] ?? fromBank?.priority ?? "if_time").trim().toLowerCase()
    const priority = priorityRaw === "must_ask" ? "must_ask" : "if_time"
    const riskRaw = String(raw["risk_level"] ?? fromBank?.risk_level ?? "medium").trim().toLowerCase()
    const risk_level: PrepV2Question["risk_level"] =
      riskRaw === "high" ? "high" : riskRaw === "low" ? "low" : "medium"
    revisedQuestions.push({
      id: finalId,
      section,
      text,
      types: types as PrepV2Question["types"],
      priority,
      purpose: String(raw["purpose"] ?? fromBank?.purpose ?? "").trim(),
      follow_up_prompt: String(raw["follow_up_prompt"] ?? fromBank?.follow_up_prompt ?? "").trim(),
      risk_level,
    })
  }
  // If the critic wiped too much, fall back to the Pass 3 set so validation can still surface a usable retry.
  const finalQuestions =
    revisedQuestions.length === 0 ? input.pass3.questions : revisedQuestions

  // Backfill must_ask if we are short — promote the highest-text-length ones.
  ensureMustAskFloor(finalQuestions, 12)

  // Backfill section question floor if a section is starved.
  ensurePerSectionFloor(finalQuestions, revisedSections, 3)

  const out: PrepV2Pass4Output = {
    host_guidance: normalizeHost(r.parsed.host_guidance),
    director_guidance: normalizeDirector(r.parsed.director_guidance),
    opening_options: normalizeApproachList(r.parsed.opening_options),
    closing_options: normalizeApproachList(r.parsed.closing_options),
    critic_notes: Array.isArray(r.parsed.critic_notes)
      ? (r.parsed.critic_notes as unknown[]).map((s) => String(s ?? "").trim()).filter(Boolean)
      : [],
  }
  return {
    ok: true,
    output: out,
    ai_run_id: r.runId,
    revised_sections: revisedSections,
    revised_questions: finalQuestions,
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

function clampInt(v: unknown, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.round(n)))
}

/**
 * Scale all section minutes proportionally so the sum lands inside
 * [TARGET_MIN, TARGET_MAX]. If already inside, do nothing.
 */
function rebalanceMinutes(sections: PrepV2Section[]) {
  const sum = sections.reduce((a, s) => a + (s.estimated_minutes || 0), 0)
  if (sum === 0) {
    // Cold start fallback.
    const defaults = [6, 10, 14, 18, 16, 11]
    sections.forEach((s, i) => (s.estimated_minutes = defaults[i] ?? 12))
    return
  }
  if (sum >= TARGET_MIN && sum <= TARGET_MAX) return
  const target = TARGET_MID
  const factor = target / sum
  let runningTotal = 0
  for (let i = 0; i < sections.length; i++) {
    if (i === sections.length - 1) {
      sections[i].estimated_minutes = clampInt(target - runningTotal, 3, 30)
    } else {
      const v = clampInt((sections[i].estimated_minutes || 0) * factor, 3, 30)
      sections[i].estimated_minutes = v
      runningTotal += v
    }
  }
}

function ensureMustAskFloor(questions: PrepV2Question[], floor: number) {
  let mustAsk = questions.filter((q) => q.priority === "must_ask").length
  if (mustAsk >= floor) return
  // Sort `if_time` by depth proxy (text length) — promote the strongest.
  const candidates = questions
    .filter((q) => q.priority === "if_time")
    .sort((a, b) => (b.text?.length ?? 0) - (a.text?.length ?? 0))
  for (const c of candidates) {
    if (mustAsk >= floor) break
    c.priority = "must_ask"
    mustAsk++
  }
}

/**
 * If a section has fewer than `floor` questions, downgrade-and-borrow
 * is not safe (would mean deleting from elsewhere). Instead, we mark
 * the prep as needing a critique retry by leaving the count where it
 * is. The validator will surface section_low_question_count.
 *
 * This helper is intentionally a no-op except in extreme cases —
 * pulling questions from the largest section to the starving one is
 * a heuristic we keep to guarantee the prep is at least openable.
 */
function ensurePerSectionFloor(
  questions: PrepV2Question[],
  sections: PrepV2Section[],
  floor: number,
) {
  // Count per section.
  const counts = new Map<string, PrepV2Question[]>()
  for (const s of sections) counts.set(s.kind, [])
  for (const q of questions) {
    const arr = counts.get(q.section)
    if (arr) arr.push(q)
  }
  // Find starving + surplus sections.
  const starving = [...counts.entries()].find(([, arr]) => arr.length < floor)
  if (!starving) return
  const [starvKind, starvArr] = starving
  let surplus: [string, PrepV2Question[]] | undefined
  for (const [k, arr] of counts) {
    if (k === starvKind) continue
    if (arr.length > floor && (!surplus || arr.length > surplus[1].length)) {
      surplus = [k, arr]
    }
  }
  if (!surplus) return
  const need = floor - starvArr.length
  // Move the lowest-priority items from surplus to starving.
  const movable = surplus[1]
    .filter((q) => q.priority === "if_time")
    .slice(0, need)
  for (const q of movable) q.section = starvKind as typeof q.section
}

function normalizeHost(
  raw: unknown,
): PrepV2Pass4Output["host_guidance"] {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    overall_tone: String(r.overall_tone ?? "").trim(),
    do_list: arrStr(r.do_list),
    dont_list: arrStr(r.dont_list),
    energy_curve: String(r.energy_curve ?? "").trim(),
  }
}

function normalizeDirector(
  raw: unknown,
): PrepV2Pass4Output["director_guidance"] {
  const r = (raw ?? {}) as Record<string, unknown>
  return {
    shot_priorities: arrStr(r.shot_priorities),
    silence_moments: arrStr(r.silence_moments),
    cut_warnings: arrStr(r.cut_warnings),
  }
}

function normalizeApproachList(raw: unknown) {
  const arr = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : []
  return arr
    .map((r) => ({
      approach: String(r.approach ?? "").trim(),
      text: String(r.text ?? "").trim(),
    }))
    .filter((x) => x.text.length > 0)
}

function arrStr(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return (v as unknown[])
    .map((x) => String(x ?? "").trim())
    .filter((x) => x.length > 0)
}
