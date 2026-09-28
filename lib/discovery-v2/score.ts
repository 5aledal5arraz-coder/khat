/**
 * v2 step 4 — score a candidate and decide, story-first.
 *
 * Approved criterion (Khaled, 2026-09-26): a grounded first-hand lived
 * story outweighs fame; Wikidata is a confidence PENALTY, not a gate. The
 * archive data behind it: story episodes drew 130K–300K views vs 3.5K–24K
 * for experts, with no exception in 15 episodes.
 *
 *   base = 0.35·S + 0.20·F + 0.12·H + 0.10·Q + 0.13·G + 0.05·N + 0.05·R
 *   (taste: famous S 0.30 / N 0.10 · hidden_gems S 0.38 / N 0.02)
 *   overall = clamp(base − penalties)
 *
 * S is > G+N+R combined, so fame + press + guestability can never outvote a
 * verified story. Every component is computed HERE from data; S and H read
 * only quotes that passed the verbatim guard in story-classify.ts — the
 * model never sets a number. Follower counts are not a signal (they ran
 * inversely to guest quality in the 2026-08-07 study).
 *
 * Hard rejects (correctness, each needs evidence):
 *   R2 deceased — confident Wikidata death year, or a verified quote
 *   R3 not an individual — classifier + a verified item
 *   R4 filter/scope contradiction — only on a VERIFIED attribute
 *   R5 no footprint — unresolved AND the web was actually searched AND
 *      nothing names the person anywhere (the anti-invention floor that
 *      replaces the Wikidata gate). NOT applied to an unpublished
 *      first-hand story (below): an ordinary witness who never gave an
 *      interview has no footprint by definition — flagged «لا أثر رقمي».
 *   R6 the evidence is about a namesake
 * (R1 — already a guest / rejected — is dropped before scoring.)
 *
 * Unpublished stories go to Khaled, not the bin (his decision «أ»,
 * 2026-09-26). A proposal that claims a first-hand lived experience whose
 * story check found no public account, and a story only relatives tell,
 * are needs_review with their own chip — never «إشارات ضعيفة». S stays 0
 * for the unpublished one (no evidence is invented for it), so it ranks
 * below every verified story; the hard rejects above still come first.
 */

import { foldVerbatim } from "@/lib/studio/verbatim"
import {
  GEOGRAPHY_LABEL,
  notCheckedStory,
  geographyOfNationality,
  gulfHookScore,
  inferGenderFromSources,
  mentionsName,
  nameVariants,
  possiblyDeceasedCue,
  resolveGeography,
  searchabilityScore,
} from "./story-evidence"
import type {
  EnrichmentSignals,
  StoryAssessment,
  StoryCheck,
  TopicRelevanceValue,
  V2Candidate,
  V2Filters,
  V2Flag,
  V2Geography,
  V2ScoreKey,
  V2Scores,
  WikiFacts,
  ProposedName,
} from "./types"

const clamp = (v: number) => Math.max(0, Math.min(1, v))

/** What an UNTRUSTED Wikidata match contributes: nothing. */
const UNRESOLVED: WikiFacts = { resolved: false }

/**
 * Real podcast appearances, or 0. Without LISTEN_NOTES_API_KEY the source
 * runs against Listen Notes' sandbox, which returns the same mock episodes
 * for every name (`test: true`) — on production every candidate showed a
 * podcast appearance and a 0.65 guestability. Mock data is not evidence.
 */
export function realPodcastAppearances(s: EnrichmentSignals): number {
  if (!s.podcast || s.podcast.test === true) return 0
  return s.podcast.appearances ?? 0
}

function notabilityScore(w: WikiFacts, s: EnrichmentSignals): number {
  const sl = w.sitelink_count ?? 0
  let n =
    sl >= 25 ? 1.0 : sl >= 10 ? 0.85 : sl >= 6 ? 0.7 : sl >= 3 ? 0.55 : sl >= 1 ? 0.35 : 0.1
  if ((s.scholar?.cited_by ?? 0) >= 5000) n += 0.15
  else if ((s.scholar?.cited_by ?? 0) >= 500) n += 0.08
  if ((s.books?.count ?? 0) >= 1) n += 0.08
  if (w.official_website) n += 0.05
  // Follower counts are deliberately NOT here: across the guest study they
  // ran inversely to guest quality, and showing them re-taught the operator
  // the wrong signal. Activity (posting), not audience size, feeds G and R.
  return clamp(n)
}

/** F from the classifier's VERIFIED topic relevance. */
const RELEVANCE_FIT: Record<TopicRelevanceValue, number> = { on_topic: 1, adjacent: 0.5, off_topic: 0 }

/**
 * F — topic fit. Measured only from the story classifier's `topic_relevance`,
 * which is backed by a verified verbatim quote. It used to START at a flat
 * 0.62 ("the LLM proposed them for this topic → solid prior"), so every
 * candidate read ≈0.62–0.8 whether or not anything connected them to the
 * episode (2026-09-28 end-to-end test).
 *
 * Without a verified relevance the value is a LEXICAL guess — the share of
 * topic words found in the proposal's own role/why/claim, no prior — and it
 * is reported as unmeasured, so the run page shows «غير مقيّم» for it.
 */
function topicFitScore(
  topic: string,
  proposed: ProposedName,
  a: StoryAssessment,
): { value: number; measured: boolean } {
  const rel = a.topic_relevance?.value
  if (rel) return { value: RELEVANCE_FIT[rel], measured: true }
  // Folded both sides so «الأسر» in the topic meets «الاسر» in a proposal.
  const hay = ` ${foldVerbatim(`${proposed.role ?? ""} ${proposed.why ?? ""} ${proposed.story_claim ?? ""}`)} `
  const toks = foldVerbatim(topic).split(" ").filter((t) => t.length >= 3)
  if (toks.length === 0) return { value: 0, measured: false }
  const hits = toks.filter((t) => hay.includes(t)).length
  return { value: clamp(hits / toks.length), measured: false }
}

/** True when at least one REAL signal feeds G (the 0.1 floor alone is not a measurement). */
function guestabilityMeasured(w: WikiFacts, s: EnrichmentSignals): boolean {
  return (
    realPodcastAppearances(s) > 0 ||
    !!s.youtube?.talk_url ||
    !!s.youtube?.channel_url ||
    !!w.social?.youtube_channel ||
    !!w.official_website ||
    !!s.x ||
    !!s.instagram ||
    !!w.social?.x ||
    !!w.social?.instagram
  )
}

function guestabilityScore(w: WikiFacts, s: EnrichmentSignals): number {
  let g = 0.1
  const app = realPodcastAppearances(s)
  if (app >= 3) g += 0.55
  else if (app >= 1) g += 0.35
  if (s.youtube?.talk_url) g += 0.2
  if (s.youtube?.channel_url || w.social?.youtube_channel) g += 0.15
  if (w.official_website) g += 0.1
  // A verified-live social presence (X or Instagram) is a real
  // contact/booking channel; a mere static profile link is a weaker
  // version of the same signal.
  if (s.x?.posting === "active" || s.instagram?.posting === "active") g += 0.15
  else if (w.social?.x || w.social?.instagram) g += 0.1
  return clamp(g)
}

function recencyScore(s: EnrichmentSignals): number {
  const m = s.news?.recent_mentions ?? 0
  const r = m >= 6 ? 1.0 : m >= 3 ? 0.7 : m >= 1 ? 0.5 : 0.2
  // Publicly active RIGHT NOW on X/Instagram counts as current presence
  // even when the person isn't in the press cycle (GDELT misses most
  // Arabic social voices).
  if (s.x?.posting === "active" || s.instagram?.posting === "active") return Math.max(r, 0.6)
  if (s.x?.posting === "occasional" || s.instagram?.posting === "occasional")
    return Math.max(r, 0.4)
  return r
}


/**
 * How much of a verified story counts toward S, by its VERIFIED relevance to
 * the episode topic. Only an on-topic story counts fully. A relevance the
 * classifier could not back with a quote counts as adjacent — not proven
 * on-topic, not proven off it.
 */
export const STORY_RELEVANCE_FACTOR: Record<TopicRelevanceValue, number> = {
  on_topic: 1,
  adjacent: 0.4,
  off_topic: 0,
}
const STORY_RELEVANCE_UNKNOWN = STORY_RELEVANCE_FACTOR.adjacent

/**
 * S — from VERIFIED evidence only: first-hand told on ≥2 distinct live
 * domains 1.0, on one 0.8; a closely-witnessed family/community story 0.5;
 * anything else (expert, none, unverified, not checked) 0 — then scaled by
 * the story's verified relevance to THE TOPIC (STORY_RELEVANCE_FACTOR). A
 * founder's verified "founding story" on an episode about family money is
 * a real story about something else; it used to score a full 0.8–1.0.
 */
export function storyScore(a: StoryAssessment): number {
  if (a.status !== "verified" || a.evidence.length === 0) return 0
  const domains = new Set(a.evidence.map((e) => e.domain ?? e.url))
  const base =
    a.story_type === "first_hand"
      ? domains.size >= 2
        ? 1
        : 0.8
      : a.story_type === "second_hand"
        ? 0.5
        : 0
  const rel = a.topic_relevance?.value
  return base * (rel ? STORY_RELEVANCE_FACTOR[rel] : STORY_RELEVANCE_UNKNOWN)
}

type Taste = "famous" | "balanced" | "hidden_gems"

function weights(taste: Taste | undefined) {
  const S = taste === "famous" ? 0.3 : taste === "hidden_gems" ? 0.38 : 0.35
  const N = taste === "famous" ? 0.1 : taste === "hidden_gems" ? 0.02 : 0.05
  return { S, F: 0.2, H: 0.12, Q: 0.1, G: 0.13, N, R: 0.05 }
}

const PENALTY_UNRESOLVED = 0.06
const PENALTY_UNCERTAIN = 0.03
const PENALTY_FILTER_UNVERIFIABLE = 0.03

const ACCEPT_BAR = 0.55
const SHORTLIST_BAR = 0.4
const STRONG_STORY = 0.8

/** The review reason for a verified first-hand story whose identity Wikidata can't confirm. */
const VERIFIED_NOT_IN_WIKIDATA = "قصة موثّقة — ليس في ويكي‌داتا، راجِع الهوية"

type FilterAttr = "gender" | "nationality"
const FILTER_ATTR_LABEL: Record<FilterAttr, string> = { gender: "الجنس", nationality: "الجنسية" }
const FILTER_ATTR_FLAG: Record<FilterAttr, V2Flag> = {
  gender: "gender_unverified",
  nationality: "nationality_unverified",
}

interface FilterOutcome {
  contradiction: string | null
  /** an explicit strict filter whose attribute could not be verified */
  unverifiable: FilterAttr[]
  /** geography scope with an unknown nationality — flagged, not penalised */
  scopeUnverified: boolean
}

/**
 * Filters judge VERIFIED attributes only: confident Wikidata, or a value
 * the classifier stated with a verified quote. Unknown is no longer a
 * reject (it rejected every non-Wikidata person under any filter) — it is
 * a penalty + a flag, and caps the decision at needs_review.
 */
function checkFilters(
  f: V2Filters,
  geo: V2Geography[],
  gender: "male" | "female" | "other" | null,
  nationality: string | null,
): FilterOutcome {
  const out: FilterOutcome = { contradiction: null, unverifiable: [], scopeUnverified: false }
  const natGeo = geographyOfNationality(nationality)

  if (f.gender) {
    if (!gender) out.unverifiable.push("gender")
    else if (gender !== f.gender) out.contradiction = "يخالف فلتر الجنس المطلوب"
  }
  if (f.nationality && !out.contradiction) {
    if (!natGeo) out.unverifiable.push("nationality")
    else if (f.nationality === "kuwaiti" && natGeo !== "kuwait")
      out.contradiction = "ليس كويتياً والفلتر يطلب كويتيين فقط"
    else if (f.nationality === "non_kuwaiti" && natGeo === "kuwait")
      out.contradiction = "كويتي والفلتر يطلب غير الكويتيين"
  }
  if (!out.contradiction) {
    if (!natGeo) out.scopeUnverified = true
    else if (natGeo === "other" || !geo.includes(natGeo)) {
      out.contradiction = `خارج النطاق الجغرافي المختار (${geo.map((g) => GEOGRAPHY_LABEL[g]).join("، ")})`
    }
  }
  return out
}

function hasFootprint(signals: EnrichmentSignals, check: StoryCheck, variants: string[]): boolean {
  if ((signals.news?.recent_mentions ?? 0) > 0) return true
  if ((signals.books?.count ?? 0) > 0) return true
  if (signals.youtube?.talk_url || signals.youtube?.channel_url) return true
  // OpenAlex and Listen Notes are deliberately NOT footprint: OpenAlex
  // returns its top fuzzy hit for any name, and Listen Notes' sandbox
  // returns mock episodes for everyone — either would make an invented
  // name look real.
  return check.sources.some((s) => mentionsName(`${s.title} ${s.text}`, variants))
}

/**
 * One gender from three signals, strongest first:
 *   1. a confidently-identified Wikidata P21 — wins outright (structured,
 *      identity-checked); "other" is kept so a male/female filter rejects it;
 *   2. the classifier's value, backed by a verified verbatim quote;
 *   3. the live sources' own grammar next to the full name
 *      (`inferGenderFromSources`: «روت فلانة», «اللواء فلان»).
 * 2 and 3 disagreeing → null: under a strict filter an unresolved conflict
 * is «unverified» (needs_review), never a guess in either direction.
 */
function resolveGender(
  wikiGender: WikiFacts["gender"],
  story: StoryCheck,
  variants: string[],
): "male" | "female" | "other" | null {
  if (wikiGender) return wikiGender
  // Sources the classifier said are about a namesake say nothing about OUR person.
  if (!story.attrs.same_person) return null
  const stated = story.attrs.gender
  const read = inferGenderFromSources(story.sources, variants)
  if (stated && read && stated !== read) return null
  return stated ?? read
}

// Every one starts «لم يُفحص للقصة» — the operator must read at a glance
// that the dominant signal was never measured, not that it came back empty.
const NOT_CHECKED_REASON: Record<NonNullable<StoryAssessment["not_checked_reason"]>, string> = {
  cap: "لم يُفحص للقصة — خارج حدّ الفحص لهذا التشغيل (التكلفة)",
  unavailable: "لم يُفحص للقصة — البحث الحيّ غير متاح",
  error: "لم يُفحص للقصة — نفدت ميزانية البحث أو خطأ مؤقّت",
}

export function scoreCandidate(
  proposed: ProposedName,
  wiki: WikiFacts,
  signals: EnrichmentSignals,
  input: {
    topic: string
    filters?: V2Filters
    geography?: V2Geography[] | null
    taste?: Taste
  },
  check?: StoryCheck,
): V2Candidate {
  const filters = input.filters ?? {}
  const geo = resolveGeography(input)
  const story: StoryCheck = check ?? {
    assessment: notCheckedStory(null, proposed.story_claim ?? null),
    sources: [],
    attrs: { deceased: false, not_individual: false, same_person: true, gender: null, nationality: null },
  }
  const a = story.assessment
  // An untrusted entry's labels are a stranger's name — never a variant of ours.
  const wikiTrusted = wiki.resolved && !wiki.identity_uncertain
  const variants = nameVariants([
    proposed.name,
    proposed.name_en,
    wikiTrusted ? wiki.label_ar : null,
    wikiTrusted ? wiki.label : null,
  ])
  const reasons: string[] = []
  const flags: V2Flag[] = []

  // ── Identity confidence ──
  // Wikidata's facts are trusted only for a confidently-identified entry;
  // an uncertain single hit may be a stranger with the same name. An
  // untrusted entry contributes NOTHING — not its sitelinks to N, not its
  // website/socials to G, not its facts to the reasons (2026-09-28: wrong-
  // person matches born 1800/1905 were lending their fame to living people).
  const trustWiki = wikiTrusted
  const facts = trustWiki ? wiki : UNRESOLVED

  // ── Components ──
  const S = storyScore(a)
  // H reads the quotes of a VERIFIED story only: an expert's verbatim
  // analysis of the invasion is real text, but it is not a lived hook.
  const verifiedQuotes =
    a.status === "verified"
      ? [...a.evidence.map((e) => e.quote), ...(a.gulf_event ? [a.gulf_event.quote] : [])]
      : []
  const H = gulfHookScore(verifiedQuotes, geo)
  const fit = topicFitScore(input.topic, proposed, a)
  const F = fit.value
  const Q = searchabilityScore(story.sources, variants, input.topic, geo)
  const G = guestabilityScore(facts, signals)
  const N = notabilityScore(facts, signals)
  const R = recencyScore(signals)

  // Components with no real evidence behind them — shown «غير مقيّم».
  const unmeasured: V2ScoreKey[] = []
  if (a.status === "not_checked") unmeasured.push("story", "searchability")
  if (!fit.measured) unmeasured.push("topic_fit")
  if (!guestabilityMeasured(facts, signals)) unmeasured.push("guestability")
  const gender = resolveGender(trustWiki ? (wiki.gender ?? null) : null, story, variants)
  const nationality = (trustWiki ? wiki.nationality_country : null) ?? story.attrs.nationality
  const deceasedYear = trustWiki && wiki.death_year ? wiki.death_year : null
  const deceased = !!deceasedYear || story.attrs.deceased

  // Stories Khaled reviews by hand (decision «أ»). The claim is the
  // proposal's own first_hand label + a concrete claim; "unverified" means
  // the check RAN and found no public account (not_checked keeps its own
  // shortlist path below).
  const unpublishedStory =
    proposed.story_type === "first_hand" && !!proposed.story_claim?.trim() && a.status === "unverified"
  const toldByOthers = a.status === "verified" && a.story_type === "second_hand"

  let penalty = 0
  if (!wiki.resolved) {
    penalty += PENALTY_UNRESOLVED
    flags.push("identity_unverified")
  } else if (wiki.identity_uncertain) {
    penalty += PENALTY_UNCERTAIN
    flags.push("identity_uncertain")
  }
  const fo = checkFilters(filters, geo, gender, nationality)
  if (fo.unverifiable.length) penalty += PENALTY_FILTER_UNVERIFIABLE
  // One flag per attribute that could not be verified, so the chip names
  // the right one (a gender filter on an unknown gender is not «الجنسية»).
  const unverifiedAttrs = new Set<FilterAttr>(fo.unverifiable)
  if (fo.scopeUnverified) unverifiedAttrs.add("nationality")
  // «الجنسية غير متحقّقة» only once something actually TRIED to verify it —
  // a trusted Wikidata entry or a story check that read sources. On a person
  // nobody checked it was printed on every card as if a check had failed;
  // «لم يُفحص للقصة» already says what is true for them.
  const nationalityChecked = trustWiki || a.status !== "not_checked"
  if (!nationalityChecked) unverifiedAttrs.delete("nationality")
  for (const attr of (["gender", "nationality"] as const)) {
    if (unverifiedAttrs.has(attr)) flags.push(FILTER_ATTR_FLAG[attr])
  }

  const w = weights(input.taste)
  const base = w.S * S + w.F * F + w.H * H + w.Q * Q + w.G * G + w.N * N + w.R * R
  const overall = clamp(base - penalty)

  const scores: V2Scores = {
    story: S,
    topic_fit: F,
    gulf_hook: H,
    searchability: Q,
    guestability: G,
    notability: N,
    recency: R,
    filter_match: fo.contradiction ? 0 : 1,
    penalty,
    overall,
    unmeasured,
  }

  // ── Decision ──
  let decision: V2Candidate["decision"]
  const checked = a.status !== "not_checked"
  if (deceased) {
    decision = "rejected"
    reasons.push(deceasedYear ? `متوفّى (${deceasedYear}) — غير قابل للاستضافة` : "متوفّى بحسب مصدر موثّق — غير قابل للاستضافة")
  } else if (story.attrs.not_individual) {
    decision = "rejected"
    reasons.push("ليس فرداً (قناة/مؤسسة) بحسب المصادر")
  } else if (checked && !story.attrs.same_person) {
    decision = "rejected"
    reasons.push("المصادر عن شخص آخر بنفس الاسم")
  } else if (fo.contradiction) {
    decision = "rejected"
    reasons.push(fo.contradiction)
  } else if (!wiki.resolved && checked && !hasFootprint(signals, story, variants) && !unpublishedStory) {
    decision = "rejected"
    reasons.push("لا أثر له على الويب — غالباً اسم غير حقيقي")
  } else if (
    a.status === "not_checked" &&
    (a.not_checked_reason === "cap" ||
      a.not_checked_reason === "error" ||
      (a.not_checked_reason === "unavailable" && !wiki.resolved))
  ) {
    // The dominant signal (S, 0.35) was never measured — cut by the per-run
    // cap, or the search/classifier failed or the budget ran out. Without
    // it a non-Wikidata person tops out near 0.36 < SHORTLIST_BAR, so
    // «إشارات ضعيفة» here would reject everyone past the cap unchecked and
    // claim past the measurement. Spec §2.2: never reject on cap/budget/
    // error alone — shortlist, and say first that it was not checked.
    // ("unavailable" = grounding off for the whole run: unchanged, still
    // non-Wikidata only, where the old score had nothing else to go on.)
    decision = "shortlist"
    reasons.push(NOT_CHECKED_REASON[a.not_checked_reason])
  } else if (unpublishedStory || toldByOthers) {
    // Below SHORTLIST_BAR by construction (S = 0 / 0.5), so the bar alone
    // rejected every one of them as «إشارات ضعيفة» — the witness nobody
    // interviewed is exactly the guest the archive data says to find.
    decision = "needs_review"
    if (unpublishedStory) {
      flags.push("story_unpublished")
      reasons.push("قصة غير منشورة — تحتاج مراجعتك")
      if (!wiki.resolved && checked && !hasFootprint(signals, story, variants)) {
        flags.push("no_web_footprint")
        reasons.push("لا أثر رقمي — تحقّق من وجوده قبل التواصل")
      }
    } else {
      flags.push("story_second_hand")
      reasons.push("قصته يرويها غيره — تحتاج مراجعتك")
    }
  } else if (S >= STRONG_STORY) {
    // A verified first-hand story IS the criterion: past the hard rejects it
    // is never below review, whatever the rest of the score. ACCEPT_BAR only
    // gates «accepted» — gating the whole branch on it sent trial 6's
    // verified witness outside Wikidata (0.47) to «قائمة مختصرة», below six
    // unverified stories, and a thinner one to «إشارات ضعيفة».
    // Never accepted on an attribute a filter asked for and nobody verified
    // (gender_unverified / nationality_unverified are in `flags`) — spelled
    // out for gender because the filter is strict: needs_review, with the chip.
    const genderUnverified = !!filters.gender && gender === null
    decision =
      overall >= ACCEPT_BAR && trustWiki && flags.length === 0 && !genderUnverified
        ? "accepted"
        : "needs_review"
    if (decision === "needs_review" && !wiki.resolved) {
      reasons.push(VERIFIED_NOT_IN_WIKIDATA)
    } else if (decision === "needs_review" && overall < ACCEPT_BAR) {
      reasons.push("قصة موثّقة — الدرجة الكلية دون عتبة القبول، راجِع الملاءمة")
    }
  } else if (overall >= SHORTLIST_BAR) {
    decision = "shortlist"
  } else {
    decision = "rejected"
    reasons.push("إشارات ضعيفة (قصة/ملاءمة/حضور)")
  }

  // A soft death cue (uncertain Wikidata death year, «الشهيد <name>» in a
  // source) never rejects — a namesake is possible — but it is never
  // «accepted» unseen and the operator is told.
  const deathCue = deceased
    ? null
    : possiblyDeceasedCue(
        wiki,
        story.sources,
        nameVariants([proposed.name, proposed.name_en]),
        a.status === "verified" && a.story_type === "first_hand",
      )
  if (deathCue && decision !== "rejected") {
    if (decision === "accepted") decision = "needs_review"
    reasons.push(deathCue)
  }

  // ── Reasons (why they scored) ──
  if (a.status === "verified") {
    reasons.push(a.story_type === "first_hand" ? "روى قصته بنفسه — موثّق بمصدر" : "يروي قصة عاشها أهله عن قرب — موثّق بمصدر")
  } else if (a.status === "unverified" && a.claim_from_propose && !unpublishedStory) {
    reasons.push("القصة المقترحة لم تُثبت بمصدر")
  } else if (a.status === "not_checked" && a.not_checked_reason) {
    const why = NOT_CHECKED_REASON[a.not_checked_reason]
    if (!reasons.includes(why)) reasons.push(why)
  }
  if (flags.includes("identity_unverified") && !reasons.includes(VERIFIED_NOT_IN_WIKIDATA)) {
    reasons.push("ليس في ويكي‌داتا — راجِع الهوية يدوياً")
  }
  if (flags.includes("identity_uncertain")) reasons.push("هوية غير مؤكّدة — قد يكون شخصاً آخر بنفس الاسم")
  const unverifiableShown = fo.unverifiable.filter((x) => x !== "nationality" || nationalityChecked)
  if (unverifiableShown.length)
    reasons.push(`تعذّر التحقّق من ${unverifiableShown.map((x) => FILTER_ATTR_LABEL[x]).join(" و")} — راجِع يدوياً`)
  if (decision !== "rejected") {
    if (realPodcastAppearances(signals) > 0) reasons.push("ظهر ضيفاً في بودكاست سابقاً")
    if ((signals.scholar?.cited_by ?? 0) >= 500) reasons.push("حضور أكاديمي قويّ")
    if ((signals.news?.recent_mentions ?? 0) >= 3) reasons.push("حضور إعلامي حديث")
    if ((facts.sitelink_count ?? 0) >= 6) reasons.push("شخصية بارزة موثّقة")
    // Activity, never the follower number — the number re-taught the
    // operator the wrong signal.
    if (signals.x?.posting === "active") reasons.push("نشط على X حالياً")
    if (signals.instagram?.posting === "active") reasons.push("نشط على إنستغرام حالياً")
  }

  return {
    name: (trustWiki ? wiki.label_ar : null) ?? proposed.name,
    name_en: (trustWiki ? wiki.label : null) ?? proposed.name_en ?? null,
    role: proposed.role ?? (trustWiki ? (wiki.occupations ?? [])[0] : null) ?? null,
    country: (trustWiki ? wiki.nationality_country : null) ?? proposed.country ?? null,
    why: proposed.why ?? facts.summary ?? null,
    wiki,
    signals,
    scores,
    decision,
    reasons,
    story: a,
    flags,
  }
}
