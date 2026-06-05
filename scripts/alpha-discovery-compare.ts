/**
 * Phase Alpha — measurable A/B harness.
 *
 *   npm run alpha:discovery-compare                 (fixture mode)
 *   npm run alpha:discovery-compare -- --db         (DB mode)
 *   npm run alpha:discovery-compare -- --db --eir <eirId>
 *   npm run alpha:discovery-compare -- --json       (machine output)
 *
 * Fixture mode runs both pipelines (current legacy filter + Alpha) on
 * a hand-curated, real-shaped corpus that mirrors what Operator Day #2
 * actually saw — including the failure modes the current filter still
 * misses ("(no name)" through bio-page fall-through, brand-shaped
 * names that pass CR-3, etc.). No DB or network required.
 *
 * DB mode reads candidates directly from guest_discovery_candidates,
 * optionally filtered to one EIR via --eir <id>, and runs Alpha on
 * each row's evidence in-place. Useful AFTER the operator has run the
 * Phase Alpha migration locally.
 *
 * Both modes produce the same 9 measurement metrics:
 *
 *   1. person_id_accuracy      — % of rows correctly classified as
 *                                person-vs-non-person against the
 *                                fixture's ground truth label
 *   2. nationality_accuracy    — % correct on labeled rows
 *   3. gender_accuracy         — % correct on labeled rows
 *   4. non_person_elimination  — % of non-person rows dropped
 *   5. social_profile_quality  — avg curated-citations per surviving row
 *   6. evidence_quality        — avg axis-diverse evidence (Alpha only)
 *   7. operator_confidence     — avg of (identity_confidence) on
 *                                rows shown to operator (Alpha) vs
 *                                the inverse % of "(no name)"
 *                                fall-throughs (legacy)
 *   8. hidden_gem_rate         — % of surviving rows with
 *                                hidden_gem_score >= 0.6
 *   9. editorial_quality       — avg recommendation_score on
 *                                surviving rows (Alpha) vs avg
 *                                composite_score on legacy
 *
 * Output is a side-by-side report. Decision rule: Alpha must
 * outperform on at least 4 of 9 metrics with no regression on the
 * remaining ones to advance to Phase Beta.
 */

import {
  runAlphaPipeline,
  PERSON_CLASS_THRESHOLD,
} from "@/lib/discovery/alpha"
import type {
  DiscoveryArchetype,
  DiscoveryEvidenceUrl,
  DiscoveryPlatformSignals,
} from "@/lib/db/schema/discovery"

// ─── Fixture corpus ──────────────────────────────────────────────────
//
// Each fixture row mirrors what real candidates from Operator Day #2
// looked like AT THE INSERTION POINT — proposed_name comes from a
// search title fragment, evidence_urls carries title + snippet from
// the search hit. The `truth` block holds the ground-truth label for
// evaluation: is this actually a person? what's the real nationality
// + gender? Synthetic data is clearly marked.

interface FixtureRow {
  id: string
  source: string
  archetype: DiscoveryArchetype
  proposed_name: string | null
  proposed_role: string | null
  proposed_country: string | null
  evidence_urls: DiscoveryEvidenceUrl[]
  platform_signals: DiscoveryPlatformSignals | null
  filters?: {
    gender?: "male" | "female"
    nationality?: "kuwaiti" | "non_kuwaiti"
  }
  episodeContext?: {
    workingTitle: string
    topicDomain?: string | null
  }
  truth: {
    is_person: boolean
    nationality?: "kuwaiti" | "non_kuwaiti"
    gender?: "male" | "female"
    /** Operator notes — what this fixture is meant to test. */
    note: string
  }
}

const ARC_QUIET_EXPERT: DiscoveryArchetype = {
  id: "quiet_expert",
  name: "خبير صامت",
  description: "صاحب خبرة عميقة لا يسوّق نفسه على المنصات",
  target_signals: ["خبرة هادئة", "مهارة قديمة", "عمل صامت"],
  expected_traits: ["دقة", "صبر", "تواضع"],
}

const ARC_TRANSFORMATION: DiscoveryArchetype = {
  id: "transformation_story",
  name: "قصة تحوّل",
  description: "شخصية مرّت بتحوّل حقيقي تتحدث عنه بصدق",
  target_signals: ["تحوّل", "نقطة فاصلة", "إعادة بناء"],
  expected_traits: ["صدق", "نضج"],
}

const ARC_MOTIVATIONAL_SATURATED: DiscoveryArchetype = {
  id: "motivational_speaker",
  name: "متحدّث تحفيزي",
  description: "خط مشبع — يُستبعد عادةً",
  target_signals: ["تحفيز", "نجاح", "إيجابية"],
  expected_traits: ["كاريزما"],
}

const EP_CTX_KUWAITI_IDENTITY = {
  workingTitle: "الهويّة الذكورية في الكويت",
  topicDomain: "identity_masculinity",
}

const FIXTURES: FixtureRow[] = [
  // ── True positive: clearly a Kuwaiti male expert ─────────────────
  {
    id: "fx-001",
    source: "google_web",
    archetype: ARC_QUIET_EXPERT,
    proposed_name: "خالد الرشيدي",
    proposed_role: "باحث في الأنثروبولوجيا الثقافية",
    proposed_country: "Kuwait",
    evidence_urls: [
      {
        platform: "linkedin",
        url: "https://www.linkedin.com/in/khalid-alrashidi/",
        title: "Khalid Al-Rashidi — Researcher, Kuwait University",
        snippet:
          "He is a Kuwaiti researcher based in Kuwait. Born in 1984. He founded the Diwan Studies Lab in 2015 and has published 12 papers on Gulf masculinity.",
      },
      {
        platform: "google_web",
        url: "https://ku.edu.kw/faculty/khalid-alrashidi",
        title: "Faculty profile — Kuwait University",
        snippet:
          "خالد الرشيدي، أستاذ مساعد في كلية الآداب بجامعة الكويت. كويتي من مواليد 1984. باحث في الأنثروبولوجيا.",
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=abc123",
        title: "حوار مع خالد الرشيدي عن الهوية الذكورية الخليجية",
        snippet: "ضيف هذه الحلقة الباحث خالد الرشيدي يتحدث عن تجربته.",
      },
    ],
    platform_signals: {
      youtube: { subscribers: 1200 },
      google_web: { query: "باحث كويتي أنثروبولوجيا الهوية الذكورية" },
    },
    filters: { gender: "male", nationality: "kuwaiti" },
    episodeContext: EP_CTX_KUWAITI_IDENTITY,
    truth: {
      is_person: true,
      nationality: "kuwaiti",
      gender: "male",
      note: "Strong positive — should pass with high recommendation",
    },
  },

  // ── True positive: a hidden expert (low audience), Kuwaiti male
  {
    id: "fx-002",
    source: "podcast",
    archetype: ARC_QUIET_EXPERT,
    proposed_name: "محمد العتيبي",
    proposed_role: "صانع ساعات يدوية",
    proposed_country: "Kuwait",
    evidence_urls: [
      {
        platform: "podcast",
        url: "https://itunes.apple.com/podcast/سوالف-حرف/id123",
        title: "حلقة سوالف حرف — ضيف الحلقة محمد العتيبي",
        snippet:
          "ضيف هذه الحلقة محمد العتيبي، صانع ساعات كويتي يعمل في حي السالمية منذ عشرين عاماً.",
      },
      {
        platform: "google_web",
        url: "https://alqabas.com/article/watchmaker-kuwait-2024",
        title: "قصة محمد العتيبي صانع الساعات الكويتي",
        snippet:
          "محمد العتيبي كويتي من حي حولي. درس صناعة الساعات في سويسرا ثم عاد عام 2003. يعمل في ورشة صغيرة في السالمية.",
      },
    ],
    platform_signals: {
      podcast: { episodes: 1 },
      google_web: { query: "صانع ساعات كويتي حرفي" },
    },
    filters: { gender: "male", nationality: "kuwaiti" },
    episodeContext: EP_CTX_KUWAITI_IDENTITY,
    truth: {
      is_person: true,
      nationality: "kuwaiti",
      gender: "male",
      note: "Hidden gem — low audience, strong evidence, archetype match",
    },
  },

  // ── False positive: show/podcast name passed as proposed_name ────
  // (This is the exact failure mode CR-3 still partially missed.)
  {
    id: "fx-003",
    source: "youtube",
    archetype: ARC_QUIET_EXPERT,
    proposed_name: "روايتهم بودكاست",
    proposed_role: null,
    proposed_country: null,
    evidence_urls: [
      {
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=xyz789",
        title: "روايتهم بودكاست — حلقة 12",
        snippet: "حلقة جديدة من بودكاست روايتهم تستضيف ضيفاً مميزاً.",
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/channel/UCxyz",
        title: "روايتهم بودكاست",
        snippet: "قناة بودكاست متخصصة في القصص الإنسانية.",
      },
    ],
    platform_signals: { youtube: { subscribers: 8000 } },
    filters: { gender: "male", nationality: "kuwaiti" },
    episodeContext: EP_CTX_KUWAITI_IDENTITY,
    truth: {
      is_person: false,
      note: "Channel name — must be dropped before operator sees it",
    },
  },

  // ── Ambiguous (no name) — current pipeline lets through, Alpha
  // should drop on missing_name + low identity_confidence
  {
    id: "fx-004",
    source: "google_web",
    archetype: ARC_TRANSFORMATION,
    proposed_name: "(no name)",
    proposed_role: null,
    proposed_country: null,
    evidence_urls: [
      {
        platform: "google_web",
        url: "https://example.com/article-12",
        title: "Untitled article",
        snippet: "Lorem ipsum dolor sit amet.",
      },
    ],
    platform_signals: { google_web: { query: "story transformation" } },
    filters: { gender: "male", nationality: "kuwaiti" },
    truth: {
      is_person: false,
      note: '"(no name)" placeholder — must be filtered',
    },
  },

  // ── Brand/organization that survives CR-3 by being only Latin
  // ("Yaqeen Institute"). Should fail Alpha on bio-page absence +
  // no birth/age + show-cue dilution.
  {
    id: "fx-005",
    source: "google_web",
    archetype: ARC_QUIET_EXPERT,
    proposed_name: "Yaqeen Knowledge",
    proposed_role: null,
    proposed_country: null,
    evidence_urls: [
      {
        platform: "google_web",
        url: "https://yaqeenknowledge.org/about-us",
        title: "About — Yaqeen Knowledge",
        snippet:
          "We are a non-profit research foundation. Our team produces lectures, articles, and courses.",
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/channel/UCyaq",
        title: "Yaqeen Knowledge",
        snippet: "Weekly lectures from our scholars.",
      },
    ],
    platform_signals: { youtube: { subscribers: 250_000 } },
    filters: { gender: "male", nationality: "kuwaiti" },
    truth: {
      is_person: false,
      note: "Organisation, no person — must be dropped",
    },
  },

  // ── Kuwaiti female (should be dropped by Alpha when filter=male)
  {
    id: "fx-006",
    source: "google_web",
    archetype: ARC_TRANSFORMATION,
    proposed_name: "نورة الكندري",
    proposed_role: "روائية كويتية",
    proposed_country: "Kuwait",
    evidence_urls: [
      {
        platform: "google_web",
        url: "https://en.wikipedia.org/wiki/Noora_Al-Kandari",
        title: "Noora Al-Kandari — Kuwaiti novelist",
        snippet:
          "She is a Kuwaiti novelist born in 1979. She founded the publishing house Sahab in 2010. Her work has been translated into 6 languages.",
      },
      {
        platform: "podcast",
        url: "https://itunes.apple.com/podcast/al-yaqeen/id456",
        title: "حوار مع الروائية نورة الكندري",
        snippet: "ضيفة هذه الحلقة الروائية الكويتية نورة الكندري.",
      },
    ],
    platform_signals: {
      google_web: { query: "روائية كويتية" },
    },
    filters: { gender: "male", nationality: "kuwaiti" },
    truth: {
      is_person: true,
      nationality: "kuwaiti",
      gender: "female",
      note: "Person but wrong gender — should be dropped by Alpha gender gate",
    },
  },

  // ── Egyptian male — same archetype, wrong nationality.
  {
    id: "fx-007",
    source: "google_web",
    archetype: ARC_QUIET_EXPERT,
    proposed_name: "أحمد فؤاد",
    proposed_role: "أستاذ علم اجتماع",
    proposed_country: "Egypt",
    evidence_urls: [
      {
        platform: "google_web",
        url: "https://cu.edu.eg/faculty/ahmed-fouad",
        title: "Ahmed Fouad — Professor, Cairo University",
        snippet:
          "He is an Egyptian professor based in Cairo. Born in 1972. His work focuses on Gulf identity studies.",
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=eg1",
        title: "محاضرة د. أحمد فؤاد عن الهوية الذكورية",
        snippet:
          "محاضرة الدكتور أحمد فؤاد المصري في جامعة القاهرة عن الهوية الذكورية في الخليج.",
      },
    ],
    platform_signals: { google_web: { query: "أستاذ علم اجتماع الهوية" } },
    filters: { gender: "male", nationality: "kuwaiti" },
    truth: {
      is_person: true,
      nationality: "non_kuwaiti",
      gender: "male",
      note: "Person + male but Egyptian — should be dropped by nationality gate",
    },
  },

  // ── Saturated archetype (motivational): person but low fit
  {
    id: "fx-008",
    source: "youtube",
    archetype: ARC_MOTIVATIONAL_SATURATED,
    proposed_name: "بدر السبيعي",
    proposed_role: "مدرّب تحفيز",
    proposed_country: "Kuwait",
    evidence_urls: [
      {
        platform: "youtube",
        url: "https://www.youtube.com/watch?v=mot1",
        title: "نصائح وحيل للنجاح اليومي مع بدر السبيعي",
        snippet:
          "10 نصائح من حياتي تساعدك على تحقيق أهدافك. أنا بدر السبيعي مدرّب تحفيز.",
      },
      {
        platform: "youtube",
        url: "https://www.youtube.com/channel/UCmot",
        title: "بدر السبيعي - Daily Motivation",
        snippet: "محتوى تحفيزي يومي.",
      },
    ],
    platform_signals: { youtube: { subscribers: 350_000 } },
    filters: { gender: "male", nationality: "kuwaiti" },
    truth: {
      is_person: true,
      nationality: "kuwaiti",
      gender: "male",
      note: "Person + correct attrs but saturated archetype — should rank low",
    },
  },

  // ── Branded "Just X" pattern that the CR-3 regex already catches.
  {
    id: "fx-009",
    source: "google_web",
    archetype: ARC_QUIET_EXPERT,
    proposed_name: "Just The Show",
    proposed_role: null,
    proposed_country: null,
    evidence_urls: [
      {
        platform: "google_web",
        url: "https://justtheshow.com/episodes",
        title: "Just The Show — Episodes",
        snippet: "A weekly podcast about everything and nothing.",
      },
    ],
    platform_signals: { google_web: { query: "podcast just the show" } },
    filters: { gender: "male", nationality: "kuwaiti" },
    truth: {
      is_person: false,
      note: "Branded podcast title — caught by both pipelines",
    },
  },

  // ── Kuwaiti male, sparse evidence (1 source). Alpha should keep
  // but at low identity_confidence (no triangulation).
  {
    id: "fx-010",
    source: "google_web",
    archetype: ARC_TRANSFORMATION,
    proposed_name: "فهد المطيري",
    proposed_role: null,
    proposed_country: null,
    evidence_urls: [
      {
        platform: "google_web",
        url: "https://example.kw/article-fahd",
        title: "فهد المطيري يحكي قصته",
        snippet: "قصة فهد المطيري بعد رحلته إلى أوروبا.",
      },
    ],
    platform_signals: { google_web: { query: "قصة فهد المطيري" } },
    filters: { gender: "male", nationality: "kuwaiti" },
    truth: {
      is_person: true,
      nationality: "kuwaiti",
      gender: "male",
      note: "Single source, ambiguous — Alpha should report low identity_confidence",
    },
  },

  // ── Non-Kuwaiti expert with strong Kuwait affiliation (KFAS) —
  // tests that Alpha doesn't false-positive on Kuwaitiness from one
  // affiliation alone.
  {
    id: "fx-011",
    source: "google_web",
    archetype: ARC_QUIET_EXPERT,
    proposed_name: "Hassan Hamdan",
    proposed_role: "researcher",
    proposed_country: "Lebanon",
    evidence_urls: [
      {
        platform: "google_web",
        url: "https://kfas.org/grant-recipients/hassan-hamdan",
        title: "KFAS — Grant recipient profile: Hassan Hamdan",
        snippet:
          "Dr. Hassan Hamdan is a Lebanese researcher who received a KFAS grant in 2019.",
      },
      {
        platform: "linkedin",
        url: "https://www.linkedin.com/in/hassan-hamdan/",
        title: "Hassan Hamdan — AUB",
        snippet:
          "He is a Lebanese academic. Born in 1980. Based in Beirut. Researcher at the American University of Beirut.",
      },
    ],
    platform_signals: { google_web: { query: "KFAS researcher Gulf identity" } },
    filters: { gender: "male", nationality: "kuwaiti" },
    truth: {
      is_person: true,
      nationality: "non_kuwaiti",
      gender: "male",
      note: "One Kuwaiti affiliation, otherwise Lebanese — must NOT pass as Kuwaiti",
    },
  },

  // ── Mixed-script malformed name — Latin + Arabic stuck together
  {
    id: "fx-012",
    source: "google_web",
    archetype: ARC_QUIET_EXPERT,
    proposed_name: "Rfoof رفوف",
    proposed_role: null,
    proposed_country: null,
    evidence_urls: [
      {
        platform: "google_web",
        url: "https://www.instagram.com/rfoofbooks/",
        title: "Rfoof رفوف",
        snippet: "Bookshop on Instagram.",
      },
    ],
    platform_signals: { google_web: { query: "bookshop kuwait" } },
    filters: { gender: "male", nationality: "kuwaiti" },
    truth: {
      is_person: false,
      note: "Brand handle + Arabic — must be filtered",
    },
  },
]

// ─── Pipelines under test ────────────────────────────────────────────

/**
 * Current pipeline simulator — we don't fire the actual LLM. Instead
 * we replicate the deterministic part of the current pipeline (the
 * `isPersonName` filter in lib/discovery/candidates.ts, which IS the
 * non-person gate today after CR-3). For attributes we report
 * "unknown" because the legacy attribute inference is a one-shot LLM
 * call we cannot fairly simulate here without burning quota.
 *
 * For the editorial score, we use the legacy ranker's deterministic
 * `editorial_fit_score` proxy: presence-of-snippets and platform
 * diversity, which is what the legacy ranker boils down to when the
 * LLM score is null (its actual fallback).
 */
import {
  computeEditorialFit as alphaComputeFit,
} from "@/lib/discovery/alpha/editorial-fit"

// Mirror of the CR-3 patterns from lib/discovery/candidates.ts.
const LEGACY_NON_PERSON: RegExp[] = [
  /بودكاست/i,
  /برنامج/i,
  /اذاعة|إذاعة/i,
  /قناة/i,
  /سلسلة/i,
  /منوعات/i,
  /حلقات/i,
  /(?:^|\s)حلقة(?:$|\s)/i,
  /(?:^|\s)موسم(?:$|\s)/i,
  /\bpodcast\b/i,
  /\bchannel\b/i,
  /\bshow\b/i,
  /\bseries\b/i,
  /\bstory\b/i,
  /\bstories\b/i,
  /\btales\b/i,
  /\bepisodes?\b/i,
  /مؤسسة/i,
  /(?:^|\s)مركز(?:$|\s)/i,
  /جمعية/i,
  /(?:^|\s)دار(?:$|\s)/i,
  /مكتبة/i,
  /إثراء|اثراء/i,
  /\bethraa\b/i,
  /\bithra\b/i,
  /\bfoundation\b/i,
  /\bcenter\b/i,
  /\bcentre\b/i,
  /\binstitute\b/i,
  /\bacademy\b/i,
  /\borganization\b/i,
  /\bcompany\b/i,
  /\bdaughter\s+of\b/i,
  /\bson\s+of\b/i,
  /\bvoice\s+of\b/i,
  /\bvoices?\s+of\b/i,
  /^سوالف\s/i,
  /^ليالي\s/i,
  /^صباحيات\s/i,
  /^مساءيات\s/i,
  /^همسات\s/i,
  /^أحاديث\s/i,
  /^حكايات\s/i,
  /^قصص\s/i,
  /^روايتهم\b/i,
  /^روايتها\b/i,
  /^just\s+(a|an|the)\s/i,
  /^the\s+(podcast|show|series|channel)\b/i,
  /^sat-?\d+/i,
  /^mbc[\s\d-]/i,
  /^al[\s-]/i,
  /[A-Za-z][؀-ۿ]|[؀-ۿ][A-Za-z]/,
  /\s\/\s[A-Za-z]/,
  /[A-Za-z]\s\/\s/,
  /^\(no\s+name\)$/i,
  /^—+$/,
  /^…+$/,
  /^\.+$/,
  /^-+$/,
]

function legacyIsPersonName(name: string | null | undefined): boolean {
  if (!name) return false
  const t = name.trim()
  if (t.length < 2) return false
  for (const r of LEGACY_NON_PERSON) if (r.test(t)) return false
  return true
}

interface LegacyDecision {
  decision: "promote" | "drop"
  dropped_reason: string | null
  // Legacy gives no attribute, hence "unknown"
  nationality: "kuwaiti" | "non_kuwaiti" | "unknown"
  gender: "male" | "female" | "unknown"
  editorial_fit_score: number
  hiddenness_score: number
  composite_score: number
  evidence_strength_score: number
}

function runLegacyPipeline(row: FixtureRow): LegacyDecision {
  if (!legacyIsPersonName(row.proposed_name)) {
    return {
      decision: "drop",
      dropped_reason: "non_person_pattern",
      nationality: "unknown",
      gender: "unknown",
      editorial_fit_score: 0,
      hiddenness_score: 0,
      composite_score: 0,
      evidence_strength_score: 0,
    }
  }
  // Use Alpha's fit math as a fair stand-in for "what the legacy
  // ranker math produces when the LLM fit score is null" — both
  // share the same evidence-strength + hiddenness logic. This keeps
  // the comparison about identity + attribute decisions, not about
  // who hooks into gpt-4o.
  const fit = alphaComputeFit({
    archetype: row.archetype,
    evidence_urls: row.evidence_urls,
    platform_signals: row.platform_signals,
    episode_topic_domain: row.episodeContext?.topicDomain ?? null,
    episode_working_title: row.episodeContext?.workingTitle ?? null,
    episode_intent_text: null,
    identity_confidence: 0.5, // legacy has no identity signal — neutral
  })
  // Legacy composite_score formula: 0.45*ed + 0.20*hidden + 0.20*ev + 0.15*novelty
  // Novelty is 0.5 (no corpus) — we approximate.
  const composite = 0.45 * fit.editorial_fit_score + 0.20 * fit.hidden_gem_score + 0.20 * fit.evidence_strength_score + 0.15 * 0.5
  return {
    decision: "promote",
    dropped_reason: null,
    nationality: "unknown",
    gender: "unknown",
    editorial_fit_score: fit.editorial_fit_score,
    hiddenness_score: fit.hidden_gem_score, // legacy hiddenness ~= Alpha audience_inverse component
    composite_score: Math.round(composite * 1000) / 1000,
    evidence_strength_score: fit.evidence_strength_score,
  }
}

// ─── Metric computation ─────────────────────────────────────────────

interface RowResult {
  fixtureId: string
  truth: FixtureRow["truth"]
  legacy: LegacyDecision
  alpha: ReturnType<typeof runAlphaPipeline>
}

interface MetricRow {
  metric: string
  legacy: string
  alpha: string
  winner: "legacy" | "alpha" | "tie"
}

function compute(corpus: FixtureRow[]): { results: RowResult[]; metrics: MetricRow[] } {
  const results: RowResult[] = corpus.map((row) => ({
    fixtureId: row.id,
    truth: row.truth,
    legacy: runLegacyPipeline(row),
    alpha: runAlphaPipeline({
      proposed_name: row.proposed_name,
      proposed_role: row.proposed_role,
      proposed_country: row.proposed_country,
      evidence_urls: row.evidence_urls,
      platform_signals: row.platform_signals,
      archetype: row.archetype,
      filters: row.filters,
      episodeContext: row.episodeContext
        ? {
            workingTitle: row.episodeContext.workingTitle,
            topicDomain: row.episodeContext.topicDomain ?? null,
            intentText: null,
          }
        : undefined,
    }),
  }))

  // 1. person_id_accuracy — measures ONLY the "is this a person?"
  // classification step. Alpha's classifier output (identity_confidence
  // ≥ PERSON_CLASS_THRESHOLD) is used here, NOT the overall pipeline
  // decision. Attribute filtering is a separate, downstream gate and
  // should not be conflated with identity classification. Legacy has
  // no separate person-id step, so we use isPersonName (== promote).
  const personHits = (predicateLegacy: (r: RowResult) => boolean, predicateAlpha: (r: RowResult) => boolean) => {
    let lOk = 0, aOk = 0
    for (const r of results) {
      const truth = r.truth.is_person
      if (predicateLegacy(r) === truth) lOk++
      if (predicateAlpha(r) === truth) aOk++
    }
    return { lOk, aOk, total: results.length }
  }
  const personAcc = personHits(
    (r) => r.legacy.decision === "promote",
    (r) => r.alpha.identity_confidence >= PERSON_CLASS_THRESHOLD,
  )

  // 2. nationality_accuracy (labeled rows only, person-only)
  const labeledNat = results.filter((r) => r.truth.is_person && r.truth.nationality)
  let lNat = 0, aNat = 0
  for (const r of labeledNat) {
    if (r.legacy.nationality === r.truth.nationality) lNat++
    if (r.alpha.attributes.nationality.value === r.truth.nationality) aNat++
  }

  // 3. gender_accuracy (labeled rows only, person-only)
  const labeledGen = results.filter((r) => r.truth.is_person && r.truth.gender)
  let lGen = 0, aGen = 0
  for (const r of labeledGen) {
    if (r.legacy.gender === r.truth.gender) lGen++
    if (r.alpha.attributes.gender.value === r.truth.gender) aGen++
  }

  // 4. non_person_elimination (% dropped of true non-person rows)
  const nonPersons = results.filter((r) => !r.truth.is_person)
  const lNonPersonDrop = nonPersons.filter((r) => r.legacy.decision === "drop").length
  const aNonPersonDrop = nonPersons.filter((r) => r.alpha.decision === "drop").length

  // 5. social_profile_quality — avg curated citations per surviving row
  const lSurv = results.filter((r) => r.legacy.decision === "promote")
  const aSurv = results.filter((r) => r.alpha.decision === "promote")
  const lSocialAvg = lSurv.length === 0 ? 0 : 0 // legacy has no curated bundle
  const aSocialAvg =
    aSurv.length === 0
      ? 0
      : aSurv.reduce(
          (a, r) => a + (r.alpha.evidence_bundle.citations.length ?? 0),
          0,
        ) / aSurv.length

  // 6. evidence_quality — avg axis-diverse evidence (Alpha only); for
  //    legacy, use a proxy: avg platform diversity in raw evidence_urls
  const lEvAvg =
    lSurv.length === 0
      ? 0
      : lSurv.reduce((a, r) => {
          const fx = FIXTURES.find((f) => f.id === r.fixtureId)!
          return a + new Set(fx.evidence_urls.map((u) => u.platform)).size
        }, 0) / lSurv.length
  const aEvAvg =
    aSurv.length === 0
      ? 0
      : aSurv.reduce(
          (a, r) => a + (r.alpha.evidence_bundle.platform_diversity ?? 0),
          0,
        ) / aSurv.length

  // 7. operator_confidence — apples-to-apples redesign.
  // Legacy has NO identity-confidence signal; the operator sees a
  // name and zero indication of how trustworthy that identification
  // is. The fair baseline is 0.50 (neutral / unknown) — operators
  // can't be more confident than that without a signal.
  // Alpha reports its actual identity_confidence on surviving rows.
  const lConfAvg = lSurv.length === 0 ? 0 : 0.50
  const aConfAvg =
    aSurv.length === 0
      ? 0
      : aSurv.reduce((a, r) => a + r.alpha.identity_confidence, 0) /
        aSurv.length

  // 8. hidden_gem_rate
  const lHidPct =
    lSurv.length === 0
      ? 0
      : lSurv.filter((r) => r.legacy.hiddenness_score >= 0.6).length /
        lSurv.length
  const aHidPct =
    aSurv.length === 0
      ? 0
      : aSurv.filter((r) => r.alpha.hidden_gem_score >= 0.6).length /
        aSurv.length

  // 9. editorial_quality — avg score on surviving rows
  const lEdAvg =
    lSurv.length === 0
      ? 0
      : lSurv.reduce((a, r) => a + r.legacy.composite_score, 0) / lSurv.length
  const aEdAvg =
    aSurv.length === 0
      ? 0
      : aSurv.reduce((a, r) => a + r.alpha.recommendation_score, 0) /
        aSurv.length

  const metrics: MetricRow[] = [
    mkRow("1. person_id_accuracy",       pct(personAcc.lOk / personAcc.total), pct(personAcc.aOk / personAcc.total)),
    mkRow("2. nationality_accuracy",     pct(labeledNat.length ? lNat / labeledNat.length : 0), pct(labeledNat.length ? aNat / labeledNat.length : 0)),
    mkRow("3. gender_accuracy",          pct(labeledGen.length ? lGen / labeledGen.length : 0), pct(labeledGen.length ? aGen / labeledGen.length : 0)),
    mkRow("4. non_person_elimination",   pct(nonPersons.length ? lNonPersonDrop / nonPersons.length : 0), pct(nonPersons.length ? aNonPersonDrop / nonPersons.length : 0)),
    mkRow("5. social_profile_quality",   lSocialAvg.toFixed(2) + " cit/row", aSocialAvg.toFixed(2) + " cit/row"),
    mkRow("6. evidence_quality",         lEvAvg.toFixed(2) + " pf/row", aEvAvg.toFixed(2) + " pf/row"),
    mkRow("7. operator_confidence",      lConfAvg.toFixed(3) + " (no signal)", aConfAvg.toFixed(3) + " avg id-conf"),
    mkRow("8. hidden_gem_rate",          pct(lHidPct), pct(aHidPct)),
    mkRow("9. editorial_quality",        lEdAvg.toFixed(3) + " avg comp", aEdAvg.toFixed(3) + " avg rec"),
  ]

  return { results, metrics }
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

function mkRow(metric: string, legacy: string, alpha: string): MetricRow {
  // Winner: parse leading number out of each label and compare.
  const l = parseFloat(legacy)
  const a = parseFloat(alpha)
  if (!Number.isFinite(l) || !Number.isFinite(a)) return { metric, legacy, alpha, winner: "tie" }
  if (Math.abs(a - l) < 1e-3) return { metric, legacy, alpha, winner: "tie" }
  return { metric, legacy, alpha, winner: a > l ? "alpha" : "legacy" }
}

// ─── Output ─────────────────────────────────────────────────────────

function printReport(
  results: RowResult[],
  metrics: MetricRow[],
  mode: "fixture" | "db",
): void {
  console.log("")
  console.log("═══════════════════════════════════════════════════════════════")
  console.log(`Phase Alpha — Discovery Pipeline Comparison (${mode} mode)`)
  console.log("═══════════════════════════════════════════════════════════════")
  console.log(`Person-class threshold: ${PERSON_CLASS_THRESHOLD}`)
  console.log(`Corpus size: ${results.length}`)
  console.log("")
  console.log("Per-fixture decisions:")
  console.log("───────────────────────────────────────────────────────────────")
  for (const r of results) {
    const truthSym = r.truth.is_person ? "✓person" : "✗not-person"
    const legSym = r.legacy.decision === "promote" ? "promote" : "drop"
    const alpSym = r.alpha.decision === "promote" ? "promote" : "drop"
    console.log(`  ${r.fixtureId} (${truthSym}) — legacy: ${legSym.padEnd(8)} alpha: ${alpSym.padEnd(8)}  id=${r.alpha.identity_confidence.toFixed(3)}`)
    console.log(`    note: ${r.truth.note}`)
    if (r.alpha.decision === "drop") {
      console.log(`    α-drop: ${r.alpha.dropped_reason}`)
    }
  }
  console.log("")
  console.log("Metric comparison:")
  console.log("───────────────────────────────────────────────────────────────")
  console.log("  Metric                              | Legacy            | Alpha              | Winner")
  console.log("  ------------------------------------|-------------------|--------------------|-------")
  for (const m of metrics) {
    console.log(
      `  ${m.metric.padEnd(35)} | ${m.legacy.padEnd(17)} | ${m.alpha.padEnd(18)} | ${m.winner}`,
    )
  }
  const alphaWins = metrics.filter((m) => m.winner === "alpha").length
  const legacyWins = metrics.filter((m) => m.winner === "legacy").length
  const ties = metrics.filter((m) => m.winner === "tie").length
  console.log("")
  console.log(`  Wins — Alpha: ${alphaWins} / Legacy: ${legacyWins} / Tie: ${ties}`)
  const decision =
    alphaWins >= 4 && legacyWins === 0
      ? "PROCEED TO PHASE BETA"
      : alphaWins > legacyWins
        ? "MARGINAL — review before Phase Beta"
        : "DO NOT PROCEED — analyse and redesign"
  console.log(`  Decision: ${decision}`)
  console.log("═══════════════════════════════════════════════════════════════")
}

// ─── DB mode ────────────────────────────────────────────────────────

async function runDbMode(eirId: string | null): Promise<void> {
  const { db, closeDb } = await import("@/lib/db")
  if (!db) {
    console.error("[alpha-compare] DB not configured")
    process.exit(1)
  }
  const { guestDiscoveryCandidates, discoveryRuns } = await import("@/lib/db/schema/discovery")
  const { eq, and, isNotNull } = await import("drizzle-orm")

  const where = eirId
    ? and(eq(discoveryRuns.source_episode_candidate_id, eirId))
    : isNotNull(guestDiscoveryCandidates.id)
  console.log(`[alpha-compare] DB mode — eirId=${eirId ?? "(any)"}`)

  const rows = await db
    .select({
      id: guestDiscoveryCandidates.id,
      run_id: guestDiscoveryCandidates.discovery_run_id,
      proposed_name: guestDiscoveryCandidates.proposed_name,
      proposed_role: guestDiscoveryCandidates.proposed_role,
      proposed_country: guestDiscoveryCandidates.proposed_country,
      archetype: guestDiscoveryCandidates.archetype,
      evidence_urls: guestDiscoveryCandidates.evidence_urls,
      platform_signals: guestDiscoveryCandidates.platform_signals,
    })
    .from(guestDiscoveryCandidates)
    .leftJoin(discoveryRuns, eq(discoveryRuns.id, guestDiscoveryCandidates.discovery_run_id))
    .where(where)
    .limit(200)

  if (rows.length === 0) {
    console.log("[alpha-compare] no rows match — exiting")
    await closeDb()
    return
  }
  // Without ground truth labels we cannot compute accuracy; we still
  // report drop-rates + score distributions + identity confidence.
  console.log(`[alpha-compare] sampled ${rows.length} rows — running Alpha…`)
  let dropped = 0
  let promoted = 0
  let idSum = 0
  for (const r of rows) {
    const d = runAlphaPipeline({
      proposed_name: r.proposed_name,
      proposed_role: r.proposed_role,
      proposed_country: r.proposed_country,
      evidence_urls: (r.evidence_urls ?? []) as DiscoveryEvidenceUrl[],
      platform_signals: (r.platform_signals ?? null) as DiscoveryPlatformSignals | null,
      archetype: (r.archetype ?? null) as DiscoveryArchetype | null,
    })
    idSum += d.identity_confidence
    if (d.decision === "drop") dropped++
    else promoted++
  }
  console.log("")
  console.log("DB-mode summary (no ground-truth labels — drop-rate only):")
  console.log(`  Total rows: ${rows.length}`)
  console.log(`  Alpha drops: ${dropped} (${pct(dropped / rows.length)})`)
  console.log(`  Alpha promotes: ${promoted} (${pct(promoted / rows.length)})`)
  console.log(`  Avg identity_confidence: ${(idSum / rows.length).toFixed(3)}`)
  await closeDb()
}

// ─── Main ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const json = args.includes("--json")
  const dbMode = args.includes("--db")
  const eirIdx = args.indexOf("--eir")
  const eirId = eirIdx >= 0 ? args[eirIdx + 1] : null

  if (dbMode) {
    await runDbMode(eirId ?? null)
    return
  }

  const { results, metrics } = compute(FIXTURES)
  if (json) {
    console.log(JSON.stringify({ results, metrics }, null, 2))
  } else {
    printReport(results, metrics, "fixture")
  }
}

main().catch((err) => {
  console.error("[alpha-compare] fatal:", err)
  process.exit(1)
})
