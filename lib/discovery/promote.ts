/**
 * Discovery candidate promotion — the bridge from a discovery candidate
 * to the canonical guest + khat-map season wizard.
 *
 * Extracted from the retired /admin/discovery server actions so the
 * seasons wizard (assignDiscoveredGuestToEpisodeAction) doesn't depend
 * on a dead UI's action file. Pure lib: no auth, no revalidatePath —
 * callers own both.
 */

import {
  getCandidate,
  setCandidateStatus,
} from "./candidates"
import { getDiscoveryRun } from "./runs"
import { bridgeDiscoveryToKhatMap } from "./bridge"
import {
  ensureGuest,
  linkDiscoveryCandidateToGuest,
  updateGuestIdentityProfile,
  type IdentityHints,
} from "@/lib/guests/canonical"

export interface PromoteDiscoveryCandidateOptions {
  /** Bypass the requires_review gate (admin confirmed new person). */
  forceCreate?: boolean
  /** Link to an existing guest directly, skipping identity matching. */
  guestId?: string | null
  /**
   * Optional EIR id. When supplied, the discovery → khat-map bridge
   * also attaches the promoted guest to the EIR's source episode
   * candidate so convert-to-preparation can proceed without manual
   * data entry.
   */
  eirId?: string | null
  /** Actor for the editorial voice signal (admin user id). */
  actorId?: string | null
}

export interface PromoteDiscoveryCandidateResult {
  guest_id: string
  created: boolean
  confidence: string
  reasons: string[]
  bridge: {
    khat_guest_candidate_id: string | null
    khat_guest_candidate_created: boolean
    attached_to_episode: boolean
  }
}

/**
 * Promote a discovery candidate: derive identity hints from evidence,
 * ensureGuest (create-or-merge the canonical guests row), write the
 * identity profile, link the candidate, stamp it `promoted`, and bridge
 * into the khat-map wizard. Throws on failure (including the
 * requires-review gate) with an operator-readable message.
 */
export async function promoteDiscoveryCandidate(
  id: string,
  options: PromoteDiscoveryCandidateOptions = {},
): Promise<PromoteDiscoveryCandidateResult> {
  const cand = await getCandidate(id)
  if (!cand) throw new Error("candidate not found")

  // Capture "promote" as the strongest editorial voice signal BEFORE
  // the heavy work so the signal lands even if the bridge step errors.
  void captureVoiceSignal(id, "promote", null, options.actorId ?? null)

  // Caller supplied a guest_id — link directly without a name search.
  if (options.guestId) {
    await setCandidateStatus(id, "promoted", {
      promoted_guest_id: options.guestId,
    })
    await linkDiscoveryCandidateToGuest({
      discovery_candidate_id: id,
      guest_id: options.guestId,
      discovery_run_id: cand.discovery_run_id ?? null,
      link_type: "manual_link",
      confidence_score: 1.0,
    })
    const manualBridge = await bridgeDiscoveryToKhatMap({
      discoveryCandidateId: id,
      globalGuestId: options.guestId,
      eirId: options.eirId ?? null,
    })
    return {
      guest_id: options.guestId,
      created: false,
      confidence: "manual",
      reasons: ["admin supplied guest_id"],
      bridge: manualBridge,
    }
  }

  const hints = identityHintsFromCandidate(cand)
  const result = await ensureGuest(hints, {
    acceptance: options.forceCreate ? "create_on_low" : "auto",
  })
  if (result.requires_review) {
    throw new Error(
      `match requires review (confidence=${result.confidence}): ` +
        result.reasons.join(" · "),
    )
  }

  // Create or update the identity profile with this candidate's signals.
  await updateGuestIdentityProfile(result.guest_id, {
    discovery_evidence: {
      urls: cand.evidence_urls.map((u) => ({
        platform: u.platform,
        url: u.url,
        title: u.title ?? null,
        snippet: u.snippet ?? null,
      })),
      best_scores: {
        composite: cand.composite_score,
        editorial_fit: cand.editorial_fit_score,
        hiddenness: cand.hiddenness_score,
        novelty: cand.novelty_score,
        evidence_strength: cand.evidence_strength_score,
      },
      matched_archetype: cand.archetype
        ? { id: cand.archetype.id, name: cand.archetype.name }
        : null,
    },
    story_arcs: {
      arcs: cand.story_signals?.arcs ?? [],
      topics: cand.story_signals?.topics ?? [],
      events: cand.story_signals?.events ?? [],
    },
    risk_map: {
      red_flags: cand.evidence_summary?.red_flags ?? [],
      sensitive_topics: cand.evidence_summary?.risks ?? [],
    },
    suggested_angles: cand.evidence_summary?.notable_quotes ?? [],
    source_summary: {
      discovery: { runs: 1, last_seen: new Date().toISOString() },
    },
    last_analyzed_at: new Date(),
  })

  await linkDiscoveryCandidateToGuest({
    discovery_candidate_id: id,
    guest_id: result.guest_id,
    discovery_run_id: cand.discovery_run_id ?? null,
    link_type: result.created ? "promoted" : "manual_link",
    confidence_score:
      result.confidence === "high"
        ? 1.0
        : result.confidence === "medium"
          ? 0.7
          : 0.4,
  })
  await setCandidateStatus(id, "promoted", {
    promoted_guest_id: result.guest_id,
  })

  // Bridge into the Khat Map editorial wizard. Idempotent — reuses an
  // existing khat_map_guest_candidate for (season, guest) if present.
  const bridge = await bridgeDiscoveryToKhatMap({
    discoveryCandidateId: id,
    globalGuestId: result.guest_id,
    eirId: options.eirId ?? null,
  })

  return {
    guest_id: result.guest_id,
    created: result.created,
    confidence: result.confidence,
    reasons: result.reasons,
    bridge,
  }
}

/**
 * Best-effort editorial voice signal. Errors are swallowed — telemetry
 * must never block the promote flow.
 */
async function captureVoiceSignal(
  candidateId: string,
  signalType: "accept" | "reject" | "promote" | "save_for_later",
  note: string | null,
  actorId: string | null,
): Promise<void> {
  try {
    const { captureVoiceSignal: capture, buildSnapshotFromCandidate } =
      await import("@/lib/discovery/voice-fingerprint")
    const cand = await getCandidate(candidateId)
    if (!cand) return
    let seasonId: string | null = null
    let topicDomain: string | null = null
    if (cand.discovery_run_id) {
      const run = await getDiscoveryRun(cand.discovery_run_id)
      seasonId = run?.season_id ?? null
      topicDomain = run?.source_config?.source_episode_topic_domain ?? null
    }
    if (!seasonId) return
    const snapshot = buildSnapshotFromCandidate(
      {
        archetype: cand.archetype,
        editorial_fit_score: cand.editorial_fit_score,
        hidden_gem_score: cand.hidden_gem_score,
        identity_confidence: cand.identity_confidence,
        pipeline_version: cand.pipeline_version,
      },
      topicDomain,
    )
    await capture({
      seasonId,
      candidateId,
      signalType,
      snapshot,
      note,
      actorId,
    })
  } catch (err) {
    console.warn(
      "[discovery] voice-fingerprint capture failed:",
      err instanceof Error ? err.message : err,
    )
  }
}

/** Build IdentityHints from a discovery candidate's evidence + signals. */
function identityHintsFromCandidate(
  cand: NonNullable<Awaited<ReturnType<typeof getCandidate>>>,
): IdentityHints {
  const externalLinks: Record<string, string> = {}
  for (const u of cand.evidence_urls) {
    if (u.platform && u.url && !externalLinks[u.platform]) {
      externalLinks[u.platform] = u.url
    }
  }
  return {
    name: cand.proposed_name,
    country: cand.proposed_country,
    bio: cand.evidence_summary?.why_they_matter ?? null,
    external_links: externalLinks,
    website: externalLinks.google_web ?? externalLinks.website ?? null,
  }
}
