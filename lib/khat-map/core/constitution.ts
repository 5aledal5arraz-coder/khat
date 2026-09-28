/**
 * Khat Editorial Constitution — «دستور خط».
 *
 * This is the PRIMARY editorial source of truth for every Khat generator
 * (topics, guests, preparation), not just the Khat Map system.
 * Channel analysis (fingerprint) is calibration — these rules override it
 * when they conflict.
 *
 * Treat the exports here as a contract that every AI prompt, every season
 * validator, and every ranking heuristic is bound by. Changes here ripple
 * through every generation cycle.
 *
 * Read-only at runtime: no function here mutates state, and nothing in
 * this file touches the DB. Pure values + pure helpers only.
 */

import type {
  KhatMapDomainWeight,
  KhatMapEpisodeType,
  KhatMapEpisodeTypeBalance,
  KhatMapFreshness,
  KhatMapInvasionPolicy,
  KhatMapMoodPreset,
  KhatMapMustIncludeRules,
  KhatMapTopicDomain,
  KhatMapTopicDomainWeights,
} from "@/types/khat-map"

// ─── دستور خط — the constitution (approved by Khaled 2026-09-28) ────────────
//
// ONE source of truth for what Khat is, injected as the FIRST system block of
// every topic/guest/prep generator (hybrid topics, original thinking, the
// season wizard, discovery propose, prep_v2). Bump KHAT_CONSTITUTION_VERSION
// on any wording change — every generator's prompt version rides on it.
//
// Khaled's decisions it encodes (final, do not re-litigate): Khat is NOT
// stories-only and NOT views-optimised; varied topics that matter to the
// widest Arab audience; lens «تجارب إنسانية مؤثرة»; style practical + human;
// goal «مكتبة مرجعية تبقى». Avoid politics, religious disputes, scandals and
// privacy intrusion. Guests default to men from Kuwait; the invasion episode
// is optional; NO fixed distribution per season — the only rule is VARIETY.

export const KHAT_CONSTITUTION_VERSION = "khat-constitution-v1"

/** The heading every generator's first system block starts with (guard tests read it). */
export const KHAT_CONSTITUTION_MARKER = "# دستور خط"

export const KHAT_CONSTITUTION_AR = {
  vision: "بودكاست خط مكتبة مرجعية عربية تبقى؛ كل حلقة كتاب تزيد قيمته مع الوقت.",
  lens: "تجارب إنسانية مؤثرة — كل موضوع يقوم على تجربة عاشها إنسان حقيقي؛ حتى الخبير يأتي بتجربته لا بمحاضرته.",
  style: "فائدة عملية نابعة من تجربة معاشة (لا قوائم «٥ أسرار»)، وعاطفة صادقة غير مصطنعة.",
  audience:
    "أوسع جمهور عربي؛ العنوان يفهمه أي عربي، والقصة قد تكون كويتية الجذور.",
  guests: "الضيوف افتراضياً: رجال من الكويت؛ الشهرة ليست معياراً — المعيار: هل تجربته تستحق أن تُروى؟",
  avoid:
    "نتجنب قطعياً: السياسة، الخلافات الدينية والمذهبية، الفضائح، التعدي على الخصوصية (في المواضيع الحساسة الضيف يقرر ما يقول، ولا نسمي طرفاً ثالثاً).",
  not_our_goal:
    "ليس هدفنا: ملاحقة المشاهدات أو الترند. المقياس: «بعد خمس سنين، أحد بيرجع للحلقة ويستفيد؟»",
  variety: "التنوع: لا حصص ثابتة؛ الموسم يجب أن يتنوع في المجالات والشرائح والأساليب.",
  invasion: "حلقة الغزو/الذاكرة الوطنية: اختيارية.",
} as const

/** The four areas Khat never enters. The policy lexicon (lib/khat-map/core/policy.ts) enforces them in code. */
export const KHAT_AVOID_AR = [
  "السياسة",
  "الخلافات الدينية والمذهبية",
  "الفضائح",
  "التعدي على الخصوصية",
] as const

// ─── Audience segments ───────────────────────────────────────────────────────

export type KhatSegmentId = "20_35" | "35_60"

export interface KhatSegment {
  id: KhatSegmentId
  label_ar: string
  /** Life-stage concerns — each exploration slot is tied to one of them. */
  concerns_ar: readonly string[]
}

export const KHAT_SEGMENTS: readonly KhatSegment[] = [
  {
    id: "20_35",
    label_ar: "٢٠–٣٥",
    concerns_ar: [
      "بداية المهنة",
      "الزواج وسنواته الأولى",
      "أول مال وأول دين",
      "الهوية والطموح",
      "الغربة",
      "أول قرار كبير",
    ],
  },
  {
    id: "35_60",
    label_ar: "٣٥–٦٠",
    concerns_ar: [
      "الأسرة",
      "المراهقون",
      "الطلاق",
      "تغيير المسار",
      "الصحة",
      "الوالدان الكبيران",
      "الثروة",
      "الإرث",
    ],
  },
]

// ─── The 7 doors and their fields (50+, extensible data) ─────────────────────

export type KhatDoorId =
  | "family"
  | "work_money"
  | "health_mind"
  | "loss_resilience"
  | "identity_society"
  | "creativity_achievement"
  | "memory_heritage"

export interface KhatField {
  /** Stable, globally-unique snake_case id. */
  id: string
  label_ar: string
}

export interface KhatDoor {
  id: KhatDoorId
  label_ar: string
  fields: readonly KhatField[]
}

/**
 * The field list the generators pick from with variety. Pure data: adding a
 * field is a one-line edit here (ids must stay unique across all doors — a
 * test pins it). Order is presentation-only.
 */
export const KHAT_DOORS: readonly KhatDoor[] = [
  {
    id: "family",
    label_ar: "العلاقات والأسرة",
    fields: [
      { id: "marriage", label_ar: "الزواج" },
      { id: "divorce", label_ar: "الطلاق" },
      { id: "fatherhood", label_ar: "الأبوة" },
      { id: "raising_children", label_ar: "تربية الأبناء" },
      { id: "adolescence", label_ar: "المراهقة" },
      { id: "relationship_with_parents", label_ar: "العلاقة بالوالدين" },
      { id: "elder_care", label_ar: "رعاية كبار السن" },
      { id: "siblings_family_legacy", label_ar: "الأخوة والإرث العائلي" },
      { id: "friendship", label_ar: "الصداقة" },
      { id: "loneliness", label_ar: "الوحدة" },
      { id: "infertility", label_ar: "العقم وتأخر الإنجاب" },
      { id: "fostering_adoption", label_ar: "الكفالة والتبني" },
      { id: "second_marriage", label_ar: "الزواج الثاني" },
    ],
  },
  {
    id: "work_money",
    label_ar: "العمل والمال",
    fields: [
      { id: "career_path", label_ar: "المسار المهني" },
      { id: "unemployment", label_ar: "البطالة" },
      { id: "career_change", label_ar: "تغيير المهنة" },
      { id: "retirement", label_ar: "التقاعد" },
      { id: "leadership_management", label_ar: "القيادة والإدارة" },
      { id: "entrepreneurship", label_ar: "ريادة الأعمال" },
      { id: "small_business", label_ar: "المشاريع الصغيرة" },
      { id: "business_failure", label_ar: "الفشل التجاري" },
      { id: "debt_bankruptcy", label_ar: "الديون والإفلاس" },
      { id: "saving_investing", label_ar: "الادخار والاستثمار" },
      { id: "wealth_impact", label_ar: "الثروة وأثرها" },
      { id: "family_business", label_ar: "الشركات العائلية" },
      { id: "trade_crafts", label_ar: "التجارة والحرف" },
      { id: "freelancing", label_ar: "العمل الحر" },
    ],
  },
  {
    id: "health_mind",
    label_ar: "الصحة والنفس",
    fields: [
      { id: "chronic_illness", label_ar: "الأمراض المزمنة" },
      { id: "cancer_survival", label_ar: "النجاة من السرطان" },
      { id: "disability", label_ar: "الإعاقة" },
      { id: "addiction_recovery", label_ar: "الإدمان والتعافي" },
      { id: "mental_health", label_ar: "الصحة النفسية" },
      { id: "depression_anxiety", label_ar: "الاكتئاب والقلق" },
      { id: "body_transformation_sport", label_ar: "التحول الجسدي والرياضة" },
      { id: "burnout", label_ar: "الإرهاق والاحتراق" },
    ],
  },
  {
    id: "loss_resilience",
    label_ar: "الفقد والصمود",
    fields: [
      { id: "losing_loved_one", label_ar: "فقد عزيز" },
      { id: "accidents", label_ar: "الحوادث" },
      { id: "captivity_detention", label_ar: "الأسر والمعتقلات" },
      { id: "war_refuge", label_ar: "الحروب واللجوء" },
      { id: "disasters", label_ar: "الكوارث" },
      { id: "trauma_recovery", label_ar: "الصدمات والتعافي" },
    ],
  },
  {
    id: "identity_society",
    label_ar: "الهوية والمجتمع",
    fields: [
      { id: "expat_migration", label_ar: "الغربة والهجرة" },
      { id: "studying_abroad", label_ar: "الدراسة في الخارج" },
      { id: "belonging_identity", label_ar: "الانتماء والهوية" },
      { id: "customs_traditions", label_ar: "العادات والتقاليد" },
      { id: "generation_gap", label_ar: "صراع الأجيال" },
      { id: "education", label_ar: "التعليم" },
      { id: "volunteering_charity", label_ar: "التطوع والعمل الخيري" },
      { id: "faith_personal", label_ar: "الإيمان كتجربة شخصية" },
      { id: "prison_reentry", label_ar: "السجن والعودة للمجتمع" },
      { id: "personal_transformation", label_ar: "التحول الشخصي" },
    ],
  },
  {
    id: "creativity_achievement",
    label_ar: "الإبداع والإنجاز",
    fields: [
      { id: "art", label_ar: "الفن" },
      { id: "writing_literature", label_ar: "الكتابة والأدب" },
      { id: "sport_achievement", label_ar: "الرياضة والإنجاز الرياضي" },
      { id: "invention_applied_science", label_ar: "الاختراع والعلوم التطبيقية" },
      { id: "technology_in_life", label_ar: "التقنية وأثرها على الحياة" },
      { id: "media_price_of_fame", label_ar: "الإعلام وثمن الشهرة" },
    ],
  },
  {
    id: "memory_heritage",
    label_ar: "الذاكرة والتراث",
    fields: [
      { id: "oral_history", label_ar: "التاريخ الشفهي" },
      { id: "old_crafts", label_ar: "الحرف القديمة" },
      { id: "sea_diving", label_ar: "البحر والغوص" },
      { id: "desert_badia", label_ar: "البر والبادية" },
      { id: "travel_adventure", label_ar: "السفر والمغامرة" },
    ],
  },
]

/** Every field with its door — the flat list the exploration map samples from. */
export const KHAT_FIELDS: ReadonlyArray<KhatField & { door: KhatDoorId }> = KHAT_DOORS.flatMap((d) =>
  d.fields.map((f) => ({ ...f, door: d.id })),
)

// ─── Rendered blocks ─────────────────────────────────────────────────────────

/**
 * The constitution as a system-prompt block.
 *   full    — everything, including the 7 doors and their fields. Topic
 *             generators (hybrid, original thinking, season wizard).
 *   compact — identity, audience, guests, avoid, measure; no field list.
 *             Discovery propose and prep_v2, which work on ONE topic.
 */
export function khatConstitutionBlock(variant: "full" | "compact" = "full"): string {
  const c = KHAT_CONSTITUTION_AR
  const audience =
    variant === "full"
      ? [
          `الجمهور: ${c.audience} شريحتان:`,
          ...KHAT_SEGMENTS.map((s) => `  · ${s.label_ar}: ${s.concerns_ar.join("، ")}`),
        ]
      : [`الجمهور: ${c.audience} شريحتان: ٢٠–٣٥ و٣٥–٦٠.`]
  const lines = [
    `${KHAT_CONSTITUTION_MARKER} (${KHAT_CONSTITUTION_VERSION}) — مرجع أعلى من أي تعليمات تليه`,
    "",
    `الرؤية: ${c.vision}`,
    `العدسة: ${c.lens}`,
    `الأسلوب: ${c.style}`,
    ...audience,
    c.guests,
    c.avoid,
    c.not_our_goal,
    c.variety,
    c.invasion,
  ]
  if (variant === "full") {
    lines.push(
      "",
      "المجالات (اختر منها بتنوّع — لا تكرّر مجالاً في دفعة واحدة، ووزّع على الأبواب):",
      ...KHAT_DOORS.map((d, i) => `${i + 1} ${d.label_ar}: ${d.fields.map((f) => f.label_ar).join("، ")}.`),
    )
  }
  return lines.join("\n")
}

// ─── Legacy identity exports (reworded to the constitution) ─────────────────

export const KHAT_IDENTITY_STATEMENT_AR = [
  KHAT_CONSTITUTION_AR.vision,
  KHAT_CONSTITUTION_AR.lens,
  KHAT_CONSTITUTION_AR.style,
].join("\n")

export const KHAT_IDENTITY_STATEMENT_EN = `
Khat is an Arabic reference library that lasts: every episode is a book whose
value grows with time. Lens: moving human experiences — every topic rests on
something a real person lived; even an expert brings his experience, not a
lecture. Practical value that comes from lived experience, and honest,
unmanufactured emotion. Not views, not trends.
`.trim()

/**
 * When the ranker faces a tradeoff, earlier priorities win. Kuwait is where
 * the GUESTS come from by default — the topics themselves are pan-Arab.
 */
export const KHAT_CORE_PRIORITIES = [
  "a lived experience worth telling — fame is not a criterion",
  "lasting reference value: someone returns to it in five years and benefits",
  "practical value grounded in lived experience — generic advice is banned",
  "honest emotion, never manufactured or manipulative",
  "topics any Arab understands; the story may be Kuwaiti-rooted",
  "variety across fields, audience segments and episode shapes",
  "Kuwaiti guests by default, pan-Arab topics",
] as const

// ─── What to avoid (hard rules) ──────────────────────────────────────────────

export const KHAT_HARD_AVOID = [
  "politics — parties, elections, governments, parliament, geopolitics",
  "religious and sectarian disputes (faith appears only as a personal experience)",
  "scandals",
  "privacy intrusion — the guest decides what to say on sensitive topics; never name a third party",
  "chasing views or trends",
  "generic advice — every practical takeaway must come from lived experience",
  "listicles and «5 secrets» framing",
  "clickbait framing",
  "a fresh angle is welcome; taboo for its own sake is not",
  "repetitive guest suggestions",
] as const

// ─── Per-season diversity (no quotas) ────────────────────────────────────────

/**
 * Khaled (2026-09-28): NO fixed segment/domain distribution per season — the
 * only rule is VARIETY. These are soft hints, not minimums; nothing fails a
 * season for missing one. Invasion, mass-audience and controversial are 0:
 * the invasion episode is optional and the other two are not Khat goals.
 */
export const DEFAULT_EPISODE_TYPE_BALANCE: KhatMapEpisodeTypeBalance = {
  intellectual: 1,
  social: 1,
  psychological: 1,
  personal_story: 1,
  national: 0,
  invasion: 0,
  historical: 1,
  signature_khat: 1,
  mass_audience: 0,
  controversial: 0,
  inspirational: 1,
}

/**
 * Season rules. Invasion / national are optional (Khaled 2026-09-28);
 * mass-audience and bold/controversial are no longer Khat goals at all.
 */
export const DEFAULT_MUST_INCLUDE_RULES: KhatMapMustIncludeRules = {
  invasion: false,
  personal_story: true,
  signature_khat: true,
  national: false,
  emotional: true,
  mass_audience: false,
  bold: false,
}

// ─── Iraqi invasion angle catalog ────────────────────────────────────────────

/**
 * Stable angle codes for the (optional) invasion episode. The angle chosen
 * for a given season is recorded on the episode candidate and promotes the
 * matching topic_bank row's freshness — so future seasons prefer fresh
 * angles automatically. Every angle is a lived experience; none names a
 * third party or argues politics.
 */
export const INVASION_ANGLES = [
  {
    code: "invasion.prisoners",
    title_ar: "الأسرى",
    summary_ar: "ذاكرة الأسرى الكويتيين، المصير، والعودة.",
  },
  {
    code: "invasion.resistance",
    title_ar: "المقاومة",
    summary_ar: "قصص المقاومة المدنية والعسكرية خلال الاحتلال.",
  },
  {
    code: "invasion.women",
    title_ar: "النساء في الغزو",
    summary_ar: "دور المرأة الكويتية خلال الاحتلال: المقاومة، الرعاية، الصمود.",
  },
  {
    code: "invasion.children",
    title_ar: "الأطفال والغزو",
    summary_ar: "كيف عاش أطفال ذلك الجيل الغزو، وأثره عليهم لاحقًا.",
  },
  {
    code: "invasion.psychological",
    title_ar: "الأثر النفسي",
    summary_ar: "الصدمة الجماعية والأثر النفسي للغزو على أجيال الكويت.",
  },
  {
    code: "invasion.media",
    title_ar: "الإعلام في الغزو",
    summary_ar: "من عاشوا البثّ من الداخل: إذاعة الكويت والتلفزيون تحت الاحتلال.",
  },
  {
    code: "invasion.betrayal",
    title_ar: "الثقة بعد الغزو",
    summary_ar: "كيف أعاد الناس بناء الثقة بمن حولهم بعد التحرير — تجارب شخصية، بلا تسمية أحد.",
  },
  {
    code: "invasion.martyrs",
    title_ar: "الشهداء",
    summary_ar: "قصص الشهداء، ذاكرة عائلاتهم، ومكانهم في الذاكرة الوطنية.",
  },
  {
    code: "invasion.economy",
    title_ar: "الأثر الاقتصادي",
    summary_ar: "أسر وتجّار خسروا كل شيء في الاحتلال — وكيف بدأوا من جديد بعد التحرير.",
  },
  {
    code: "invasion.lessons",
    title_ar: "ما تعلّمته الأسرة الكويتية",
    summary_ar: "دروس الصمود التي حملتها البيوت الكويتية من الغزو إلى أبنائها.",
  },
  {
    code: "invasion.comparison_1990_today",
    title_ar: "1990 وما بعدها",
    summary_ar: "من عاش 1990 شاباً: كيف غيّرت تلك الأشهر نظرته للأمان والبيت والوطن.",
  },
  {
    code: "invasion.post_invasion_kuwait",
    title_ar: "الكويت بعد الغزو",
    summary_ar: "كيف تغيّرت الحياة اليومية في البيوت الكويتية بعد التحرير.",
  },
] as const

export type InvasionAngleCode = (typeof INVASION_ANGLES)[number]["code"]

/**
 * Seeds for the topic bank. The seeder (run once) inserts one row per
 * angle with category="invasion" and freshness="fresh". From then on, the
 * learning layer owns freshness transitions.
 */
export const INVASION_ANGLE_SEEDS = INVASION_ANGLES.map((a) => ({
  title: a.title_ar,
  description: a.summary_ar,
  angle_code: a.code,
  category: "invasion" as const,
  episode_type: "invasion" as KhatMapEpisodeType,
  tags: ["invasion", "kuwait", "national_memory"],
  freshness: "fresh" as KhatMapFreshness,
  source: "admin_seeded" as const,
  status: "active" as const,
}))

// ─── Freshness policy ────────────────────────────────────────────────────────

/**
 * Reuse policy per freshness level. The generator reads this table when
 * deciding whether to surface a topic.
 *   - "allow":   surface freely
 *   - "prefer_fresh": may be surfaced but deprioritize vs fresher alternatives
 *   - "require_approval": only surface with explicit admin request
 */
export const FRESHNESS_POLICY: Record<
  KhatMapFreshness,
  { surface: "allow" | "prefer_fresh" | "require_approval"; weight: number }
> = {
  fresh: { surface: "allow", weight: 1.0 },
  lightly_covered: { surface: "allow", weight: 0.75 },
  recently_used: { surface: "prefer_fresh", weight: 0.25 },
  deeply_covered: { surface: "require_approval", weight: 0.1 },
}

// ─── Guest quality gates ─────────────────────────────────────────────────────

/**
 * Guest rules. Fame is NOT a criterion (Khaled 2026-09-28): the question is
 * whether the person's lived experience is worth telling, and whether he
 * told it himself somewhere public.
 */
export const GUEST_QUALITY_GATES = {
  /** A first-hand, self-told public account of the experience. */
  requires_self_told_account: true,
  /** Fame and follower counts are never a reason to propose someone. */
  fame_is_not_a_criterion: true,
  /** Reject shallow social influencers as primary suggestions. */
  reject_shallow_influencers: true,
  /** Politicians, people in ongoing court cases, stories that expose others. */
  reject_policy_risk: true,
  /** Prefer guests the audience can still learn from years later. */
  prefer_timeless_over_viral: true,
} as const

// ─── Prompt fragments ────────────────────────────────────────────────────────

/**
 * Season-wizard system preamble: the constitution (full) + this season's
 * invasion policy + guest gates. The invasion episode is OPTIONAL by default
 * (Khaled 2026-09-28); "required" survives only as an explicit admin choice
 * on a season, and "excluded" forbids it.
 */
export function khatConstitutionPrompt(
  invasionPolicy: KhatMapInvasionPolicy = "optional",
): string {
  const invasionLine =
    invasionPolicy === "required"
      ? "- the admin asked for ONE Iraqi-invasion-of-Kuwait episode this season, told as a lived experience (angle must vary across seasons)"
      : invasionPolicy === "optional"
        ? "- an Iraqi-invasion-of-Kuwait episode is OPTIONAL — include it ONLY if a fresh lived-experience angle is available, otherwise explore other fields"
        : "- an Iraqi-invasion-of-Kuwait episode is EXCLUDED for this season — the admin has explicitly opted out of the theme; do NOT propose invasion episodes and do NOT mark any episode with episode_type=\"invasion\""
  return [
    khatConstitutionBlock("full"),
    "",
    "## This season",
    invasionLine,
    "- no quotas: the only rule is VARIETY across fields, doors, audience segments and episode shapes",
    "",
    "## Hard avoids",
    ...KHAT_HARD_AVOID.map((a) => `- ${a}`),
    "",
    "## Guest gates",
    "- the criterion is a lived experience worth telling, not fame or follower count",
    "- default: men from Kuwait",
    "- no politicians, no one in an ongoing court case, no story that exposes someone else",
    "- reject shallow influencers as primary suggestions",
  ].join("\n")
}

// ─── Mood preset catalog ─────────────────────────────────────────────────────

/**
 * Default weight for any domain not present in a season's
 * `topic_domain_weights` record. Medium = "treat as balanced".
 */
export const DEFAULT_DOMAIN_WEIGHT: KhatMapDomainWeight = 2

/**
 * 12 curated mood presets. `controversy_heavy` and `philosophy_religion` were
 * retired with the constitution (2026-09-28): they steered seasons into
 * politics and religious dispute, which Khat avoids outright; no preset
 * leans into `religion` or `power_manipulation` any more.
 *
 * Picking a preset seeds the per-season `topic_domain_weights` with these recommended overrides; the admin can
 * then tweak any individual domain without changing the preset label.
 *
 * Weights use the 0–3 scale (off / low / medium / high). Missing domains
 * default to `DEFAULT_DOMAIN_WEIGHT` (medium). Never include `"none"` in
 * a preset — it's the untagged escape hatch, not a targetable domain.
 *
 * Presets are INTENT, not a content hard-lock. The structurer still
 * honors the constitution — presets just shape
 * which domains the research + structurer lean into.
 */
export const MOOD_PRESETS: Record<
  KhatMapMoodPreset,
  {
    label_ar: string
    description_ar: string
    domain_weights: KhatMapTopicDomainWeights
  }
> = {
  balanced: {
    label_ar: "متوازن",
    description_ar:
      "توازن معتدل بين كل المجالات — لا تفضيل قوي لأي مجال. خيار افتراضي آمن للمواسم العامة.",
    domain_weights: {},
  },
  classic_khat: {
    label_ar: "خط الكلاسيكي",
    description_ar:
      "روح خط: تجارب إنسانية مؤثرة، ذاكرة وتراث، عمق فكري نابع من تجربة معاشة.",
    domain_weights: {
      kuwait_gulf: 3,
      historical: 3,
      identity_masculinity: 3,
      philosophy: 3,
      psychology: 2,
      relationships: 2,
      social_issues: 2,
      technology_ai: 1,
      internet_culture: 1,
    },
  },
  psychology_heavy: {
    label_ar: "نفسية مركّزة",
    description_ar:
      "تركيز على النفس البشرية، المشاعر الداخلية، العلاقات العميقة.",
    domain_weights: {
      psychology: 3,
      relationships: 3,
      emotions_inner_life: 3,
      identity_masculinity: 2,
      philosophy: 2,
      parenting: 2,
      technology_ai: 1,
      internet_culture: 1,
      money_career: 1,
    },
  },
  relationships_heavy: {
    label_ar: "علاقات",
    description_ar:
      "علاقات، تربية، رجولة/هوية، مشاعر داخلية — موسم إنساني دافئ.",
    domain_weights: {
      relationships: 3,
      parenting: 3,
      identity_masculinity: 3,
      emotions_inner_life: 3,
      psychology: 2,
      modern_society: 2,
      money_career: 1,
    },
  },
  technology_future: {
    label_ar: "تقنية ومستقبل",
    description_ar:
      "الذكاء الاصطناعي، التقنية، مستقبل المجتمع، ثقافة الإنترنت.",
    domain_weights: {
      technology_ai: 3,
      internet_culture: 3,
      modern_society: 3,
      social_issues: 2,
      philosophy: 2,
      kuwait_gulf: 1,
      historical: 1,
    },
  },
  social_issues: {
    label_ar: "قضايا اجتماعية",
    description_ar:
      "ضغوط المجتمع، الهوية، الأسرة، القضايا الحديثة، التوترات البنيوية.",
    domain_weights: {
      social_issues: 3,
      modern_society: 3,
      identity_masculinity: 2,
      relationships: 2,
      money_career: 2,
      parenting: 2,
    },
  },
  kuwait_gulf_focus: {
    label_ar: "كويت وخليج",
    description_ar:
      "تركيز على الكويت، الخليج، التاريخ المحلي، الهوية الوطنية.",
    domain_weights: {
      kuwait_gulf: 3,
      historical: 3,
      hidden_history: 3,
      identity_masculinity: 2,
      social_issues: 2,
      modern_society: 2,
      technology_ai: 1,
      internet_culture: 1,
    },
  },
  mystery_hidden_history: {
    label_ar: "لغز وتاريخ خفي",
    description_ar:
      "جرائم، ألغاز، تاريخ غير معروف، نظريات، أسرار طُويت — موسم تشويقي عميق.",
    domain_weights: {
      crime_mystery: 3,
      hidden_history: 3,
      historical: 2,
      kuwait_gulf: 2,
      social_issues: 1,
    },
  },
  emotions_inner_life: {
    label_ar: "مشاعر داخلية",
    description_ar:
      "الوحدة، القلق، المعنى، التجربة الذاتية، ما يحدث داخل الإنسان.",
    domain_weights: {
      emotions_inner_life: 3,
      psychology: 3,
      philosophy: 2,
      identity_masculinity: 2,
      relationships: 2,
      money_career: 1,
    },
  },
  business_money: {
    label_ar: "مال وأعمال",
    description_ar:
      "المسار المهني، المال، النجاح، الفشل، السلطة الاقتصادية الحديثة.",
    domain_weights: {
      money_career: 3,
      modern_society: 2,
      psychology: 2,
      identity_masculinity: 2,
      technology_ai: 2,
      social_issues: 2,
    },
  },
  modern_society: {
    label_ar: "مجتمع حديث",
    description_ar:
      "التحولات الاجتماعية، الهوية، الأسرة، الضغوط الحديثة، العصر الرقمي.",
    domain_weights: {
      modern_society: 3,
      social_issues: 3,
      identity_masculinity: 3,
      relationships: 2,
      technology_ai: 2,
      parenting: 2,
      internet_culture: 2,
    },
  },
  internet_culture: {
    label_ar: "ثقافة الإنترنت",
    description_ar:
      "وسائل التواصل، الفيروسية، الشهرة، الأنا، التلاعب الرقمي، ثقافة الصورة.",
    domain_weights: {
      internet_culture: 3,
      technology_ai: 3,
      modern_society: 2,
      social_issues: 2,
      psychology: 2,
      identity_masculinity: 2,
    },
  },
}

// ─── Weight helpers ──────────────────────────────────────────────────────────

/**
 * Resolve a domain's effective weight, falling back to medium when the
 * domain isn't explicitly set in the season's weight map. "none" always
 * returns medium — it's the untagged escape hatch, not a targetable
 * preference axis.
 */
export function effectiveDomainWeight(
  weights: KhatMapTopicDomainWeights | null | undefined,
  domain: KhatMapTopicDomain,
): KhatMapDomainWeight {
  if (domain === "none") return DEFAULT_DOMAIN_WEIGHT
  if (!weights) return DEFAULT_DOMAIN_WEIGHT
  const w = weights[domain]
  if (w === 0 || w === 1 || w === 2 || w === 3) return w
  return DEFAULT_DOMAIN_WEIGHT
}

/**
 * Merge a preset's weights with an override record. The override wins —
 * this is how the settings UI preserves admin edits when the preset
 * label didn't change. Pass an empty override to get the clean preset.
 */
export function mergeDomainWeights(
  presetWeights: KhatMapTopicDomainWeights,
  overrides: KhatMapTopicDomainWeights,
): KhatMapTopicDomainWeights {
  const out: KhatMapTopicDomainWeights = { ...presetWeights }
  for (const [k, v] of Object.entries(overrides)) {
    if (v === 0 || v === 1 || v === 2 || v === 3) {
      out[k as KhatMapTopicDomain] = v
    }
  }
  return out
}

/**
 * Group domains by effective weight band — used by the workflow guide's
 * admin-facing messaging ("weighted toward X; deprioritized: Y").
 * Excludes "none" from every bucket.
 */
export function summarizeDomainWeights(
  weights: KhatMapTopicDomainWeights,
): {
  leading: KhatMapTopicDomain[] // weight=3
  high: KhatMapTopicDomain[] // weight=2 (explicit, not default)
  low: KhatMapTopicDomain[] // weight=1
  excluded: KhatMapTopicDomain[] // weight=0
} {
  const out = {
    leading: [] as KhatMapTopicDomain[],
    high: [] as KhatMapTopicDomain[],
    low: [] as KhatMapTopicDomain[],
    excluded: [] as KhatMapTopicDomain[],
  }
  for (const [k, v] of Object.entries(weights)) {
    if (k === "none") continue
    const domain = k as KhatMapTopicDomain
    if (v === 3) out.leading.push(domain)
    else if (v === 2) out.high.push(domain)
    else if (v === 1) out.low.push(domain)
    else if (v === 0) out.excluded.push(domain)
  }
  return out
}

// ─── Domain angle catalogs (Phase D) ─────────────────────────────────────────

/**
 * Stable angle codes for non-invasion topic domains. Angles that invited
 * politics, religious/sectarian dispute, scandal or third-party exposure
 * were reworded (2026-09-28) into lived experiences under the SAME codes,
 * so topic-bank memory keyed by code stays intact.
 *
 * Mirrors the invasion angle memory model: each angle gets a stable string code
 * (e.g. "psychology.childhood_trauma"), seeded into `khat_map_topic_bank`
 * with the matching `category` column = the topic_domain value. The
 * learning layer (freshness transitions, usage counts) works exactly
 * the same as for invasion angles.
 *
 * Only 10 domains get catalogs — the rest (historical, kuwait_gulf,
 * parenting, etc.) can be ai_discovered later without losing any
 * functionality. The seeder is idempotent: adding more angles here +
 * re-running the seeder is safe.
 *
 * Each domain's catalog is short (8 angles) and high-signal. Expanding
 * later is a pure constitution edit — no migration required.
 */
interface DomainAngleSeed {
  code: string
  title_ar: string
  summary_ar: string
  episode_type: KhatMapEpisodeType
}

type DomainAngleCatalog = Partial<
  Record<KhatMapTopicDomain, DomainAngleSeed[]>
>

export const DOMAIN_ANGLE_CATALOG: DomainAngleCatalog = {
  relationships: [
    {
      code: "relationships.long_distance",
      title_ar: "العلاقات عن بُعد",
      summary_ar: "تحديات الحفاظ على علاقة عبر المسافة، البلدان، والتوقيت.",
      episode_type: "social",
    },
    {
      code: "relationships.intercultural",
      title_ar: "علاقات بين ثقافات",
      summary_ar: "الزواج والعلاقات بين الخلفيات الثقافية المختلفة.",
      episode_type: "social",
    },
    {
      code: "relationships.after_heartbreak",
      title_ar: "ما بعد القلب المكسور",
      summary_ar: "الشفاء من الانفصال وإعادة بناء الذات بعد علاقة طويلة.",
      episode_type: "psychological",
    },
    {
      code: "relationships.digital_dating",
      title_ar: "المواعدة الرقمية",
      summary_ar: "التعارف عبر التطبيقات في العالم العربي — الفرص والأعباء.",
      episode_type: "social",
    },
    {
      code: "relationships.family_pressure",
      title_ar: "ضغط الأهل على الاختيار",
      summary_ar: "تأثير الأسرة على اختيار الشريك والقرارات العاطفية.",
      episode_type: "social",
    },
    {
      code: "relationships.marriage_crisis",
      title_ar: "أزمات الزواج",
      summary_ar: "لحظات الانهيار في الزواج، الطلاق، وإعادة البناء.",
      episode_type: "personal_story",
    },
    {
      code: "relationships.friendship_decay",
      title_ar: "تلاشي الصداقات",
      summary_ar: "كيف تموت الصداقات في الثلاثينات والأربعينات بصمت.",
      episode_type: "social",
    },
    {
      code: "relationships.solo_by_choice",
      title_ar: "العزوبية عن اختيار",
      summary_ar: "اختيار البقاء فرداً بوعي — في مجتمعات تضغط للزواج.",
      episode_type: "controversial",
    },
  ],
  philosophy: [
    {
      code: "philosophy.meaning_of_life",
      title_ar: "معنى الحياة",
      summary_ar: "البحث عن الغاية في عصر التشتّت والمعلومات اللامتناهية.",
      episode_type: "intellectual",
    },
    {
      code: "philosophy.free_will",
      title_ar: "الإرادة الحرة",
      summary_ar: "هل نملك فعلاً حرية الاختيار، أم أنّ كل قرار محكوم بالسياق؟",
      episode_type: "intellectual",
    },
    {
      code: "philosophy.time_and_mortality",
      title_ar: "الزمن والفناء",
      summary_ar: "العلاقة الإنسانية بالزمن، الشيخوخة، والموت كبوصلة للحياة.",
      episode_type: "intellectual",
    },
    {
      code: "philosophy.moral_relativism",
      title_ar: "النسبية الأخلاقية",
      summary_ar: "هل القيم مطلقة أم نسبية؟ ومن يقرر الصواب والخطأ؟",
      episode_type: "controversial",
    },
    {
      code: "philosophy.identity_persistence",
      title_ar: "ثبات الهوية عبر الزمن",
      summary_ar: "هل نحن الشخص ذاته الذي كنّاه قبل عشر سنوات؟",
      episode_type: "intellectual",
    },
    {
      code: "philosophy.suffering_and_meaning",
      title_ar: "المعاناة والمعنى",
      summary_ar: "لماذا تمنح المعاناة الحياة عمقاً أحياناً، وتدمّرها أحياناً أخرى؟",
      episode_type: "intellectual",
    },
    {
      code: "philosophy.existential_loneliness",
      title_ar: "الوحدة الوجودية",
      summary_ar: "الشعور بالعزلة حتى وسط الناس — جذوره وسبل التعامل.",
      episode_type: "psychological",
    },
    {
      code: "philosophy.truth_in_media",
      title_ar: "الحقيقة في عصر الإعلام",
      summary_ar: "ما الذي يعنيه 'الحق' حين تُعاد صياغته ألف مرة؟",
      episode_type: "intellectual",
    },
  ],
  religion: [
    {
      code: "religion.doubt_and_faith",
      title_ar: "الشك والإيمان — تجربة شخصية",
      summary_ar: "رحلة شخصية من الشك إلى الإيمان الناضج، يرويها صاحبها بلا جدل عقدي.",
      episode_type: "personal_story",
    },
    {
      code: "religion.modernity_tension",
      title_ar: "الإيمان في الحياة اليومية",
      summary_ar: "كيف عاش إنسانٌ إيمانه وسط ضغوط العمل والغربة والحياة الحديثة.",
      episode_type: "personal_story",
    },
    {
      code: "religion.interpretation_debate",
      title_ar: "الإيمان في المحنة",
      summary_ar: "كيف حمل الإيمان صاحبه عبر مرض أو فقد أو سجن — تجربة، لا جدل.",
      episode_type: "personal_story",
    },
    {
      code: "religion.secular_drift",
      title_ar: "العودة بعد البعد",
      summary_ar: "شاب ابتعد ثم عاد — كما يرويها هو، بلا محاكمة لأحد.",
      episode_type: "personal_story",
    },
    {
      code: "religion.ritual_vs_meaning",
      title_ar: "رحلة غيّرت صاحبها",
      summary_ar: "حجّ أو عمرة أو خلوة غيّرت صاحبها — ما الذي عاشه فعلاً؟",
      episode_type: "personal_story",
    },
    {
      code: "religion.women_in_religion",
      title_ar: "الأب والقيم في البيت",
      summary_ar: "كيف ينقل أبٌ قيمه وإيمانه لأبنائه بلا إكراه — تجربة أب.",
      episode_type: "social",
    },
    {
      code: "religion.tradition_vs_reform",
      title_ar: "العطاء عن قناعة",
      summary_ar: "قصص تطوّع وعمل خيري بدأت من قناعة شخصية عاشها صاحبها.",
      episode_type: "inspirational",
    },
    {
      code: "religion.conversion_stories",
      title_ar: "رمضان في الغربة",
      summary_ar: "كيف يعيش المغترب شهره الأول بعيداً عن أهله وبيته.",
      episode_type: "personal_story",
    },
  ],
  money_career: [
    {
      code: "money.self_made",
      title_ar: "صنع الذات المالي",
      summary_ar: "قصص بناء الثروة من الصفر في سياق خليجي / عربي.",
      episode_type: "inspirational",
    },
    {
      code: "money.family_business",
      title_ar: "أعمال الأسرة",
      summary_ar: "الشركات العائلية — الصراعات، الإرث، ونقل القيادة.",
      episode_type: "social",
    },
    {
      code: "money.financial_failure",
      title_ar: "الفشل المالي",
      summary_ar: "الإفلاس، الديون، والنهوض من الانهيار الاقتصادي.",
      episode_type: "personal_story",
    },
    {
      code: "money.wealth_and_meaning",
      title_ar: "الثراء والمعنى",
      summary_ar: "بعد المال — ماذا يطارد الأغنياء وما الذي يُرضيهم؟",
      episode_type: "intellectual",
    },
    {
      code: "money.career_pivot",
      title_ar: "التحول المهني",
      summary_ar: "ترك المسار الآمن بعد سنوات والبدء من جديد.",
      episode_type: "inspirational",
    },
    {
      code: "money.gulf_economy",
      title_ar: "اقتصاد الخليج",
      summary_ar: "تحولات اقتصادات الخليج بعد النفط وأثرها على الأفراد.",
      episode_type: "economic",
    },
    {
      code: "money.debt_culture",
      title_ar: "ثقافة الدين",
      summary_ar: "كيف تحوّل الاستهلاك الحديث الطبقة الوسطى إلى أسرى ديون.",
      episode_type: "social",
    },
    {
      code: "money.inheritance_dilemmas",
      title_ar: "معضلات الميراث",
      summary_ar: "الخلافات العائلية حول المال الموروث — أسبابها وحلولها.",
      episode_type: "social",
    },
  ],
  technology_ai: [
    {
      code: "technology.ai_and_creativity",
      title_ar: "الذكاء الاصطناعي والإبداع",
      summary_ar: "هل يستطيع الذكاء الاصطناعي أن يُبدع — وماذا يعني ذلك للفنانين؟",
      episode_type: "intellectual",
    },
    {
      code: "technology.digital_addiction",
      title_ar: "الإدمان الرقمي",
      summary_ar: "الإدمان على الهواتف وتطبيقات التواصل — آلياته وكلفته النفسية.",
      episode_type: "psychological",
    },
    {
      code: "technology.ai_job_displacement",
      title_ar: "الذكاء الاصطناعي وسوق العمل",
      summary_ar: "أي الوظائف ستختفي — وأيّها تصمد في عصر الذكاء الاصطناعي؟",
      episode_type: "social",
    },
    {
      code: "technology.privacy_loss",
      title_ar: "فقدان الخصوصية",
      summary_ar: "كيف تُجمع بياناتك، وأين تذهب، ومن يربح منها.",
      episode_type: "controversial",
    },
    {
      code: "technology.algorithm_manipulation",
      title_ar: "تلاعب الخوارزميات",
      summary_ar: "كيف تُشكّل الخوارزميات قراراتك دون أن تدري.",
      episode_type: "controversial",
    },
    {
      code: "technology.tech_in_arabic",
      title_ar: "التقنية في العالم العربي",
      summary_ar: "أين يقف العالم العربي في سباق التقنية — ولماذا.",
      episode_type: "social",
    },
    {
      code: "technology.children_and_screens",
      title_ar: "الأطفال والشاشات",
      summary_ar: "أثر الهواتف على نموّ الأطفال المعرفي والعاطفي.",
      episode_type: "social",
    },
    {
      code: "technology.digital_identity",
      title_ar: "الهوية الرقمية",
      summary_ar: "من نكون على الإنترنت — وهل هو نحن فعلاً؟",
      episode_type: "psychological",
    },
  ],
  internet_culture: [
    {
      code: "internet.viral_fame",
      title_ar: "الشهرة الفيروسية",
      summary_ar: "كيف يتغيّر الإنسان حين يُصبح مشهوراً فجأةً على الإنترنت.",
      episode_type: "personal_story",
    },
    {
      code: "internet.anonymity_abuse",
      title_ar: "إساءة استخدام الإخفاء",
      summary_ar: "الحسابات المجهولة، التنمّر، والعواقب على الضحايا.",
      episode_type: "controversial",
    },
    {
      code: "internet.influencer_economy",
      title_ar: "اقتصاد المؤثرين",
      summary_ar: "من وراء صناعة المحتوى — الأرقام، الصفقات، والضغوط الخفية.",
      episode_type: "social",
    },
    {
      code: "internet.online_mob",
      title_ar: "الجموع الرقمية",
      summary_ar: "ديناميكيات الهجوم الجماعي على الإنترنت — كيف يتشكّل وينكسر.",
      episode_type: "controversial",
    },
    {
      code: "internet.comparison_trap",
      title_ar: "فخ المقارنة",
      summary_ar: "أثر مشاهدة حيوات الآخرين المنمّقة على تقدير الذات.",
      episode_type: "psychological",
    },
    {
      code: "internet.arabic_memes",
      title_ar: "الميمز العربية",
      summary_ar: "كيف تُعيد الميمز تشكيل لغة الشباب وطريقة ضحكهم.",
      episode_type: "social",
    },
    {
      code: "internet.cancel_culture",
      title_ar: "بعد الهجوم الجماعي",
      summary_ar: "من تعرّض لهجوم جماعي على الإنترنت يروي كيف عاشه وكيف تعافى.",
      episode_type: "personal_story",
    },
    {
      code: "internet.attention_economy",
      title_ar: "اقتصاد الانتباه",
      summary_ar: "انتباهك هو المنتج — معركة التطبيقات على كل دقيقة من يومك.",
      episode_type: "intellectual",
    },
  ],
  psychology: [
    {
      code: "psychology.childhood_trauma",
      title_ar: "صدمات الطفولة",
      summary_ar: "كيف تُشكّل جراح الصغر قرارات الكبر دون وعيٍ منّا.",
      episode_type: "psychological",
    },
    {
      code: "psychology.anxiety_era",
      title_ar: "عصر القلق",
      summary_ar: "لماذا تزداد اضطرابات القلق رغم التقدّم المادي.",
      episode_type: "psychological",
    },
    {
      code: "psychology.loneliness_epidemic",
      title_ar: "وباء الوحدة",
      summary_ar: "الوحدة كظاهرة حديثة — أسبابها، مخاطرها، وأدوات مواجهتها.",
      episode_type: "social",
    },
    {
      code: "psychology.ego_dynamics",
      title_ar: "ديناميكيات الأنا",
      summary_ar: "الأنا، الكبرياء، والهشاشة — ولماذا نتعثّر في العلاقات بسببها.",
      episode_type: "psychological",
    },
    {
      code: "psychology.people_pleasing",
      title_ar: "إرضاء الناس",
      summary_ar: "أصول شخصية المُرضي، كلفتها، والطريق للتحرّر منها.",
      episode_type: "psychological",
    },
    {
      code: "psychology.self_sabotage",
      title_ar: "تدمير الذات",
      summary_ar: "لماذا يُفشل الإنسان نفسه حين يقترب من النجاح.",
      episode_type: "psychological",
    },
    {
      code: "psychology.shame_and_guilt",
      title_ar: "الخجل والذنب",
      summary_ar: "الفرق بين الخجل والذنب — وأيّهما يُدمّر أكثر.",
      episode_type: "psychological",
    },
    {
      code: "psychology.healing_journey",
      title_ar: "رحلة الشفاء",
      summary_ar: "كيف يشفى الإنسان نفسه — دون علاج، ومع علاج.",
      episode_type: "personal_story",
    },
  ],
  crime_mystery: [
    {
      code: "crime.unsolved_arabic",
      title_ar: "العدالة من الداخل",
      summary_ar: "محامٍ أو شرطي أو قاضٍ متقاعد يروي قضية غيّرته — بلا أسماء.",
      episode_type: "personal_story",
    },
    {
      code: "crime.financial_scandals",
      title_ar: "النجاة من الاحتيال المالي",
      summary_ar: "ضحية احتيال يروي كيف وقع وكيف نهض — بلا تسمية أحد.",
      episode_type: "personal_story",
    },
    {
      code: "crime.digital_crime",
      title_ar: "الجريمة الرقمية",
      summary_ar: "الابتزاز، الاحتيال، وسرقة الهوية في الفضاء الإلكتروني.",
      episode_type: "social",
    },
    {
      code: "crime.missing_persons",
      title_ar: "المفقودون",
      summary_ar: "قصص اختفاء غامضة — وعوائل تنتظر جواباً لسنوات.",
      episode_type: "personal_story",
    },
    {
      code: "crime.cults_and_sects",
      title_ar: "الخروج من دائرة مغلقة",
      summary_ar: "من عاش داخل جماعة مغلقة أو علاقة متحكّمة يروي كيف خرج — بلا تسمية أحد.",
      episode_type: "personal_story",
    },
    {
      code: "crime.journalist_investigations",
      title_ar: "صحفي في الميدان",
      summary_ar: "صحفي يروي ما عاشه في الميدان وثمنه عليه شخصياً.",
      episode_type: "personal_story",
    },
    {
      code: "crime.historical_mysteries",
      title_ar: "ألغاز تاريخية",
      summary_ar: "أحداث مضى عليها عقود ولا تزال رواياتها متنازَعة.",
      episode_type: "historical",
    },
    {
      code: "crime.escape_stories",
      title_ar: "قصص الهروب",
      summary_ar: "الهروب من سجن، بلد، أو واقع — حكايات استحالة مُتحقِّقة.",
      episode_type: "personal_story",
    },
  ],
  hidden_history: [
    {
      code: "hidden.silenced_arabic",
      title_ar: "ذاكرة لم تُكتب",
      summary_ar: "أحداث عاشها أجدادنا ولم يوثّقها أحد — تُروى بلسان من شهدها.",
      episode_type: "historical",
    },
    {
      code: "hidden.forgotten_figures",
      title_ar: "شخصيات منسية",
      summary_ar: "مفكّرون، فنانون، وناشطون عرب غُيّبت أسماؤهم من الرواية العامة.",
      episode_type: "historical",
    },
    {
      code: "hidden.revisionist_events",
      title_ar: "أحداث بزوايا جديدة",
      summary_ar: "قراءة معاكسة لأحداث نظنّ أنّنا نعرفها.",
      episode_type: "historical",
    },
    {
      code: "hidden.gulf_pre_oil",
      title_ar: "الخليج قبل النفط",
      summary_ar: "الحياة في الخليج قبل اكتشاف النفط — مجتمع يكاد يُنسى.",
      episode_type: "historical",
    },
    {
      code: "hidden.women_in_history",
      title_ar: "المرأة في التاريخ",
      summary_ar: "نساء كويتيات وعربيات قِدن تحولات — وأسماؤهن غابت.",
      episode_type: "historical",
    },
    {
      code: "hidden.intellectual_movements",
      title_ar: "حركات فكرية مُهمَلة",
      summary_ar: "تيارات فكرية عربية لم تأخذ حقّها من التوثيق.",
      episode_type: "intellectual",
    },
    {
      code: "hidden.regional_conspiracies",
      title_ar: "حكايات الديرة القديمة",
      summary_ar: "حكايات وأماكن من الكويت القديمة يرويها من عاشها.",
      episode_type: "historical",
    },
    {
      code: "hidden.ottoman_gulf_legacy",
      title_ar: "إرث العثمانيين في الخليج",
      summary_ar: "ما تركه العثمانيون في الخليج — وما أُزيل من ذاكرته.",
      episode_type: "historical",
    },
  ],
  identity_masculinity: [
    {
      code: "identity.modern_masculinity",
      title_ar: "الرجولة الحديثة",
      summary_ar: "ماذا يعني أن تكون رجلاً في زمن تتغيّر فيه كل التوقعات.",
      episode_type: "controversial",
    },
    {
      code: "identity.arab_identity_crisis",
      title_ar: "أزمة الهوية العربية",
      summary_ar: "بين التراث والحداثة — أين يقف الشاب العربي اليوم؟",
      episode_type: "intellectual",
    },
    {
      code: "identity.fatherhood_redefined",
      title_ar: "الأبوة المُعاد تعريفها",
      summary_ar: "كيف يختلف الأب اليوم عن الأب قبل جيل — ولماذا.",
      episode_type: "social",
    },
    {
      code: "identity.provider_role",
      title_ar: "دور المُعيل",
      summary_ar: "ضغط الإعالة على الرجل في عصر المساواة الاقتصادية.",
      episode_type: "social",
    },
    {
      code: "identity.emotional_men",
      title_ar: "الرجل العاطفي",
      summary_ar: "الرجال وصحتهم النفسية — كسر صمت طبّعه المجتمع.",
      episode_type: "psychological",
    },
    {
      code: "identity.generational_identity",
      title_ar: "الهوية بين الأجيال",
      summary_ar: "الفجوة بين جيل الآباء وجيل الأبناء في المنطقة.",
      episode_type: "social",
    },
    {
      code: "identity.tribal_vs_national",
      title_ar: "بين البادية والمدينة",
      summary_ar: "من انتقل من حياة البادية إلى المدينة — ماذا كسب وماذا خسر.",
      episode_type: "personal_story",
    },
    {
      code: "identity.expat_arab",
      title_ar: "العربي المغترب",
      summary_ar: "الحياة كعربي في الغرب — الهوية المزدوجة وضريبتها.",
      episode_type: "personal_story",
    },
  ],
}

/**
 * Flat seed list ready for the topic-bank upsert. Uses category ===
 * topic_domain for lookup symmetry (getFreshAnglesForDomain scans by
 * category). source="admin_seeded" protects admin-curated rows from
 * being overwritten on re-run.
 */
export const DOMAIN_ANGLE_SEEDS = Object.entries(DOMAIN_ANGLE_CATALOG).flatMap(
  ([domain, angles]) =>
    (angles ?? []).map((a) => ({
      title: a.title_ar,
      description: a.summary_ar,
      angle_code: a.code,
      category: domain,
      episode_type: a.episode_type,
      tags: [domain, "phase_d_seeded"],
      freshness: "fresh" as KhatMapFreshness,
      source: "admin_seeded" as const,
      status: "active" as const,
    })),
)
