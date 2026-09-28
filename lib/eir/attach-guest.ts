/**
 * Attach a canonical guest to an EIR — the one sequence every "this guest is
 * for this episode" path runs:
 *   1. set `guest_id` on the EIR;
 *   2. walk it to `guest_assigned` when it is still in idea / guest_discovery,
 *      so preparation becomes eligible;
 *   3. bridge into Khat Map (idempotent), so the season-level convert button
 *      unblocks.
 *
 * Callers: the EIR page's assign-guest action, and the canonical-link route
 * when the candidate being linked was nominated for an episode from its
 * discovery results («رشّحه لهالحلقة»). No auth and no revalidation here —
 * both belong to the caller.
 */

import {
  getEpisodeIntelligenceRecord,
  setEpisodeIntelligenceGuest,
  type EpisodeIntelligenceRecord,
} from "@/lib/eir"
import { walkEirToPhase } from "@/lib/khat-brain"
import { bridgeDiscoveryToKhatMap } from "@/lib/discovery"

export interface AttachGuestBridge {
  khat_guest_candidate_id: string | null
  khat_guest_candidate_created: boolean
  attached_to_episode: boolean
}

export async function attachGuestToEir(input: {
  eir: Pick<EpisodeIntelligenceRecord, "id" | "phase" | "season_id">
  guestId: string
  actorId: string
  reason: string
}): Promise<AttachGuestBridge> {
  const { eir, guestId } = input
  await setEpisodeIntelligenceGuest({ eir_id: eir.id, guest_id: guestId })
  if (eir.phase === "idea" || eir.phase === "guest_discovery") {
    await walkEirToPhase({
      eirId: eir.id,
      toPhase: "guest_assigned",
      actorId: input.actorId,
      reason: input.reason,
    })
  }
  const b = await bridgeDiscoveryToKhatMap({
    globalGuestId: guestId,
    eirId: eir.id,
    seasonId: eir.season_id,
  })
  return {
    khat_guest_candidate_id: b.khat_guest_candidate_id,
    khat_guest_candidate_created: b.khat_guest_candidate_created,
    attached_to_episode: b.attached_to_episode,
  }
}

export type NominatedAssignment =
  | { status: "assigned"; eirId: string; bridge: AttachGuestBridge }
  | { status: "already_assigned"; eirId: string }
  | { status: "eir_has_other_guest"; eirId: string }
  | { status: "eir_missing"; eirId: string }

/**
 * A CRM candidate nominated for an episode («رشّحه لهالحلقة» →
 * `guest_candidates.target_eir_id`) has just been linked to canonical guest
 * `guestId`: assign that guest to the episode. Never overwrites a DIFFERENT
 * guest already on the EIR — that stays the operator's call on the EIR page.
 */
export async function assignNominatedGuestToEir(input: {
  eirId: string
  guestId: string
  actorId: string
}): Promise<NominatedAssignment> {
  const eir = await getEpisodeIntelligenceRecord(input.eirId)
  if (!eir) return { status: "eir_missing", eirId: input.eirId }
  if (eir.guest_id === input.guestId) return { status: "already_assigned", eirId: eir.id }
  if (eir.guest_id) return { status: "eir_has_other_guest", eirId: eir.id }
  const bridge = await attachGuestToEir({
    eir,
    guestId: input.guestId,
    actorId: input.actorId,
    reason: "nominated_candidate_linked",
  })
  return { status: "assigned", eirId: eir.id, bridge }
}
