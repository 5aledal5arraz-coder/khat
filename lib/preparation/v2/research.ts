/**
 * Phase X Step 4 — Pass 1: Research Synthesis.
 *
 * Reads everything we already know about the episode + guest (EIR
 * editorial intent, optional hybrid-topic provenance, optional guest
 * identity profile, optional Khat Map context) and produces:
 *   - thesis (one-sentence argument)
 *   - 6 axes_of_tension
 *   - guest_extraction_strategy (paragraph)
 *   - sensitive_zones (list)
 *
 * Single AI call, structural model. No web fetches in v2.1 — this pass
 * synthesizes from what's stored. Live web research stays out of the
 * critical path until we wire a vetted research adapter.
 */

import { runAiTask } from "@/lib/ai-router"
import type { PrepV2Pass1Output } from "./types"

export interface Pass1Input {
  episode_title: string
  episode_goal: string | null
  topic_domain: string | null
  episode_type: string | null
  language: "ar" | "en"
  /** Editorial intent payload from the EIR (hook, why_matters, why_now, etc). */
  editorial_intent: Record<string, unknown> | null
  /** When candidate came from the Hybrid Generator. */
  hybrid_provenance: {
    market_inspiration?: string | null
    original_lens?: string | null
    conflict_angle?: string | null
  } | null
  /** Stored guest identity blob, if any. */
  guest_identity: Record<string, unknown> | null
  /** EIR id — for ai_runs subject scope. */
  eir_id: string | null
  preparation_id: string
}

export interface Pass1Result {
  ok: boolean
  output: PrepV2Pass1Output | null
  ai_run_id: string | null
  error?: string
}

export async function runResearchSynthesis(
  input: Pass1Input,
): Promise<Pass1Result> {
  const langLabel = input.language === "ar" ? "Arabic" : "English"

  const provenance = input.hybrid_provenance
  const provenanceBlob = provenance
    ? `Market inspiration: ${provenance.market_inspiration ?? "—"}
Original lens: ${provenance.original_lens ?? "—"}
Conflict angle: ${provenance.conflict_angle ?? "—"}`
    : "(no hybrid provenance — pure editor-driven topic)"

  const guestBlob = input.guest_identity
    ? JSON.stringify(input.guest_identity).slice(0, 1500)
    : "(no guest identity stored)"

  const intent = input.editorial_intent ?? {}
  const intentBlob = JSON.stringify(intent).slice(0, 1200)

  const system = [
    `You are a senior editorial researcher for a serious ${langLabel}-language podcast.`,
    "You are about to set up a 60–90 minute conversation. Your job in this pass is to extract the BACKBONE of the conversation, not to write questions.",
    "",
    "Output JSON only. Shape:",
    "{",
    `  "thesis": string,                       // one sentence: the central argument`,
    `  "axes_of_tension": string[6],           // exactly 6 tensions to explore`,
    `  "guest_extraction_strategy": string,    // a paragraph (≥80 chars) describing how to draw out THIS guest`,
    `  "sensitive_zones": string[]             // topics to handle with care or avoid mid-arc`,
    "}",
    "",
    "RULES:",
    "1. The thesis must NAME a real argument. No generic phrases like 'we explore identity'.",
    "2. Each axis_of_tension is a SHORT label of a specific pull (e.g., 'wanting to be seen vs. fearing exposure'). Not a topic. Not a question.",
    "3. The guest_extraction_strategy must be specific to THIS guest's biography/voice. If the guest is unknown, say what kind of opening would still work.",
    "4. sensitive_zones are real risks (legal, religious, personal trauma, contractual). Be honest. Empty array is fine if there are none.",
    "5. Do not write questions in this pass.",
  ].join("\n")

  const user = [
    `Episode title: ${input.episode_title}`,
    `Episode goal: ${input.episode_goal ?? "(none)"}`,
    `Topic domain: ${input.topic_domain ?? "(none)"} | type: ${input.episode_type ?? "(none)"}`,
    "",
    "Editorial intent:",
    intentBlob,
    "",
    "Hybrid provenance:",
    provenanceBlob,
    "",
    "Guest identity (raw):",
    guestBlob,
    "",
    `Return JSON only. No prose, no preamble. Language of output values: ${langLabel}.`,
  ].join("\n")

  const r = await runAiTask<PrepV2Pass1Output>({
    taskKind: "structural",
    eirId: input.eir_id,
    subjectTable: "episode_preparations",
    subjectId: input.preparation_id,
    input: {
      pass: "prep_v2.research_synthesis",
      preparation_id: input.preparation_id,
      language: input.language,
    },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.5 },
  })

  if (r.status !== "succeeded" || !r.parsed) {
    return {
      ok: false,
      output: null,
      ai_run_id: r.runId,
      error: r.errorMessage ?? "Pass 1 returned no JSON",
    }
  }
  // Normalize: trim strings, cap axes to 6.
  const parsed = r.parsed
  const axes = Array.isArray(parsed.axes_of_tension)
    ? parsed.axes_of_tension.map((a: unknown) => String(a ?? "").trim()).filter(Boolean).slice(0, 6)
    : []
  const out: PrepV2Pass1Output = {
    thesis: String(parsed.thesis ?? "").trim(),
    axes_of_tension: axes,
    guest_extraction_strategy: String(parsed.guest_extraction_strategy ?? "").trim(),
    sensitive_zones: Array.isArray(parsed.sensitive_zones)
      ? parsed.sensitive_zones.map((z: unknown) => String(z ?? "").trim()).filter(Boolean)
      : [],
  }
  return { ok: true, output: out, ai_run_id: r.runId }
}
