/**
 * Guest Discovery v2 — job handler.
 *
 * One job does the whole run (propose → Wikidata-resolve → enrich → story
 * check for the top K → score → persist). The story check is the only
 * fan-out of paid calls and is capped per run (DISCOVERY_STORY_MAX_CANDIDATES). Reuses the existing discovery_runs +
 * guest_discovery_candidates tables; v2 data lives under
 * `platform_signals.v2`.
 *
 * Run lifecycle goes through `transitionDiscoveryRun` + `bumpCandidateCount`
 * (lib/discovery/runs.ts) — the one place that stamps `started_at` /
 * `completed_at`, writes `error_message` and counts candidates. This handler
 * used to write `status` directly with its own UPDATE, which skipped all of
 * that: every v2 run showed candidate_count=0 and null timestamps, and a
 * failed run carried no error_message for the command center to show.
 */

import { registerHandler } from "../registry"
import {
  bumpCandidateCount,
  canTransitionRun,
  getDiscoveryRun,
  setDiscoveryRunSourceConfig,
  transitionDiscoveryRun,
} from "@/lib/discovery/runs"
import { createCandidate, setCandidateStatus } from "@/lib/discovery/candidates"
import { runV2Discovery } from "@/lib/discovery-v2/pipeline"
import { resolveV2RunErrorKind, v2RunFailureMessage } from "@/lib/discovery-v2/run-failure"
import { NonRetryableJobError } from "../types"
import type { V2Candidate, V2RunInput } from "@/lib/discovery-v2/types"
import type {
  DiscoveryCandidateStatus,
  DiscoveryEvidenceUrl,
  DiscoveryRunStatus,
  DiscoverySourceConfig,
} from "@/lib/db/schema/discovery"

interface V2RunPayload extends Record<string, unknown> {
  run_id: string
}

/**
 * The run state machine's happy path. v2 does its work in one pipeline call
 * rather than one step per state, so the handler walks the path to the state
 * it has actually reached, one LEGAL transition at a time — never a direct
 * write that could skip the timestamps the transitions stamp.
 */
const RUN_PATH: DiscoveryRunStatus[] = [
  "pending",
  "seeding",
  "searching",
  "verifying",
  "ranking",
  "completed",
]

async function advanceRun(
  id: string,
  to: DiscoveryRunStatus,
  extra: { candidateCount?: number } = {},
): Promise<void> {
  const run = await getDiscoveryRun(id)
  if (!run) throw new Error(`discovery_v2.run: run ${id} not found`)
  const from = RUN_PATH.indexOf(run.status)
  const target = RUN_PATH.indexOf(to)
  if (from < 0 || target < 0 || from >= target) {
    if (run.status !== to) {
      throw new Error(`discovery_v2.run: cannot advance run ${id} from ${run.status} to ${to}`)
    }
    return
  }
  for (let i = from + 1; i <= target; i++) {
    await transitionDiscoveryRun({ id, to: RUN_PATH[i], ...(i === target ? extra : {}) })
  }
}

/** Fail the run through the lifecycle (stamps completed_at + error_message). */
async function failRun(id: string, error: string): Promise<void> {
  const run = await getDiscoveryRun(id)
  if (!run || !canTransitionRun(run.status, "failed")) return
  await transitionDiscoveryRun({ id, to: "failed", error })
}

function decisionToStatus(d: V2Candidate["decision"]): DiscoveryCandidateStatus {
  // needs_review (a verified story whose identity/filter is unconfirmed)
  // shares `under_review` with accepted — no schema change; the distinction
  // lives in platform_signals.v2.decision.
  return d === "accepted" || d === "needs_review"
    ? "under_review"
    : d === "shortlist"
      ? "proposed"
      : "rejected"
}

function buildEvidence(c: V2Candidate): DiscoveryEvidenceUrl[] {
  const ev: DiscoveryEvidenceUrl[] = []
  const push = (platform: string, url?: string | null, title?: string | null, snippet?: string | null) => {
    if (url) ev.push({ platform, url, title: title ?? c.name, snippet: snippet ?? null, fetched_at: new Date().toISOString() })
  }
  // Verified story evidence first: the quote passed the verbatim guard.
  for (const e of c.story?.evidence ?? []) push("story", e.url, e.domain ?? "مصدر القصة", e.quote)
  push("wikipedia_ar", c.wiki.wikipedia_ar_url, c.name, c.wiki.summary)
  push("wikipedia", c.wiki.wikipedia_url, c.name_en ?? c.name, c.wiki.summary)
  push("official", c.wiki.official_website, "الموقع الرسمي")
  push("youtube", c.signals.youtube?.channel_url, c.signals.youtube?.channel_title ?? "قناة يوتيوب")
  push("youtube_talk", c.signals.youtube?.talk_url, "لقاء/مقابلة")
  push("podcast", c.signals.podcast?.latest_url, "ظهور في بودكاست")
  push("news", c.signals.news?.latest_url, c.signals.news?.latest_title ?? "تغطية إعلامية")
  // Live X presence (enriched via the API) beats the static Wikidata link:
  // the snippet carries what the person is talking about RIGHT NOW.
  if (c.signals.x) {
    const x = c.signals.x
    const label = `X — @${x.username}${x.posting === "active" ? " (نشط)" : ""}`
    push("x", x.url, label, x.recent_sample[0] ?? x.bio ?? null)
  } else {
    push("x", c.wiki.social?.x, "X")
  }
  // Same for Instagram: the Business-Discovery-verified presence (with a
  // recent-caption snippet) beats the bare Wikidata profile link.
  if (c.signals.instagram) {
    const ig = c.signals.instagram
    const label = `Instagram — @${ig.username}${ig.posting === "active" ? " (نشط)" : ""}`
    push("instagram", ig.url, label, ig.recent_sample[0] ?? ig.bio ?? null)
  } else {
    push("instagram", c.wiki.social?.instagram, "Instagram")
  }
  return ev
}

registerHandler<V2RunPayload>("discovery_v2.run", async (payload) => {
  if (!payload.run_id) throw new Error("discovery_v2.run: run_id required")
  const run = await getDiscoveryRun(payload.run_id)
  if (!run) throw new Error(`discovery_v2.run: run ${payload.run_id} not found`)

  const cfg = (run.source_config ?? {}) as Record<string, unknown>
  const input: V2RunInput = {
    topic: String(cfg.topic ?? run.seed_prompt ?? ""),
    filters: (cfg.filters as V2RunInput["filters"]) ?? {},
    geography: (cfg.geography as V2RunInput["geography"]) ?? null,
    taste: (cfg.taste as V2RunInput["taste"]) ?? "balanced",
    limit: Number(cfg.limit ?? 12),
    seasonId: run.season_id ?? null,
    episodeCandidateId: (cfg.episodeCandidateId as string) ?? null,
    runId: run.id,
  }

  // pending → seeding (stamps started_at) → searching.
  await advanceRun(run.id, "searching")

  let result
  try {
    result = await runV2Discovery(input)
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    await failRun(run.id, err.message)
    throw err
  }

  if (result.error && result.candidates.length === 0) {
    // v2_error (raw) + v2_error_kind stay in source_config — the run page
    // reads them from there and picks the operator copy.
    const kind = resolveV2RunErrorKind(result.errorKind, result.error)
    await setDiscoveryRunSourceConfig(run.id, {
      ...cfg,
      v2_error: result.error,
      v2_error_kind: kind,
      v2_stats: result.stats,
    } as DiscoverySourceConfig)
    const reason = `${v2RunFailureMessage(kind)} (${result.error})`
    await failRun(run.id, reason)
    // A failed run is a failed JOB. This used to `return`, so the worker
    // stamped the job `succeeded` while the run said «فشل». Terminal: the
    // router already spent the propose retry, and a second paid run is the
    // operator's call («أعد المحاولة» on the run page), not the queue's.
    throw new NonRetryableJobError(reason)
  }

  const targetEpisodeCandidateId = (cfg.episodeCandidateId as string) ?? null

  // A failure while persisting must not leave the run stuck in "searching".
  try {
    for (const c of result.candidates) {
      const cand = await createCandidate({
        discovery_run_id: run.id,
        target_episode_candidate_id: targetEpisodeCandidateId,
        proposed_name: c.name,
        proposed_role: c.role,
        proposed_country: c.country,
        evidence_urls: buildEvidence(c),
        platform_signals: {
          v2: {
            decision: c.decision,
            scores: c.scores,
            reasons: c.reasons,
            why: c.why,
            name_en: c.name_en,
            image_url: c.wiki.image_url,
            occupations: c.wiki.occupations,
            birth_year: c.wiki.birth_year,
            nationality: c.wiki.nationality_country,
            gender: c.wiki.gender,
            sitelinks: c.wiki.sitelink_count,
            qid: c.wiki.qid,
            social: c.wiki.social,
            signals: c.signals,
            // Optional live-web verification (present only for top advanced
            // candidates when grounding is enabled; null otherwise).
            grounded: c.grounded ?? null,
            // Story-first: verified evidence + flags (identity/filter).
            story: c.story ?? null,
            flags: c.flags ?? [],
          },
        } as never,
      })
      await setCandidateStatus(cand.id, decisionToStatus(c.decision), {
        rejection_reason: c.decision === "rejected" ? c.reasons[0] ?? "below bar" : null,
      })
      // Counted per row as it lands, so a run that dies mid-persist still
      // reports how many candidates it actually wrote.
      await bumpCandidateCount(run.id, 1)
    }

    await setDiscoveryRunSourceConfig(run.id, { ...cfg, v2_stats: result.stats } as DiscoverySourceConfig)
    // searching → verifying → ranking → completed (stamps completed_at).
    await advanceRun(run.id, "completed")
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    await failRun(run.id, err.message)
    throw err
  }

  return { ...result.stats }
})
