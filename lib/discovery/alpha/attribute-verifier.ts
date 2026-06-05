/**
 * Phase Alpha — Attribute triangulation verifier.
 *
 * Goal: produce HONEST confidence values for gender + nationality, not
 * a one-shot LLM guess. The current verifier asks gpt-4o-mini to infer
 * both attributes from a few URL snippets in one call; it then maps a
 * single token to "kuwaiti" / "male". That collapses uncertainty into
 * a binary decision and yields false confidence — exactly why the
 * filter visibility (CR-2) had to be added on top.
 *
 * Alpha computes each attribute as a weighted combination of multiple
 * INDEPENDENT signals, each carrying its own sub-evidence. The final
 * value is the majority-direction sub-signal; the confidence is the
 * weighted agreement among signals. Triangulation means: any one
 * signal can be wrong; only convergent signals push confidence up.
 *
 * Signal stacks:
 *
 *   Nationality
 *     • name_morphology     — Kuwaiti family names (Al-Sabah, Al-Khaled,
 *                             Al-Mutairi, Al-Otaibi, Al-Rashidi, …)
 *     • bio_statement       — bio fragments stating "from Kuwait" /
 *                             "كويتي" / "based in Kuwait"
 *     • location_mentions   — repeated Kuwait place names (Salmiya,
 *                             Hawalli, Jabriya, Bayan, …)
 *     • domain_TLD          — .kw domain or kuwait-* subdomain
 *     • affiliation         — KU, KFAS, Kuwait Times, Al-Watan, GUST,
 *                             AUK, KISR, KIO — markers of local
 *                             institutional life
 *
 *   Gender
 *     • name_morphology     — given name ending in "ة" / "a" / known
 *                             feminine roots
 *     • pronoun_arabic      — "هو/هي" / "ها/ه" suffixes in evidence
 *                             snippets when adjacent to the name
 *     • role_morphology     — feminine occupation form ("كاتبة",
 *                             "مؤسسة") vs masculine ("كاتب", "مؤسس")
 *     • bio_statement       — "she founded", "he is", explicit pronouns
 *                             in any English bio fragment
 *
 * Each sub-signal is in [-1, 1] where -1 = strong evidence for the
 * opposite value, 0 = no signal, +1 = strong evidence for the target.
 * The composite is the weighted average; sign chooses the value, and
 * |composite| × signal_count_bonus produces the confidence.
 *
 * Threshold for "verified": 0.80. Below that, the row is flagged
 * `attribute_uncertain` and the operator card surfaces the uncertainty
 * explicitly (no silent fallback to a default value).
 */

import type {
  AlphaAttributeConfidence,
  AlphaAttributeConfidences,
  DiscoveryEvidenceUrl,
} from "@/lib/db/schema/discovery"

export const ATTRIBUTE_VERIFIER_VERSION = "alpha-attr-2" as const

/**
 * Threshold below which the attribute is reported as uncertain. The
 * Alpha pipeline records the score but does NOT auto-reject under a
 * strict filter; instead, the operator card shows the uncertainty
 * badge and the row's `recommendation_score` is penalised. This is a
 * deliberate departure from the current `filter_mismatch` flow which
 * silently drops candidates whose attribute the model couldn't read.
 */
export const ATTRIBUTE_VERIFIED_THRESHOLD = 0.80

// ─── Kuwaiti family-name roots (non-exhaustive but well-distributed) ──
// Keep ASCII + Arabic forms; the matcher normalises whitespace and
// "ال" prefix handling. False positives are cheaper here than false
// negatives because nationality is corroborated by ≥2 sub-signals.

const KUWAITI_FAMILY_ROOTS: string[] = [
  // Royal / well-known clans
  "الصباح", "آل صباح",
  "الخالد", "آل خالد",
  "الجابر", "آل جابر",
  // Common tribal / family names
  "العتيبي", "المطيري", "الرشيدي", "الدوسري", "العنزي", "الشمري",
  "العجمي", "الفضلي", "الحربي", "السبيعي", "القحطاني", "الخالدي",
  "البلوشي", "البقشي", "العوضي", "الكندري", "الفليج", "الفهد",
  "العصفور", "الحجي", "الرومي", "السعيد", "البحر", "الفلاح",
  "الخرافي", "الغانم", "الشايع", "البحوث", "الوزان", "النفيسي",
  "الفارس", "السرحان", "الخباز", "الزامل", "الفليج",
  // Latin transliterations
  "al-sabah", "al sabah", "al-khaled", "al khaled", "al-jaber", "al jaber",
  "al-otaibi", "al-mutairi", "al-rashidi", "al-dosari", "al-enezi",
  "al-shammari", "al-ajmi", "al-fadhli", "al-harbi", "al-subaie",
  "al-qahtani", "al-khalidi", "al-baloushi", "al-awadhi", "al-kandari",
  "al-fahd", "al-romi", "al-saeed", "al-bahar", "al-fallah",
  "al-kharafi", "al-ghanim", "al-shaya", "al-wazzan", "al-nefisi",
]

const KUWAITI_PLACES: string[] = [
  "الكويت", "السالمية", "حولي", "الجابرية", "بيان", "السرة", "المنقف",
  "الفحيحيل", "الجهراء", "الأحمدي", "مشرف", "الشعب", "الروضة",
  "العديلية", "كيفان", "الفروانية", "خيطان", "صباح السالم",
  "kuwait", "salmiya", "hawalli", "jabriya", "bayan", "surra",
  "ahmadi", "farwaniya", "khaitan", "fahaheel", "jahra", "mishref",
]

const KUWAITI_AFFILIATIONS: string[] = [
  "kuwait university", "ku.edu.kw", "jamiat al-kuwait", "جامعة الكويت",
  "kfas", "kisr", "kuwait foundation",
  "al qabas", "القبس", "al rai", "الراي", "kuwait times",
  "al watan", "الوطن", "alanba", "الأنباء",
  "gust", "auk", "kio", "kuwait investment",
  "al-shall", "national bank of kuwait", "nbk",
]

// ─── Feminine name endings + roots (Arabic + Latin) ──────────────────
// Coverage targets the Gulf naming pool. The signal is intentionally
// weak alone (single sub-signal can't exceed weight 0.30) so the
// classifier requires corroboration.

const FEMININE_NAME_TAILS_AR = ["ة", "ى"]
const FEMININE_NAME_TAILS_LATIN = ["a", "ah"]
const FEMININE_GIVEN_NAMES = [
  "فاطمة", "عائشة", "خديجة", "سارة", "ساره", "نورة", "نوره",
  "هيا", "موضي", "شيخة", "شيخه", "ريم", "أنوار", "هند", "لطيفة",
  "بدور", "دانة", "دانه", "غدير", "بشاير", "شهد", "رؤى", "رهف",
  "مريم", "أسماء", "زينب", "سلوى", "نادية", "هدى", "هدير", "ميس",
  "fatima", "fatema", "aisha", "ayesha", "khadija", "sarah",
  "noora", "noor", "haya", "shaikha", "rim", "reem", "anwar",
  "hind", "latifa", "budour", "dana", "danah", "ghadeer",
  "bashayer", "shahd", "ruaa", "rahaf", "maryam", "asma",
  "zainab", "salwa", "nadia", "huda", "haifa",
]
const MASCULINE_GIVEN_NAMES = [
  "عبدالله", "عبد الله", "محمد", "أحمد", "احمد", "خالد", "فهد",
  "سعد", "سلطان", "ناصر", "بدر", "مشاري", "يوسف", "صالح",
  "حمد", "حماد", "عيسى", "موسى", "هاشم", "هادي", "ماجد",
  "abdullah", "mohammed", "mohamed", "ahmed", "khalid", "fahad",
  "saud", "saad", "sultan", "nasser", "bader", "mishari", "yusuf",
  "youssef", "saleh", "hamad", "hashim", "majid",
]

// ─── Gender — feminine occupation form indicators ────────────────────
// v2: lookarounds + roots that handle suffixes. Feminine forms must
// match with the ة ending; masculine forms must NOT match the
// feminine form (we test feminine first and skip the masculine root
// when the feminine variant already fired).
const FEMININE_ROLE_FORMS = [
  /(?:^|\s)كاتبة(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)مؤسسة(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)مديرة(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)معالجة(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)مدربة(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)مصممة(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)باحثة(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)محاضرة(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)رائدة(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)ممرضة(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)مصورة(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)روائية(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)رياضية(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)سيدة\s+أعمال/u,
  /(?:^|\s)أستاذة(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)دكتورة(?:\s|$|[،؛.!؟])/u,
]
const MASCULINE_ROLE_FORMS = [
  /(?:^|\s)كاتب(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)مؤسس(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)مدير(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)معالج(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)مدرب(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)مصمم(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)باحث(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)محاضر(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)رائد(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)ممرض(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)مصور(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)روائي(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)رياضي(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)رجل\s+أعمال/u,
  /(?:^|\s)أستاذ(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)دكتور(?:\s|$|[،؛.!؟])/u,
  /(?:^|\s)صانع(?:\s|$|[،؛.!؟])/u,
]

// ─── Public entry ────────────────────────────────────────────────────

export interface AttributeVerifierInput {
  proposed_name: string | null
  evidence_urls: DiscoveryEvidenceUrl[]
  /** Optional pre-existing nationality hint (e.g. "Kuwait" from search agent). */
  proposed_country: string | null
}

export function verifyAttributes(
  input: AttributeVerifierInput,
): AlphaAttributeConfidences {
  const name = (input.proposed_name ?? "").trim()
  const evidence = input.evidence_urls ?? []

  return {
    nationality: verifyNationality({ name, evidence, hint: input.proposed_country }),
    gender: verifyGender({ name, evidence }),
  }
}

// ─── Nationality ─────────────────────────────────────────────────────

function verifyNationality(args: {
  name: string
  evidence: DiscoveryEvidenceUrl[]
  hint: string | null
}): AlphaAttributeConfidence<"kuwaiti" | "non_kuwaiti"> {
  const { name, evidence, hint } = args
  const allText = collectText(name, evidence)

  const breakdown: Record<string, number> = {}
  const trail: string[] = []

  // 1. name_morphology — Kuwaiti family root in the name (weight 0.30)
  let morph = 0
  for (const root of KUWAITI_FAMILY_ROOTS) {
    if (containsToken(name, root)) {
      morph = 0.9
      trail.push(`name_morphology: family root "${root}"`)
      break
    }
  }
  breakdown.name_morphology = morph

  // 2. bio_statement — explicit "Kuwaiti" mention (weight 0.30)
  // v2: Arabic patterns use lookarounds; `\b` doesn't work on Arabic.
  let bio = 0
  if (/(?:^|\s|[،؛.!؟])كويتي(?:ة|\s|$|[،؛.!؟])/u.test(allText)) {
    bio = 0.8
    trail.push(`bio: "كويتي" / "كويتية"`)
  }
  if (/\bkuwaiti\b/i.test(allText)) {
    bio = Math.max(bio, 0.8)
    trail.push(`bio: "Kuwaiti"`)
  }
  if (/\bfrom kuwait\b/i.test(allText) || /\bbased in kuwait\b/i.test(allText)) {
    bio = Math.max(bio, 0.7)
    trail.push(`bio: "from/based in Kuwait"`)
  }
  // Counter-evidence: bio says "from Saudi/Egypt/Lebanon/UAE/Qatar/Bahrain"
  if (
    /\b(?:from\s+)?(saudi|egyptian|egypt|lebanese|emirati|qatari|bahraini|jordanian|syrian|iraqi|yemeni|palestinian|moroccan|sudanese|omani|libyan)\b/i.test(
      allText,
    ) ||
    // Arabic — bare substrings; non-Kuwaiti nationality roots
    /(?:^|\s|[،؛.!؟])(?:سعودي|مصري|لبناني|إماراتي|قطري|بحريني|أردني|سوري|عراقي|يمني|فلسطيني|مغربي|سوداني|عماني|ليبي)(?:ة|\s|$|[،؛.!؟])/u.test(
      allText,
    )
  ) {
    bio = Math.min(bio, -0.5)
    trail.push(`bio: explicit non-Kuwait nationality`)
  }
  breakdown.bio_statement = bio

  // 3. location_mentions — Kuwaiti place names (weight 0.15)
  let loc = 0
  let locHits = 0
  for (const place of KUWAITI_PLACES) {
    if (containsToken(allText, place)) {
      locHits++
      if (locHits === 1) trail.push(`location: "${place}"`)
    }
  }
  if (locHits >= 3) loc = 0.8
  else if (locHits === 2) loc = 0.6
  else if (locHits === 1) loc = 0.4
  breakdown.location_mentions = loc

  // 4. domain_TLD (weight 0.10)
  let tld = 0
  for (const e of evidence) {
    const url = (e.url ?? "").toLowerCase()
    if (/\.kw(\/|:|$)/.test(url) || /kuwait\./.test(url)) {
      tld = 0.7
      trail.push(`tld: ${e.url}`)
      break
    }
  }
  breakdown.domain_TLD = tld

  // 5. affiliation (weight 0.15)
  let aff = 0
  for (const a of KUWAITI_AFFILIATIONS) {
    if (containsToken(allText, a)) {
      aff = 0.7
      trail.push(`affiliation: "${a}"`)
      break
    }
  }
  breakdown.affiliation = aff

  // 6. Hint from search agent — very weak, ignored on disagreement
  let hintScore = 0
  if (hint) {
    if (/kuwait/i.test(hint)) {
      hintScore = 0.3
      trail.push(`hint: "${hint}"`)
    }
  }
  breakdown.search_hint = hintScore

  // Weighted composite
  const composite =
    0.30 * morph +
    0.30 * bio +
    0.15 * loc +
    0.10 * tld +
    0.15 * aff +
    0.05 * hintScore
  // signal_count bonus — at least 2 positive sub-signals adds 0.05
  const positiveCount =
    +(morph > 0) + +(bio > 0) + +(loc > 0) + +(tld > 0) + +(aff > 0)
  const corroboration = positiveCount >= 3 ? 0.10 : positiveCount === 2 ? 0.05 : 0

  let signed = composite + (composite > 0 ? corroboration : 0)
  // If bio is strongly negative, override sign
  if (bio <= -0.4) signed = Math.min(signed, -0.4)

  const value =
    signed >= 0.40 ? "kuwaiti" :
    signed <= -0.40 ? "non_kuwaiti" :
    null
  const confidence = round3(Math.min(1, Math.abs(signed)))

  return {
    value,
    confidence,
    evidence: trail.slice(0, 6),
    signal_breakdown: roundBreakdown(breakdown),
  }
}

// ─── Gender ──────────────────────────────────────────────────────────

function verifyGender(args: {
  name: string
  evidence: DiscoveryEvidenceUrl[]
}): AlphaAttributeConfidence<"male" | "female"> {
  const { name, evidence } = args
  const allText = collectText(name, evidence)
  const breakdown: Record<string, number> = {}
  const trail: string[] = []

  // 1. name_morphology — given-name lookup + ending heuristic
  // (weight 0.30, sign: female positive, male negative — at the end
  // we map sign back to a label)
  let morph = 0
  const firstToken = name.split(/\s+/)[0]?.trim() ?? ""
  const lowerFirst = firstToken.toLowerCase()
  const knownFemale = FEMININE_GIVEN_NAMES.some(
    (n) => lowerFirst === n.toLowerCase() || firstToken === n,
  )
  const knownMale = MASCULINE_GIVEN_NAMES.some(
    (n) => lowerFirst === n.toLowerCase() || firstToken === n,
  )
  if (knownFemale) {
    morph = 0.9
    trail.push(`name: known feminine "${firstToken}"`)
  } else if (knownMale) {
    morph = -0.9
    trail.push(`name: known masculine "${firstToken}"`)
  } else if (firstToken) {
    // Ending heuristic — weaker
    if (FEMININE_NAME_TAILS_AR.some((t) => firstToken.endsWith(t))) {
      morph = 0.4
      trail.push(`name: feminine ending "${firstToken}"`)
    } else if (
      FEMININE_NAME_TAILS_LATIN.some((t) => lowerFirst.endsWith(t)) &&
      lowerFirst.length >= 4
    ) {
      morph = 0.3
      trail.push(`name: Latin-feminine ending "${firstToken}"`)
    }
  }
  breakdown.name_morphology = morph

  // 2. role_morphology — feminine vs masculine Arabic occupation forms
  // (weight 0.25)
  let role = 0
  let femHits = 0
  let masHits = 0
  for (const r of FEMININE_ROLE_FORMS) if (r.test(allText)) femHits++
  for (const r of MASCULINE_ROLE_FORMS) if (r.test(allText)) masHits++
  if (femHits > 0 && femHits > masHits) {
    role = Math.min(1, femHits * 0.4)
    trail.push(`role: feminine forms ×${femHits}`)
  } else if (masHits > 0 && masHits > femHits) {
    role = -Math.min(1, masHits * 0.4)
    trail.push(`role: masculine forms ×${masHits}`)
  }
  breakdown.role_morphology = role

  // 3. bio_statement (weight 0.25) — English pronouns / explicit refs
  let bio = 0
  if (/\bshe is\b/i.test(allText) || /\bshe founded\b/i.test(allText) || /\bher (work|book|art|story)\b/i.test(allText)) {
    bio = 0.8
    trail.push(`bio: feminine pronouns`)
  }
  if (/\bhe is\b/i.test(allText) || /\bhe founded\b/i.test(allText) || /\bhis (work|book|art|story)\b/i.test(allText)) {
    bio = bio === 0 ? -0.8 : 0 // conflict → 0
    if (bio !== 0) trail.push(`bio: masculine pronouns`)
  }
  breakdown.bio_statement = bio

  // 4. pronoun_arabic (weight 0.20) — هي/ها for female, هو/ه for male
  // in name-adjacent context. v2: lookarounds, not \b.
  let pron = 0
  const heCount = (allText.match(/(?:^|\s)هو(?=\s|$|[،؛.!؟])/gu) ?? []).length
  const sheCount = (allText.match(/(?:^|\s)هي(?=\s|$|[،؛.!؟])/gu) ?? []).length
  if (sheCount > heCount && sheCount >= 1) {
    pron = 0.5
    trail.push(`pronoun: هي×${sheCount}`)
  } else if (heCount > sheCount && heCount >= 1) {
    pron = -0.5
    trail.push(`pronoun: هو×${heCount}`)
  }
  breakdown.pronoun_arabic = pron

  // Weighted composite (sign convention: + = female, - = male)
  const composite =
    0.30 * morph + 0.25 * role + 0.25 * bio + 0.20 * pron

  const positiveSignals =
    +(morph !== 0) + +(role !== 0) + +(bio !== 0) + +(pron !== 0)
  const corroboration =
    positiveSignals >= 3 ? 0.10 : positiveSignals === 2 ? 0.05 : 0
  const signed =
    composite +
    (composite > 0 ? corroboration : composite < 0 ? -corroboration : 0)

  const value =
    signed >= 0.40 ? "female" :
    signed <= -0.40 ? "male" :
    null
  const confidence = round3(Math.min(1, Math.abs(signed)))

  return {
    value,
    confidence,
    evidence: trail.slice(0, 6),
    signal_breakdown: roundBreakdown(breakdown),
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function collectText(name: string, evidence: DiscoveryEvidenceUrl[]): string {
  return [name, ...evidence.map((e) => `${e.title ?? ""} ${e.snippet ?? ""}`)]
    .filter(Boolean)
    .join(" \n ")
}

function containsToken(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false
  // Case-insensitive substring; safe enough given we curate the
  // needles. Arabic forms aren't affected by lowercasing.
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function roundBreakdown(b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(b)) out[k] = round3(v)
  return out
}

function round3(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.round(v * 1000) / 1000
}
