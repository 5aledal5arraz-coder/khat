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
 * ⚠️ THIS CONSTANT IS NOT ONLY A "RETRIEVAL MODEL" KNOB. Three call sites
 * read it, and one of them depends on the model's PROSE SHAPE, not just on
 * the grounding metadata:
 *   • lib/ai/grounded-evidence.ts        — metadata only (prose discarded) ✔
 *   • lib/ai/preparation/research/gemini.ts — metadata only ✔
 *   • lib/ai/preparation/identify.ts:43  — pairs paragraph `i` with grounded
 *     source `i` by REGEX over the free text to extract candidate NAMES.
 *
 * So changing `GEMINI_RETRIEVAL_MODEL` via env silently changes guest-name
 * EXTRACTION too: a model that formats its answer differently breaks the
 * pairing with no error. Isolating identify.ts onto its own constant is ~5–8
 * lines across 3 files and is NOT done here (out of scope, 2026-07-26) —
 * this note exists so the next person doesn't discover it in production.
 */
export const GEMINI_RETRIEVAL_MODEL =
  env.GEMINI_RETRIEVAL_MODEL || "gemini-3.6-flash"

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
