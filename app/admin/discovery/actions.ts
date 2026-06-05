"use server"

/**
 * Khat Brain Phase 5 — /admin/discovery server actions.
 *
 * Phase 6: promote action now uses ensureGuest() to create or merge
 * the canonical guests row, plus writes a guest_identity_profile and
 * a guest_discovery_links row. Admin no longer needs to supply a
 * guest_id — it's derived from the candidate's evidence.
 */

import { revalidatePath } from "next/cache"
import { requireAdmin, getAdminAuthUser } from "@/lib/api-utils"
import { enqueueJob } from "@/lib/jobs"
import {
  createDiscoveryRun,
  getCandidate,
  setCandidateStatus,
  bridgeDiscoveryToKhatMap,
  type DiscoverySource,
} from "@/lib/discovery"
import {
  ensureGuest,
  linkDiscoveryCandidateToGuest,
  updateGuestIdentityProfile,
  type IdentityHints,
} from "@/lib/guests/canonical"
import { db } from "@/lib/db"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import {
  khatMapSeasons,
  khatMapEpisodeCandidates,
} from "@/lib/db/schema/khat-map"
import { discoveryRuns } from "@/lib/db/schema/discovery"
import { and, eq, inArray } from "drizzle-orm"
import type { KhatMapEditorialControls } from "@/types/khat-map"
import {
  KHAT_EDITORIAL_CONTROLS_DEFAULTS,
  KHAT_TOPIC_DOMAIN_LABEL,
} from "@/types/khat-map"

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export interface StartDiscoveryRunInput {
  seasonId?: string | null
  seedPrompt?: string | null
  count?: number
  platforms?: DiscoverySource[]
  /**
   * Phase Beta — operator-set taste for hiddenness. Re-weights the
   * recommendation_score axis inside Alpha's editorial-fit module.
   *   famous       — popular/known guests welcome
   *   balanced     — default (post-Alpha v2 weights)
   *   hidden_gems  — niche / low-audience candidates dominate
   * Omitted → "balanced".
   */
  hiddennessPreference?: "famous" | "balanced" | "hidden_gems"
  /**
   * UX-11 — episode context. When passed, the action auto-derives
   * `seasonId` from the EIR (if not explicitly provided) and builds a
   * default `seedPrompt` from the EIR's working title + editorial
   * intent. The discovery run is then linked to the same season as
   * the episode, so candidates surface for the right show.
   */
  eirId?: string | null
  /**
   * Phase B redesign — episode-scoped run. When passed, the action
   * resolves the episode candidate's parent season, inherits the
   * season's strict guest filters into `source_config`, and stamps
   * `source_episode_candidate_id` on the run so candidates surface
   * for THIS slot, not the whole season.
   */
  episodeCandidateId?: string | null
}

export interface StartDiscoveryRunData {
  runId: string
  derived: {
    seasonId: string | null
    seedPrompt: string | null
    fromEir: boolean
    fromEpisodeCandidate: boolean
  }
}

export async function startDiscoveryRunAction(
  input: StartDiscoveryRunInput,
): Promise<Result<StartDiscoveryRunData>> {
  await requireAdmin()
  const user = await getAdminAuthUser()
  if (!user) return { success: false, error: "غير مصرح" }

  try {
    // UX-11 — derive season + seed prompt from EIR when episode
    // context is passed. Either field already in `input` takes
    // precedence so operators can still override.
    let seasonId = input.seasonId ?? null
    let seedPrompt = input.seedPrompt ?? null
    let fromEir = false
    let fromEpisodeCandidate = false
    let sourceEpisodeCandidateId: string | null = null
    let sourceEpisodeWorkingTitle: string | null = null
    let sourceEpisodeTopicDomain: string | null = null

    // Phase B redesign — episode-candidate context. Resolves the
    // season, the working title, and any topic-domain hint so the
    // prompt builder can anchor the archetype seed to THIS topic.
    if (input.episodeCandidateId && db) {
      const [cand] = await db
        .select({
          id: khatMapEpisodeCandidates.id,
          season_id: khatMapEpisodeCandidates.season_id,
          working_title: khatMapEpisodeCandidates.working_title,
          topic_domain: khatMapEpisodeCandidates.topic_domain,
          why_matters: khatMapEpisodeCandidates.why_matters,
          hook: khatMapEpisodeCandidates.hook,
          goal: khatMapEpisodeCandidates.goal,
        })
        .from(khatMapEpisodeCandidates)
        .where(eq(khatMapEpisodeCandidates.id, input.episodeCandidateId))
        .limit(1)
      if (cand) {
        fromEpisodeCandidate = true
        sourceEpisodeCandidateId = cand.id
        sourceEpisodeWorkingTitle = cand.working_title
        sourceEpisodeTopicDomain = cand.topic_domain ?? null
        if (!seasonId) seasonId = cand.season_id ?? null
        if (!seedPrompt) {
          const parts = [`بحث عن ضيف للحلقة: ${cand.working_title}`]
          // CR-6 — surface the topic domain as its Arabic label, not the
          // raw enum (was "مجال: identity_masculinity"). Falls back to
          // the raw token if the enum isn't in the map.
          if (cand.topic_domain) {
            const arLabel =
              KHAT_TOPIC_DOMAIN_LABEL[
                cand.topic_domain as keyof typeof KHAT_TOPIC_DOMAIN_LABEL
              ]?.label ?? cand.topic_domain
            parts.push(`مجال: ${arLabel}`)
          }
          if (cand.hook) parts.push(`الخطّاف: ${cand.hook}`)
          if (cand.why_matters) parts.push(`لماذا يهم: ${cand.why_matters}`)
          if (cand.goal) parts.push(`الهدف: ${cand.goal}`)
          seedPrompt = parts.join(" · ").slice(0, 1200)
        }
      }
    }

    if (input.eirId && db) {
      const [eir] = await db
        .select({
          season_id: episodeIntelligenceRecords.season_id,
          working_title: episodeIntelligenceRecords.working_title,
          editorial_intent: episodeIntelligenceRecords.editorial_intent,
          topic_domain: episodeIntelligenceRecords.topic_domain,
        })
        .from(episodeIntelligenceRecords)
        .where(eq(episodeIntelligenceRecords.id, input.eirId))
        .limit(1)
      if (eir) {
        fromEir = true
        if (!seasonId) seasonId = eir.season_id ?? null
        // CR-5 (patch) — when the operator triggered from an EIR (no
        // explicit episodeCandidateId), resolve the originating
        // khat_map_episode_candidate via editorial_intent.source_id and
        // use it as the source for both the run record AND the
        // duplicate-run dedup check below. Without this, EIR-direct
        // discovery flows bypassed the dedup gate.
        if (!sourceEpisodeCandidateId) {
          const intent = (eir.editorial_intent ?? {}) as {
            source_id?: string | null
          }
          if (intent.source_id) {
            sourceEpisodeCandidateId = intent.source_id
            sourceEpisodeWorkingTitle = eir.working_title
            sourceEpisodeTopicDomain = eir.topic_domain ?? null
          }
        }
        if (!seedPrompt) {
          const intent = (eir.editorial_intent ?? {}) as Record<string, unknown>
          const hook =
            typeof intent.hook === "string" ? intent.hook.trim() : ""
          const whyMatters =
            typeof intent.why_matters === "string"
              ? intent.why_matters.trim()
              : ""
          const goal =
            typeof intent.goal === "string" ? intent.goal.trim() : ""
          const parts: string[] = [
            `بحث عن ضيف للحلقة: ${eir.working_title}`,
          ]
          if (eir.topic_domain) {
            const arLabel =
              KHAT_TOPIC_DOMAIN_LABEL[
                eir.topic_domain as keyof typeof KHAT_TOPIC_DOMAIN_LABEL
              ]?.label ?? eir.topic_domain
            parts.push(`مجال: ${arLabel}`)
          }
          if (hook) parts.push(`الخطّاف: ${hook}`)
          if (whyMatters) parts.push(`لماذا يهم: ${whyMatters}`)
          if (goal) parts.push(`الهدف: ${goal}`)
          seedPrompt = parts.join(" · ").slice(0, 1200)
        }
      }
    }

    // Phase B redesign — pull the season's strict filters so they flow
    // into source_config. The downstream prompt builder + verifier read
    // them from there. Falls back to neutral defaults when the run
    // isn't season-scoped (legacy callers).
    let inheritedGender: "male" | "female" | undefined
    let inheritedNationality: "kuwaiti" | "non_kuwaiti" | undefined
    if (seasonId && db) {
      const [seasonRow] = await db
        .select({
          editorial_controls: khatMapSeasons.editorial_controls,
        })
        .from(khatMapSeasons)
        .where(eq(khatMapSeasons.id, seasonId))
        .limit(1)
      const controls =
        (seasonRow?.editorial_controls as
          | KhatMapEditorialControls
          | undefined) ?? KHAT_EDITORIAL_CONTROLS_DEFAULTS
      const gf = controls.guest_filters
      if (gf.gender === "male" || gf.gender === "female") {
        inheritedGender = gf.gender
      }
      if (gf.nationality === "kuwaiti" || gf.nationality === "non_kuwaiti") {
        inheritedNationality = gf.nationality
      }
    }

    // CR-5 — duplicate-run prevention. If a discovery run for the same
    // source episode candidate is already in flight (pending / seeding /
    // searching / verifying / ranking), refuse the new request and link
    // the operator to the existing run. Avoids the 4-runs-in-8-minutes
    // pattern flagged in the operator-day report.
    if (sourceEpisodeCandidateId && db) {
      const inflightStatuses = [
        "pending",
        "seeding",
        "searching",
        "verifying",
        "ranking",
      ] as const
      const [existing] = await db
        .select({ id: discoveryRuns.id, status: discoveryRuns.status })
        .from(discoveryRuns)
        .where(
          and(
            eq(
              discoveryRuns.source_episode_candidate_id,
              sourceEpisodeCandidateId,
            ),
            inArray(discoveryRuns.status, [...inflightStatuses]),
          ),
        )
        .limit(1)
      if (existing) {
        return {
          success: false,
          error:
            "تشغيل اكتشاف لهذه الحلقة جارٍ بالفعل. انتظر اكتماله أو ألغِه قبل بدء تشغيل جديد.",
        }
      }
    }

    const run = await createDiscoveryRun({
      season_id: seasonId,
      source_episode_candidate_id: sourceEpisodeCandidateId,
      seed_prompt: seedPrompt,
      source_config: {
        // Phase B redesign — YouTube + Google web are the primary
        // signal. iTunes podcast is dropped from the default platform
        // set (it stays available as an opt-in via `input.platforms`).
        // Phase Beta — when input.platforms is omitted, the handler
        // picks Beta defaults (which include editorial + public_voice
        // + network) automatically based on the alphaFlagEnabled()
        // env check; passing an explicit list bypasses Beta default.
        platforms: input.platforms,
        candidates_per_archetype: 5,
        gender: inheritedGender,
        nationality: inheritedNationality,
        source_episode_candidate_id: sourceEpisodeCandidateId,
        source_episode_working_title: sourceEpisodeWorkingTitle,
        source_episode_topic_domain: sourceEpisodeTopicDomain,
        hiddenness_preference: input.hiddennessPreference ?? "balanced",
      },
      created_by: user.id,
    })

    await enqueueJob(
      "discovery.seed_archetypes",
      {
        run_id: run.id,
        count: input.count ?? 8,
        seed_prompt: seedPrompt,
      },
      { priority: 5, maxAttempts: 2 },
    )

    revalidatePath("/admin/discovery")
    if (input.eirId) {
      revalidatePath(`/admin/khat-brain/episodes/${input.eirId}`)
    }
    if (seasonId) {
      revalidatePath(`/admin/khat-brain/seasons/${seasonId}`)
    }
    return {
      success: true,
      data: {
        runId: run.id,
        derived: {
          seasonId,
          seedPrompt,
          fromEir,
          fromEpisodeCandidate,
        },
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "خطأ" }
  }
}

export async function rankRunAction(
  runId: string,
): Promise<Result<{ enqueued: true }>> {
  await requireAdmin()
  if (!runId) return { success: false, error: "runId required" }
  try {
    await enqueueJob(
      "discovery.rank_candidates",
      { run_id: runId },
      { priority: 8 },
    )
    revalidatePath("/admin/discovery")
    return { success: true, data: { enqueued: true } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "خطأ" }
  }
}

export async function rejectCandidateAction(
  id: string,
  reason: string,
): Promise<Result<{ ok: true }>> {
  const user = await requireAdmin()
  try {
    await setCandidateStatus(id, "rejected", { rejection_reason: reason })
    // Phase Beta — fire-and-forget editorial voice signal capture.
    void captureVoiceSignalForAction({
      candidateId: id,
      signalType: "reject",
      note: reason,
      actorId: user.id,
    })
    revalidatePath("/admin/discovery")
    return { success: true, data: { ok: true } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "خطأ" }
  }
}

export async function saveCandidateForLaterAction(
  id: string,
): Promise<Result<{ ok: true }>> {
  const user = await requireAdmin()
  try {
    await setCandidateStatus(id, "saved_for_later")
    void captureVoiceSignalForAction({
      candidateId: id,
      signalType: "save_for_later",
      actorId: user.id,
    })
    revalidatePath("/admin/discovery")
    return { success: true, data: { ok: true } }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "خطأ" }
  }
}

/**
 * Phase Beta — shared helper to write an editorial voice signal.
 * Lives here (in the action layer) rather than the candidate layer
 * because it depends on identifying the actor + reading the candidate
 * row + its run for the season id. Errors are swallowed; the signal
 * is best-effort telemetry.
 */
async function captureVoiceSignalForAction(args: {
  candidateId: string
  signalType: "accept" | "reject" | "promote" | "save_for_later"
  note?: string | null
  actorId?: string | null
}): Promise<void> {
  try {
    const { captureVoiceSignal, buildSnapshotFromCandidate } = await import(
      "@/lib/discovery/alpha/voice-fingerprint"
    )
    const cand = await getCandidate(args.candidateId)
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
    await captureVoiceSignal({
      seasonId,
      candidateId: args.candidateId,
      signalType: args.signalType,
      snapshot,
      note: args.note ?? null,
      actorId: args.actorId ?? null,
    })
  } catch (err) {
    // Never block the user flow on fingerprint write failures.
    console.warn(
      "[discovery] voice-fingerprint capture failed:",
      err instanceof Error ? err.message : err,
    )
  }
}

/**
 * Phase 6 promotion: derive identity hints from candidate evidence,
 * call ensureGuest, build a profile, link the candidate, stamp the
 * candidate. If matching is uncertain, returns requires_review with a
 * clean reason chain so the admin can confirm before merging.
 *
 * Force-create flag bypasses the requires_review gate when the admin
 * has confirmed the candidate is a new person.
 */
export async function promoteCandidateAction(
  id: string,
  options: {
    forceCreate?: boolean
    guestId?: string | null
    /**
     * Optional EIR id. When supplied, the discovery → khat-map bridge
     * also attaches the promoted guest to the EIR's source episode
     * candidate so the season-level convert-to-preparation flow can
     * proceed without manual data entry.
     */
    eirId?: string | null
  } = {},
): Promise<
  Result<{
    ok: true
    guest_id: string
    created: boolean
    confidence: string
    requires_review: boolean
    reasons: string[]
    bridge: {
      khat_guest_candidate_id: string | null
      khat_guest_candidate_created: boolean
      attached_to_episode: boolean
    }
  }>
> {
  const user = await requireAdmin()
  try {
    const cand = await getCandidate(id)
    if (!cand) return { success: false, error: "candidate not found" }

    // Phase Beta — capture "promote" as the strongest editorial voice
    // signal. We fire-and-forget BEFORE the heavy promote work so the
    // signal lands even if the bridge step downstream errors.
    void captureVoiceSignalForAction({
      candidateId: id,
      signalType: "promote",
      actorId: user.id,
    })

    // Caller supplied a guest_id — link directly without a name search.
    if (options.guestId) {
      await setCandidateStatus(id, "promoted", { promoted_guest_id: options.guestId })
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
      revalidatePath("/admin/discovery")
      if (options.eirId) {
        revalidatePath(`/admin/khat-brain/episodes/${options.eirId}`)
      }
      return {
        success: true,
        data: {
          ok: true,
          guest_id: options.guestId,
          created: false,
          confidence: "manual",
          requires_review: false,
          reasons: ["admin supplied guest_id"],
          bridge: {
            khat_guest_candidate_id: manualBridge.khat_guest_candidate_id,
            khat_guest_candidate_created: manualBridge.khat_guest_candidate_created,
            attached_to_episode: manualBridge.attached_to_episode,
          },
        },
      }
    }

    const hints = identityHintsFromCandidate(cand)

    const result = await ensureGuest(hints, {
      acceptance: options.forceCreate ? "create_on_low" : "auto",
    })
    if (result.requires_review) {
      return {
        success: false,
        error:
          `match requires review (confidence=${result.confidence}): ` +
          result.reasons.join(" · "),
      }
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
        result.confidence === "high" ? 1.0 : result.confidence === "medium" ? 0.7 : 0.4,
    })
    await setCandidateStatus(id, "promoted", { promoted_guest_id: result.guest_id })

    // Bridge into the Khat Map editorial wizard so the promoted guest
    // is usable by convert-to-preparation. Idempotent — reuses an
    // existing khat_map_guest_candidate for (season, guest) if present.
    const bridge = await bridgeDiscoveryToKhatMap({
      discoveryCandidateId: id,
      globalGuestId: result.guest_id,
      eirId: options.eirId ?? null,
    })

    revalidatePath("/admin/discovery")
    revalidatePath("/admin/guests")
    if (options.eirId) {
      revalidatePath(`/admin/khat-brain/episodes/${options.eirId}`)
    }
    return {
      success: true,
      data: {
        ok: true,
        guest_id: result.guest_id,
        created: result.created,
        confidence: result.confidence,
        requires_review: false,
        reasons: result.reasons,
        bridge: {
          khat_guest_candidate_id: bridge.khat_guest_candidate_id,
          khat_guest_candidate_created: bridge.khat_guest_candidate_created,
          attached_to_episode: bridge.attached_to_episode,
        },
      },
    }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "خطأ" }
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
