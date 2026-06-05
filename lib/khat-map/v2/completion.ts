/**
 * Intelligent completion — missing-role detection for Khat Map v2.
 *
 * Derives, from the admin's accepted pool, which of the five must-include
 * editorial roles are still open. The completion banner surfaces when
 * `target - accepted ≤ 2` and the auto-fill generator consumes this list
 * to prompt the LLM for cards that fill specific gaps.
 *
 * Role definitions mirror the Khat constitution's must-include rules
 * (see lib/khat-map/constitution.ts). Detection is intentionally generous
 * — a signature-emotional episode counts for both axes — to avoid
 * surfacing false gaps when the admin has already covered a theme via
 * a related candidate.
 */

import type {
  KhatMapEpisodeCandidate,
  KhatMapEpisodeType,
  KhatMapRiskLevel,
  KhatMapTopicDomain,
} from "@/types/khat-map"

export type KhatMapMustIncludeRole =
  | "emotional"
  | "controversial"
  | "kuwait"
  | "personal"
  | "signature"

export const ALL_ROLES: KhatMapMustIncludeRole[] = [
  "emotional",
  "controversial",
  "kuwait",
  "personal",
  "signature",
]

export const ROLE_LABEL_AR: Record<KhatMapMustIncludeRole, string> = {
  emotional: "عاطفية",
  controversial: "جريئة",
  kuwait: "كويتية",
  personal: "قصة شخصية",
  signature: "خط موقّعة",
}

/**
 * Prompt-ready descriptor. Passed to the LLM when auto-filling so it
 * understands what "fills this role" actually means at Khat.
 */
export const ROLE_DESCRIPTOR: Record<KhatMapMustIncludeRole, string> = {
  emotional:
    "حلقة ذات ثقل عاطفي عالي — تتناول مشاعر داخلية، علاقات، فقد، أمومة/أبوّة، أو تحولات نفسية. استخدم topic_domain من: emotions_inner_life | relationships | parenting — أو episode_type='psychological'.",
  controversial:
    "حلقة جريئة/مثيرة للجدل — تلمس تابوهات اجتماعية أو دينية أو سياسية باحترام. risk_level يجب أن يكون 'bold' أو 'highly_sensitive' — أو episode_type='controversial'.",
  kuwait:
    "حلقة بصلة كويتية/خليجية واضحة — ذاكرة وطنية، شخصية كويتية، حدث محلي. استخدم topic_domain='kuwait_gulf' أو episode_type='national'.",
  personal:
    "قصة شخصية مؤثّرة — حلقة يحمل الضيف فيها تجربة فريدة غير قابلة للنسخ. استخدم episode_type='personal_story' أو 'inspirational'.",
  signature:
    "حلقة توقيع خط — موضوع فكري عميق يمكن لخط حمله بدرجة تفرّد عالية. استخدم episode_type='signature_khat'.",
}

/**
 * Predicate set — each returns true when the candidate satisfies the
 * role. Kept separate from the detector so tests can target them.
 */
const ROLE_PREDICATES: Record<
  KhatMapMustIncludeRole,
  (t: Pick<KhatMapEpisodeCandidate, "episode_type" | "topic_domain" | "risk_level">) => boolean
> = {
  signature: (t) => t.episode_type === "signature_khat",
  personal: (t) =>
    t.episode_type === "personal_story" || t.episode_type === "inspirational",
  kuwait: (t) =>
    t.episode_type === "national" ||
    (t.topic_domain as KhatMapTopicDomain) === "kuwait_gulf",
  controversial: (t) =>
    t.episode_type === "controversial" ||
    t.risk_level === ("bold" as KhatMapRiskLevel) ||
    t.risk_level === ("highly_sensitive" as KhatMapRiskLevel),
  emotional: (t) => {
    const d = t.topic_domain as KhatMapTopicDomain
    return (
      t.episode_type === ("psychological" as KhatMapEpisodeType) ||
      d === "emotions_inner_life" ||
      d === "relationships" ||
      d === "parenting"
    )
  },
}

export function detectSatisfiedRoles(
  accepted: Array<Pick<KhatMapEpisodeCandidate, "episode_type" | "topic_domain" | "risk_level">>,
): Set<KhatMapMustIncludeRole> {
  const out = new Set<KhatMapMustIncludeRole>()
  for (const t of accepted) {
    for (const role of ALL_ROLES) {
      if (ROLE_PREDICATES[role](t)) out.add(role)
    }
  }
  return out
}

export function detectMissingRoles(
  accepted: Array<Pick<KhatMapEpisodeCandidate, "episode_type" | "topic_domain" | "risk_level">>,
): KhatMapMustIncludeRole[] {
  const satisfied = detectSatisfiedRoles(accepted)
  return ALL_ROLES.filter((r) => !satisfied.has(r))
}

/**
 * Prioritize missing roles when we can only fill N slots. Order reflects
 * the constitution's emphasis (signature first — it's the backbone;
 * emotional + personal next because they carry the show's voice; then
 * kuwait; controversial last because it's easiest to swap in later).
 */
const ROLE_PRIORITY: KhatMapMustIncludeRole[] = [
  "signature",
  "emotional",
  "personal",
  "kuwait",
  "controversial",
]

export function prioritizeMissingRoles(
  missing: KhatMapMustIncludeRole[],
  max: number,
): KhatMapMustIncludeRole[] {
  const ordered = ROLE_PRIORITY.filter((r) => missing.includes(r))
  return ordered.slice(0, Math.max(0, max))
}

/**
 * Build the prompt hint the batch engine injects when the caller wants
 * to fill specific roles. Each line names the role + its descriptor;
 * the engine's system prompt then binds them to specific cards.
 */
export function buildRoleHintBlock(
  roles: KhatMapMustIncludeRole[],
): string {
  if (roles.length === 0) return ""
  const lines = roles.map(
    (r, i) => `  ${i + 1}. ${ROLE_LABEL_AR[r]} — ${ROLE_DESCRIPTOR[r]}`,
  )
  return [
    "## Required role coverage (CRITICAL)",
    "You MUST return exactly one card per role below — in order. Each card must independently satisfy its role's predicate. If you cannot fill a role credibly, return a best-effort card and note the gap in editorial_score (e.g. 6 instead of 9).",
    ...lines,
  ].join("\n")
}
