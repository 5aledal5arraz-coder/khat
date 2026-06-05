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
import { SECTION_KINDS, type PrepV2Pass2Output, type PrepV2Section } from "./types"

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
}

export interface Pass2Result {
  ok: boolean
  output: PrepV2Pass2Output | null
  ai_run_id: string | null
  error?: string
}

export async function runStructureBuild(input: Pass2Input): Promise<Pass2Result> {
  const langLabel = input.language === "ar" ? "Arabic" : "English"

  const system = [
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

function clampInt(v: unknown, min: number, max: number): number {
  const n = Number(v)
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.round(n)))
}
