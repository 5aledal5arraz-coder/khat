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

    const { temperature, maxOutputTokens, topP, ...rest } =
      req.providerOptions as {
        temperature?: number
        maxOutputTokens?: number
        topP?: number
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
          ...(temperature !== undefined ? { temperature } : {}),
          ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
          ...(topP !== undefined ? { topP } : {}),
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
