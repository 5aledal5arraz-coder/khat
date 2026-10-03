/**
 * Identity merge rules (B8) and alias handling (B9).
 *
 * Names are candidate keys, not identities. An extracted guest is linked to an
 * EXISTING person only on a safe rule; otherwise a NEW person is created and
 * both are flagged `needs_identity_review`. Duplicate fragmentation is
 * acceptable in M1; a false merge is not (B18).
 *
 * Safe auto-link implemented in M1:
 *   Case C — exactly one existing person with the exact normalized full name,
 *            a name of at least three tokens (a two-token name may be common),
 *            who already appeared on the SAME channel with the IDENTICAL
 *            DISTINGUISHING role/descriptor (generic «ضيف»/"guest" does not count), and no conflicting nationality
 *            geography or gender signal.
 * Not automatic in M1 (no independent identifier exists in title/description
 * metadata): Case A (internal Khat identity) and Case B (verified profile /
 * Wikidata / employer). Those are the admin «ربط بضيف خط» / merge actions.
 *
 * The nationality comparison reuses discovery-v2's `geographyOfNationality`
 * (Kuwait / Saudi / rest of Gulf / other) — the same rule its Wikidata
 * namesake check uses to call two people different.
 */
import { geographyOfNationality } from "@/lib/discovery-v2/story-evidence"
import type { PodcastGenderMarker } from "@/lib/db/schema/podcast-universe"
import { nameTokenCount, normalizeText } from "./normalize"

/** ISO code → a word geographyOfNationality understands. */
const CODE_TO_WORD: Record<string, string> = {
  KW: "kuwait",
  SA: "saudi",
  AE: "emirates",
  BH: "bahrain",
  QA: "qatar",
  OM: "oman",
}

export function geographyOfCode(code: string | null | undefined): string | null {
  if (!code) return null
  return geographyOfNationality(CODE_TO_WORD[code.toUpperCase()] ?? code) ?? null
}

export interface CandidateGuest {
  nameKey: string
  channelId: string
  role: string | null
  nationalityCode: string | null
  gender: PodcastGenderMarker
}

export interface ExistingPerson {
  id: string
  nameKey: string
  nationalityCode: string | null
  genderMarker: PodcastGenderMarker
  appearances: Array<{
    channelId: string
    role: string | null
    nationalityCode: string | null
    gender: PodcastGenderMarker
  }>
}

export type LinkDecision =
  | { action: "link"; personId: string; rule: "case_c_same_channel_role" }
  | { action: "create"; review: false }
  | { action: "create"; review: true; namesakeIds: string[]; reason: string }

/**
 * Roles that describe the slot, not the person — «ضيف», "guest", «المتحدث».
 * Two namesakes who were both «ضيف الحلقة» share nothing that distinguishes
 * them, so these never corroborate a Case C link. Normalized form.
 */
const GENERIC_ROLE_TOKENS = new Set([
  "ضيف", "الضيف", "ضيفنا", "ضيفه", "ضيفة", "الضيفة", "ضيوف", "الحلقة", "حلقة", "حلقه", "هذه",
  "متحدث", "المتحدث", "متحدثة", "محاور", "المحاور", "شخصية", "الشخصية", "شخص", "مشارك", "المشارك",
  "guest", "the", "our", "speaker", "episode", "of", "this", "special", "featured", "person",
])

export function roleKey(role: string | null | undefined): string {
  return normalizeText(role)
}

/** The role with generic slot words removed; empty = nothing distinguishing. */
export function distinguishingRole(role: string | null | undefined): string {
  return roleKey(role)
    .split(" ")
    .filter((t) => t && !GENERIC_ROLE_TOKENS.has(t))
    .join(" ")
}

function geographiesConflict(a: Array<string | null>, b: Array<string | null>): boolean {
  const ga = new Set(a.map(geographyOfCode).filter((g): g is string => !!g))
  const gb = new Set(b.map(geographyOfCode).filter((g): g is string => !!g))
  if (ga.size === 0 || gb.size === 0) return false
  return ![...ga].some((g) => gb.has(g))
}

function gendersConflict(a: PodcastGenderMarker[], b: PodcastGenderMarker[]): boolean {
  const sa = new Set(a.filter((g) => g !== "unknown"))
  const sb = new Set(b.filter((g) => g !== "unknown"))
  if (sa.size === 0 || sb.size === 0) return false
  return ![...sa].some((g) => sb.has(g))
}

/**
 * Decide how an extracted guest maps onto existing people. Pure.
 * NEVER links on the name alone.
 */
export function decideIdentityLink(guest: CandidateGuest, existing: ExistingPerson[]): LinkDecision {
  const namesakes = existing.filter((p) => p.nameKey === guest.nameKey)
  if (namesakes.length === 0) return { action: "create", review: false }

  const ids = namesakes.map((p) => p.id)
  if (namesakes.length > 1) {
    return { action: "create", review: true, namesakeIds: ids, reason: "several people already share this name" }
  }
  const p = namesakes[0]
  if (nameTokenCount(guest.nameKey) < 3) {
    return { action: "create", review: true, namesakeIds: ids, reason: "same two-token name — may be a common name" }
  }
  const role = distinguishingRole(guest.role)
  if (!role) {
    return { action: "create", review: true, namesakeIds: ids, reason: "same name, no distinguishing role to corroborate" }
  }
  const sameChannelSameRole = p.appearances.some((a) => a.channelId === guest.channelId && distinguishingRole(a.role) === role)
  if (!sameChannelSameRole) {
    const differentRole = p.appearances.some((a) => roleKey(a.role) && roleKey(a.role) !== role)
    return {
      action: "create",
      review: true,
      namesakeIds: ids,
      reason: differentRole ? "same name, different profession/role" : "same name, insufficient corroboration",
    }
  }
  const theirNat = [p.nationalityCode, ...p.appearances.map((a) => a.nationalityCode)]
  if (geographiesConflict([guest.nationalityCode], theirNat)) {
    return { action: "create", review: true, namesakeIds: ids, reason: "same name, different nationality signal" }
  }
  const theirGender = [p.genderMarker, ...p.appearances.map((a) => a.gender)]
  if (gendersConflict([guest.gender], theirGender)) {
    return { action: "create", review: true, namesakeIds: ids, reason: "same name, conflicting gender signal" }
  }
  return { action: "link", personId: p.id, rule: "case_c_same_channel_role" }
}
