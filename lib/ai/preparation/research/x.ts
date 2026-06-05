/**
 * X / Twitter retriever — placeholder.
 *
 * Not currently implemented. When `X_BEARER_TOKEN` is provided, we will
 * switch to the X API v2 `/2/tweets/search/recent` endpoint and return
 * tweets as normalized sources.
 *
 * The retrieve() signature here matches the other providers so plugging X
 * in later requires NO changes to the pipeline orchestrator.
 */

import type { RawRetrievedSource } from "./types"
import type { PreparationRetrievalDiagnostic } from "@/types/preparation"

export interface XRetrievalResult {
  sources: RawRetrievedSource[]
  diagnostic: PreparationRetrievalDiagnostic
}

export async function xSearch(_query: string): Promise<XRetrievalResult> {
  const token = process.env.X_BEARER_TOKEN
  if (!token) {
    return {
      sources: [],
      diagnostic: {
        provider: "x",
        status: "unavailable",
        message:
          "مصادر X/تويتر غير متوفرة — لم يتم ضبط X_BEARER_TOKEN. البحث أدناه لا يتضمن آراء أو نقاشات أو مواضيع رائجة من X.",
        count: 0,
      },
    }
  }
  // Future: call `https://api.twitter.com/2/tweets/search/recent?query=...`
  // and map results into RawRetrievedSource. Left as a TODO so we do not
  // ship a half-working provider.
  return {
    sources: [],
    diagnostic: {
      provider: "x",
      status: "skipped",
      message: "مزوّد X مُعدّ ولكن لم يتم تفعيله بعد.",
      count: 0,
    },
  }
}
