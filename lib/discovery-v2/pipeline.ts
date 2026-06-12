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
import { loadDiscoveryMemory } from "./memory"
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

  // Cross-run memory: exclude existing guests, promoted candidates, and
  // operator rejections inside the prompt; resolved QIDs are re-checked
  // below as a hard filter (the LLM can respell a name, the QID can't).
  const memory = await loadDiscoveryMemory({ seasonId: input.seasonId })

  const proposal = await proposeNames(input, want, memory)
  if (proposal.error || proposal.names.length === 0) {
    return {
      candidates: [],
      proposeRunId: proposal.runId ?? null,
      stats: { proposed: 0, resolved: 0, accepted: 0, shortlist: 0, rejected: 0 },
      error: proposal.error ?? "no names proposed",
    }
  }

  // Resolve + enrich + score, 6 at a time. Each candidate now makes a
  // small, mostly-batched set of HTTP calls (see wikidata.resolvePerson),
  // so a slightly higher concurrency cuts wall-clock without hammering the
  // free public APIs.
  const scored = await pmap(proposal.names, 6, async (p) => {
    // The proposal's own role/country/name_en is the disambiguation hint —
    // it scores homonym QIDs against what the LLM actually meant.
    const wiki = await resolvePerson(p.name, {
      role: p.role,
      country: p.country,
      name_en: p.name_en,
    })
    if (!wiki.resolved) {
      return scoreCandidate(p, wiki, {}, input) // → rejected (unverifiable)
    }
    if (wiki.qid && memory.excludeQids.has(wiki.qid)) {
      return null // already a guest / promoted / operator-rejected
    }
    const signals = await enrich(p.name, wiki)
    return scoreCandidate(p, wiki, signals, input)
  })

  const kept = scored.filter((c): c is V2Candidate => c !== null)

  // De-dupe by resolved QID (LLM sometimes proposes the same person twice).
  const seen = new Set<string>()
  const deduped: V2Candidate[] = []
  for (const c of kept) {
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
