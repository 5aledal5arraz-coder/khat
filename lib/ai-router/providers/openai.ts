/**
 * Khat Brain — OpenAI provider adapter.
 *
 * Speaks the Responses API — OpenAI's recommended primitive (Chat
 * Completions remains supported but is legacy for new work, and
 * GPT-5.4+ reasoning features are Responses-first). Wraps the client
 * from lib/ai/client.ts.
 *
 * The adapter owns parameter translation so the ~40 generator call
 * sites keep passing the familiar `providerOptions` unchanged:
 *
 *   temperature / top_p → passed through ONLY when the model samples
 *                          (legacy gpt-4o/4.1 families, or a GPT-5.x
 *                          call with reasoning explicitly "none").
 *                          Reasoning models reject samplers — dropping
 *                          them beats a 400 on every legacy call site.
 *   max_tokens          → max_output_tokens
 *   reasoningEffort     → reasoning.effort (falls back to the router's
 *                          task-kind default from the registry)
 *   verbosity           → text.verbosity
 *
 * Anything else in providerOptions is spread into the request verbatim
 * (provider-specific escape hatch — an invalid key is a caller bug and
 * fails loudly, same contract as before).
 */

import { env } from "@/lib/env"
import type { Response as OpenAIResponse } from "openai/resources/responses/responses"
import { getClient } from "@/lib/ai/client"
import type {
  ProviderAdapter,
  ResolvedRequest,
  AdapterResult,
  ReasoningEffort,
} from "../types"
import { lookupPricing } from "../registry"

/**
 * Models with a reasoning dial: gpt-5, gpt-5.x, o3, o4-mini… The
 * `-chat-` snapshots (e.g. gpt-5-chat-latest) are plain samplers and
 * reject the `reasoning` param, so they're excluded.
 */
function isReasoningModel(modelName: string): boolean {
  return /^(gpt-5|o\d)/.test(modelName) && !modelName.includes("-chat-")
}

const EFFORT_VALUES: ReadonlySet<string> = new Set([
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
])

export const openaiAdapter: ProviderAdapter = {
  provider: "openai",

  isAvailable() {
    return Boolean(env.OPENAI_API_KEY)
  },

  async execute(req: ResolvedRequest): Promise<AdapterResult> {
    const client = getClient()

    const {
      temperature,
      top_p: topP,
      max_tokens: maxTokens,
      max_output_tokens: maxOutputTokens,
      reasoningEffort: effortOverride,
      verbosity,
      ...passthrough
    } = req.providerOptions as {
      temperature?: number
      top_p?: number
      max_tokens?: number
      max_output_tokens?: number
      reasoningEffort?: string
      verbosity?: "low" | "medium" | "high"
      [key: string]: unknown
    }

    const reasoning = isReasoningModel(req.modelName)
    const effort: ReasoningEffort | undefined =
      typeof effortOverride === "string" && EFFORT_VALUES.has(effortOverride)
        ? (effortOverride as ReasoningEffort)
        : req.reasoningEffort
    // Samplers are only valid when the model actually samples freely.
    const samplersAllowed = !reasoning || effort === "none"

    const params: Parameters<typeof client.responses.create>[0] = {
      model: req.modelName,
      input: req.prompt,
      // Keep provider-side retention off — prompts carry full episode
      // transcripts; ai_runs is our system of record, not OpenAI's.
      store: false,
      ...(reasoning && effort ? { reasoning: { effort } } : {}),
      ...(req.expectJson || verbosity
        ? {
            text: {
              ...(req.expectJson ? { format: { type: "json_object" as const } } : {}),
              ...(verbosity ? { verbosity } : {}),
            },
          }
        : {}),
      ...(samplersAllowed && temperature !== undefined ? { temperature } : {}),
      ...(samplersAllowed && topP !== undefined ? { top_p: topP } : {}),
      ...(maxOutputTokens ?? maxTokens
        ? { max_output_tokens: maxOutputTokens ?? maxTokens }
        : {}),
      ...passthrough,
    }

    // Abort (not just race) on deadline so the HTTP request is actually
    // cancelled. The thrown message must contain "timeout" — the
    // router's classifyError maps it to the retryable "timeout" class.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), req.timeoutMs)
    let response: OpenAIResponse
    try {
      response = (await client.responses.create(params, {
        signal: controller.signal,
      })) as unknown as OpenAIResponse
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`Provider timeout after ${req.timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }

    const rawText = response.output_text ?? ""
    const tokensIn = response.usage?.input_tokens ?? null
    // Includes reasoning tokens — they bill as output, so cost stays honest.
    const tokensOut = response.usage?.output_tokens ?? null

    const pricing = lookupPricing("openai", req.modelName)
    const costUsd =
      pricing && tokensIn !== null && tokensOut !== null
        ? (tokensIn / 1_000_000) * pricing.inputCostPer1M +
          (tokensOut / 1_000_000) * pricing.outputCostPer1M
        : null

    return { rawText, tokensIn, tokensOut, costUsd }
  },
}
