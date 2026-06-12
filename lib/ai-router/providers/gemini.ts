/**
 * Khat Brain — Gemini provider adapter.
 *
 * Executes router requests against the shared Gemini SDK instance
 * (lib/ai/gemini.ts). PromptMessage[] is reshaped to Gemini's
 * systemInstruction + user content; `expectJson` maps to
 * `responseMimeType: application/json`. Token usage comes from
 * usageMetadata; cost from the registry pricing table.
 *
 * Grounded web retrieval (Google Search tool) stays in the preparation
 * research module — it returns grounding metadata, not text, so it
 * doesn't fit the router's text/JSON contract.
 */

import { getGeminiClient, isGeminiConfigured } from "@/lib/ai/gemini"
import type {
  ProviderAdapter,
  ResolvedRequest,
  AdapterResult,
} from "../types"
import { lookupPricing } from "../registry"

export const geminiAdapter: ProviderAdapter = {
  provider: "gemini",

  isAvailable() {
    return isGeminiConfigured()
  },

  async execute(req: ResolvedRequest): Promise<AdapterResult> {
    const client = getGeminiClient()

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

    const model = client.getGenerativeModel({
      model: req.modelName,
      ...(systemParts.length
        ? { systemInstruction: systemParts.join("\n\n") }
        : {}),
      generationConfig: {
        ...(req.expectJson ? { responseMimeType: "application/json" } : {}),
        ...(temperature !== undefined ? { temperature } : {}),
        ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
        ...(topP !== undefined ? { topP } : {}),
      },
    })

    const result = await Promise.race([
      model.generateContent({ contents: conversation }),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Provider timeout after ${req.timeoutMs}ms`)),
          req.timeoutMs,
        ),
      ),
    ])

    const rawText = result.response.text() ?? ""
    const usage = result.response.usageMetadata
    const tokensIn = usage?.promptTokenCount ?? null
    const tokensOut = usage?.candidatesTokenCount ?? null

    const pricing = lookupPricing("gemini", req.modelName)
    const costUsd =
      pricing && tokensIn !== null && tokensOut !== null
        ? (tokensIn / 1_000_000) * pricing.inputCostPer1M +
          (tokensOut / 1_000_000) * pricing.outputCostPer1M
        : null

    return { rawText, tokensIn, tokensOut, costUsd }
  },
}
