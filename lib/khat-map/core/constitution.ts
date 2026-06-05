/**
 * Khat Editorial Constitution.
 *
 * This is the PRIMARY editorial source of truth for the Khat Map system.
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

// ─── Identity statement ──────────────────────────────────────────────────────

export const KHAT_IDENTITY_STATEMENT_AR = `
خط بودكاست ليس بودكاست اتجاهات سطحي.
خط يقدّم محتوى عميقًا ذا قيمة دائمة، يرفع مستوى التفكير ويُلامس المجتمع.
محتوى خط يبقى ذا قيمة بعد سنوات، ويُقدَّم بمصداقية، وعاطفة صادقة غير مصطنعة.
`.trim()

export const KHAT_IDENTITY_STATEMENT_EN = `
Khat Podcast is NOT a shallow trend-chasing show.
Khat delivers deep, timeless content that elevates thinking and society.
Content must remain valuable years after publication, feel emotionally
honest (never manipulative), and offer fresh angles missing from Arabic media.
`.trim()

// ─── Core editorial priorities (ranked, highest first) ───────────────────────

/**
 * When the ranker faces a tradeoff, earlier priorities win. Trend-driven
 * seasons may down-weight lower priorities but cannot skip higher ones.
 */
export const KHAT_CORE_PRIORITIES = [
  "deep, timeless value over shallow trends",
  "topics that improve thinking and elevate society",
  "emotionally powerful but never manipulative",
  "original angles — not repeated Arabic-podcast clichés",
  "balanced, rational, thoughtful guests",
  "strong storytelling and connected thinking",
  "diverse seasons — not one-note seasons",
  "Kuwaiti identity and Gulf society grounding",
  "human stories that make viewers reflect",
  "topics that are under-discussed in Arabic media",
] as const

// ─── What to avoid (hard rules) ──────────────────────────────────────────────

export const KHAT_HARD_AVOID = [
  "generic shallow trends",
  "repetitive guest suggestions",
  "celebrity-only logic",
  "weak speakers without depth",
  "guests with no thoughtful track record",
  "topics already repeated often in Arabic podcasts",
  "topics that only matter for a few days",
  "overly clickbait framing",
  "low-value controversy for its own sake",
  "shallow self-help clichés",
  "tabloid-level relationship drama",
  "partisan political venting without substance",
] as const

// ─── Per-season diversity requirements ───────────────────────────────────────

/**
 * Default minimum counts per episode type for a full season. The season
 * generator must produce at least these minimums; admin can relax via
 * preferences.episode_type_balance.
 *
 * Guideline for 10-episode seasons. For smaller/larger seasons, the generator
 * scales each minimum proportionally but NEVER below the floor enforced by
 * `DEFAULT_MUST_INCLUDE_RULES`.
 */
export const DEFAULT_EPISODE_TYPE_BALANCE: KhatMapEpisodeTypeBalance = {
  intellectual: 2,
  social: 2,
  psychological: 1,
  personal_story: 1,
  national: 1, // invasion counts toward national
  invasion: 1, // separate floor — see below
  historical: 1,
  signature_khat: 1,
  mass_audience: 1,
  controversial: 1,
  inspirational: 1,
}

/**
 * Non-negotiable rules every season must satisfy. Violations block season
 * approval — they are not warnings. Defaults here match `KHAT_IDENTITY`
 * and should only be relaxed with deliberate admin override.
 */
export const DEFAULT_MUST_INCLUDE_RULES: KhatMapMustIncludeRules = {
  invasion: true,
  personal_story: true,
  signature_khat: true,
  national: true,
  emotional: true,
  mass_audience: true,
  bold: true,
}

// ─── Iraqi invasion angle catalog ────────────────────────────────────────────

/**
 * Stable angle codes for the invasion episode. The angle chosen for a
 * given season is recorded on the episode candidate and promotes the
 * matching topic_bank row's freshness — so future seasons prefer fresh
 * angles automatically.
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
    summary_ar: "المعركة على الرواية: إذاعة الكويت، التلفزيون، الإعلام الدولي.",
  },
  {
    code: "invasion.betrayal",
    title_ar: "الخيانة والعملاء",
    summary_ar: "المتعاونون مع المحتل، المحاكمات، والمجتمع ما بعد التحرير.",
  },
  {
    code: "invasion.martyrs",
    title_ar: "الشهداء",
    summary_ar: "قصص الشهداء، ذاكرة عائلاتهم، ومكانهم في الذاكرة الوطنية.",
  },
  {
    code: "invasion.economy",
    title_ar: "الأثر الاقتصادي",
    summary_ar: "تكاليف الاحتلال على اقتصاد الكويت وإعادة البناء بعد التحرير.",
  },
  {
    code: "invasion.lessons",
    title_ar: "ما تعلّمته الكويت",
    summary_ar: "الدروس المؤسسية والسياسية التي استخلصتها الدولة من الغزو.",
  },
  {
    code: "invasion.comparison_1990_today",
    title_ar: "1990 وما بعدها",
    summary_ar: "مقارنة بين مخاوف 1990 والمخاوف الإقليمية المعاصرة.",
  },
  {
    code: "invasion.post_invasion_kuwait",
    title_ar: "الكويت بعد الغزو",
    summary_ar: "كيف تغيّر المجتمع الكويتي بعد التحرير — هوية، سياسة، ثقافة.",
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
 * Hard minimums for any guest the AI proposes. The Gemini discovery layer
 * must filter candidates that fail these gates before handing off to OpenAI.
 */
export const GUEST_QUALITY_GATES = {
  /** Must have demonstrable public substance — not just follower count. */
  requires_substantive_public_record: true,
  /** Reject generic celebrity suggestions without editorial fit. */
  reject_celebrity_without_fit: true,
  /** Reject shallow social influencers as primary suggestions. */
  reject_shallow_influencers: true,
  /** Minimum depth_score the AI should assign (0–10). */
  min_depth_score: 6.0,
  /** Prefer guests the audience can still learn from years later. */
  prefer_timeless_over_viral: true,
} as const

// ─── Prompt fragments (for AI modules in Phase 3) ────────────────────────────

/**
 * Canonical system-prompt preamble. Every Khat Map generation call (season
 * structuring, scoring, reordering, guest analysis) must include this
 * preamble so the model stays aligned with Khat's editorial identity.
 *
 * When called with an `invasion_policy`, the "Season must-include" block
 * adapts so the model doesn't force an invasion episode into seasons
 * where the admin has opted for `optional` or `excluded`. For backward
 * compat, passing no arg preserves the legacy `required` wording.
 */
export function khatConstitutionPrompt(
  invasionPolicy: KhatMapInvasionPolicy = "required",
): string {
  const invasionLine =
    invasionPolicy === "required"
      ? "- at least one Iraqi invasion of Kuwait episode (angle must vary across seasons)"
      : invasionPolicy === "optional"
        ? "- an Iraqi-invasion-of-Kuwait episode is OPTIONAL — include it ONLY if a fresh angle is available in the memory, otherwise explore other themes"
        : "- an Iraqi-invasion-of-Kuwait episode is EXCLUDED for this season — the admin has explicitly opted out of the theme; do NOT propose invasion episodes and do NOT mark any episode with episode_type=\"invasion\""
  const nationalLine =
    invasionPolicy === "excluded"
      ? "- at least one Kuwait / national-memory episode (NOT invasion — explore another national angle)"
      : "- at least one Kuwait / national-memory episode (invasion counts)"
  return [
    "# Khat Editorial Constitution (authoritative)",
    "",
    KHAT_IDENTITY_STATEMENT_AR,
    "",
    "## Core priorities (highest first)",
    ...KHAT_CORE_PRIORITIES.map((p, i) => `${i + 1}. ${p}`),
    "",
    "## Hard avoids",
    ...KHAT_HARD_AVOID.map((a) => `- ${a}`),
    "",
    "## Season must-include (every season)",
    invasionLine,
    "- at least one personal inspiring story",
    "- at least one signature-depth Khat episode",
    nationalLine,
    "- at least one highly emotional episode",
    "- at least one mass-audience-appeal episode",
    "- at least one bold / controversial episode",
    "",
    "## Guest gates",
    "- must have demonstrable public substance (not just fame or follower count)",
    "- reject generic celebrities without editorial fit",
    "- reject shallow influencers as primary suggestions",
    "- prefer guests whose insights remain valuable for years",
  ].join("\n")
}

// ─── Mood preset catalog ─────────────────────────────────────────────────────

/**
 * Default weight for any domain not present in a season's
 * `topic_domain_weights` record. Medium = "treat as balanced".
 */
export const DEFAULT_DOMAIN_WEIGHT: KhatMapDomainWeight = 2

/**
 * 14 curated mood presets. Picking a preset seeds the per-season
 * `topic_domain_weights` with these recommended overrides; the admin can
 * then tweak any individual domain without changing the preset label.
 *
 * Weights use the 0–3 scale (off / low / medium / high). Missing domains
 * default to `DEFAULT_DOMAIN_WEIGHT` (medium). Never include `"none"` in
 * a preset — it's the untagged escape hatch, not a targetable domain.
 *
 * Presets are INTENT, not a content hard-lock. The structurer still
 * honors must-include rules and the Khat identity — presets just shape
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
      "روح خط الأصلية: هوية، كويت/خليج، تاريخ، عمق فكري، مع قصص إنسانية.",
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
  controversy_heavy: {
    label_ar: "قضايا جريئة",
    description_ar:
      "مواضيع جدلية، سلطة، تلاعب، تاريخ خفي — موسم جريء عالي النبرة.",
    domain_weights: {
      power_manipulation: 3,
      hidden_history: 3,
      social_issues: 3,
      religion: 2,
      modern_society: 2,
      crime_mystery: 2,
      technology_ai: 2,
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
      power_manipulation: 2,
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
      power_manipulation: 2,
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
  philosophy_religion: {
    label_ar: "فلسفة ودين",
    description_ar:
      "الفلسفة، الدين، الأسئلة الوجودية، المعنى، التدين في العصر الحديث.",
    domain_weights: {
      philosophy: 3,
      religion: 3,
      identity_masculinity: 2,
      emotions_inner_life: 2,
      psychology: 2,
      modern_society: 1,
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
      power_manipulation: 2,
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
      religion: 2,
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
      power_manipulation: 2,
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
      power_manipulation: 3,
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
 * Stable angle codes for non-invasion topic domains. Mirrors the
 * invasion angle memory model: each angle gets a stable string code
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
      title_ar: "الشك والإيمان",
      summary_ar: "رحلة المؤمن المشكّك — من الشك إلى الإيمان الناضج.",
      episode_type: "intellectual",
    },
    {
      code: "religion.modernity_tension",
      title_ar: "التوتر بين الدين والحداثة",
      summary_ar: "كيف يتعايش الإيمان مع متطلبات الحياة الحديثة؟",
      episode_type: "intellectual",
    },
    {
      code: "religion.interpretation_debate",
      title_ar: "جدل التفسير",
      summary_ar: "من يمتلك حق قراءة النص الديني — ولماذا يختلف القرّاء؟",
      episode_type: "controversial",
    },
    {
      code: "religion.secular_drift",
      title_ar: "الانجذاب للعلمنة",
      summary_ar: "لماذا يبتعد بعض الشباب العرب عن الدين — والعكس أيضاً.",
      episode_type: "social",
    },
    {
      code: "religion.ritual_vs_meaning",
      title_ar: "الشعائر مقابل المعنى",
      summary_ar: "هل الممارسة الدينية اليوم شكلية أم روحية؟",
      episode_type: "intellectual",
    },
    {
      code: "religion.women_in_religion",
      title_ar: "المرأة في الدين",
      summary_ar: "المرأة بين النص والموروث — مساحات الاجتهاد المعاصرة.",
      episode_type: "controversial",
    },
    {
      code: "religion.tradition_vs_reform",
      title_ar: "التقليد مقابل التجديد",
      summary_ar: "الدعوات للتجديد الديني — شرعيتها وحدودها.",
      episode_type: "intellectual",
    },
    {
      code: "religion.conversion_stories",
      title_ar: "قصص التحول الديني",
      summary_ar: "الدخول في دين، تركه، أو الانتقال بين المذاهب.",
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
      summary_ar: "كيف تُعيد الميمز تشكيل الخطاب العام والسياسي في المنطقة.",
      episode_type: "social",
    },
    {
      code: "internet.cancel_culture",
      title_ar: "ثقافة الإلغاء",
      summary_ar: "حدود المساءلة الرقمية بين العدالة والعقاب الجماعي.",
      episode_type: "controversial",
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
      title_ar: "قضايا عربية غير محلولة",
      summary_ar: "ملفات جنائية في المنطقة لم تُغلَق — ماذا بقي مجهولاً فيها.",
      episode_type: "controversial",
    },
    {
      code: "crime.financial_scandals",
      title_ar: "الفضائح المالية",
      summary_ar: "جرائم الياقات البيضاء — الاحتيال، التستّر، والنجاة من العقوبة.",
      episode_type: "controversial",
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
      title_ar: "الطوائف والجماعات",
      summary_ar: "كيف يُستدرج الناس إلى جماعات مغلقة — وكيف ينجون منها.",
      episode_type: "controversial",
    },
    {
      code: "crime.journalist_investigations",
      title_ar: "تحقيقات صحفية",
      summary_ar: "قصص صحفيين حفروا في ملفات خطرة — وثمن ما كشفوه.",
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
      title_ar: "ذاكرة عربية مُسكَتَة",
      summary_ar: "أحداث عربية طُويت في الإعلام الرسمي — ولماذا.",
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
      title_ar: "نظريات إقليمية",
      summary_ar: "نظريات تداولها الإقليم عن أحداث كبرى — ما حقيقتها؟",
      episode_type: "controversial",
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
      title_ar: "القبيلة مقابل الدولة",
      summary_ar: "الولاءات المتداخلة — القبيلة، المنطقة، الدولة، الأمة.",
      episode_type: "controversial",
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
