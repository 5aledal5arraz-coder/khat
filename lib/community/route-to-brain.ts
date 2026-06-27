/**
 * Route an approved community contribution into Khat Brain — the bridge that
 * turns visitor input into a real production artifact, closing the dead-end:
 *   guest    → a guest candidate (casting funnel)
 *   topic    → an operator-approved market signal
 *   question → an "idea" EIR carrying the question in suggested_questions
 *   concept  → an "idea" EIR seeded from the concept
 *   improvement → review-only (no Khat Brain target)
 *
 * Idempotent: a contribution is routed once (status flips to "routed").
 */

import { getCommunityContributionById, updateCommunityContribution } from "./queries"
import { notifyContributionOutcome } from "./notify"
import { communityRef } from "@/lib/community-ref"
import { logActivity } from "@/lib/crm"
import { createCandidate } from "@/lib/guest-candidates/queries"
import { createManualSignal } from "@/lib/market-intelligence/manual-signals"
import { createEpisodeIntelligenceRecord } from "@/lib/eir"
import type { ManualSignalKind } from "@/lib/db/schema/market-intelligence"

export interface RouteResult {
  ok: boolean
  reason?: "not_found" | "already_routed" | "not_routable" | "downstream_error"
  routed_kind?: string
  routed_id?: string | null
  message?: string
}

const URL_RE = /https?:\/\/[^\s,؛]+/g

export async function routeContribution(id: string, actorId?: string | null): Promise<RouteResult> {
  const c = await getCommunityContributionById(id)
  if (!c) return { ok: false, reason: "not_found" }
  if (c.status === "routed" && c.routed_kind) {
    return { ok: true, reason: "already_routed", routed_kind: c.routed_kind, routed_id: c.routed_id }
  }

  const actor = actorId ?? "system:community"
  const ref = c.reference || communityRef(c.id)
  const detailText = Object.values(c.details || {})
    .filter((v): v is string => typeof v === "string")
    .join(" ")
  const urls = `${c.body} ${detailText}`.match(URL_RE) ?? []

  let routed_kind: string
  let routed_id: string | null = null

  try {
    switch (c.type) {
      case "guest": {
        const cand = await createCandidate(
          {
            full_name: c.title.slice(0, 200),
            bio: c.body,
            notes_internal: `اقتراح من مجتمع خط (${ref})\n${c.body}${detailText ? `\n${detailText}` : ""}`,
            source_type: "community_contribution",
            source_note: `اقتراح من مجتمع خط — ${ref}`,
            social_links: urls.slice(0, 5).map((url) => ({ platform: "website", url })),
          },
          actor,
        )
        routed_kind = "guest_candidate"
        routed_id = cand.id
        break
      }
      case "topic": {
        const res = await createManualSignal(
          {
            title: c.title.slice(0, 200),
            summary: c.body,
            manual_kind: "other" as ManualSignalKind,
            source_link: urls[0] || null,
            operator_notes: `من مجتمع خط — ${ref}`,
          },
          { actorId: actor },
        )
        if (!res.ok) {
          // A duplicate just means the signal already exists — treat as routed.
          if (res.error !== "duplicate_signal") return { ok: false, reason: "downstream_error", message: res.message }
        }
        routed_kind = "market_signal"
        routed_id = res.ok ? res.data.signal_id : null
        break
      }
      case "question": {
        const eir = await createEpisodeIntelligenceRecord({
          working_title: `سؤال مجتمع: ${c.title}`.slice(0, 160),
          phase: "idea",
          editorial_intent: {
            suggested_questions: [c.title],
            description: c.body,
            source: "manual",
            source_id: c.id,
          },
          created_by: actor,
        })
        routed_kind = "eir"
        routed_id = eir.id
        break
      }
      case "concept": {
        const eir = await createEpisodeIntelligenceRecord({
          working_title: c.title.slice(0, 160),
          phase: "idea",
          editorial_intent: {
            hook: c.body,
            description: c.body,
            source: "manual",
            source_id: c.id,
          },
          created_by: actor,
        })
        routed_kind = "eir"
        routed_id = eir.id
        break
      }
      default:
        return { ok: false, reason: "not_routable" }
    }
  } catch (err) {
    return { ok: false, reason: "downstream_error", message: err instanceof Error ? err.message : String(err) }
  }

  await updateCommunityContribution(id, {
    status: "routed",
    routed_kind,
    routed_id,
    routed_at: new Date().toISOString(),
  })
  await logActivity("community", id, {
    type: "routed_to_brain",
    summary: `وُجّهت إلى خط برين: ${ROUTE_LABEL[routed_kind] || routed_kind}`,
    actor,
    metadata: { routed_kind, routed_id },
  })

  // Tell the contributor their idea reached production (once, if they left an email).
  void notifyContributionOutcome(c, "routed")

  return { ok: true, routed_kind, routed_id }
}

const ROUTE_LABEL: Record<string, string> = {
  guest_candidate: "مرشّح ضيف",
  market_signal: "إشارة سوق",
  eir: "فكرة حلقة",
}
