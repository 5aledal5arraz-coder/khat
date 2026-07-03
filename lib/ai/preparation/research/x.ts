/**
 * X / Twitter retriever — real implementation over lib/x/client.ts.
 *
 * Searches recent public posts (last ~7 days) for the preparation query and
 * returns them as normalized sources, so prep research includes live opinions
 * and discussions from X. Key-gated on X_BEARER_TOKEN: without it the provider
 * reports "unavailable" exactly as before; API failures report "failed" and
 * never break the pipeline.
 */

import { env } from "@/lib/env"
import { searchRecentPosts } from "@/lib/x/client"
import type { RawRetrievedSource } from "./types"
import type { PreparationRetrievalDiagnostic } from "@/types/preparation"

export interface XRetrievalResult {
  sources: RawRetrievedSource[]
  diagnostic: PreparationRetrievalDiagnostic
}

export async function xSearch(query: string): Promise<XRetrievalResult> {
  const token = env.X_BEARER_TOKEN
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

  const posts = await searchRecentPosts(query, 10)
  if (posts.length === 0) {
    return {
      sources: [],
      diagnostic: {
        provider: "x",
        status: "failed",
        message: "لم يُعثر على منشورات حديثة على X لهذا الاستعلام (أو تعذّر الوصول إلى الواجهة).",
        count: 0,
      },
    }
  }

  const sources: RawRetrievedSource[] = posts.map((p) => ({
    provider: "x",
    title: p.text.replace(/\s+/g, " ").slice(0, 90) || "منشور على X",
    url: `https://x.com/i/web/status/${p.id}`,
    snippet: p.text.replace(/\s+/g, " ").slice(0, 280),
    publisher: "X",
    published_at: p.created_at ?? undefined,
    metrics: { like_count: p.likes },
  }))

  return {
    sources,
    diagnostic: {
      provider: "x",
      status: "ok",
      message: `عُثر على ${sources.length} منشوراً حديثاً على X.`,
      count: sources.length,
    },
  }
}
