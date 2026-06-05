/**
 * Khat Brain — OpenAI provider adapter.
 *
 * Wraps lib/ai/client.ts. Doesn't replace the existing client — it
 * reuses it so generators that haven't migrated yet continue to work.
 */

import type { ChatCompletion } from "openai/resources/chat/completions"
import { getClient } from "@/lib/ai/client"
import type {
  ProviderAdapter,
  ResolvedRequest,
  AdapterResult,
} from "../types"
import { lookupPricing } from "../registry"

export const openaiAdapter: ProviderAdapter = {
  provider: "openai",

  isAvailable() {
    return Boolean(process.env.OPENAI_API_KEY)
  },

  async execute(req: ResolvedRequest): Promise<AdapterResult> {
    const client = getClient()

    const params: Parameters<typeof client.chat.completions.create>[0] = {
      model: req.modelName,
      messages: req.prompt as Parameters<
        typeof client.chat.completions.create
      >[0]["messages"],
      ...(req.expectJson ? { response_format: { type: "json_object" } } : {}),
      ...req.providerOptions,
    }

    // We never request streaming, so the create call returns a
    // ChatCompletion. Cast through unknown because the client's overload
    // union can't be narrowed without a `stream: false` literal.
    const completion = (await Promise.race([
      client.chat.completions.create(params),
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`Provider timeout after ${req.timeoutMs}ms`)),
          req.timeoutMs,
        ),
      ),
    ])) as unknown as ChatCompletion

    const rawText = completion.choices[0]?.message?.content ?? ""
    const tokensIn = completion.usage?.prompt_tokens ?? null
    const tokensOut = completion.usage?.completion_tokens ?? null

    const pricing = lookupPricing("openai", req.modelName)
    const costUsd =
      pricing && tokensIn !== null && tokensOut !== null
        ? (tokensIn / 1_000_000) * pricing.inputCostPer1M +
          (tokensOut / 1_000_000) * pricing.outputCostPer1M
        : null

    return { rawText, tokensIn, tokensOut, costUsd }
  },
}
