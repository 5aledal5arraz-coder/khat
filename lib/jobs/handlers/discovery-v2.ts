/**
 * Guest Discovery v2 — job handler.
 *
 * One job does the whole run (propose → Wikidata-resolve → enrich →
 * score → persist), because the work is mostly fast HTTP to free public
 * APIs, not a heavy AI fan-out. Reuses the existing discovery_runs +
 * guest_discovery_candidates tables; v2 data lives under
 * `platform_signals.v2`. Run lifecycle is managed with direct status
 * updates (v2 doesn't use the v1 seeding→…→ranking state machine).
 */

import { eq } from "drizzle-orm"
import { registerHandler } from "../registry"
import { db } from "@/lib/db"
import { discoveryRuns } from "@/lib/db/schema/discovery"
import { getDiscoveryRun } from "@/lib/discovery/runs"
import { createCandidate, setCandidateStatus } from "@/lib/discovery/candidates"
import { runV2Discovery } from "@/lib/discovery-v2/pipeline"
import type { V2Candidate, V2RunInput } from "@/lib/discovery-v2/types"
import type {
  DiscoveryCandidateStatus,
  DiscoveryEvidenceUrl,
} from "@/lib/db/schema/discovery"

interface V2RunPayload extends Record<string, unknown> {
  run_id: string
}

function setRunStatus(id: string, status: string, extra: Record<string, unknown> = {}) {
  return db!
    .update(discoveryRuns)
    .set({ status: status as never, updated_at: new Date(), ...extra })
    .where(eq(discoveryRuns.id, id))
}

function decisionToStatus(d: V2Candidate["decision"]): DiscoveryCandidateStatus {
  return d === "accepted" ? "under_review" : d === "shortlist" ? "proposed" : "rejected"
}

function buildEvidence(c: V2Candidate): DiscoveryEvidenceUrl[] {
  const ev: DiscoveryEvidenceUrl[] = []
  const push = (platform: string, url?: string | null, title?: string | null, snippet?: string | null) => {
    if (url) ev.push({ platform, url, title: title ?? c.name, snippet: snippet ?? null, fetched_at: new Date().toISOString() })
  }
  push("wikipedia_ar", c.wiki.wikipedia_ar_url, c.name, c.wiki.summary)
  push("wikipedia", c.wiki.wikipedia_url, c.name_en ?? c.name, c.wiki.summary)
  push("official", c.wiki.official_website, "الموقع الرسمي")
  push("youtube", c.signals.youtube?.channel_url, c.signals.youtube?.channel_title ?? "قناة يوتيوب")
  push("youtube_talk", c.signals.youtube?.talk_url, "لقاء/مقابلة")
  push("podcast", c.signals.podcast?.latest_url, "ظهور في بودكاست")
  push("news", c.signals.news?.latest_url, c.signals.news?.latest_title ?? "تغطية إعلامية")
  push("x", c.wiki.social?.x, "X")
  push("instagram", c.wiki.social?.instagram, "Instagram")
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
    taste: (cfg.taste as V2RunInput["taste"]) ?? "balanced",
    limit: Number(cfg.limit ?? 12),
    seasonId: run.season_id ?? null,
    episodeCandidateId: (cfg.episodeCandidateId as string) ?? null,
  }

  await setRunStatus(run.id, "searching")

  let result
  try {
    result = await runV2Discovery(input)
  } catch (e) {
    await setRunStatus(run.id, "failed")
    throw e instanceof Error ? e : new Error(String(e))
  }

  if (result.error && result.candidates.length === 0) {
    await setRunStatus(run.id, "failed", {
      source_config: { ...cfg, v2_error: result.error } as never,
    })
    return { error: result.error, ...result.stats }
  }

  const targetEpisodeCandidateId = (cfg.episodeCandidateId as string) ?? null

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
        },
      } as never,
    })
    await setCandidateStatus(cand.id, decisionToStatus(c.decision), {
      rejection_reason: c.decision === "rejected" ? c.reasons[0] ?? "below bar" : null,
    })
  }

  await setRunStatus(run.id, "completed", {
    source_config: { ...cfg, v2_stats: result.stats } as never,
  })

  return { ...result.stats }
})
