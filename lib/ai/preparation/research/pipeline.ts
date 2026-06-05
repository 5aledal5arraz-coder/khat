/**
 * Research pipeline orchestrator.
 *
 * Wires every step together:
 *
 *   1) buildResearchQueries   — queries.ts
 *   2) parallel retrieval     — gemini.ts + youtube.ts + x.ts
 *   3) normalize + dedupe     — normalize.ts
 *   4) synthesize with cites  — synthesize.ts
 *   5) verifier pass          — verify.ts
 *   6) final PipelineResult
 *
 * This module is the only thing `research.ts` (public entry) depends on,
 * so we can swap internals without touching the API surface.
 */

import type {
  PreparationInputs,
  PreparationResearchSource,
  PreparationRetrievalDiagnostic,
  PreparationClaim,
  PreparationSourceProvider,
} from "@/types/preparation"
import { buildResearchQueries } from "./queries"
import { geminiSearchWeb, isGeminiConfigured } from "./gemini"
import { youtubeSearch } from "./youtube"
import { xSearch } from "./x"
import { normalizeSources } from "./normalize"
import { synthesizeResearch } from "./synthesize"
import { verifyClaims } from "./verify"
import type {
  PipelineResult,
  RawRetrievedSource,
  ProviderResult,
} from "./types"

// ─── Retrieval orchestration ─────────────────────────────────────────────────

async function runGeminiRetrieval(queries: string[]): Promise<ProviderResult> {
  if (!isGeminiConfigured()) {
    return {
      sources: [],
      diagnostic: {
        provider: "gemini_web",
        status: "unavailable",
        message: "GEMINI_API_KEY is not configured.",
        count: 0,
      },
    }
  }
  try {
    // Run queries sequentially so we don't trip Gemini concurrency limits
    // and so a later query can bail out early if the earlier ones failed.
    const all: RawRetrievedSource[] = []
    for (const q of queries.slice(0, 4)) {
      const batch = await geminiSearchWeb(q, 6)
      all.push(...batch)
    }
    return {
      sources: all,
      diagnostic: {
        provider: "gemini_web",
        status: "ok",
        count: all.length,
      },
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      sources: [],
      diagnostic: {
        provider: "gemini_web",
        status: "failed",
        message,
        count: 0,
      },
    }
  }
}

async function runYouTubeRetrieval(queries: string[]): Promise<ProviderResult> {
  const key = process.env.YOUTUBE_API_KEY2 || process.env.YOUTUBE_API_KEY
  if (!key) {
    return {
      sources: [],
      diagnostic: {
        provider: "youtube",
        status: "unavailable",
        message: "YOUTUBE_API_KEY is not configured.",
        count: 0,
      },
    }
  }

  // Run queries individually — one query failing (e.g. empty results) must
  // not discard the others. Collect errors and report them only if every
  // query failed.
  const picked = queries.slice(0, 3)
  const settled = await Promise.allSettled(picked.map((q) => youtubeSearch(q, 5)))
  const sources: RawRetrievedSource[] = []
  const errors: string[] = []
  for (const s of settled) {
    if (s.status === "fulfilled") sources.push(...s.value)
    else errors.push(s.reason instanceof Error ? s.reason.message : String(s.reason))
  }

  if (sources.length === 0 && errors.length === picked.length) {
    return {
      sources: [],
      diagnostic: {
        provider: "youtube",
        status: "failed",
        message: errors[0], // all queries hit the same root cause
        count: 0,
      },
    }
  }

  return {
    sources,
    diagnostic: {
      provider: "youtube",
      status: "ok",
      count: sources.length,
      message: errors.length > 0 ? `${errors.length}/${picked.length} queries failed` : undefined,
    },
  }
}

async function runXRetrieval(queries: string[]): Promise<ProviderResult> {
  const q = queries[0] || ""
  const { sources, diagnostic } = await xSearch(q)
  return { sources, diagnostic }
}

// ─── Main entry ──────────────────────────────────────────────────────────────

export async function runResearchPipeline(
  inputs: PreparationInputs,
): Promise<PipelineResult> {
  // Step 1 — query generation
  const queries = buildResearchQueries(inputs)
  const qStrings = queries.map((q) => q.ar)

  // Step 2 — multi-source retrieval (parallel across providers)
  const [gemini, youtube, x] = await Promise.all([
    runGeminiRetrieval(qStrings),
    runYouTubeRetrieval(qStrings),
    runXRetrieval(qStrings),
  ])

  const retrieval: PreparationRetrievalDiagnostic[] = [
    gemini.diagnostic,
    youtube.diagnostic,
    x.diagnostic,
  ]

  // Step 3–4 — normalize + dedupe (Gemini web first so it wins URL ties)
  const merged: RawRetrievedSource[] = [
    ...gemini.sources,
    ...youtube.sources,
    ...x.sources,
  ]
  const sources: PreparationResearchSource[] = normalizeSources(merged)

  // If we have zero sources, short-circuit with an empty result + note.
  if (sources.length === 0) {
    return {
      sources: [],
      retrieval,
      claims: [],
      quotes: [],
      past_interviews: [],
      verified_count: 0,
      weak_count: 0,
      unverified_count: 0,
      queries_used: qStrings,
    }
  }

  // Step 5 — synthesize structured claims with source_ids
  const proposed = await synthesizeResearch(inputs, sources)

  // Step 6 — verifier pass
  const decisions = await verifyClaims(proposed.claims, sources)
  const decisionById = new Map(decisions.map((d) => [d.claim_id, d]))

  // Provider lookup for cross-source enrichment.
  const providerById = new Map<number, PreparationSourceProvider>(
    sources.map((s) => [s.id, s.provider]),
  )

  // Attach verifier status + derived cross-source metadata to each claim,
  // dropping 'unverified'. provider_types and cross_source_verified are
  // computed deterministically from the cited source_ids — not asked of
  // the model — so they cannot hallucinate.
  const enrichedClaims: PreparationClaim[] = proposed.claims
    .map((c, i) => {
      const id = `c${i + 1}`
      const dec = decisionById.get(id)
      const providers = new Set<PreparationSourceProvider>()
      for (const sid of c.source_ids) {
        const p = providerById.get(sid)
        if (p) providers.add(p)
      }
      const provider_types = [...providers]
      const status = dec?.status ?? "unverified"
      return {
        id,
        claim: c.claim,
        category: c.category,
        source_ids: c.source_ids,
        status,
        verifier_note: dec?.note,
        provider_types,
        // Cross-source verification: claim survived the verifier AND is
        // backed by at least two different provider types.
        cross_source_verified: status === "verified" && provider_types.length >= 2,
      }
    })
    // Drop unverified entirely — weak stays but is marked.
    .filter((c) => c.status !== "unverified")

  // Ranking: cross-source verified first, then by provider-type count,
  // then by raw source count, then by verified-over-weak. This does NOT
  // drop any claims — recall is preserved, only ordering changes.
  const finalClaims: PreparationClaim[] = [...enrichedClaims].sort((a, b) => {
    if (a.cross_source_verified !== b.cross_source_verified) {
      return a.cross_source_verified ? -1 : 1
    }
    if (a.provider_types.length !== b.provider_types.length) {
      return b.provider_types.length - a.provider_types.length
    }
    if (a.source_ids.length !== b.source_ids.length) {
      return b.source_ids.length - a.source_ids.length
    }
    if (a.status !== b.status) return a.status === "verified" ? -1 : 1
    return 0
  })

  const verified_count = finalClaims.filter((c) => c.status === "verified").length
  const weak_count = finalClaims.filter((c) => c.status === "weak").length
  const unverified_count = decisions.filter((d) => d.status === "unverified").length

  return {
    sources,
    retrieval,
    claims: finalClaims,
    quotes: proposed.quotes,
    past_interviews: proposed.past_interviews,
    verified_count,
    weak_count,
    unverified_count,
    queries_used: qStrings,
  }
}
