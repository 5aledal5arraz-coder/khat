/**
 * v2 pipeline orchestrator — worth telling first («دستور خط», 2026-09-28).
 *
 *   witness profiles (D2 — one cheap bounded call: WHO lived this topic)
 *   → in parallel, three name sources:
 *       propose names (LLM, over-generate; story_claim + public_account_ref
 *         are hypotheses only)
 *       grounded harvest (D1 — Kuwaiti press / podcasts / TEDx, names found
 *         telling it themselves, arriving WITH their verified sources)
 *       X list-graph (D5 — curated lived-experience lists, capped, politics out)
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
import { scoreCandidate, storyEvidenceDepth } from "./score"
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
import { proposeWitnessProfiles, WITNESS_TIMEOUT_MS } from "./witness"
import { harvestGroundedNames, type HarvestResult } from "./harvest"
import { classifyWebSearchFailure, dominantFailureKind, type WebSearchFailureKind } from "./web-search-health"
import { harvestXListNames, type XHarvestResult } from "./sources/x-lists"
import { resolveGeography } from "./story-evidence"
import { GEMINI_RETRIEVAL_MODEL } from "@/lib/ai/gemini"
import type { WitnessProfile } from "./types"

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

/**
 * The run page order. Tier first (rankOf); inside a tier the VERIFIED story
 * decides before fame: S, then how much independent evidence backs it
 * (storyEvidenceDepth), then the overall score. S is an ordinal bucket
 * (0.8 = one live domain, 1 = two …), so on the 2026-09-29 run three strong
 * cards tied on it and the order fell to overall — i.e. to fame (N/G/R),
 * which is how a namesake's sitelinks could lift a card.
 */
export function compareCandidates(a: V2Candidate, b: V2Candidate): number {
  return (
    rankOf(a) - rankOf(b) ||
    b.scores.story - a.scores.story ||
    storyEvidenceDepth(b.story) - storyEvidenceDepth(a.story) ||
    b.scores.overall - a.scores.overall
  )
}

// ── Propose top-up budget ────────────────────────────────────────────────
/**
 * discovery_v2.run's HANDLER_TIMEOUT_MS in lib/jobs/worker.ts (the map is not
 * exported; tests/ai-router/discovery-propose-budget.test.ts pins the two
 * together). 15 min, up from 10 (2026-09-28): the first propose call now
 * gets 300s + one timeout retry (registry `discovery`), so its worst case
 * (proposeWorstCaseMs ≈ 608s) plus POST_PROPOSE_RESERVE_MS must still fit.
 * 16 min since batch 2 (same day): the witness step (preProposeWorstCaseMs,
 * 45s) runs first, and 45 + 608 + 240 left only 7s of the old 900s.
 * A worker job — no nginx wall applies.
 */
export const DISCOVERY_JOB_BUDGET_MS = 16 * 60_000
/**
 * Everything after propose (resolve/enrich + story checks, cap 12 at
 * concurrency 2) took ~140–210s in the 2026-09-26 trials; + margin.
 */
export const POST_PROPOSE_RESERVE_MS = 240_000
/**
 * The grounded harvest runs beside propose; this bounds it from its start so
 * it can never hold the run past a fast propose by more than a little.
 */
export const HARVEST_WALL_MS = 180_000

/**
 * Worst-case wall time spent BEFORE the first propose call: the witness
 * profiles step (one attempt, no retry). The job budget must fit this +
 * proposeWorstCaseMs() + POST_PROPOSE_RESERVE_MS (pinned in
 * tests/ai-router/discovery-propose-budget.test.ts).
 */
export function preProposeWorstCaseMs(): number {
  return WITNESS_TIMEOUT_MS
}

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
  witnessProfiles: WitnessProfile[] = [],
): Promise<{ names: ProposedName[]; runId: string; error?: string; errorStatus?: string; toppedUp: number }> {
  const first = await proposeNames(input, want, memory, { witnessProfiles })
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
    witnessProfiles,
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
    /** D2 — witness profiles written for this topic (0 = the step failed / off) */
    witness_profiles?: number
    /** D1 — grounded searches spent, names they yielded, their estimated cost */
    harvest_queries?: number
    harvested_web?: number
    harvest_search_cost_usd?: number
    /** D1 — grounded harvest searches that FAILED (after retries) */
    harvest_failed?: number
    /** story-check web searches that returned / failed (→ «لم يُفحص») / were cut by the clock */
    story_searched?: number
    story_check_failed?: number
    story_check_cut?: number
    /** any web-search failure this run was a provider overload (503 / 429 / 5xx) */
    provider_overloaded?: boolean
    /** the dominant reason among web-search failures (web-search-health.ts), null = none failed */
    web_failure_reason?: WebSearchFailureKind | null
    /** names the propose model itself returned (0 when it returned none or failed) */
    proposed_by_model?: number
    /** the propose call failed outright (the names shown came from the web / X) */
    propose_failed?: boolean
    /** D5 — X calls spent, names kept, and why X stopped early (402/429), if it did */
    x_calls?: number
    x_names?: number
    x_degraded?: string | null
    /** Why X was not read at all this run (e.g. "no_relevant_list"), if it wasn't. */
    x_skipped?: string | null
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

  // D2 — who lived this topic. Bounded (WITNESS_TIMEOUT_MS, no retry) and
  // fail-safe: without profiles propose runs as before and the harvest skips.
  const witness = await proposeWitnessProfiles(input).catch((err: unknown) => ({
    profiles: [] as WitnessProfile[],
    runId: null,
    error: err instanceof Error ? err.message : String(err),
  }))
  if (witness.error) console.warn("[discovery-v2/witness] skipped:", witness.error.split("\n")[0])
  const profiles = witness.profiles

  // Three name sources in parallel. The harvest and X are add-ons: a failure
  // there costs names, never the run.
  const emptyHarvest: HarvestResult = { names: [], queries: 0, searchCostUsd: 0, errors: [], failed: 0, failureKinds: [] }
  const emptyX: XHarvestResult = { names: [], calls: 0, users_read: 0, degraded: null, skipped: null, est_cost_usd: null }
  const [proposal, harvest, xh] = await Promise.all([
    proposeWithTopUp(input, want, memory, startedAt, profiles),
    harvestGroundedNames(input, profiles, { deadlineAt: Date.now() + HARVEST_WALL_MS }).catch(
      (err: unknown): HarvestResult => ({
        ...emptyHarvest,
        errors: [err instanceof Error ? err.message : String(err)],
        failed: 1,
        failureKinds: [classifyWebSearchFailure(err)],
      }),
    ),
    harvestXListNames({
      topic: input.topic,
      profiles,
      geography: resolveGeography(input),
      exclude: (name) => memory.excludeNameKeys.has(discoveryNameKey(name)),
    }).catch((): XHarvestResult => emptyX),
  ])
  if (harvest.errors.length) console.warn("[discovery-v2/harvest]", harvest.errors.join(" | ").slice(0, 300))

  // Harvested names first: when the same person also came from propose, the
  // copy that carries its verified sources is the one kept.
  const merged: ProposedName[] = []
  const mergedKeys = new Set<string>()
  for (const p of [...harvest.names, ...(proposal.error ? [] : proposal.names), ...xh.names]) {
    const key = discoveryNameKey(p.name)
    if (!key || mergedKeys.has(key)) continue
    mergedKeys.add(key)
    merged.push(p)
  }
  // Web-search health (web-search-health.ts): every failed grounded search
  // is counted with its reason, so a run the provider mostly refused says so
  // instead of ending as a quiet short list. Story-check failures join below.
  const webFailures: WebSearchFailureKind[] = [...harvest.failureKinds]
  const webHealth = () => ({
    provider_overloaded: webFailures.includes("overloaded"),
    web_failure_reason: dominantFailureKind(webFailures),
  })
  const sourceStats = {
    witness_profiles: profiles.length,
    harvest_queries: harvest.queries,
    harvest_failed: harvest.failed,
    harvested_web: harvest.names.length,
    harvest_search_cost_usd: Number(harvest.searchCostUsd.toFixed(4)),
    proposed_by_model: proposal.error ? 0 : proposal.names.length,
    propose_failed: !!proposal.error,
    x_calls: xh.calls,
    x_names: xh.names.length,
    x_degraded: xh.degraded,
    x_skipped: xh.skipped,
  }

  if (merged.length === 0) {
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
        ...sourceStats,
        ...webHealth(),
      },
      error: proposal.error ?? "no names proposed",
      errorKind: proposal.error ? proposeErrorKind(proposal.errorStatus, proposal.error) : "no_names",
    }
  }
  if (proposal.error) {
    // The harvest / X still found people — a propose failure costs its names only.
    console.warn(
      `[discovery-v2/propose] failed (${proposal.error.split("\n")[0]}) — continuing with ${merged.length} harvested name(s)`,
    )
  }

  // A proposal whose OWN stated gender contradicts a strict gender filter
  // is the model breaking the rule it was given — drop it before any paid
  // step. Not evidence the other way: an unstated or matching self-report
  // is still verified from Wikidata / the sources in score.ts.
  const wantGender = input.filters?.gender ?? null
  const proposed = wantGender
    ? merged.filter((p) => !p.gender || p.gender === wantGender)
    : merged

  // 1. Resolve + memory filter + enrich, 6 at a time. Enrichment runs for
  //    EVERY person — an unresolved name is searched by the name as proposed.
  const prepared = await pmap(proposed, 6, async (p) => {
    // The proposal's own role/country/name_en is the disambiguation hint.
    const wiki = await resolvePerson(p.name, {
      role: p.role,
      country: p.country,
      name_en: p.name_en,
    })
    // An UNCERTAIN match may be a namesake: its QID, its Arabic label and
    // its handles (X / Instagram / YouTube channel) are a stranger's. None
    // of them may exclude, dedupe or enrich this person (2026-09-28) —
    // enriching through them looked up the namesake's accounts, whose
    // activity then fed G/R and whose URLs reached the CRM as social links.
    const trusted = wiki.resolved && !wiki.identity_uncertain
    if (trusted && wiki.qid && memory.excludeQids.has(wiki.qid)) return null
    if ([p.name, trusted ? wiki.label_ar : null].some((n) => n && memory.excludeNameKeys.has(discoveryNameKey(n)))) {
      return null // already a guest / promoted / operator-rejected, respelled
    }
    const enrichAs: WikiFacts = trusted
      ? wiki
      : { resolved: false, label: p.name_en ?? null, label_ar: p.name }
    const signals = await enrich(p.name, enrichAs)
    return { p, wiki, signals, free: freeStorySources(signals) }
  })

  // De-dupe by QID, else folded name (the LLM sometimes proposes a person twice).
  const seen = new Set<string>()
  const people = prepared.filter((x): x is NonNullable<typeof x> => {
    if (!x) return false
    const trustedQid = x.wiki.resolved && !x.wiki.identity_uncertain ? x.wiki.qid : null
    const key = trustedQid ?? `n:${discoveryNameKey(x.p.name)}`
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
    // The guest-policy gate already fired on what we know without the story
    // (a trusted entity's description / Wikipedia summary) — no paid check.
    !!c.flags?.includes("policy_violation") ||
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
  let storySearched = 0
  let storySearchFailed = 0
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
      // D1: a harvested name arrives with the live sources that found him —
      // classify those; a second paid search would find the same pages.
      if (x.p.harvest_sources?.length) {
        web = { sources: x.p.harvest_sources, model: GEMINI_RETRIEVAL_MODEL }
      } else {
        web = await gatherStoryWebSources(x.p, input, {
          timeoutMs: Math.min(STORY_SEARCH_TIMEOUT_MS, left - STORY_CLASSIFY_RESERVE_MS),
        })
        storySearched++
      }
    } catch (err) {
      // Budget spent / search never ran / transient / deadline — NOT "no story".
      // Counted with its reason: the run page says so when it is a real share.
      storySearchFailed++
      webFailures.push(classifyWebSearchFailure(err))
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
          topic: input.topic,
          sources,
          variants,
          // Shown to the classifier to be JUDGED (wikidata_match), never trusted.
          entity: x.wiki,
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

  scored.sort(compareCandidates)

  // Optional presence stamp for the rest (opt-in, cost-capped, fail-safe);
  // skips anyone the story search already grounded.
  const verified = await attachGroundedVerification(scored, input)

  const count = (d: V2Candidate["decision"]) => verified.filter((c) => c.decision === d).length
  const stats = {
    proposed: merged.length,
    resolved: verified.filter((c) => c.wiki.resolved).length,
    accepted: count("accepted"),
    needs_review: count("needs_review"),
    shortlist: count("shortlist"),
    rejected: count("rejected"),
    story_checked: verified.filter((c) => c.story && c.story.status !== "not_checked").length,
    story_verified: verified.filter((c) => c.story?.status === "verified").length,
    proposed_top_up: proposal.toppedUp,
    ...sourceStats,
    story_searched: storySearched,
    story_check_failed: storySearchFailed,
    story_check_cut: cutByDeadline,
    ...webHealth(),
  }
  if (storySearchFailed > 0 || harvest.failed > 0) {
    console.warn(
      `[discovery-v2] web search degraded: harvest ${harvest.failed} failed / ${harvest.queries} ok, ` +
        `story ${storySearchFailed} failed / ${storySearched} ok (${stats.web_failure_reason})`,
    )
  }

  return { candidates: verified, proposeRunId: proposal.runId ?? null, stats }
}
