/**
 * v2 pipeline orchestrator.
 *
 *   propose names (LLM, over-generate)
 *     → resolve each against Wikidata (drop non-real / non-human)
 *     → enrich resolved people with independent signals
 *     → score + decide
 *     → rank
 *
 * Resolution + enrichment run in small concurrent batches so we stay
 * polite to the free public APIs. Pure function over the network — no DB
 * here (the job handler persists the result).
 */

import type { V2Candidate, V2RunInput } from "./types"
import { proposeNames } from "./propose"
import { resolvePerson } from "./sources/wikidata"
import { enrich } from "./enrich"
import { scoreCandidate } from "./score"

const DECISION_RANK: Record<V2Candidate["decision"], number> = {
  accepted: 0,
  shortlist: 1,
  rejected: 2,
}

async function pmap<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker))
  return out
}

export interface V2RunResult {
  candidates: V2Candidate[]
  proposeRunId: string | null
  stats: { proposed: number; resolved: number; accepted: number; shortlist: number; rejected: number }
  error?: string
}

export async function runV2Discovery(input: V2RunInput): Promise<V2RunResult> {
  const limit = Math.max(3, Math.min(input.limit ?? 12, 24))
  const want = Math.min(limit * 2, 30)

  const proposal = await proposeNames(input, want)
  if (proposal.error || proposal.names.length === 0) {
    return {
      candidates: [],
      proposeRunId: proposal.runId ?? null,
      stats: { proposed: 0, resolved: 0, accepted: 0, shortlist: 0, rejected: 0 },
      error: proposal.error ?? "no names proposed",
    }
  }

  // Resolve + enrich + score, 4 at a time.
  const scored = await pmap(proposal.names, 4, async (p) => {
    const wiki = await resolvePerson(p.name, input.filters)
    if (!wiki.resolved) {
      return scoreCandidate(p, wiki, {}, input) // → rejected (unverifiable)
    }
    const signals = await enrich(p.name, wiki)
    return scoreCandidate(p, wiki, signals, input)
  })

  // De-dupe by resolved QID (LLM sometimes proposes the same person twice).
  const seen = new Set<string>()
  const deduped: V2Candidate[] = []
  for (const c of scored) {
    const key = c.wiki.qid ?? c.name
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(c)
  }

  deduped.sort(
    (a, b) =>
      DECISION_RANK[a.decision] - DECISION_RANK[b.decision] ||
      b.scores.overall - a.scores.overall,
  )

  const stats = {
    proposed: proposal.names.length,
    resolved: deduped.filter((c) => c.wiki.resolved).length,
    accepted: deduped.filter((c) => c.decision === "accepted").length,
    shortlist: deduped.filter((c) => c.decision === "shortlist").length,
    rejected: deduped.filter((c) => c.decision === "rejected").length,
  }

  return { candidates: deduped, proposeRunId: proposal.runId, stats }
}
