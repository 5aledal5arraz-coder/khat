/**
 * Post-LLM editorial filter.
 *
 * The prompt asks the model to honor the admin's editorial controls, but
 * we don't trust it to comply 100%. This filter runs AFTER the LLM
 * returns and BEFORE we pay embedding cost. Drops anything that violates
 * a hard constraint:
 *
 *   • Disabled domains (weight = 0 in domain_weights)
 *   • Banned topics — substring match on working_title
 *   • Banned guests — substring match on guest.full_name / display_name
 *   • Repeated topics — substring match on working_title
 *   • Guest gender filter (strict — `unknown` is rejected when filter is set)
 *   • Guest nationality filter (strict — empty/unverified country is
 *     rejected when filter is set to `kuwaiti` or `non_kuwaiti`)
 *
 * Domain weight scoring (low/high) is handled in scoring.ts, not here.
 * This layer is binary: in or out.
 */

import type {
  KhatMapEditorialControls,
  KhatMapTopicDomain,
} from "@/types/khat-map"
import type { RawCandidate } from "./types"

/**
 * Country strings that count as Kuwaiti. Includes English and Arabic
 * variants plus the ISO code, since `analyzeGuest` and downstream
 * discovery sources don't normalize.
 */
const KUWAITI_COUNTRY_MARKERS = [
  "kuwait",
  "kuwaiti",
  "الكويت",
  "كويتي",
  "كويتية",
  "kw",
]

function isKuwaitiCountry(country: string): boolean {
  if (!country) return false
  const lc = country.toLowerCase().trim()
  if (!lc) return false
  return KUWAITI_COUNTRY_MARKERS.some(
    (m) => lc === m || lc.includes(m),
  )
}

export interface FilterDropReason {
  reason:
    | "disabled_domain"
    | "banned_topic"
    | "banned_guest"
    | "repeated_topic"
    | "guest_gender"
    | "guest_nationality"
}

export interface FilterResult {
  kept: RawCandidate[]
  dropped: Array<{ candidate: RawCandidate; reason: FilterDropReason["reason"] }>
}

export function applyEditorialFilters(
  candidates: RawCandidate[],
  controls: KhatMapEditorialControls,
): FilterResult {
  const kept: RawCandidate[] = []
  const dropped: FilterResult["dropped"] = []

  // Pre-compute lower-cased lookup sets for cheap substring checks.
  const bannedTopics = controls.hard_avoid.banned_topics.map((s) =>
    s.toLowerCase().trim(),
  )
  const bannedGuests = controls.hard_avoid.banned_guests.map((s) =>
    s.toLowerCase().trim(),
  )
  const repeated = controls.hard_avoid.repeated_topics_to_avoid.map((s) =>
    s.toLowerCase().trim(),
  )
  const disabledDomains = new Set<KhatMapTopicDomain>(
    Object.entries(controls.domain_weights ?? {})
      .filter(([, w]) => w === 0)
      .map(([d]) => d as KhatMapTopicDomain),
  )
  const gf = controls.guest_filters

  for (const c of candidates) {
    const title = c.topic.working_title.toLowerCase()
    const desc = (c.topic.description ?? "").toLowerCase()
    const guestName = (
      c.guest?.full_name ??
      c.guest?.display_name ??
      ""
    ).toLowerCase()
    const guestCountry = (c.guest?.country ?? "").toLowerCase().trim()

    // 1. Disabled domain
    if (disabledDomains.has(c.topic.topic_domain)) {
      dropped.push({ candidate: c, reason: "disabled_domain" })
      continue
    }

    // 2. Banned topic (substring on title or description)
    if (
      bannedTopics.length > 0 &&
      bannedTopics.some((b) => b && (title.includes(b) || desc.includes(b)))
    ) {
      dropped.push({ candidate: c, reason: "banned_topic" })
      continue
    }

    // 3. Repeated topic (substring on title — same shape as banned)
    if (
      repeated.length > 0 &&
      repeated.some((r) => r && (title.includes(r) || desc.includes(r)))
    ) {
      dropped.push({ candidate: c, reason: "repeated_topic" })
      continue
    }

    // 4. Banned guest (substring on guest name)
    if (
      guestName &&
      bannedGuests.length > 0 &&
      bannedGuests.some((b) => b && guestName.includes(b))
    ) {
      dropped.push({ candidate: c, reason: "banned_guest" })
      continue
    }

    // 5. Guest gender filter — strict on unknown.
    if (gf.gender !== "all" && c.guest) {
      if (c.guest.gender !== gf.gender) {
        // Mismatch (including `unknown`) is rejected when the filter is set.
        dropped.push({ candidate: c, reason: "guest_gender" })
        continue
      }
    }

    // 6. Nationality filter — strict on unknown. When the filter is set
    //    to a concrete value, a candidate with an empty/unverifiable
    //    country is dropped (we can't confirm they match).
    if (gf.nationality !== "any" && c.guest) {
      if (!guestCountry) {
        dropped.push({ candidate: c, reason: "guest_nationality" })
        continue
      }
      const kuwaiti = isKuwaitiCountry(guestCountry)
      if (gf.nationality === "kuwaiti" && !kuwaiti) {
        dropped.push({ candidate: c, reason: "guest_nationality" })
        continue
      }
      if (gf.nationality === "non_kuwaiti" && kuwaiti) {
        dropped.push({ candidate: c, reason: "guest_nationality" })
        continue
      }
    }

    kept.push(c)
  }

  return { kept, dropped }
}

/**
 * Per-domain weight multiplier for the scoring stage. Map weight → factor:
 *   0 → 0    (already filtered out before scoring; kept here for safety)
 *   1 → 0.7  (low-weight: lose ~30%)
 *   2 → 1.0  (neutral)
 *   3 → 1.3  (high-weight: gain ~30%)
 * Domains not present in the map default to neutral (1.0).
 */
export function domainWeightMultiplier(
  domain: KhatMapTopicDomain,
  controls: KhatMapEditorialControls,
): number {
  const w = controls.domain_weights?.[domain]
  if (w === 0) return 0
  if (w === 1) return 0.7
  if (w === 3) return 1.3
  return 1.0
}
