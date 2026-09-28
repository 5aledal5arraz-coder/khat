/**
 * v2 pipeline orchestrator — story-first.
 *
 *   propose names (LLM, over-generate; story_claim is a hypothesis only)
 *     → ONE top-up propose for the missing count when the reply is short
 *       and the job budget can spare it (proposeWithTopUp)
 *     → resolve each against Wikidata (identity confidence, NOT a gate)
 *     → memory hard filter: QID or folded name (drops known/rejected people)
 *     → enrich EVERY person with independent public signals
 *     → pre-score (everything except the story)
 *     → story check for K people ordered by story potential (not fame):
 *       live evidence + classifier + verbatim guard
 *     → final score + decide
 *     → rank
 *
 * The Wikidata gate used to sit at the top of this function: an unresolved
 * name skipped enrichment and scored with zero evidence, so every story
 * guest outside Wikidata (6 of 6 real ones checked) was rejected before any
 * signal was read. Pure function over the network — no DB here (the job
 * handler persists the result).
 */

import type { CandidateResearchSource } from "@/types/database"
import { DEFAULT_MODELS } from "@/lib/ai-router/registry"
import type { ProposedName, StoryCheck, V2Candidate, V2RunInput, WikiFacts } from "./types"
import { proposeNames } from "./propose"
import { discoveryNameKey, loadDiscoveryMemory, type DiscoveryMemory } from "./memory"
import { resolvePerson } from "./sources/wikidata"
import { enrich } from "./enrich"
import { scoreCandidate } from "./score"
import { attachGroundedVerification, deriveGroundedSignal } from "./grounded-verify"
import {
  freeStorySources,
  gatherStoryWebSources,
  isStoryGroundingEnabled,
  nameVariants,
  notCheckedStory,
  selectForStoryCheck,
  storyMaxCandidates,
} from "./story-evidence"
import { classifyStory } from "./story-classify"
import { proposeErrorKind, type V2RunErrorKind } from "./run-failure"

const DECISION_RANK: Record<V2Candidate["decision"], number> = {
  accepted: 0,
  needs_review: 0,
  shortlist: 2,
  rejected: 3,
}

/**
 * An unpublished first-hand story (S = 0) is reviewed by hand, ranked
 * below every verified story and above the shortlist. With no footprint
 * at all it may be an invented name (R5 is waived for it, not disproved),
 * so it drops below the shortlist — still above the rejected. The rest
 * keep the decision rank; a second-hand story is verified (S = 0.5) and
 * stays in the top tier by score. Any verified story (S > 0) that survived
 * the hard rejects is top tier by construction — pinned here too, so the
 * order never depends on how score.ts labelled it.
 */
function rankOf(c: V2Candidate): number {
  if (c.decision !== "rejected" && c.scores.story > 0) return 0
  if (c.decision === "needs_review" && c.flags?.includes("story_unpublished")) {
    return c.flags.includes("no_web_footprint") ? 2.5 : 1
  }
  return DECISION_RANK[c.decision]
}

// ── Propose top-up budget ────────────────────────────────────────────────
/**
 * discovery_v2.run's HANDLER_TIMEOUT_MS in lib/jobs/worker.ts (the map is not
 * exported; tests/ai-router/discovery-propose-budget.test.ts pins the two
 * together). 15 min, up from 10 (2026-09-28): the first propose call now
 * gets 300s + one timeout retry (registry `discovery`), so its worst case
 * (proposeWorstCaseMs ≈ 608s) plus POST_PROPOSE_RESERVE_MS must still fit.
 * A worker job — no nginx wall applies.
 */
export const DISCOVERY_JOB_BUDGET_MS = 15 * 60_000
/**
 * Everything after propose (resolve/enrich + story checks, cap 12 at
 * concurrency 2) took ~140–210s in the 2026-09-26 trials; + margin.
 */
export const POST_PROPOSE_RESERVE_MS = 240_000
/** Below this a medium-effort reply is unlikely to land — skip, don't burn the call. */
export const TOPUP_MIN_MS = 90_000
/** Top up when fewer than this share of `want` came back usable. */
export const TOPUP_THRESHOLD = 0.6

// ── Story-phase deadline ─────────────────────────────────────────────────
/**
 * Left free after the story phase: final scoring, the (opt-in) presence
 * stamp, and the handler persisting the candidates. The story phase ends at
 * startedAt + DISCOVERY_JOB_BUDGET_MS − this.
 */
export const POST_STORY_RESERVE_MS = 60_000
/** No check STARTS with less than this before the story deadline: a search plus a classification can't both land. */
export const STORY_CHECK_MIN_MS = 45_000
/** Held back from a check's search for the classification that follows it. */
export const STORY_CLASSIFY_RESERVE_MS = 30_000
/** Upper bound for one story search (the whole gather: attempts, retries, re-roll). */
export const STORY_SEARCH_TIMEOUT_MS = 90_000
/** The router's max backoff between retries (lib/ai-router/router.ts BACKOFF_CAP_MS). */
const ROUTER_BACKOFF_CAP_MS = 8_000

/**
 * Worst-case wall time of the FIRST propose call under the registry policy:
 * every attempt runs to its timeout, with the max backoff between them.
 * The top-up is excluded — it runs only on what the budget can spare, as a
 * single attempt.
 */
export function proposeWorstCaseMs(): number {
  const d = DEFAULT_MODELS.discovery
  const timeoutMs = d.defaultTimeoutMs ?? 120_000
  const retries = d.defaultMaxRetries ?? 0
  return timeoutMs * (1 + retries) + ROUTER_BACKOFF_CAP_MS * retries
}

/**
 * The classifier's per-attempt timeout + retries within `leftMs`: the
 * `verification` registry policy (120s × 3) when it fits, otherwise one
 * attempt cut to what is left — `(timeout + backoff) × (1 + retries)` never
 * exceeds `leftMs`.
 */
export function classifyBudget(leftMs: number): { timeoutMs: number; maxRetries: number } {
  const policy = DEFAULT_MODELS.verification
  const timeoutMs = Math.max(1, Math.min(policy.defaultTimeoutMs ?? 120_000, leftMs))
  const fits = Math.floor(leftMs / (timeoutMs + ROUTER_BACKOFF_CAP_MS)) - 1
  return { timeoutMs, maxRetries: Math.max(0, Math.min(policy.defaultMaxRetries ?? 2, fits)) }
}

/** Usable proposals: not self-contradicting the gender filter, not in memory, deduped. */
function usableNames(
  names: ProposedName[],
  memory: DiscoveryMemory,
  wantGender: string | null,
): ProposedName[] {
  const seen = new Set<string>()
  return names.filter((p) => {
    if (wantGender && p.gender && p.gender !== wantGender) return false
    const key = discoveryNameKey(p.name)
    if (!key || seen.has(key) || memory.excludeNameKeys.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Propose, and when the reply is short (< TOPUP_THRESHOLD of `want`
 * usable — the v2-propose-5 trial returned 7 for 24) make exactly ONE
 * follow-up call for the missing count, excluding every name already
 * proposed. Skipped when the job budget (DISCOVERY_JOB_BUDGET_MS) cannot spare the call
 * plus the rest of the run; a failed top-up keeps the first list.
 */
async function proposeWithTopUp(
  input: V2RunInput,
  want: number,
  memory: DiscoveryMemory,
  startedAt: number,
): Promise<{ names: ProposedName[]; runId: string; error?: string; errorStatus?: string; toppedUp: number }> {
  const first = await proposeNames(input, want, memory)
  if (first.error) return { ...first, toppedUp: 0 }

  const wantGender = input.filters?.gender ?? null
  const usable = usableNames(first.names, memory, wantGender)
  if (usable.length >= Math.ceil(want * TOPUP_THRESHOLD)) return { ...first, toppedUp: 0 }

  const spare = DISCOVERY_JOB_BUDGET_MS - (Date.now() - startedAt) - POST_PROPOSE_RESERVE_MS
  const timeoutMs = Math.min(DEFAULT_MODELS.discovery.defaultTimeoutMs ?? 300_000, spare)
  if (timeoutMs < TOPUP_MIN_MS) {
    console.warn(
      `[discovery-v2/propose] top-up skipped: ${usable.length}/${want} usable, only ${Math.round(spare / 1000)}s of job budget to spare`,
    )
    return { ...first, toppedUp: 0 }
  }

  // One attempt: the registry's timeout retry would double the call past
  // what `spare` was computed for.
  const more = await proposeNames(input, want - usable.length, memory, {
    alreadyProposed: first.names.map((p) => p.name),
    timeoutMs,
    maxRetries: 0,
  })
  if (more.error) {
    console.warn("[discovery-v2/propose] top-up failed, keeping the first list:", more.error)
    return { ...first, toppedUp: 0 }
  }
  const have = new Set(first.names.map((p) => discoveryNameKey(p.name)))
  const added = more.names.filter((p) => {
    const key = discoveryNameKey(p.name)
    if (!key || have.has(key)) return false // the model respelled a name it already gave
    have.add(key)
    return true
  })
  return { names: [...first.names, ...added], runId: first.runId, toppedUp: added.length }
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
  stats: {
    proposed: number
    resolved: number
    accepted: number
    needs_review: number
    shortlist: number
    rejected: number
    story_checked: number
    story_verified: number
    /** names the one top-up propose call added (0 = not needed / skipped / failed) */
    proposed_top_up: number
  }
  error?: string
  /** Set with `error`: why the run produced nothing (drives the run page copy). */
  errorKind?: V2RunErrorKind
}

const NO_ATTRS: StoryCheck["attrs"] = {
  deceased: false,
  not_individual: false,
  same_person: true,
  gender: null,
  nationality: null,
}

export async function runV2Discovery(input: V2RunInput): Promise<V2RunResult> {
  const startedAt = Date.now()
  const limit = Math.max(3, Math.min(input.limit ?? 12, 24))
  const want = Math.min(limit * 2, 30)

  // Cross-run memory: exclude existing guests, promoted candidates, and
  // operator rejections inside the prompt; QIDs AND folded names are
  // re-checked below as a hard filter (the LLM can respell a name).
  const memory = await loadDiscoveryMemory({ seasonId: input.seasonId })

  const proposal = await proposeWithTopUp(input, want, memory, startedAt)
  if (proposal.error || proposal.names.length === 0) {
    return {
      candidates: [],
      proposeRunId: proposal.runId ?? null,
      stats: {
        proposed: 0,
        resolved: 0,
        accepted: 0,
        needs_review: 0,
        shortlist: 0,
        rejected: 0,
        story_checked: 0,
        story_verified: 0,
        proposed_top_up: proposal.toppedUp,
      },
      error: proposal.error ?? "no names proposed",
      errorKind: proposal.error ? proposeErrorKind(proposal.errorStatus, proposal.error) : "no_names",
    }
  }

  // A proposal whose OWN stated gender contradicts a strict gender filter
  // is the model breaking the rule it was given — drop it before any paid
  // step. Not evidence the other way: an unstated or matching self-report
  // is still verified from Wikidata / the sources in score.ts.
  const wantGender = input.filters?.gender ?? null
  const proposed = wantGender
    ? proposal.names.filter((p) => !p.gender || p.gender === wantGender)
    : proposal.names

  // 1. Resolve + memory filter + enrich, 6 at a time. Enrichment runs for
  //    EVERY person — an unresolved name is searched by the name as proposed.
  const prepared = await pmap(proposed, 6, async (p) => {
    // The proposal's own role/country/name_en is the disambiguation hint.
    const wiki = await resolvePerson(p.name, {
      role: p.role,
      country: p.country,
      name_en: p.name_en,
    })
    if (wiki.qid && memory.excludeQids.has(wiki.qid)) return null
    if ([p.name, wiki.label_ar].some((n) => n && memory.excludeNameKeys.has(discoveryNameKey(n)))) {
      return null // already a guest / promoted / operator-rejected, respelled
    }
    const enrichAs: WikiFacts = wiki.resolved
      ? wiki
      : { resolved: false, label: p.name_en ?? null, label_ar: p.name }
    const signals = await enrich(p.name, enrichAs)
    return { p, wiki, signals, free: freeStorySources(signals) }
  })

  // De-dupe by QID, else folded name (the LLM sometimes proposes a person twice).
  const seen = new Set<string>()
  const people = prepared.filter((x): x is NonNullable<typeof x> => {
    if (!x) return false
    const key = x.wiki.qid ?? `n:${discoveryNameKey(x.p.name)}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  // 2. Pre-score without the story — decides who is worth a paid check.
  const pre = people.map((x) => {
    const check: StoryCheck = {
      assessment: notCheckedStory(null, x.p.story_claim ?? null),
      sources: x.free,
      attrs: NO_ATTRS,
    }
    return { ...x, pre: scoreCandidate(x.p, x.wiki, x.signals, input, check) }
  })

  // 3. Story check for K people, split in two halves (selectForStoryCheck):
  //    people with a public footprint (likely a published account) and the
  //    lesser-known (likely an unpublished one), each ordered by STORY
  //    POTENTIAL — the proposal's claim strength + fit. Not by pre-score:
  //    before the check S = 0, so the pre-score is fame (N+G+Q+R) and sent
  //    every check to the famous. A person already hard-rejected on verified
  //    facts (confident death year, verified filter contradiction) is not
  //    worth a paid search.
  const enabled = isStoryGroundingEnabled()
  const cap = enabled ? storyMaxCandidates() : 0
  const hardRejected = (c: V2Candidate) =>
    c.scores.filter_match === 0 ||
    (c.wiki.resolved && !c.wiki.identity_uncertain && !!c.wiki.death_year)
  const queue = selectForStoryCheck(
    pre.filter((x) => !hardRejected(x.pre)),
    input.topic,
    cap,
  )

  const checks = new Map<(typeof pre)[number], { check: StoryCheck; web: CandidateResearchSource[]; webText: string[]; model: string }>()
  // The job is killed at DISCOVERY_JOB_BUDGET_MS, and a search (up to 3
  // attempts + a re-roll) or a classification (120s × 3) had no bound of
  // its own. Every check now runs against one deadline: none starts without
  // room for a search + a classification, and each call gets only what is
  // left. A check the clock cut is not_checked("error") → «لم يُفحص»
  // shortlist, never a rejection.
  const storyDeadline = startedAt + DISCOVERY_JOB_BUDGET_MS - POST_STORY_RESERVE_MS
  let cutByDeadline = 0
  // Concurrency 2: the shared daily retrieval budget still trips in
  // (roughly) rank order, and 12 checks fit the job budget.
  await pmap(queue, 2, async (x) => {
    const claim = x.p.story_claim ?? null
    const notChecked = () =>
      checks.set(x, {
        check: { assessment: notCheckedStory("error", claim), sources: x.free, attrs: NO_ATTRS },
        web: [],
        webText: [],
        model: "",
      })
    const left = storyDeadline - Date.now()
    if (left < STORY_CHECK_MIN_MS) {
      cutByDeadline++
      notChecked()
      return
    }
    let web
    try {
      web = await gatherStoryWebSources(x.p, input, {
        timeoutMs: Math.min(STORY_SEARCH_TIMEOUT_MS, left - STORY_CLASSIFY_RESERVE_MS),
      })
    } catch (err) {
      // Budget spent / search never ran / transient / deadline — NOT "no story".
      console.warn(
        "[discovery-v2/story] evidence skipped:",
        err instanceof Error ? err.message.split("\n")[0] : String(err),
      )
      notChecked()
      return
    }
    const sources = [...web.sources, ...x.free]
    const variants = nameVariants([x.p.name, x.p.name_en, x.wiki.label_ar, x.wiki.label])
    // Nothing citable at all → no classifier call to pay for: the web was
    // searched and had nothing (that IS evidence — footprint floor applies).
    const classifyLeft = storyDeadline - Date.now()
    if (sources.some((s) => s.verified) && classifyLeft <= 0) {
      cutByDeadline++
      notChecked()
      return
    }
    const check: StoryCheck = sources.some((s) => s.verified)
      ? await classifyStory({
          name: x.p.name,
          nameEn: x.p.name_en,
          role: x.p.role,
          claim,
          sources,
          variants,
          runId: input.runId,
          seasonId: input.seasonId,
          ...classifyBudget(classifyLeft),
        })
      : {
          assessment: { ...notCheckedStory(null, claim), status: "unverified" },
          sources,
          attrs: NO_ATTRS,
        }
    checks.set(x, {
      check,
      web: web.sources.map((s) => ({
        title: s.title,
        url: s.url,
        domain: s.domain,
        verified: s.verified,
      })),
      webText: web.sources.map((s) => `${s.title} ${s.text}`),
      model: web.model,
    })
  })

  if (cutByDeadline > 0) {
    console.warn(
      `[discovery-v2/story] ${cutByDeadline}/${queue.length} story checks cut by the job deadline — marked «لم يُفحص»`,
    )
  }

  // 4. Final score + decide.
  const scored: V2Candidate[] = pre.map((x) => {
    const done = checks.get(x)
    const check: StoryCheck = done?.check ?? {
      assessment: notCheckedStory(
        hardRejected(x.pre) ? null : enabled ? "cap" : "unavailable",
        x.p.story_claim ?? null,
      ),
      sources: x.free,
      attrs: NO_ATTRS,
    }
    const c = scoreCandidate(x.p, x.wiki, x.signals, input, check)
    // The story search already paid for live-web evidence — derive the
    // presence stamp from it instead of grounding the same person twice.
    if (done && done.model) {
      c.grounded = {
        ...deriveGroundedSignal(done.web, done.webText),
        sources: done.web,
        provider: "gemini",
        model: done.model,
        checked_at: new Date().toISOString(),
      }
    }
    return c
  })

  scored.sort((a, b) => rankOf(a) - rankOf(b) || b.scores.overall - a.scores.overall)

  // Optional presence stamp for the rest (opt-in, cost-capped, fail-safe);
  // skips anyone the story search already grounded.
  const verified = await attachGroundedVerification(scored, input)

  const count = (d: V2Candidate["decision"]) => verified.filter((c) => c.decision === d).length
  const stats = {
    proposed: proposal.names.length,
    resolved: verified.filter((c) => c.wiki.resolved).length,
    accepted: count("accepted"),
    needs_review: count("needs_review"),
    shortlist: count("shortlist"),
    rejected: count("rejected"),
    story_checked: verified.filter((c) => c.story && c.story.status !== "not_checked").length,
    story_verified: verified.filter((c) => c.story?.status === "verified").length,
    proposed_top_up: proposal.toppedUp,
  }

  return { candidates: verified, proposeRunId: proposal.runId, stats }
}
