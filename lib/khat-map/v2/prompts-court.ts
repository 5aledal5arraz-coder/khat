/**
 * Editorial Court — the skeptical executive-producer pass.
 *
 * After the editorial generator produces a pool, the Court interrogates each
 * idea BEFORE it can be accepted. It is deliberately adversarial: its job is to
 * find why an idea would fail, whether it is overdone, whether a real guest
 * could carry it, and to RE-CALIBRATE the 14 success dimensions more honestly
 * than the generator (which is biased toward its own ideas). Its scores are
 * authoritative; its verdict (accept / revise / reject) gates the pool.
 *
 * One call reviews the whole pool (cheap, calibrated across the set). Pure
 * string builders. No I/O.
 */

import type { CourtInput } from "./types"
import { SUCCESS_DIMENSION_LABELS_AR } from "./success-score"

const COURT_SUCCESS_FIELDS = `{
      "click_potential": 0-10, "retention_potential": 0-10, "discussion_potential": 0-10,
      "shareability": 0-10, "guest_potential": 0-10, "sponsor_appeal": 0-10,
      "timeless_value": 0-10, "regional_relevance": 0-10, "global_relevance": 0-10,
      "brand_alignment": 0-10, "originality": 0-10, "depth": 0-10,
      "risk_calibration": 0-10, "production_feasibility": 0-10
    }`

const VERDICT_SHAPE = `{
    "index": number (echo the candidate's index EXACTLY),
    "verdict": "accept" | "revise" | "reject",
    "success": ${COURT_SUCCESS_FIELDS},
    "why_succeed": string (Arabic — the single strongest reason it works),
    "why_fail": string (Arabic — the most likely reason it flops; never empty, always find one),
    "is_overdone": boolean (true if this exact framing is tired / everywhere),
    "reference_potential": boolean (could it become THE episode people send to explain the topic),
    "clip_potential": boolean (does it contain a stand-alone shareable moment),
    "recommended_title": string (the strongest title — keep the generator's or replace it),
    "recommended_reason": string (Arabic — one line why)
  }`

export function buildCourtSystemPrompt(threshold: number): string {
  const successMenu = Object.entries(SUCCESS_DIMENSION_LABELS_AR)
    .map(([k, ar]) => `  · ${k} (${ar})`)
    .join("\n")

  return [
    "# Khat Editorial Court — skeptical executive producer (authoritative)",
    "",
    "You are the toughest person in the room. A pool of episode ideas has been generated.",
    "Your job is NOT to be nice — it is to protect Khat's bar and the audience's time. For",
    "each idea, interrogate it hard, then re-score it honestly. Generators inflate their own",
    "ideas; you correct that.",
    "",
    "## Interrogate every idea (answer these in your head)",
    "- Why this topic? Why this title? Why now? Why would people click? Why would they STAY?",
    "- Why would they share it? What is the real tension / debate / emotional hook?",
    "- What is the intellectual value? The global appeal? The GCC / Kuwait relevance?",
    "- What could make this episode FAIL? Is it already overdone? Could a strong guest carry it?",
    "- Can it become a reference episode? Can it create clips? Can it attract sponsors WITHOUT",
    "  cheapening the brand?",
    "",
    "## Re-score the 14 success dimensions (0-10, honestly, full range)",
    successMenu,
    "Be harsher than the generator. A merely-fine idea should land in the 4-6 range. Reserve",
    "8-10 for genuinely exceptional. brand_alignment is the gate — an off-brand idea scores low",
    "there no matter how clickable.",
    "",
    `## Verdict (the bar is a success score of ${threshold}/100)`,
    "- accept   — strong; clears the bar comfortably.",
    "- revise   — a real idea with a fixable weakness (weak title, wrong angle, thin debate).",
    "- reject   — overdone, off-brand, shallow, or simply not strong enough.",
    "Always fill why_fail — even an accept has a risk worth naming.",
    "",
    "## Output",
    "JSON only — a top-level array with ONE verdict per candidate, echoing each `index`.",
    `Array<${VERDICT_SHAPE}>`,
  ].join("\n")
}

export function buildCourtUserPrompt(input: CourtInput): string {
  const cards = input.candidates
    .map((c) => {
      const lenses = c.lenses.length ? c.lenses.join(", ") : "—"
      return [
        `# index ${c.index}`,
        `working_title: ${c.working_title}`,
        `recommended_title: ${c.recommended_title ?? "—"}`,
        `category/subcategory: ${c.category ?? "—"} / ${c.subcategory ?? "—"}`,
        `lenses: ${lenses}`,
        `hook: ${c.hook || "—"}`,
        `debate_axis: ${c.debate_axis ?? "—"}`,
        `description: ${c.description || "—"}`,
      ].join("\n")
    })
    .join("\n\n")

  return [
    "Review this pool. Interrogate and re-score each idea, then return one verdict per",
    "candidate (echo the index). Be the skeptic. JSON array only.",
    "",
    cards,
  ].join("\n")
}
