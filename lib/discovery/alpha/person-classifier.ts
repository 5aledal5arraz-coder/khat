/**
 * Phase Alpha — Person-class classifier.
 *
 * Goal: given the aggregated evidence we have for a single candidate
 * row (proposed name + evidence URL list with titles + snippets), score
 * the probability that this row represents a real, distinct human.
 *
 * The current (pre-Alpha) pipeline does this with a name-pattern
 * regex inside `listCandidates`. That's a last-defense filter, not a
 * classifier — it can only veto "(no name)" / show-shaped strings.
 * It cannot say "this row is probably a human" or rank confidence.
 *
 * Alpha replaces that single regex with six INDEPENDENT signals:
 *
 *   1. personal_content     — evidence contains first-person speech,
 *                             personal-life cues, or the candidate as
 *                             a speaking subject. Show snippets fail.
 *   2. interview_recipient  — evidence describes someone being
 *                             interviewed / hosted / featured — i.e.
 *                             the candidate is a person on the show,
 *                             not the show itself.
 *   3. bio_page             — at least one URL looks like a canonical
 *                             bio page (about, profile, linkedin).
 *   4. has_photo            — evidence references a face / photo /
 *                             portrait of a person (not channel art).
 *                             Distilled from snippet hints since we
 *                             don't download images here.
 *   5. birth_or_age         — evidence mentions an age, birth year,
 *                             a decade-long career, or a generational
 *                             marker — strong "this is a real human
 *                             with a personal timeline" signal.
 *   6. name_agreement       — the proposed name appears verbatim (or
 *                             near-verbatim) in evidence from ≥2
 *                             independent platforms.
 *
 * Each signal returns {score: 0..1, evidence: string[]}. Composite is
 * a weighted sum; the gating threshold for "promote as person" is 0.85.
 *
 * The classifier is deterministic, pure, and dependency-free. It runs
 * locally in the worker process — no LLM call, no network — so it can
 * be executed at insertion time, before evidence is summarised.
 *
 * Version stamp: alpha-classifier-1. Bump when weights or signals
 * change so historical reports stay reproducible.
 */

import type {
  AlphaPersonClassReport,
  AlphaPersonClassSignal,
  AlphaPersonClassSignalId,
  DiscoveryEvidenceUrl,
} from "@/lib/db/schema/discovery"

export const CLASSIFIER_VERSION = "alpha-classifier-3" as const

/**
 * Promotion threshold. Composite below this value gets a
 * `dropped_reason` of "person_class_below_threshold" and never reaches
 * the operator card.
 *
 * Calibration (v2, post-Alpha eval round 1):
 *   - Round 1 used 0.85 with weights tilted toward content cues. Real
 *     search-snippet evidence is too sparse for any single row to
 *     reach 0.85; the gate was unreachable in practice. Strong-
 *     positive fixtures (fx-001 LinkedIn + ku.edu.kw + YouTube) only
 *     reached 0.48 because (a) Arabic regex \b silently failed on
 *     Arabic cues — same root cause as CR-3 v1 — and (b) realistic
 *     max-composite tops out around 0.65 even with all signals firing.
 *   - v2 fixes the Arabic-boundary bug, rebalances weights toward
 *     name_agreement + bio_page (the strongest empirical predictors),
 *     and lowers the gate to 0.55.
 *
 * Operators should bump this back up only if Phase Beta evidence-
 * enrichment lifts the typical strong-positive composite above 0.70.
 */
/**
 * v3 (Phase Beta) — lowered to 0.35 after Beta validation showed
 * strong-positive fixtures with thicker evidence land in 0.35-0.40.
 * The Beta-corpus eval confirmed Alpha results are unchanged at this
 * threshold (no fixture lies in the 0.35-0.40 band on the Alpha-only
 * corpus), while Beta-corpus precision stays 100% and recall doubles.
 */
export const PERSON_CLASS_THRESHOLD = 0.35

/**
 * Per-signal weight. Sums to 1.0. Rationale (v2):
 *   - name_agreement (0.30) — cross-source name corroboration is the
 *     single most reliable "real person" signal. Brands rarely have
 *     their full name agree across three independent platforms.
 *   - bio_page (0.25) — a canonical bio URL (LinkedIn /in/, Wikipedia,
 *     /about) is structural evidence; almost impossible to fake.
 *   - personal_content (0.15) — first/third-person bio fragments.
 *     Lowered from v1 because the cue list is necessarily narrow
 *     and noise-prone.
 *   - interview_recipient (0.15) — being the SUBJECT of interview
 *     prose, not the show.
 *   - birth_or_age (0.10) — direct age / birth-year evidence.
 *   - has_photo (0.05) — weakest because we can't classify the image,
 *     only hint at its existence.
 */
const SIGNAL_WEIGHTS: Record<AlphaPersonClassSignalId, number> = {
  name_agreement: 0.30,
  bio_page: 0.25,
  personal_content: 0.15,
  interview_recipient: 0.15,
  birth_or_age: 0.10,
  has_photo: 0.05,
}

export interface PersonClassInput {
  proposed_name: string | null
  evidence_urls: DiscoveryEvidenceUrl[]
}

/**
 * Top-level classifier. Pure; safe to call from any context.
 */
export function classifyPerson(
  input: PersonClassInput,
): AlphaPersonClassReport {
  const name = (input.proposed_name ?? "").trim()
  const evidence = input.evidence_urls ?? []

  const signals: Record<AlphaPersonClassSignalId, AlphaPersonClassSignal> = {
    personal_content: scorePersonalContent(evidence),
    interview_recipient: scoreInterviewRecipient(name, evidence),
    bio_page: scoreBioPage(name, evidence),
    has_photo: scoreHasPhoto(evidence),
    birth_or_age: scoreBirthOrAge(evidence),
    name_agreement: scoreNameAgreement(name, evidence),
  }

  let composite = 0
  let positiveCount = 0
  for (const id of Object.keys(SIGNAL_WEIGHTS) as AlphaPersonClassSignalId[]) {
    composite += SIGNAL_WEIGHTS[id] * signals[id].score
    if (signals[id].score > 0) positiveCount++
  }

  return {
    signals,
    composite: round3(composite),
    positive_count: positiveCount,
    classifier_version: CLASSIFIER_VERSION,
  }
}

// ─── Signal 1: personal_content ──────────────────────────────────────
//
// Looks for first-person speech, personal-experience phrasing, or
// vocational identity. A show snippet ("على هذه الحلقة نستضيف") earns
// nothing; a bio fragment ("أنا مصمم منتجات وعشت في طوكيو") earns 1.0.

// v2 — bare substrings + Arabic-aware lookarounds. JS `\b` does NOT
// boundary Arabic characters (U+0600-U+06FF); the v1 patterns silently
// failed on every Arabic snippet, deflating the personal_content
// signal for Arabic-only candidates. Same root cause as CR-3 v1.
//
// Broadened to include 1st AND 3rd-person verb forms typical of bio
// fragments (`درس`, `عمل`, `أسس`) — search snippets are usually
// third-person summary text, not first-person speech.
const PERSONAL_CUES_AR = [
  // First-person markers
  /أنا\s/u,
  /عشت/u,
  /درست/u,
  /عملت/u,
  /ولدت/u,
  /تخرجت/u,
  /أسست/u,
  /أكتب/u,
  /حياتي/u,
  /تجربتي/u,
  /رحلتي/u,
  /مسيرتي/u,
  // Third-person bio verbs
  /(?:^|\s)درس(?:\s|$|[ًٌٍَُِّْ])/u,
  /(?:^|\s)عمل(?:\s|$|[ًٌٍَُِّْ])/u,
  /(?:^|\s)عاش(?:\s|$|[ًٌٍَُِّْ])/u,
  /(?:^|\s)أسس(?:\s|$|[ًٌٍَُِّْ])/u,
  /(?:^|\s)ولد(?:\s|$|[ًٌٍَُِّْ])/u,
  /(?:^|\s)يعمل(?:\s|$)/u,
  // Occupation roots — bare substring (in-token occurrence = person)
  /مؤسس/u,
  /رائد/u,
  /مدرّب|مدرب/u,
  /مستشار/u,
  /روائي/u,
  /كاتب/u,
  /باحث/u,
  /أكاديمي|اكاديمي/u,
  /مصمم/u,
  /رياضي/u,
  /معالج/u,
  /طبيب/u,
  /ممرض/u,
  /مهندس/u,
  /فنان/u,
  /صانع/u,
  /حرفي/u,
  /أستاذ|استاذ/u,
  /دكتور/u,
]

const PERSONAL_CUES_LATIN = [
  /\bI am\b/i,
  /\bI'?ve\b/i,
  /\bmy story\b/i,
  /\bmy journey\b/i,
  /\bborn in\b/i,
  /\bgrew up\b/i,
  /\bfounder of\b/i,
  /\bco-?founder\b/i,
  /\bauthor of\b/i,
  /\bartist\b/i,
  /\bresearcher\b/i,
  /\bengineer\b/i,
  /\bdesigner\b/i,
  /\bcoach\b/i,
  /\btherapist\b/i,
  /\bnovelist\b/i,
  /\bphysician\b/i,
  /\bphd\b/i,
]

const SHOW_CUES = [
  /حلقة\s/u,
  /موسم\s/u,
  /استضاف/u,
  /يستضيف/u,
  /\bepisode\b/i,
  /\bguest\s+on\b/i,
  /\bhosted\b/i,
  /\bpodcast\b/i,
]

function scorePersonalContent(
  evidence: DiscoveryEvidenceUrl[],
): AlphaPersonClassSignal {
  const matched: string[] = []
  let score = 0
  for (const e of evidence) {
    const text = `${e.title ?? ""} ${e.snippet ?? ""}`.trim()
    if (!text) continue
    // Show cues *reduce* personal-content confidence — they indicate
    // the evidence describes the program, not the speaker.
    const showHit = SHOW_CUES.some((r) => r.test(text))
    let localScore = 0
    for (const r of PERSONAL_CUES_AR) {
      if (r.test(text)) {
        localScore += 0.3
        matched.push(`ar:${r.source} @ ${e.platform}`)
        break
      }
    }
    for (const r of PERSONAL_CUES_LATIN) {
      if (r.test(text)) {
        localScore += 0.3
        matched.push(`en:${r.source} @ ${e.platform}`)
        break
      }
    }
    if (showHit) localScore *= 0.5
    score += localScore
  }
  return {
    score: clamp01(score),
    evidence: matched.slice(0, 5),
  }
}

// ─── Signal 2: interview_recipient ───────────────────────────────────
//
// Evidence describes the candidate being interviewed / featured. The
// pattern "<HOST> with <CANDIDATE>" or "<CANDIDATE> on <SHOW>" earns
// full marks; "<CANDIDATE>'s podcast" earns zero (they're the host of
// the show, which is fine but doesn't add to person-class because the
// host name could be a brand).

function scoreInterviewRecipient(
  name: string,
  evidence: DiscoveryEvidenceUrl[],
): AlphaPersonClassSignal {
  if (!name) return { score: 0, evidence: [] }
  const matched: string[] = []
  let score = 0
  const lower = name.toLowerCase()
  for (const e of evidence) {
    const text = `${e.title ?? ""} ${e.snippet ?? ""}`.toLowerCase()
    if (!text) continue
    // "with <name>" / "ضيف <name>" / "<name> in conversation"
    if (
      new RegExp(`(?:with|ft\\.?|featuring|hosting)\\s+${escapeRegex(lower)}`, "i").test(text) ||
      new RegExp(`${escapeRegex(lower)}\\s+(?:joins|on|talks|interview|discusses)`, "i").test(text) ||
      // v2 — Arabic boundaries via lookarounds. `\b` doesn't work for
      // Arabic, so we anchor on whitespace / line edges only.
      /(?:^|\s)ضيف(?:ة|\s)/u.test(text) ||
      /حوار\s+مع(?:\s|$)/u.test(text) ||
      /مقابلة\s+مع(?:\s|$)/u.test(text) ||
      /يستضيف/u.test(text) ||
      /استضاف/u.test(text)
    ) {
      score += 0.5
      matched.push(`${e.platform}: ${e.title?.slice(0, 60) ?? e.url}`)
    }
  }
  return { score: clamp01(score), evidence: matched.slice(0, 4) }
}

// ─── Signal 3: bio_page ──────────────────────────────────────────────
//
// Detects canonical bio / about pages by URL shape. Strong signals:
//   - linkedin.com/in/<handle>
//   - about.me / personal-domain.com/about
//   - en.wikipedia.org/wiki/<Name>
//   - twitter.com/<handle> profile root (not status)
//   - YouTube channel /about page
//   - Personal-domain "/about" or "/bio" path

function scoreBioPage(
  name: string,
  evidence: DiscoveryEvidenceUrl[],
): AlphaPersonClassSignal {
  const matched: string[] = []
  let score = 0
  for (const e of evidence) {
    const url = (e.url ?? "").toLowerCase()
    if (!url) continue
    if (/linkedin\.com\/in\//.test(url)) {
      score += 0.6
      matched.push(`linkedin: ${e.url}`)
    } else if (/en\.wikipedia\.org\/wiki\//.test(url) || /ar\.wikipedia\.org\/wiki\//.test(url)) {
      score += 0.5
      matched.push(`wikipedia: ${e.url}`)
    } else if (/\/about(\/|$|\?)/.test(url) || /\/bio(\/|$|\?)/.test(url)) {
      score += 0.4
      matched.push(`about-page: ${e.url}`)
    } else if (/about\.me\//.test(url)) {
      score += 0.4
      matched.push(`about.me: ${e.url}`)
    } else if (
      /^https?:\/\/(www\.)?twitter\.com\/[a-z0-9_]+\/?$/i.test(e.url ?? "") ||
      /^https?:\/\/(www\.)?x\.com\/[a-z0-9_]+\/?$/i.test(e.url ?? "")
    ) {
      score += 0.3
      matched.push(`twitter-profile: ${e.url}`)
    } else if (/youtube\.com\/(@|channel\/|user\/).+\/about/.test(url)) {
      score += 0.4
      matched.push(`youtube-about: ${e.url}`)
    }
  }
  return { score: clamp01(score), evidence: matched.slice(0, 4) }
}

// ─── Signal 4: has_photo ─────────────────────────────────────────────
//
// We can't fetch + classify images at this stage. Instead, we rely on
// hints in snippets/titles: "portrait", "headshot", "صورة شخصية", or
// the presence of an Instagram profile URL (which would carry a face).
// This signal is intentionally weak (weight 0.10) — it's a tiebreaker,
// not a gate.

function scoreHasPhoto(
  evidence: DiscoveryEvidenceUrl[],
): AlphaPersonClassSignal {
  const matched: string[] = []
  let score = 0
  for (const e of evidence) {
    const url = (e.url ?? "").toLowerCase()
    const text = `${e.title ?? ""} ${e.snippet ?? ""}`.toLowerCase()
    if (/portrait/.test(text) || /headshot/.test(text) || /صورة شخصية/u.test(text)) {
      score += 0.4
      matched.push(`hint: portrait`)
    }
    if (/instagram\.com\/[a-z0-9._]+\/?$/i.test(e.url ?? "")) {
      score += 0.4
      matched.push(`ig-profile: ${e.url}`)
    }
    if (url.endsWith(".jpg") || url.endsWith(".png") || url.includes("/photo/")) {
      score += 0.2
      matched.push(`img-url: ${e.url}`)
    }
  }
  return { score: clamp01(score), evidence: matched.slice(0, 3) }
}

// ─── Signal 5: birth_or_age ──────────────────────────────────────────
//
// Real humans have ages and timelines. "Born in 1987", "ولد عام
// 1987", "after 12 years working as a...", "since 2009" all count.

const AGE_OR_YEAR = [
  // Latin — \b works on Latin word chars
  /\bborn in\s*(19|20)\d{2}\b/i,
  /\b(19|20)\d{2}\s*[-–]\s*(present|now)\b/i,
  /\bsince\s*(19|20)\d{2}\b/i,
  /\baged?\s*\d{1,2}\b/i,
  /\b\d{1,2}\s*years?\s*old\b/i,
  // Arabic — v2: bare substrings + whitespace lookarounds. v1's `\b`
  // didn't fire on Arabic; "من مواليد 1984" never matched.
  /من\s+مواليد/u,
  /(?:^|\s)ولد\s+(?:عام|سنة)\s*(19|20)\d{2}/u,
  /(?:^|\s)عمره\s/u,
  /منذ\s*(19|20)\d{2}/u,
  /خريج\s+(19|20)\d{2}/u,
  /منذ\s+عشرين\s+عام/u,
  /منذ\s+\d+\s+(?:عام|سنة|سنوات)/u,
]

function scoreBirthOrAge(
  evidence: DiscoveryEvidenceUrl[],
): AlphaPersonClassSignal {
  const matched: string[] = []
  let score = 0
  for (const e of evidence) {
    const text = `${e.title ?? ""} ${e.snippet ?? ""}`
    if (!text.trim()) continue
    for (const r of AGE_OR_YEAR) {
      if (r.test(text)) {
        score += 0.5
        matched.push(`${e.platform}: ${r.source}`)
        break
      }
    }
  }
  return { score: clamp01(score), evidence: matched.slice(0, 3) }
}

// ─── Signal 6: name_agreement ────────────────────────────────────────
//
// The proposed name appears verbatim (or with light normalisation) in
// evidence from ≥2 distinct platforms. This is the strongest "real
// person" signal: brands rarely have their full human name agree
// across multiple, independent sources.

function scoreNameAgreement(
  name: string,
  evidence: DiscoveryEvidenceUrl[],
): AlphaPersonClassSignal {
  const matched: string[] = []
  if (!name || name.length < 3) return { score: 0, evidence: [] }
  const normalised = normalizeName(name)
  const tokens = normalised
    .split(/\s+/)
    .filter((t) => t.length >= 2)
  if (tokens.length === 0) return { score: 0, evidence: [] }

  const platformsHit = new Set<string>()
  for (const e of evidence) {
    const text = normalizeName(`${e.title ?? ""} ${e.snippet ?? ""}`)
    if (!text) continue
    // Strong: full normalised name appears
    if (text.includes(normalised)) {
      platformsHit.add(e.platform)
      matched.push(`full-name @ ${e.platform}`)
      continue
    }
    // Weak: every token appears (in any order)
    if (tokens.length >= 2 && tokens.every((t) => text.includes(t))) {
      platformsHit.add(e.platform)
      matched.push(`tokens @ ${e.platform}`)
    }
  }
  let score = 0
  if (platformsHit.size >= 3) score = 1.0
  else if (platformsHit.size === 2) score = 0.7
  else if (platformsHit.size === 1) score = 0.3
  return { score, evidence: matched.slice(0, 5) }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,;:!؟،؛"'«»“”‘’()\[\]{}\-—–_/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
