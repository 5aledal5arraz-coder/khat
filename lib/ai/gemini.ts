/**
 * Shared Gemini SDK instance + model defaults.
 *
 * Single owner of the `@google/generative-ai` client so every Gemini
 * caller (AI Router adapter, preparation research, channel analysis)
 * shares one instance and one set of model defaults. Keys: GEMINI_API_KEY
 * (primary) or GOOGLE_API_KEY (fallback).
 */

import { GoogleGenerativeAI } from "@google/generative-ai"

/** Default Gemini model for structured JSON reasoning. */
export const GEMINI_REASONING_MODEL =
  process.env.GEMINI_REASONING_MODEL || "gemini-2.5-flash"

/** Default Gemini model for grounded web retrieval (Google Search tool). */
export const GEMINI_RETRIEVAL_MODEL =
  process.env.GEMINI_RETRIEVAL_MODEL || "gemini-2.5-flash"

let cached: GoogleGenerativeAI | null = null

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
}

/**
 * Returns the cached Gemini client. Throws a blocking error if no key is
 * configured — callers must not fall back silently.
 */
export function getGeminiClient(): GoogleGenerativeAI {
  if (cached) return cached
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not configured. Gemini-backed features (research retrieval, channel analysis) require it.",
    )
  }
  cached = new GoogleGenerativeAI(key)
  return cached
}
