/**
 * Shared Gemini SDK instance + model defaults.
 *
 * Single owner of the `@google/genai` client so every Gemini caller (AI
 * Router adapter, preparation research, channel analysis) shares one
 * instance and one set of model defaults. Keys: GEMINI_API_KEY (primary)
 * or GOOGLE_API_KEY (fallback).
 */

import { env } from "@/lib/env"
import { GoogleGenAI } from "@google/genai"

/**
 * Default Gemini model for structured JSON reasoning (`research_reasoning`,
 * `guest_identify`).
 *
 * `gemini-2.5-flash` is on Google's shutdown calendar for 2026-10-16, and
 * these defaults are what runs wherever the env override is unset — so the
 * default itself has to be current, not just the deployed env. Also measured
 * to follow the "run 2-3 focused searches" instruction far better on our real
 * workload (2.57 queries/call vs 10.0 on 2.5-flash).
 */
export const GEMINI_REASONING_MODEL =
  env.GEMINI_REASONING_MODEL || "gemini-3.6-flash"

/**
 * Default Gemini model for grounded web retrieval (Google Search tool).
 *
 * Read ONLY by call sites that discard the model's prose and keep the
 * grounding metadata:
 *   • lib/ai/grounded-evidence.ts           — metadata only ✔
 *   • lib/ai/preparation/research/gemini.ts — metadata only ✔
 *
 * That invariant is what makes this knob safe to retune from env: swapping
 * the model changes which sources come back, never how a downstream parser
 * reads them. **Do not point a prose-parsing call site at this constant** —
 * add its own, as GEMINI_IDENTIFY_MODEL below does.
 */
export const GEMINI_RETRIEVAL_MODEL =
  env.GEMINI_RETRIEVAL_MODEL || "gemini-3.6-flash"

/**
 * Default Gemini model for guest-identity disambiguation
 * (lib/ai/preparation/identify.ts).
 *
 * Separate from GEMINI_RETRIEVAL_MODEL on purpose. identify.ts does not
 * consume grounding metadata alone: it splits the model's FREE TEXT into
 * paragraph blocks and pairs block `i` with grounded source `i`, then pulls
 * the candidate's NAME out of that block by regex. It therefore depends on
 * the model's prose SHAPE, not just on its search results — a model that
 * formats its answer differently (one block instead of three, a leading
 * preamble, numbered instead of bulleted) mis-pairs names to sources and
 * fails silently, with candidates that look plausible and cite the wrong
 * person.
 *
 * While the two shared one env var, tuning "the retrieval model" — a change
 * whose blast radius reads as "which websites we search" — silently retuned
 * guest-name extraction too. Splitting them makes each knob's blast radius
 * equal to its name. The default is pinned to the same literal both knobs
 * had, so only a box that had deliberately overridden retrieval sees any
 * change, and on that box the change IS the fix.
 */
export const GEMINI_IDENTIFY_MODEL =
  env.GEMINI_IDENTIFY_MODEL || "gemini-3.6-flash"

let cached: GoogleGenAI | null = null

export function isGeminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY)
}

/**
 * Returns the cached Gemini client. Throws a blocking error if no key is
 * configured — callers must not fall back silently.
 */
export function getGeminiClient(): GoogleGenAI {
  if (cached) return cached
  const key = env.GEMINI_API_KEY || env.GOOGLE_API_KEY
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Gemini-backed features (research retrieval, channel analysis) require it.",
    )
  }
  cached = new GoogleGenAI({ apiKey: key })
  return cached
}
