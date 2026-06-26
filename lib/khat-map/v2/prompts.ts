/**
 * Prompt builders for the Khat Map v2 batch + guest-first engines.
 *
 * All three prompts share the Khat editorial constitution so the
 * identity of the show stays consistent across v1 and v2. Each returns
 * a plain string — no I/O — which keeps the LLM wrappers trivial to
 * swap out in tests.
 */

import { khatConstitutionPrompt } from "@/lib/khat-map/core/constitution"
import type {
  KhatMapTopicDomain,
  KhatMapUserTasteProfile,
} from "@/types/khat-map"
import type {
  CandidateGenInput,
  GuestAnalyzeInput,
  GuestAnchoredTopicsInput,
} from "./types"

// ─── Shared output contract (kept in one place) ──────────────────────────────

const TOPIC_FIELDS = `{
    "working_title": string (Arabic, concise),
    "hook": string,
    "why_matters": string,
    "why_now": string,
    "goal": string,
    "description": string,
    "episode_type": one of "intellectual"|"social"|"psychological"|"personal_story"|"national"|"historical"|"economic"|"controversial"|"inspirational"|"mass_audience"|"signature_khat"|"invasion",
    "topic_domain": one of "philosophy"|"psychology"|"relationships"|"religion"|"identity_masculinity"|"money_career"|"technology_ai"|"internet_culture"|"crime_mystery"|"hidden_history"|"power_manipulation"|"parenting"|"kuwait_gulf"|"historical"|"social_issues"|"modern_society"|"emotions_inner_life"|"none",
    "topic_angle_code": string | null,
    "main_axes": string[],
    "suggested_questions": string[],
    "risk_level": "safe"|"medium"|"bold"|"highly_sensitive",
    "effort_level": "easy"|"medium"|"hard"|"requires_special",
    "sponsor_appeal": "low"|"medium"|"high"
  }`

const GUEST_FIELDS = `{
    "full_name": string,
    "display_name": string | null,
    "bio": string,
    "gender": "male" | "female" | "unknown",
    "profession": string | null,
    "why_fit": string,
    "category": string | null,
    "country": string | null,
    "city": string | null,
    "social_accounts": { ... structured keys: twitter, instagram, youtube, tiktok, linkedin, facebook, snapchat },
    "official_website": string | null,
    "relevance_score": number (0-10),
    "depth_score": number (0-10),
    "reach_score": number (0-10)
  }`

const CANDIDATE_SHAPE_FOOTER = `,
  "editorial_score": number (0-10 — your overall confidence this is a great Khat card),
  "why_now": string (≤ 16 words, Arabic, suitable for UI top-of-card),
  "domain_reasoning": string | null (optional: one line explaining domain choice)
}`

/**
 * Build the CANDIDATE_SHAPE contract for a given phase. In Phase A
 * (`"topics"`) the contract pins `guest` to `null` to suppress guest
 * suggestions entirely — guest discovery happens in Phase B per-episode.
 * In legacy / Phase B (`"guests"`) callers get the original
 * topic+optional-guest shape.
 */
function buildCandidateShape(phase: "topics" | "guests"): string {
  if (phase === "topics") {
    return `{
  "topic": ${TOPIC_FIELDS},
  "guest": null${CANDIDATE_SHAPE_FOOTER}`
  }
  return `{
  "topic": ${TOPIC_FIELDS},
  "guest": null | ${GUEST_FIELDS}${CANDIDATE_SHAPE_FOOTER}`
}

const CANDIDATE_SHAPE = buildCandidateShape("guests")

// ─── Batch engine prompt ─────────────────────────────────────────────────────

export function buildBatchSystemPrompt(
  input: CandidateGenInput,
): string {
  const rejected = input.rejected_titles.length
    ? input.rejected_titles.slice(0, 20).map((t) => `  · ${t}`).join("\n")
    : "  (no rejections yet)"
  const rejectedReasons = input.rejected_reason_categories.length
    ? Array.from(new Set(input.rejected_reason_categories))
        .slice(0, 10)
        .map((r) => `  · ${r}`)
        .join("\n")
    : "  (none)"
  const taste = formatTasteHints(input.taste_profile)
  const loadedDomains = Object.entries(input.accepted_domain_counts)
    .filter(([, n]) => n > 0)
    .map(([d, n]) => `  · ${d}: ${n}`)
    .join("\n") || "  (none accepted yet)"
  const alreadyChosen = input.accepted_titles.length
    ? input.accepted_titles.slice(0, 30).map((t) => `  · ${t}`).join("\n")
    : "  (none yet)"

  const controlBlocks = renderEditorialControlBlocks(input.editorial_controls)
  // Phase A/B redesign — Phase A is topics-only. We pin guest fields to
  // null in the contract AND tell the model upfront so it doesn't waste
  // tokens producing guest detail we throw away.
  const phase = input.phase ?? "guests"
  const candidateShape = buildCandidateShape(phase)
  const phaseRule =
    phase === "topics"
      ? "4. PHASE A — TOPICS ONLY. Always emit `\"guest\": null` for every card. Do NOT propose any guest. Guest discovery happens in a dedicated Phase B step against each finalized topic."
      : "4. Every topic needs a plausible guest unless 'guest': null is genuinely better (e.g. a historical essay episode). Don't invent celebrities or URLs you can't verify from the brief."

  return [
    khatConstitutionPrompt(input.invasion_policy),
    "",
    "## Your role (batch proposer)",
    phase === "topics"
      ? `You are producing ONE BATCH of ${input.target_count} distinct TOPIC proposals (no guests) for a Khat season. The admin will review each topic individually and accept or reject. Your job is to give them a diverse, high-signal batch — no repeats, no near-misses to past rejections, no weak filler. Guests are out of scope for this call.`
      : `You are producing ONE BATCH of ${input.target_count} distinct topic+guest proposals for a Khat season. The admin will review each card individually and accept or reject. Your job is to give them a diverse, high-signal batch — no repeats, no near-misses to past rejections, no weak filler.`,
    "",
    "## Season state",
    `Target length: ${input.season_target} episodes.`,
    "Already accepted by domain:",
    loadedDomains,
    "",
    "## Already chosen for this season (DO NOT duplicate or paraphrase these)",
    "These topics are already locked into the season (operator-seeded and/or accepted). Propose topics that are clearly DIFFERENT — different subject, angle, and framing. Fill the GAPS around these, and keep the season varied.",
    alreadyChosen,
    "",
    "## Negative memory (DO NOT repeat or paraphrase these)",
    rejected,
    "",
    "Rejection reason categories (signals about admin's preferences):",
    rejectedReasons,
    "",
    "## Admin taste profile",
    taste,
    ...controlBlocks.flatMap((b) => ["", b]),
    "",
    "## Ironclad rules",
    "1. NEVER propose a topic that is a paraphrase, near-duplicate, or obvious variant of any title in 'Already chosen', 'Negative memory', OR 'Hard avoid'. If in doubt, pick a different angle.",
    "2. Diversify episode_type AND topic_domain across this batch — no more than 2 of either.",
    "3. Honor the constitution's must-include rules across the SEASON (not every batch). Pull from under-represented editorial roles when possible.",
    phaseRule,
    "5. Set `editorial_score` honestly — this drives ranking. Use the full 0-10 range; don't give everything a 7.",
    "6. Respect the `Editorial controls` block above with the same weight as the constitution itself. Disabled domains MUST NOT appear; banned topics/guests MUST NOT appear; guest filters MUST be honored.",
    "7. Output JSON only — a top-level array of exactly the requested number of candidates. No prose outside the array.",
    "",
    "## Output contract",
    `Array<${candidateShape}>`,
    // Mode-specific hints (strict angle bank, required roles) rendered
    // by the orchestrator. These stack AFTER the output contract so the
    // last instructions the model sees are the most binding.
    ...(input.extra_system_blocks ?? []).flatMap((b) => (b ? ["", b] : [])),
  ].join("\n")
}

/**
 * Render per-season editorial controls into prompt-ready blocks. Empty
 * blocks are omitted so the LLM doesn't waste attention on no-op headers.
 * The renderer is shared between the batch prompt and the guest-anchored
 * prompt to keep behavior identical.
 */
export function renderEditorialControlBlocks(
  controls: import("@/types/khat-map").KhatMapEditorialControls,
): string[] {
  const blocks: string[] = []

  // 1. Identity override — augments (does not replace) the constitution.
  const idOverride = controls.identity_override
  if (
    idOverride.priorities.length > 0 ||
    idOverride.identity_description ||
    Object.keys(idOverride.tone_emphasis).length > 0
  ) {
    const lines: string[] = ["## Editorial controls — Identity override"]
    if (idOverride.identity_description) {
      lines.push(`Season identity addendum: ${idOverride.identity_description}`)
    }
    if (idOverride.priorities.length > 0) {
      lines.push("Extra priorities (apply alongside constitution priorities):")
      for (const p of idOverride.priorities.slice(0, 8)) lines.push(`  · ${p}`)
    }
    const tone = idOverride.tone_emphasis
    if (Object.keys(tone).length > 0) {
      const toneBits: string[] = []
      if (typeof tone.depth === "number")
        toneBits.push(`depth=${tone.depth.toFixed(2)}`)
      if (typeof tone.controversy === "number")
        toneBits.push(`controversy=${tone.controversy.toFixed(2)}`)
      if (typeof tone.emotional === "number")
        toneBits.push(`emotional=${tone.emotional.toFixed(2)}`)
      lines.push(
        `Tone emphasis (0=avoid, 0.5=neutral, 1=lean into): ${toneBits.join(", ")}`,
      )
    }
    blocks.push(lines.join("\n"))
  }

  // 2. Domain weights — explicit signal about which domains the admin
  //    wants more / less of, plus any disabled domains.
  const weights = controls.domain_weights ?? {}
  const high: string[] = []
  const low: string[] = []
  const disabled: string[] = []
  for (const [d, w] of Object.entries(weights)) {
    if (w === 0) disabled.push(d)
    else if (w === 1) low.push(d)
    else if (w === 3) high.push(d)
  }
  if (high.length || low.length || disabled.length) {
    const lines: string[] = ["## Editorial controls — Domain preferences"]
    if (high.length) lines.push(`Lean INTO (weight 3): ${high.join(", ")}`)
    if (low.length) lines.push(`Lean AWAY (weight 1): ${low.join(", ")}`)
    if (disabled.length)
      lines.push(
        `DISABLED — never propose any card in these domains: ${disabled.join(", ")}`,
      )
    blocks.push(lines.join("\n"))
  }

  // 3. Hard avoid — banned topics, banned guests, repeated subjects.
  const ha = controls.hard_avoid
  const totalAvoid =
    ha.banned_topics.length +
    ha.banned_guests.length +
    ha.repeated_topics_to_avoid.length
  if (totalAvoid > 0) {
    const lines: string[] = [
      "## Editorial controls — Hard avoid (MUST NOT propose)",
    ]
    if (ha.banned_topics.length) {
      lines.push("Banned topics:")
      for (const t of ha.banned_topics.slice(0, 20)) lines.push(`  · ${t}`)
    }
    if (ha.banned_guests.length) {
      lines.push("Banned guest names:")
      for (const g of ha.banned_guests.slice(0, 20)) lines.push(`  · ${g}`)
    }
    if (ha.repeated_topics_to_avoid.length) {
      lines.push("Subjects repeated too often (skip variants):")
      for (const r of ha.repeated_topics_to_avoid.slice(0, 20))
        lines.push(`  · ${r}`)
    }
    blocks.push(lines.join("\n"))
  }

  // 4. Guest filter — HARD constraint. The post-LLM editorial-filter layer
  //    drops violators strictly (strict-on-unknown), so any card whose
  //    guest doesn't match is wasted tokens. Tell the model up front and
  //    instruct it to emit `guest: null` rather than guessing.
  const gf = controls.guest_filters
  if (gf.gender !== "all" || gf.nationality !== "any") {
    const bits: string[] = []
    if (gf.gender !== "all")
      bits.push(`gender MUST be exactly "${gf.gender}" (no "unknown")`)
    if (gf.nationality === "kuwaiti")
      bits.push(`country MUST be Kuwait — "الكويت" / "Kuwait" / "Kuwaiti"`)
    else if (gf.nationality === "non_kuwaiti")
      bits.push(`country MUST be set AND MUST NOT be Kuwait`)
    blocks.push(
      [
        "## Editorial controls — Guest filter (STRICT HARD RULE)",
        `Apply to every proposed guest: ${bits.join("; ")}.`,
        "If you cannot confidently produce a guest that satisfies ALL of the above for a given topic, set `guest: null` for that card. Do NOT guess gender or nationality just to fill the slot — guesses will be dropped by the post-LLM filter and the candidate will go to waste.",
      ].join("\n"),
    )
  }

  return blocks
}

export function buildBatchUserPrompt(input: CandidateGenInput): string {
  return [
    `Produce ${input.target_count} candidates for season ${input.season_id}.`,
    `Oversample — the ranker will keep the best ones. Prioritize novelty vs. the rejection memory and balance against the accepted domain counts above.`,
    `Respond with a JSON array only.`,
  ].join("\n")
}

// ─── Guest analysis prompt ───────────────────────────────────────────────────

export function buildGuestAnalyzeSystemPrompt(): string {
  return [
    "You are a senior editorial analyst for Khat Podcast.",
    "Given an admin's free-form description of a prospective guest — name plus any combination of bio, social links, website — infer a structured profile useful for booking decisions.",
    "",
    "Ironclad rules:",
    "1. Do NOT invent facts about the guest. If you don't know, leave the field null and drop confidence.",
    "2. If the name is clearly a public figure you recognize, you may include factual public info (profession, country) — but do NOT fabricate social handles or websites. Copy URLs only if they appear in the input.",
    "3. `expertise_domains` should be a ranked list (most credible first) drawn from the 17-domain taxonomy.",
    "4. `confidence` reflects how confidently you'd stake a booking on this profile: 0.2 is 'name only, probably a stranger', 0.8 is 'well-known with verifiable handles'.",
    "5. Output JSON only.",
    "",
    "## Output contract",
    `{
  "full_name": string,
  "display_name": string | null,
  "inferred_bio": string (2-4 sentences, Arabic),
  "profession": string | null (short Arabic label),
  "gender": "male" | "female" | "unknown",
  "country": string | null,
  "city": string | null,
  "expertise_domains": KhatMapTopicDomain[] (subset of the 17-domain taxonomy, ranked),
  "editorial_angle": string (one-line Arabic — why Khat should book them),
  "confidence": number (0-1),
  "social_accounts": { twitter?, instagram?, youtube?, tiktok?, linkedin?, facebook?, snapchat? } (ONLY copy verified URLs from the input — otherwise omit),
  "official_website": string | null (ONLY if present in input)
}`,
  ].join("\n")
}

export function buildGuestAnalyzeUserPrompt(input: GuestAnalyzeInput): string {
  const lines = [`Guest name: ${input.full_name}`]
  if (input.bio) lines.push(`Admin-provided bio: ${input.bio}`)
  if (input.official_website)
    lines.push(`Admin-provided website: ${input.official_website}`)
  const socials = Object.entries(input.social_accounts).filter(
    ([k, v]) => k !== "other" && typeof v === "string" && v.trim().length > 0,
  )
  if (socials.length > 0) {
    lines.push("Admin-provided social links:")
    for (const [platform, url] of socials) {
      lines.push(`  ${platform}: ${url}`)
    }
  }
  lines.push("", "Produce the structured profile JSON.")
  return lines.join("\n")
}

// ─── Guest-anchored topic generation prompt ──────────────────────────────────

export function buildGuestAnchoredSystemPrompt(
  input: GuestAnchoredTopicsInput,
): string {
  const taste = formatTasteHints(input.taste_profile)
  const rejected = input.rejected_titles.length
    ? input.rejected_titles.slice(0, 15).map((t) => `  · ${t}`).join("\n")
    : "  (none)"
  const controlBlocks = renderEditorialControlBlocks(input.editorial_controls)
  return [
    khatConstitutionPrompt("optional"),
    "",
    "## Your role (guest-anchored angle generator)",
    `The admin has pointed at a specific prospective guest. Your job is to produce ${input.angle_count} Khat-grade topic angles that leverage THIS GUEST'S expertise — not generic topics. Every angle must plausibly match the guest's public substance.`,
    "",
    "## Guest profile",
    `Name: ${input.guest_profile.full_name}`,
    input.guest_profile.profession
      ? `Profession: ${input.guest_profile.profession}`
      : "",
    `Expertise domains (ranked): ${input.guest_profile.expertise_domains.join(", ")}`,
    `Editorial angle: ${input.guest_profile.editorial_angle}`,
    `Confidence: ${input.guest_profile.confidence.toFixed(2)}`,
    "",
    "## Negative memory (DO NOT repeat)",
    rejected,
    "",
    "## Admin taste",
    taste,
    ...controlBlocks.flatMap((b) => ["", b]),
    "",
    "## Ironclad rules",
    "1. Every angle MUST lean on the guest's expertise. A topic they can't credibly carry is a failed card.",
    "2. Pick topic_domain from the guest's ranked expertise list when possible; venturing outside is allowed only if it produces a stronger editorial angle.",
    "3. Attach the same guest object to every candidate — the UI will render all N cards sharing this one guest.",
    "4. Honor negatives + Editorial controls strictly — do not paraphrase rejected titles, do not propose disabled/banned topics.",
    "5. Output JSON only — a top-level array of exactly the requested count.",
    "",
    "## Output contract",
    `Array<${CANDIDATE_SHAPE}>`,
  ].filter(Boolean).join("\n")
}

export function buildGuestAnchoredUserPrompt(
  input: GuestAnchoredTopicsInput,
): string {
  return `Produce ${input.angle_count} guest-anchored angles. Respond with a JSON array only.`
}

// ─── Taste hint formatter ────────────────────────────────────────────────────

function formatTasteHints(taste: KhatMapUserTasteProfile): string {
  if (taste.total_decisions === 0) {
    return "  (new user — no signal yet; aim for balanced, canonical Khat cards)"
  }
  const lines: string[] = []
  lines.push(`  · decisions recorded: ${taste.total_decisions}`)
  const loved = taste.preferred_domains
    .filter((d) => d.weight > 0.6)
    .slice(0, 4)
    .map((d) => `${d.domain} (${d.weight.toFixed(2)})`)
  const avoided = taste.preferred_domains
    .filter((d) => d.weight < 0.4)
    .slice(0, 4)
    .map((d) => `${d.domain} (${d.weight.toFixed(2)})`)
  if (loved.length) lines.push(`  · leans toward: ${loved.join(", ")}`)
  if (avoided.length) lines.push(`  · leans away from: ${avoided.join(", ")}`)
  lines.push(
    `  · depth: ${taste.depth_score.toFixed(2)}, controversy: ${taste.controversy_tolerance.toFixed(2)}, emotional: ${taste.emotional_preference.toFixed(2)}, kuwait: ${taste.kuwait_relevance_weight.toFixed(2)}`,
  )
  if (taste.rejected_patterns.length > 0) {
    const top = taste.rejected_patterns
      .slice(0, 3)
      .map((p) => `${p.reason_category}(${p.count})`)
    lines.push(`  · common rejection reasons: ${top.join(", ")}`)
  }
  return lines.join("\n")
}

// Helper re-exported for tests / debug tooling
export { formatTasteHints as __formatTasteHints }
export type { KhatMapTopicDomain }
