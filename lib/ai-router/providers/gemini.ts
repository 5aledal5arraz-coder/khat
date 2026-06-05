/**
 * Khat Brain — Gemini provider adapter (placeholder).
 *
 * The project already has @google/generative-ai installed and Gemini is
 * used for channel analysis. For Phase 1 we keep this adapter as a
 * structured stub: it advertises availability when GEMINI_API_KEY is
 * set, and throws a clear error if anyone routes to it. Wiring it for
 * real is Phase 2 work — the existing channel-analysis Gemini code
 * will move under this adapter.
 */

import type {
  ProviderAdapter,
  ResolvedRequest,
  AdapterResult,
} from "../types"

export const geminiAdapter: ProviderAdapter = {
  provider: "gemini",

  isAvailable() {
    return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)
  },

  async execute(_req: ResolvedRequest): Promise<AdapterResult> {
    throw new Error(
      "Gemini adapter is not yet wired through the AI Router. " +
        "Phase 1 routes everything through OpenAI. " +
        "Lift the existing channel-analysis Gemini calls under this adapter in Phase 2.",
    )
  },
}
