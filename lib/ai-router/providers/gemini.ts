/**
 * Khat Brain — Gemini provider adapter.
 *
 * Executes router requests against the shared Gemini SDK instance
 * (lib/ai/gemini.ts, `@google/genai`). PromptMessage[] is reshaped to
 * Gemini's systemInstruction + user content; `expectJson` maps to
 * `responseMimeType: application/json`. Token usage comes from
 * usageMetadata (via the shared `deriveGeminiTelemetry`); cost from the
 * registry pricing table.
 *
 * Grounded web retrieval (Google Search tool) stays in the preparation
 * research module — it returns grounding metadata, not text, so it
 * doesn't fit the router's text/JSON contract.
 */

import { getGeminiClient, isGeminiConfigured } from "@/lib/ai/gemini"
import type { GenerateContentResponse } from "@google/genai"
import type {
  ProviderAdapter,
  ResolvedRequest,
  AdapterResult,
} from "../types"
import { deriveGeminiTelemetry } from "../gemini-usage"

export const geminiAdapter: ProviderAdapter = {
  provider: "gemini",

  isAvailable() {
    return isGeminiConfigured()
  },

  async execute(req: ResolvedRequest): Promise<AdapterResult> {
    const ai = getGeminiClient()

    const systemParts = req.prompt
      .filter((m) => m.role === "system")
      .map((m) => m.content)
    const conversation = req.prompt
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      }))
    // Gemini requires at least one user turn.
    if (conversation.length === 0) {
      conversation.push({ role: "user", parts: [{ text: "" }] })
    }

    // `temperature` and `topP` are deliberately NOT pulled out here: Google
    // deprecated and now ignores them (see the config block below), so they
    // fall into `rest` with every other option we do not forward. Naming them
    // only to discard them would leave two unused bindings claiming to matter.
    const { maxOutputTokens, ...rest } = req.providerOptions as {
      maxOutputTokens?: number
    }
    void rest

    // Abort (not just race) on deadline so the request is actually
    // cancelled client-side. The thrown message must contain "timeout" —
    // the router's classifyError maps it to the retryable "timeout" class.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), req.timeoutMs)
    let response: GenerateContentResponse
    try {
      response = await ai.models.generateContent({
        model: req.modelName,
        contents: conversation,
        config: {
          abortSignal: controller.signal,
          ...(systemParts.length
            ? { systemInstruction: systemParts.join("\n\n") }
            : {}),
          ...(req.expectJson ? { responseMimeType: "application/json" } : {}),
          /**
           * ── `temperature` AND `topP` ARE DELIBERATELY NOT SENT ──────────
           * Google, on https://ai.google.dev/gemini-api/docs/latest-model
           * (read 2026-08-07): "temperature, top_p, and top_k are deprecated
           * and ignored. In future model generations, supplying these
           * parameters returns an HTTP 400 error."
           *
           * It applies to `gemini-3.6-flash` — which is what we run — and to
           * every later generation. So since 2026-07-21 these have been
           * accepted and thrown away, and one call site had a comment
           * promising determinism it was no longer getting. Sending them now
           * buys nothing and guarantees a 400 on the next model family.
           *
           * They are still DESTRUCTURED above so a caller passing them is
           * inert rather than leaking into `rest`. Where output needs to be
           * constrained, say so in the system instruction — Google's own
           * replacement advice, and the only thing the model still reads.
           */
          ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
        },
      })
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Provider timeout after ${req.timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }

    const rawText = response.text ?? ""
    const { tokensIn, tokensOut, costUsd } = deriveGeminiTelemetry(
      response.usageMetadata,
      req.modelName,
    )

    return { rawText, tokensIn, tokensOut, costUsd }
  },
}
