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

/** Default Gemini model for grounded web retrieval (Google Search tool). */
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
