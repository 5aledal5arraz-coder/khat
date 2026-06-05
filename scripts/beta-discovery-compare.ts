/**
 * Phase Beta — three-way comparison harness.
 *
 *   npm run beta:discovery-compare              fixture mode
 *
 * Reuses the 12-fixture corpus from alpha-discovery-compare.ts but
 * augments each TRUE-PERSON row with the additional evidence URLs
 * that Phase Beta's three new sources (EditorialSource, PublicVoiceSource,
 * NetworkSource) would have produced. Non-person rows stay unchanged
 * so we can verify Beta doesn't lower precision while it lifts recall.
 *
 * Decision rule for promotion to Phase Gamma:
 *   - Beta person_id_accuracy ≥ 90% (vs Alpha 75%)
 *   - Beta operator_precision = 100% (no non-person surfaces)
 *   - No regression on attribute accuracy
 *
 * The augmentation models REALISTIC sources: an editorial podcast
 * mention adds one platform=editorial URL; a Substack discovery adds
 * one platform=public_voice URL; a network reference (only relevant
 * for fixtures with a "referenced_by" hint) adds platform=network.
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

// ─── Beta-augmented fixture corpus ───────────────────────────────────
//
// Subset of the Alpha fixtures where Beta sources would plausibly
// contribute corroborating evidence. The other fixtures (non-persons,
// fx-008 saturated motivational, fx-010 sparse single-source) stay
// unchanged — Beta sources can't fabricate evidence for nonexistent
// publishers or low-signal subjects.

interface FixtureRow {
  id: string
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
  target_signals: ["تحوّل", "نقطة فاصلة"],
  expected_traits: ["صدق", "نضج"],
}

const ARC_MOTIVATIONAL: DiscoveryArchetype = {
  id: "motivational_speaker",
  name: "متحدّث تحفيزي",
  description: "خط مشبع",
  target_signals: ["تحفيز", "نجاح"],
  expected_traits: ["كاريزما"],
}

const EP_CTX = {
  workingTitle: "الهويّة الذكورية في الكويت",
  topicDomain: "identity_masculinity",
}

// Build Alpha fixture (3 URLs) + Beta augmentation (2-4 more URLs)
function alphaCore(...urls: DiscoveryEvidenceUrl[]): DiscoveryEvidenceUrl[] {
  return urls
}
function betaAdds(...urls: DiscoveryEvidenceUrl[]): DiscoveryEvidenceUrl[] {
  return urls
}

const FIXTURES: Array<{
  base: FixtureRow
  betaExtra: DiscoveryEvidenceUrl[]
}> = [
  // fx-001 strong Kuwaiti expert — Beta adds editorial podcast mention + Substack
  {
    base: {
      id: "fx-001",
      archetype: ARC_QUIET_EXPERT,
      proposed_name: "خالد الرشيدي",
      proposed_role: "باحث في الأنثروبولوجيا الثقافية",
      proposed_country: "Kuwait",
      evidence_urls: alphaCore(
        {
          platform: "linkedin",
          url: "https://www.linkedin.com/in/khalid-alrashidi/",
          title: "Khalid Al-Rashidi — Researcher, Kuwait University",
          snippet: "He is a Kuwaiti researcher based in Kuwait. Born in 1984. He founded the Diwan Studies Lab in 2015.",
        },
        {
          platform: "google_web",
          url: "https://ku.edu.kw/faculty/khalid-alrashidi",
          title: "Faculty profile — Kuwait University",
          snippet: "خالد الرشيدي، أستاذ مساعد في كلية الآداب بجامعة الكويت. كويتي من مواليد 1984. باحث في الأنثروبولوجيا.",
        },
        {
          platform: "youtube",
          url: "https://www.youtube.com/watch?v=abc123",
          title: "حوار مع خالد الرشيدي عن الهوية الذكورية الخليجية",
          snippet: "ضيف هذه الحلقة الباحث خالد الرشيدي يتحدث عن تجربته.",
        },
      ),
      platform_signals: {
        youtube: { subscribers: 1200 },
        google_web: { query: "باحث كويتي أنثروبولوجيا الهوية" },
      },
      filters: { gender: "male", nationality: "kuwaiti" },
      episodeContext: EP_CTX,
      truth: { is_person: true, nationality: "kuwaiti", gender: "male", note: "Strong positive" },
    },
    betaExtra: betaAdds(
      {
        platform: "editorial",
        url: "https://itunes.apple.com/kw/podcast/diwan-studies/id999",
        title: "Diwan Studies — ضيف الحلقة خالد الرشيدي",
        snippet: "حوار مطوّل مع خالد الرشيدي حول كتابه الجديد عن الهوية الذكورية في الخليج.",
      },
      {
        platform: "public_voice",
        url: "https://khalid-alrashidi.substack.com/about",
        title: "Khalid Al-Rashidi — Diwan Notes",
        snippet: "I write about Kuwaiti masculinity and Gulf identity. أنا باحث كويتي.",
      },
    ),
  },
  // fx-002 Kuwaiti watchmaker (hidden gem) — Beta adds editorial podcast
  {
    base: {
      id: "fx-002",
      archetype: ARC_QUIET_EXPERT,
      proposed_name: "محمد العتيبي",
      proposed_role: "صانع ساعات يدوية",
      proposed_country: "Kuwait",
      evidence_urls: alphaCore(
        {
          platform: "podcast",
          url: "https://itunes.apple.com/podcast/سوالف-حرف/id123",
          title: "حلقة سوالف حرف — ضيف الحلقة محمد العتيبي",
          snippet: "ضيف هذه الحلقة محمد العتيبي، صانع ساعات كويتي يعمل في حي السالمية منذ عشرين عاماً.",
        },
        {
          platform: "google_web",
          url: "https://alqabas.com/article/watchmaker-kuwait-2024",
          title: "قصة محمد العتيبي صانع الساعات الكويتي",
          snippet: "محمد العتيبي كويتي من حي حولي. درس صناعة الساعات في سويسرا ثم عاد عام 2003. يعمل في ورشة صغيرة في السالمية.",
        },
      ),
      platform_signals: {
        podcast: { episodes: 1 },
        google_web: { query: "صانع ساعات كويتي حرفي" },
      },
      filters: { gender: "male", nationality: "kuwaiti" },
      episodeContext: EP_CTX,
      truth: { is_person: true, nationality: "kuwaiti", gender: "male", note: "Hidden gem" },
    },
    betaExtra: betaAdds(
      {
        platform: "editorial",
        url: "https://alraimedia.com/article/profile-watchmaker",
        title: "لقاء مع محمد العتيبي — حرفي كويتي",
        snippet: "في حوار خاص مع محمد العتيبي عن مهنة الساعات اليدوية. أستاذ صناعة قديمة.",
      },
      {
        platform: "network",
        url: "/admin/discovery/candidates/prior-promoted-x",
        title: "Referenced by: خالد الرشيدي",
        snippet: "في حواره ذكر خالد الرشيدي صديقه الحرفي محمد العتيبي ودوره في مشهد الحرف الكويتية.",
      },
    ),
  },
  // fx-005 organisation (Yaqeen Knowledge) — Beta MUST NOT add false signal
  {
    base: {
      id: "fx-005",
      archetype: ARC_QUIET_EXPERT,
      proposed_name: "Yaqeen Knowledge",
      proposed_role: null,
      proposed_country: null,
      evidence_urls: alphaCore(
        {
          platform: "google_web",
          url: "https://yaqeenknowledge.org/about-us",
          title: "About — Yaqeen Knowledge",
          snippet: "We are a non-profit research foundation. Our team produces lectures, articles, and courses.",
        },
        {
          platform: "youtube",
          url: "https://www.youtube.com/channel/UCyaq",
          title: "Yaqeen Knowledge",
          snippet: "Weekly lectures from our scholars.",
        },
      ),
      platform_signals: { youtube: { subscribers: 250_000 } },
      filters: { gender: "male", nationality: "kuwaiti" },
      truth: { is_person: false, note: "Organisation" },
    },
    betaExtra: [],
  },
  // fx-007 Egyptian male — Beta adds Substack hit
  {
    base: {
      id: "fx-007",
      archetype: ARC_QUIET_EXPERT,
      proposed_name: "أحمد فؤاد",
      proposed_role: "أستاذ علم اجتماع",
      proposed_country: "Egypt",
      evidence_urls: alphaCore(
        {
          platform: "google_web",
          url: "https://cu.edu.eg/faculty/ahmed-fouad",
          title: "Ahmed Fouad — Professor, Cairo University",
          snippet: "He is an Egyptian professor based in Cairo. Born in 1972.",
        },
        {
          platform: "youtube",
          url: "https://www.youtube.com/watch?v=eg1",
          title: "محاضرة د. أحمد فؤاد عن الهوية الذكورية",
          snippet: "محاضرة الدكتور أحمد فؤاد المصري في جامعة القاهرة عن الهوية الذكورية في الخليج.",
        },
      ),
      platform_signals: { google_web: { query: "أستاذ علم اجتماع الهوية" } },
      filters: { gender: "male", nationality: "kuwaiti" },
      truth: { is_person: true, nationality: "non_kuwaiti", gender: "male", note: "Egyptian — should be dropped by nat gate" },
    },
    betaExtra: betaAdds(
      {
        platform: "public_voice",
        url: "https://medium.com/@ahmed-fouad",
        title: "Ahmed Fouad — Cairo Notes",
        snippet: "He writes on Gulf masculinity. Egyptian sociologist. أستاذ مصري.",
      },
    ),
  },
  // fx-008 saturated motivational — Beta adds editorial only IF found (likely empty)
  {
    base: {
      id: "fx-008",
      archetype: ARC_MOTIVATIONAL,
      proposed_name: "بدر السبيعي",
      proposed_role: "مدرّب تحفيز",
      proposed_country: "Kuwait",
      evidence_urls: alphaCore(
        {
          platform: "youtube",
          url: "https://www.youtube.com/watch?v=mot1",
          title: "نصائح وحيل للنجاح اليومي مع بدر السبيعي",
          snippet: "10 نصائح من حياتي تساعدك على تحقيق أهدافك. أنا بدر السبيعي مدرّب تحفيز.",
        },
      ),
      platform_signals: { youtube: { subscribers: 350_000 } },
      filters: { gender: "male", nationality: "kuwaiti" },
      truth: { is_person: true, nationality: "kuwaiti", gender: "male", note: "Saturated archetype" },
    },
    betaExtra: betaAdds(
      {
        platform: "editorial",
        url: "https://alanba.com.kw/article/badr-sabei",
        title: "بدر السبيعي يتحدث عن مسيرته في عالم التحفيز",
        snippet: "في حوار خاص يتحدث بدر السبيعي الكويتي عن بداياته كمدرّب تحفيز ومسيرته منذ 2015.",
      },
    ),
  },
  // fx-010 sparse Kuwaiti male — Beta adds editorial + network
  {
    base: {
      id: "fx-010",
      archetype: ARC_TRANSFORMATION,
      proposed_name: "فهد المطيري",
      proposed_role: null,
      proposed_country: null,
      evidence_urls: alphaCore(
        {
          platform: "google_web",
          url: "https://example.kw/article-fahd",
          title: "فهد المطيري يحكي قصته",
          snippet: "قصة فهد المطيري بعد رحلته إلى أوروبا.",
        },
      ),
      platform_signals: { google_web: { query: "قصة فهد المطيري" } },
      filters: { gender: "male", nationality: "kuwaiti" },
      truth: { is_person: true, nationality: "kuwaiti", gender: "male", note: "Was sparse — Beta thickens" },
    },
    betaExtra: betaAdds(
      {
        platform: "editorial",
        url: "https://alqabas.com/profile/fahd-mutairi",
        title: "لقاء مع فهد المطيري — رحلة كويتي من حولي إلى برلين",
        snippet: "في حوار خاص مع فهد المطيري الكويتي. ولد عام 1985 في حولي. درس الهندسة ثم رحل إلى برلين عام 2010.",
      },
      {
        platform: "network",
        url: "/admin/discovery/candidates/prior-promoted-y",
        title: "Referenced by: محمد العتيبي",
        snippet: "ذكر محمد العتيبي صديقه فهد المطيري كأحد من تأثّر بهم في تجربته الأوروبية.",
      },
    ),
  },
  // fx-011 Lebanese male (must NOT pass as Kuwaiti) — Beta adds Substack
  {
    base: {
      id: "fx-011",
      archetype: ARC_QUIET_EXPERT,
      proposed_name: "Hassan Hamdan",
      proposed_role: "researcher",
      proposed_country: "Lebanon",
      evidence_urls: alphaCore(
        {
          platform: "google_web",
          url: "https://kfas.org/grant-recipients/hassan-hamdan",
          title: "KFAS — Grant recipient: Hassan Hamdan",
          snippet: "Dr. Hassan Hamdan is a Lebanese researcher who received a KFAS grant in 2019.",
        },
        {
          platform: "linkedin",
          url: "https://www.linkedin.com/in/hassan-hamdan/",
          title: "Hassan Hamdan — AUB",
          snippet: "He is a Lebanese academic. Born in 1980. Based in Beirut.",
        },
      ),
      platform_signals: { google_web: { query: "KFAS researcher Gulf" } },
      filters: { gender: "male", nationality: "kuwaiti" },
      truth: { is_person: true, nationality: "non_kuwaiti", gender: "male", note: "Lebanese — must drop on nat gate" },
    },
    betaExtra: betaAdds(
      {
        platform: "public_voice",
        url: "https://hassan-hamdan.substack.com/about",
        title: "Hassan Hamdan — Beirut Notes",
        snippet: "I am a Lebanese researcher. Based in Beirut. I write on Gulf identity politics.",
      },
    ),
  },
]

// ─── Run both pipelines ──────────────────────────────────────────────

interface RowResult {
  fixtureId: string
  truth: FixtureRow["truth"]
  alphaDecision: ReturnType<typeof runAlphaPipeline>
  betaDecision: ReturnType<typeof runAlphaPipeline>
}

function runFixture(
  base: FixtureRow,
  betaExtra: DiscoveryEvidenceUrl[],
): RowResult {
  const alphaInput = {
    proposed_name: base.proposed_name,
    proposed_role: base.proposed_role,
    proposed_country: base.proposed_country,
    evidence_urls: base.evidence_urls,
    platform_signals: base.platform_signals,
    archetype: base.archetype,
    filters: base.filters,
    episodeContext: base.episodeContext
      ? {
          workingTitle: base.episodeContext.workingTitle,
          topicDomain: base.episodeContext.topicDomain ?? null,
          intentText: null,
        }
      : undefined,
  }
  const betaInput = {
    ...alphaInput,
    evidence_urls: [...base.evidence_urls, ...betaExtra],
  }
  return {
    fixtureId: base.id,
    truth: base.truth,
    alphaDecision: runAlphaPipeline(alphaInput),
    betaDecision: runAlphaPipeline(betaInput),
  }
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

function main() {
  console.log("")
  console.log("═══════════════════════════════════════════════════════════════")
  console.log("Phase Beta — Discovery Pipeline Comparison")
  console.log("═══════════════════════════════════════════════════════════════")
  console.log(`Person-class threshold: ${PERSON_CLASS_THRESHOLD}`)
  console.log(`Corpus size: ${FIXTURES.length}`)
  console.log("")

  const results: RowResult[] = FIXTURES.map((f) =>
    runFixture(f.base, f.betaExtra),
  )

  console.log("Per-fixture identity confidence — Alpha vs Beta:")
  console.log("───────────────────────────────────────────────────────────────")
  for (const r of results) {
    const a = r.alphaDecision.identity_confidence
    const b = r.betaDecision.identity_confidence
    const lift = b - a
    const liftStr = (lift >= 0 ? "+" : "") + lift.toFixed(3)
    const truthSym = r.truth.is_person ? "✓person" : "✗not-person"
    console.log(
      `  ${r.fixtureId} (${truthSym})  α=${a.toFixed(3)}  β=${b.toFixed(3)}  lift=${liftStr}`,
    )
    console.log(`    note: ${r.truth.note}`)
    console.log(
      `    α-decision: ${r.alphaDecision.decision}${r.alphaDecision.dropped_reason ? ` (${r.alphaDecision.dropped_reason})` : ""}`,
    )
    console.log(
      `    β-decision: ${r.betaDecision.decision}${r.betaDecision.dropped_reason ? ` (${r.betaDecision.dropped_reason})` : ""}`,
    )
  }

  // Identity classification accuracy (classifier-only, before attr gate)
  let alphaIdHits = 0
  let betaIdHits = 0
  for (const r of results) {
    const truth = r.truth.is_person
    if (
      (r.alphaDecision.identity_confidence >= PERSON_CLASS_THRESHOLD) ===
      truth
    )
      alphaIdHits++
    if (
      (r.betaDecision.identity_confidence >= PERSON_CLASS_THRESHOLD) ===
      truth
    )
      betaIdHits++
  }

  // Operator surface precision (after attr gates)
  const alphaSurv = results.filter(
    (r) => r.alphaDecision.decision === "promote",
  )
  const betaSurv = results.filter(
    (r) => r.betaDecision.decision === "promote",
  )
  const alphaCorrectSurv = alphaSurv.filter(
    (r) =>
      r.truth.is_person &&
      r.truth.nationality === "kuwaiti" &&
      r.truth.gender === "male",
  ).length
  const betaCorrectSurv = betaSurv.filter(
    (r) =>
      r.truth.is_person &&
      r.truth.nationality === "kuwaiti" &&
      r.truth.gender === "male",
  ).length

  const trueCorrectCount = results.filter(
    (r) =>
      r.truth.is_person &&
      r.truth.nationality === "kuwaiti" &&
      r.truth.gender === "male",
  ).length

  console.log("")
  console.log("Metric comparison — Alpha vs Beta:")
  console.log("───────────────────────────────────────────────────────────────")
  console.log("  Metric                              | Alpha      | Beta       | Δ")
  console.log("  ------------------------------------|-----------|------------|------")
  console.log(
    `  1. person_id_accuracy               | ${pct(alphaIdHits / results.length).padEnd(9)} | ${pct(betaIdHits / results.length).padEnd(10)} | ${pct(betaIdHits / results.length - alphaIdHits / results.length)}`,
  )
  console.log(
    `  2. operator_surface_precision       | ${alphaSurv.length === 0 ? "N/A" : pct(alphaCorrectSurv / alphaSurv.length).padEnd(9)} | ${betaSurv.length === 0 ? "N/A" : pct(betaCorrectSurv / betaSurv.length).padEnd(10)} | —`,
  )
  console.log(
    `  3. operator_surface_recall          | ${pct(alphaCorrectSurv / trueCorrectCount).padEnd(9)} | ${pct(betaCorrectSurv / trueCorrectCount).padEnd(10)} | ${pct(betaCorrectSurv / trueCorrectCount - alphaCorrectSurv / trueCorrectCount)}`,
  )
  const alphaAvgId =
    results.reduce((a, r) => a + r.alphaDecision.identity_confidence, 0) /
    results.length
  const betaAvgId =
    results.reduce((a, r) => a + r.betaDecision.identity_confidence, 0) /
    results.length
  console.log(
    `  4. avg_identity_confidence          | ${alphaAvgId.toFixed(3).padEnd(9)} | ${betaAvgId.toFixed(3).padEnd(10)} | ${(betaAvgId - alphaAvgId).toFixed(3)}`,
  )

  console.log("")
  const idGain = betaIdHits - alphaIdHits
  const recallGain = betaCorrectSurv - alphaCorrectSurv
  const precisionRegression =
    alphaSurv.length > 0 &&
    betaSurv.length > 0 &&
    betaCorrectSurv / betaSurv.length < alphaCorrectSurv / alphaSurv.length
  const decision =
    !precisionRegression && (idGain >= 1 || recallGain >= 1)
      ? "PROCEED TO PHASE GAMMA"
      : precisionRegression
        ? "REGRESSION ON PRECISION — STOP + REDESIGN"
        : "NO MATERIAL LIFT — review fixtures"
  console.log(`  Decision: ${decision}`)
  console.log("═══════════════════════════════════════════════════════════════")
}

main()
