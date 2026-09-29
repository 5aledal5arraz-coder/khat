/**
 * Guest Discovery v2 — story evidence (gathering + the deterministic text
 * checks the scorer runs over it).
 *
 * The approved criterion (Khaled, 2026-09-26): a grounded first-hand lived
 * story outweighs fame. This module finds the text that could prove one:
 *   - live web evidence via the SHARED grounded-evidence service (Gemini +
 *     Google Search — paid, capped, logged to ai_runs, daily budget);
 *   - the free YouTube talk title/description + GDELT headline already
 *     fetched by enrich().
 * It never decides anything — story-classify.ts verifies quotes against
 * these sources and score.ts turns verified evidence into numbers.
 *
 * Also home to the geography scope (Kuwait by default, Saudi/Gulf opt-in)
 * and the lexicons the Gulf-event hook reads. The lexicons are editorial
 * constants owned by mariam/Khaled: they encode the 2 August / Gulf-hook
 * finding from the archive data, not an engineering choice.
 */

import {
  domainFromUrl,
  gatherGroundedEvidence,
  isGroundedEvidenceConfigured,
  isVertexRedirect,
} from "@/lib/ai/grounded-evidence"
import { foldVerbatim } from "@/lib/studio/verbatim"
import type {
  EnrichmentSignals,
  ProposedName,
  StoryAssessment,
  StorySource,
  V2Geography,
  V2RunInput,
  WikiFacts,
} from "./types"

// ─── Switches (read at point of use) ─────────────────────────────────────────

/** ON by default — the approved criterion is dead code otherwise. */
export function isStoryGroundingEnabled(): boolean {
  return process.env.DISCOVERY_STORY_GROUNDING !== "off" && isGroundedEvidenceConfigured()
}

const DEFAULT_STORY_MAX = 12

/** How many candidates one run may story-check — the cost lever. [0, 24]. */
export function storyMaxCandidates(): number {
  const raw = process.env.DISCOVERY_STORY_MAX_CANDIDATES
  if (raw == null || raw === "") return DEFAULT_STORY_MAX
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_STORY_MAX
  return Math.min(24, Math.floor(n))
}

/** The assessment for a person whose story was never checked (and why). */
export function notCheckedStory(
  reason: StoryAssessment["not_checked_reason"],
  claim: string | null,
): StoryAssessment {
  return {
    status: "not_checked",
    not_checked_reason: reason,
    story_type: "none",
    summary: null,
    evidence: [],
    gulf_event: null,
    claim_from_propose: claim,
  }
}

// ─── Geography ───────────────────────────────────────────────────────────────

export const GEOGRAPHY_LABEL: Record<V2Geography, string> = {
  kuwait: "الكويت",
  saudi: "السعودية",
  gulf: "بقية الخليج",
}

/**
 * The run's geography. Explicit selection wins; otherwise Kuwait only —
 * except a legacy `non_kuwaiti` nationality filter (season guest filters),
 * which would contradict a Kuwait scope, maps to Saudi + Gulf.
 */
export function resolveGeography(input: Pick<V2RunInput, "geography" | "filters">): V2Geography[] {
  const picked = (input.geography ?? []).filter(
    (g): g is V2Geography => g === "kuwait" || g === "saudi" || g === "gulf",
  )
  if (picked.length > 0) return [...new Set(picked)]
  if (input.filters?.nationality === "non_kuwaiti") return ["saudi", "gulf"]
  return ["kuwait"]
}

// Whole-word forms, matched per token after the article «ال» is stripped —
// never as substrings: "Romania" contains "oman", "Qatarat" is not Qatar.
// Bare «عمان» is deliberately absent (it is also Amman); «سلطنه عمان» is.
const NAT_KUWAIT = /^(?:kuwait|kuwaiti|kuwaitis|كويت|كويتي|كويتيه|كويتيون|كويتيين)$/
const NAT_SAUDI = /^(?:saudi|saudis|سعوديه|سعودي|سعوديون|سعوديين)$/
const NAT_GULF =
  /^(?:bahrain|bahraini|bahrainis|qatar|qatari|qataris|emirates|emirati|emiratis|uae|oman|omani|omanis|بحرين|بحريني|بحرينيه|قطر|قطري|قطريه|امارات|اماراتي|اماراتيه|عماني|عمانيه)$/

// Region / identity words that say WHERE, never WHO or WHAT: «عرب»,
// «خليجي», "arab", "gulf". Folded, article stripped.
const GEO_GENERIC = /^(?:عرب|عربي|عربيه|عربيا|العرب|خليج|خليجي|خليجيه|خليجيون|خليجيين|arab|arabs|arabic|arabian|gulf)$/

/**
 * True for a nationality / region word («الكويت», «بالكويت», «كويتي»,
 * «خليجي», "Kuwaiti", "gulf"). A place word matches nearly every
 * Kuwaiti's bio, so it can never count as a TOPIC word (X list bios —
 * «حب الكويت يجمعنا» matched a prison topic) or an OCCUPATION / ROLE word
 * (Wikidata «لاعب كرة قدم كويتي» matched a proposal «مواطن كويتي»).
 */
export function isGeoWord(token: string): boolean {
  const f = foldVerbatim(token)
  if (!f || f.includes(" ")) return false
  const forms = new Set([f])
  let t = f
  if (t.length > 3 && /^[وف]/.test(t)) forms.add((t = t.slice(1)))
  if (t.length > 3 && /^[بلك]/.test(t)) forms.add((t = t.slice(1)))
  for (const x of [...forms]) if (x.length > 4 && x.startsWith("ال")) forms.add(x.slice(2))
  return [...forms].some(
    (x) => NAT_KUWAIT.test(x) || NAT_SAUDI.test(x) || NAT_GULF.test(x) || GEO_GENERIC.test(x),
  )
}

/** A free-form nationality ("Kuwait", «كويتي», "Saudi Arabia") → scope key. */
export function geographyOfNationality(nat: string | null | undefined): V2Geography | "other" | null {
  if (!nat || !nat.trim()) return null
  const f = foldVerbatim(nat)
  if (!f) return null
  const toks = f.split(" ").map((t) => (t.length > 4 && t.startsWith("ال") ? t.slice(2) : t))
  if (toks.some((t) => NAT_KUWAIT.test(t))) return "kuwait"
  if (toks.some((t) => NAT_SAUDI.test(t))) return "saudi"
  if (toks.some((t) => NAT_GULF.test(t)) || ` ${f} `.includes(" سلطنه عمان ")) return "gulf"
  return "other"
}

// Folded forms (see foldVerbatim): hamza-alef → ا, ة → ه.
const EVENTS: Record<V2Geography, string[]> = {
  kuwait: [
    "الغزو", "الاحتلال", "التحرير", "2 اغسطس", "1990", "1991", "الاسر", "الاسرى",
    "المفقودين", "الصامدين", "المقاومه الكويتيه", "سوق المناخ", "الطفره", "الغوص",
    "السفر", "النوخذه", "حرب الخليج",
  ],
  saudi: ["جهيمان", "1979", "الطفره", "حرب الخليج", "1990", "1991"],
  gulf: ["الغوص", "النوخذه", "السفر", "الطفره", "حرب الخليج"],
}
/** Events that hook a Gulf audience whatever the scope. */
const EVENTS_COMMON = ["الحرب", "الانتفاضه", "1973"]

const PLACES: Record<V2Geography, string[]> = {
  kuwait: ["الكويت"],
  saudi: ["السعوديه", "الرياض", "جده"],
  // «سلطنه عمان», not bare «عمان» — that is also Amman.
  gulf: ["الخليج", "البحرين", "قطر", "الامارات", "سلطنه عمان"],
}

/** The seed lexicon from the spec, split by the scope it hooks. */
export function gulfEventLexicon(geo: V2Geography[]): { events: string[]; places: string[] } {
  const events = new Set(EVENTS_COMMON.map(foldVerbatim))
  const places = new Set<string>()
  for (const g of geo) {
    for (const e of EVENTS[g]) events.add(foldVerbatim(e))
    for (const p of PLACES[g]) places.add(foldVerbatim(p))
  }
  return { events: [...events], places: [...places] }
}

/** Word-bounded containment over folded text. */
function hasWord(foldedPadded: string, foldedTerm: string): boolean {
  return !!foldedTerm && foldedPadded.includes(` ${foldedTerm} `)
}
const pad = (s: string) => ` ${foldVerbatim(s)} `

/**
 * H — 1.0 when a VERIFIED quote names an event of the selected scope,
 * 0.5 when it only names a place in it, 0 otherwise. Unverified text never
 * reaches here (the caller passes verified quotes only).
 */
export function gulfHookScore(verifiedQuotes: string[], geo: V2Geography[]): number {
  if (verifiedQuotes.length === 0) return 0
  const { events, places } = gulfEventLexicon(geo)
  const hays = verifiedQuotes.map(pad)
  if (hays.some((h) => events.some((e) => hasWord(h, e)))) return 1
  if (hays.some((h) => places.some((p) => hasWord(h, p)))) return 0.5
  return 0
}

// ─── Name matching ───────────────────────────────────────────────────────────

/**
 * Folded forms that count as "names this person": each full name, plus for
 * 3+-word names the last two words and first+last word («ناصر محمد سالمين»
 * → «محمد سالمين», «ناصر سالمين»). A single word never counts on its own
 * unless the name IS one word — «ناصر» alone matches half of Kuwait.
 */
export function nameVariants(names: Array<string | null | undefined>): string[] {
  const out = new Set<string>()
  for (const n of names) {
    const f = foldVerbatim(n ?? "")
    if (!f) continue
    const toks = f.split(" ")
    out.add(f)
    if (toks.length >= 3) {
      out.add(toks.slice(-2).join(" "))
      out.add(`${toks[0]} ${toks[toks.length - 1]}`)
    }
  }
  return [...out].filter((v) => v.length >= 3)
}

export function mentionsName(text: string, variants: string[]): boolean {
  const h = pad(text)
  return variants.some((v) => hasWord(h, v))
}

// ─── Story-check order ───────────────────────────────────────────────────────

/**
 * How strongly the PROPOSAL says this person lived the topic: a first-hand
 * claim > first-hand without a concrete claim ≈ a second-hand claim >
 * adjacent > expert. A hypothesis — it only decides who gets the paid
 * check first, never a score.
 */
export function claimStrength(p: Pick<ProposedName, "story_type" | "story_claim">): number {
  const hasClaim = !!p.story_claim?.trim()
  switch (p.story_type) {
    case "first_hand":
      return hasClaim ? 1 : 0.6
    case "second_hand":
      return hasClaim ? 0.6 : 0.4
    case "adjacent":
      return hasClaim ? 0.3 : 0.2
    case "expert":
      return hasClaim ? 0.1 : 0
    default:
      return hasClaim ? 0.3 : 0
  }
}

/**
 * Topic fit read from the PROPOSAL text only (role + why + claim), bucketed
 * 0 / 0.5 / 1. Deliberately not score.ts's topicFitScore: that one also
 * reads Wikidata's occupations/description/summary, so a person with a
 * Wikidata entry simply has more text to hit — fame leaking back in.
 */
export function proposalFit(p: ProposedName, topic: string): number {
  const toks = foldVerbatim(topic).split(" ").filter((t) => t.length >= 3)
  if (toks.length === 0) return 0.5
  const hay = ` ${foldVerbatim(`${p.role ?? ""} ${p.why ?? ""} ${p.story_claim ?? ""}`)} `
  const hits = toks.filter((t) => hay.includes(t)).length
  return hits === 0 ? 0 : hits / toks.length >= 0.5 ? 1 : 0.5
}

/**
 * Topic fit of the PROPOSAL text as a continuous share of topic words
 * (0..1). The queue sorts on this rather than the 0 / 0.5 / 1 bucket: a
 * long Phase-B topic («العنوان — المجال — الخطّاف — لماذا») puts nearly
 * everyone in the 0.5 bucket, so the bucket could not tell the economist on
 * a money episode from a founder with an unrelated founding story.
 */
export function proposalFitRatio(p: ProposedName, topic: string): number {
  const toks = foldVerbatim(topic).split(" ").filter((t) => t.length >= 3)
  if (toks.length === 0) return 0.5
  const hay = ` ${foldVerbatim(`${p.role ?? ""} ${p.why ?? ""} ${p.story_claim ?? ""}`)} `
  return toks.filter((t) => hay.includes(t)).length / toks.length
}

/** Priority for the paid story check: story potential, not fame. */
export function storyCheckPriority(p: ProposedName, topic: string): number {
  return Math.round((0.8 * claimStrength(p) + 0.2 * proposalFit(p, topic)) * 100) / 100
}

/**
 * Order people for the story check (the caller slices to the cap).
 * Notability has NO weight in the key; on a tie the lesser-known person
 * goes first — not in Wikidata, then fewer Wikipedia editions — because a
 * famous person without the check still has a public record the operator
 * can read, while a witness outside Wikidata has nothing but this check.
 * Stable, so remaining ties keep the proposal's own order.
 *
 * Why (trial 2026-09-26, «الغزو العراقي للكويت»): all 24 proposals were
 * first_hand with a claim, so the old first key never discriminated and the
 * order fell to the pre-story score — N+G+Q+R, i.e. fame — leaving a brigade
 * commander and two other non-Wikidata witnesses «not_checked (cap)».
 */
export function rankForStoryCheck<T extends StoryCheckItem>(items: T[], topic: string): T[] {
  const fame = (w: WikiFacts) => (w.resolved ? 1 + (w.sitelink_count ?? 0) : 0)
  // TOPIC FIT FIRST, then claim strength (2026-09-28, run 1e88aa03): with the
  // claim leading, every confident first-hand claim outranked a topical
  // expert whatever the claim was ABOUT — founders' founding stories took the
  // cap on a family-money episode and the economists were never checked.
  return items
    .map((x, i) => ({
      x,
      i,
      dead: cueRank(x),
      fit: proposalFitRatio(x.p, topic),
      claim: claimStrength(x.p),
      fame: fame(x.wiki),
    }))
    .sort((a, b) => a.dead - b.dead || b.fit - a.fit || b.claim - a.claim || a.fame - b.fame || a.i - b.i)
    .map((r) => r.x)
}

type StoryCheckItem = { p: ProposedName; wiki: WikiFacts; signals?: EnrichmentSignals | null }

/** Full-name variants only — a lone first name matches strangers. */
function fullNameVariants(p: ProposedName): string[] {
  return nameVariants([p.name, p.name_en]).filter((v) => v.includes(" "))
}

/**
 * A cue-flagged person is checked last in their pool, never skipped.
 *
 * Only a SOURCE cue («الشهيد <full name>» in a free source) counts here. An
 * uncertain Wikidata entry's death year is a stranger's until proven
 * otherwise (2026-09-28): it used to push a living candidate to the back of
 * the queue on a namesake's death. (A TRUSTED entry with a death year never
 * reaches the queue — it is a hard reject.) The score still reports that
 * cue to the operator; it just no longer decides who gets checked.
 */
function cueRank(x: StoryCheckItem): number {
  const free = x.signals ? freeStorySources(x.signals) : []
  return possiblyDeceasedCue({ resolved: false }, free, fullNameVariants(x.p)) ? 1 : 0
}

/**
 * Something public already names this person — the pool whose story check
 * is likely to FIND a published account. Read from what enrich() already
 * fetched (free), never from notability:
 *   - a confidently-resolved Wikidata entry (an uncertain hit may be a
 *     stranger with the same name — trial 5's «هند البحر» → a different Hind);
 *   - a YouTube talk or GDELT headline whose own text names them in full.
 * Not counted: a channel-name match («Hind Deer» for «هند البحر») and
 * podcast appearances — Listen Notes matches names loosely (trial 5: a
 * Belgian radio show for «هند البحر», a 9/11 trial episode for «علي البلوشي»).
 */
export function hasPublicFootprint(x: StoryCheckItem): boolean {
  if (x.wiki.resolved && !x.wiki.identity_uncertain) return true
  if (!x.signals) return false
  const variants = fullNameVariants(x.p)
  return freeStorySources(x.signals).some((src) => mentionsName(src.text, variants))
}

/** Checks reserved for topical experts at the default cap (12). */
export const STORY_EXPERT_RESERVE = 2

/** The reserve scales with the cap — 2 of 12, 1 of 6, none below 6. */
export function expertReserve(cap: number): number {
  return Math.max(0, Math.min(STORY_EXPERT_RESERVE, Math.floor(cap / 6)))
}

/** 1 when a free source names the person AND the topic — a public account likely exists. */
function footprintFit(x: StoryCheckItem, topic: string): number {
  if (!x.signals) return 0
  const toks = foldVerbatim(topic).split(" ").filter((t) => t.length >= 3)
  if (toks.length === 0) return 0
  const variants = fullNameVariants(x.p)
  return freeStorySources(x.signals).some(
    (s) => mentionsName(s.text, variants) && toks.some((t) => pad(s.text).includes(t)),
  )
    ? 1
    : 0
}

/**
 * Choose who gets the `cap` paid story checks — two halves, so every run
 * yields both kinds of guest (Khaled, 2026-09-26, after trial 5):
 *   - PUBLIC (floor(cap/2)): hasPublicFootprint — the pool likely to have a
 *     published first-hand account. Ordered by claim strength, then fit —
 *     the proposal text's, or 1 when the free evidence already names them
 *     together with the topic (trial 5: «… وما علاقتها بالغزو العراقي
 *     للكويت» for a proposal whose claim only said «آبار النفط») — then
 *     notability, which only breaks the remaining ties.
 *   - LESSER-KNOWN (the rest): no public footprint — rankForStoryCheck
 *     (priority, lesser-known first), where the unpublished witness lives.
 * A pool shorter than its half gives the leftover to the other. Within each
 * pool a possibly-deceased cue sorts last. The result interleaves the two
 * (public first) so a daily budget that trips mid-run cuts both halves
 * evenly. Deterministic: stable on the proposal order.
 *
 * Why: trial 4 sent the cap to the famous (fame as tie-break); trial 5's
 * lesser-known-first sent all 12 to obscure names — 9 «قصة غير منشورة», 1
 * verified — while three people with known published accounts were not
 * checked at all.
 */
export function selectForStoryCheck<T extends StoryCheckItem>(
  items: T[],
  topic: string,
  cap: number,
): T[] {
  if (cap <= 0) return []
  const fame = (w: WikiFacts) => (w.resolved && !w.identity_uncertain ? 1 + (w.sitelink_count ?? 0) : 0)
  const fitOf = (x: T) => Math.max(proposalFitRatio(x.p, topic), footprintFit(x, topic))

  // RESERVED: the top topical experts (2 of 12 — `expertReserve`). In run
  // 1e88aa03 (2026-09-28, «المال يتذكّر ما نسيته العائلة») both economists
  // were cut by the cap: every first-hand claim outranked them, and a claim
  // is a hypothesis about a story, not about THIS topic. An expert with zero
  // topic fit is not "topical" and reserves nothing.
  const experts = items
    .map((x, i) => ({ x, i, dead: cueRank(x), fit: fitOf(x), pub: hasPublicFootprint(x) ? 1 : 0, fame: fame(x.wiki) }))
    .filter((r) => r.x.p.story_type === "expert" && r.fit > 0)
    .sort((a, b) => a.dead - b.dead || b.fit - a.fit || b.pub - a.pub || b.fame - a.fame || a.i - b.i)
  const reserved = experts.slice(0, Math.min(expertReserve(cap), cap)).map((r) => r.x)
  const reservedSet = new Set<T>(reserved)
  const rest = items.filter((x) => !reservedSet.has(x))
  const restCap = cap - reserved.length

  const pub: T[] = []
  const lesser: T[] = []
  for (const x of rest) (hasPublicFootprint(x) ? pub : lesser).push(x)
  // Topic fit leads claim strength (see rankForStoryCheck), notability last.
  const pubRanked = pub
    .map((x, i) => ({
      x,
      i,
      dead: cueRank(x),
      claim: claimStrength(x.p),
      fit: fitOf(x),
      fame: fame(x.wiki),
    }))
    .sort((a, b) => a.dead - b.dead || b.fit - a.fit || b.claim - a.claim || b.fame - a.fame || a.i - b.i)
    .map((r) => r.x)
  const lesserRanked = rankForStoryCheck(lesser, topic)

  const lesserN = Math.min(lesserRanked.length, restCap - Math.min(pubRanked.length, Math.floor(restCap / 2)))
  const pubN = Math.min(pubRanked.length, restCap - lesserN)
  // Interleaved, so a daily budget that trips mid-run cuts every pool evenly.
  const out: T[] = []
  for (let i = 0; i < Math.max(pubN, lesserN, reserved.length); i++) {
    if (i < pubN) out.push(pubRanked[i])
    if (i < lesserN) out.push(lesserRanked[i])
    if (i < reserved.length) out.push(reserved[i])
  }
  return out
}

// ─── Possibly deceased (soft cue) ────────────────────────────────────────────

const DECEASED_TITLES = new Set(
  ["الشهيد", "الشهيدة", "المرحوم", "المرحومة", "الراحل", "الراحلة", "الفقيد", "الفقيدة"].map(foldVerbatim),
)

/**
 * A SOFT death cue for a person the hard rule cannot reject: Wikidata has a
 * death year but the match is uncertain, or a source title calls the
 * person by full name with «الشهيد/المرحوم/الراحل/الفقيد» right before it
 * (trial 5: «بيت الشهيد - الشهيد …» on two unchecked/unverified witnesses).
 * Never a rejection — a namesake martyr is possible — only a reason for
 * the operator and a later place in the check queue. Returns the reason.
 * `toldOwnStory` (a VERIFIED first-hand account) silences the Wikidata cue:
 * the person told it themselves, so the uncertain dead entry is the
 * namesake (the resolver's own «لاعب كرة قدم، مصر» case).
 */
export function possiblyDeceasedCue(
  wiki: WikiFacts,
  sources: StorySource[],
  variants: string[],
  toldOwnStory = false,
): string | null {
  if (!toldOwnStory && wiki.resolved && wiki.identity_uncertain && wiki.death_year) {
    return `قد يكون متوفّى — ويكي‌داتا تذكر وفاة (${wiki.death_year}) لشخص بنفس الاسم؛ تحقّق قبل التواصل`
  }
  const names = variants.map((v) => v.split(" ")).filter((t) => t.length >= 2)
  if (names.length === 0) return null
  for (const s of sources) {
    const toks = foldVerbatim(`${s.title} ${s.text}`).split(" ").filter(Boolean)
    for (const name of names) {
      for (let i = 1; i + name.length <= toks.length; i++) {
        if (!name.every((t, k) => toks[i + k] === t)) continue
        const prev = toks[i - 1]
        const bare = prev.startsWith("و") && DECEASED_TITLES.has(prev.slice(1)) ? prev.slice(1) : prev
        if (DECEASED_TITLES.has(bare)) {
          return "قد يكون متوفّى — مصدر يسبق اسمه بـ«الشهيد/المرحوم»؛ تحقّق قبل التواصل"
        }
      }
    }
  }
  return null
}

// ─── Gender from verified text ───────────────────────────────────────────────

// Arabic marks the subject's gender on the verb and on a title. Only words
// ADJACENT to the person's full name count, and only unambiguous ones:
//   before the name — a narration verb (VSO: «روت سارة …», «وقال ناصر …»)
//                     or a title («الدكتورة سارة …», «اللواء ناصر …»);
//   after the name  — a past narration verb (SVO: «سارة … روت»).
// Relative pronouns («الذي/التي») are excluded: in «منزل سارة الذي» the
// pronoun agrees with «منزل», not with her. Transitive verbs that take a
// person as object («ذكرت», «كشفت», «سألت») are excluded for the same reason.
const FEMALE_VERBS = ["روت", "قالت", "تحدثت", "اكدت", "اضافت", "اوضحت", "استذكرت", "سردت", "حكت", "عاشت", "تروي", "تقول", "تتحدث", "تستذكر", "تسرد", "تحكي"]
const MALE_VERBS = ["روى", "قال", "تحدث", "اكد", "اضاف", "اوضح", "استذكر", "سرد", "حكى", "عاش", "يروي", "يقول", "يتحدث", "يستذكر", "يسرد", "يحكي"]
const FEMALE_TITLES = ["السيده", "الشيخه", "الدكتوره", "الاستاذه", "المواطنه", "الفنانه", "الكاتبه", "الاعلاميه", "الشاعره", "الناشطه", "المهندسه", "الطبيبه", "الممرضه", "المعلمه", "الروائيه", "الاديبه", "الباحثه", "المذيعه", "السفيره", "الوزيره", "النائبه"]
const MALE_TITLES = ["السيد", "الشيخ", "الدكتور", "الاستاذ", "المواطن", "الفنان", "الكاتب", "الاعلامي", "الشاعر", "الناشط", "المهندس", "الطبيب", "المعلم", "الروائي", "الاديب", "الباحث", "المذيع", "السفير", "الوزير", "النائب", "اللواء", "العميد", "العقيد", "المقدم", "الرائد", "النقيب", "الملازم", "الفريق", "العسكري"]
const POST_NAME_FEMALE = ["روت", "قالت", "تحدثت", "استذكرت"]
const POST_NAME_MALE = ["روى", "قال", "تحدث", "استذكر"]

const foldSet = (xs: string[]) => new Set(xs.map(foldVerbatim))
const F_BEFORE = foldSet([...FEMALE_VERBS, ...FEMALE_TITLES])
const M_BEFORE = foldSet([...MALE_VERBS, ...MALE_TITLES])
const F_AFTER = foldSet(POST_NAME_FEMALE)
const M_AFTER = foldSet(POST_NAME_MALE)

/** «وقالت» / «فروى» → the verb; the conjunction is not part of the cue. */
function stripConjunction(tok: string, cues: Set<string>): string {
  if (cues.has(tok)) return tok
  if (tok.length > 3 && (tok.startsWith("و") || tok.startsWith("ف"))) return tok.slice(1)
  return tok
}

/**
 * The person's gender as the LIVE sources' own grammar states it, or null.
 * Reads verified sources only (a GDELT headline is a crawl record, never
 * re-checked). Every occurrence of a full-name variant votes; any
 * disagreement → null (unknown), so one odd sentence can never decide a
 * strict filter. Pure — the scorer calls it with sources already gathered.
 */
export function inferGenderFromSources(
  sources: StorySource[],
  variants: string[],
): "male" | "female" | null {
  // Only multi-word variants: a lone first name matches strangers.
  const names = variants.map((v) => v.split(" ")).filter((t) => t.length >= 2)
  if (names.length === 0) return null
  let female = 0
  let male = 0
  const allCues = new Set([...F_BEFORE, ...M_BEFORE])
  for (const s of sources) {
    if (!s.verified) continue
    const toks = foldVerbatim(`${s.title} ${s.text}`).split(" ").filter(Boolean)
    for (const name of names) {
      for (let i = 0; i + name.length <= toks.length; i++) {
        if (!name.every((t, k) => toks[i + k] === t)) continue
        const before = i > 0 ? stripConjunction(toks[i - 1], allCues) : ""
        const after = toks[i + name.length] ?? ""
        if (F_BEFORE.has(before) || F_AFTER.has(after)) female++
        if (M_BEFORE.has(before) || M_AFTER.has(after)) male++
      }
    }
  }
  if (female > 0 && male === 0) return "female"
  if (male > 0 && female === 0) return "male"
  return null
}

// ─── Searchability (Q) ───────────────────────────────────────────────────────

const STORY_KEYWORDS = [
  "شهاده", "قصه", "قصته", "قصتها", "تجربه", "تجربته", "تجربتها", "عاش", "عاشت",
  "روى", "يروي", "تروي", "ذكريات", "ذكرياته", "مقابله", "لقاء", "حوار", "سيرته", "شاهد",
].map(foldVerbatim)

/**
 * Q — distinct LIVE domains whose text names the person in a story, event
 * or topic context: ≥2 → 1, 1 → 0.5, 0 → 0. No extra call: it reads the
 * sources already gathered.
 */
export function searchabilityScore(
  sources: StorySource[],
  variants: string[],
  topic: string,
  geo: V2Geography[],
): number {
  const { events } = gulfEventLexicon(geo)
  const topicToks = foldVerbatim(topic)
    .split(" ")
    .filter((t) => t.length >= 3)
  const context = [...STORY_KEYWORDS, ...events, ...topicToks]
  const domains = new Set<string>()
  for (const s of sources) {
    if (!s.verified || !s.domain) continue
    const h = pad(`${s.title} ${s.text}`)
    if (!variants.some((v) => hasWord(h, v))) continue
    if (!context.some((c) => hasWord(h, c))) continue
    domains.add(s.domain)
  }
  return domains.size >= 2 ? 1 : domains.size === 1 ? 0.5 : 0
}

// ─── Sources ─────────────────────────────────────────────────────────────────

/** YouTube's search API returns HTML-escaped titles; a quote is not. */
function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
}

/**
 * The free sources enrich() already fetched, as story sources. The YouTube
 * talk is marked live (the Data API lists it now); the GDELT headline is
 * NOT — it is a crawl record whose page was never re-checked, so it counts
 * toward the footprint but can never back a quote or searchability.
 */
export function freeStorySources(signals: EnrichmentSignals): StorySource[] {
  const out: StorySource[] = []
  const yt = signals.youtube
  if (yt?.talk_url && (yt.talk_title || yt.talk_description)) {
    const title = unescapeHtml(yt.talk_title ?? "")
    const description = unescapeHtml(yt.talk_description ?? "")
    out.push({
      kind: "youtube",
      title,
      url: yt.talk_url,
      domain: "youtube.com",
      text: `${title} ${description}`.trim(),
      verified: true,
      // This IS the page's own metadata (Data API search snippet), not an
      // AI summary — it may prove a quote or a speaker (source-page.ts).
      page: { title, author: null, text: description, via: "youtube_api" },
    })
  }
  const news = signals.news
  if (news?.latest_url && news.latest_title) {
    out.push({
      kind: "news",
      title: news.latest_title,
      url: news.latest_url,
      domain: domainFromUrl(news.latest_url),
      text: news.latest_title,
      verified: false,
    })
  }
  return out
}

export function buildStoryQuery(p: ProposedName, topic: string): string {
  const en = p.name_en ? ` (${p.name_en})` : ""
  const who = [p.role, p.country].filter(Boolean).join("، ")
  const about = p.story_claim?.trim()
    ? `يُعتقد أنه عاش: ${p.story_claim.trim()}. وموضوع الحلقة: ${topic}`
    : `موضوع الحلقة: ${topic}`
  return (
    `ابحث عن مقابلات صحفية أو لقاءات تلفزيونية أو مقاطع يوتيوب أو شهادات يروي فيها ` +
    `"${p.name}"${en}${who ? ` (${who})` : ""} بنفسه تجربة شخصية عاشها — ${about}. ` +
    `أريد ما رواه هو عن نفسه، لا ما كُتب عنه كخبير. ` +
    `إن لم تجد شيئاً يرويه بنفسه فقل ذلك صراحةً.`
  )
}

/**
 * Gather live web evidence for ONE person. Throws on any failure (budget
 * spent, unconfigured, search never ran) — the pipeline marks that
 * candidate `not_checked` and carries on; it never becomes "no story".
 */
export async function gatherStoryWebSources(
  p: ProposedName,
  input: V2RunInput,
  opts: { timeoutMs?: number } = {},
): Promise<{ sources: StorySource[]; model: string }> {
  const evidence = await gatherGroundedEvidence(buildStoryQuery(p, input.topic), {
    maxResults: 6,
    subjectTable: "discovery_runs",
    subjectId: input.runId ?? null,
    actorId: null,
    timeoutMs: opts.timeoutMs,
  })
  // Same skip rule as grounded-verify.ts: a still-wrapped redirect carries a
  // rotating token and a null domain didn't parse — neither is citable.
  const sources: StorySource[] = evidence.sources
    .filter((s) => s.domain && !isVertexRedirect(s.url))
    .map((s) => ({
      kind: "web" as const,
      title: s.title,
      url: s.url,
      domain: s.domain,
      text: s.snippet ?? "",
      verified: s.verified,
    }))
  return { sources, model: evidence.provenance.model }
}
