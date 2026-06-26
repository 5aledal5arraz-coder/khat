/**
 * Season Topic Categories — the balance axis for the redesigned generator.
 *
 * WHY THIS EXISTS
 * The old generator balanced on `topic_domain` (17 values), a taxonomy that is
 * structurally skewed toward psychology / philosophy / inner-life and has no
 * first-class slot for science, business, personal finance, health, culture,
 * future trends, or lifestyle. So every season drifted into the same
 * introspective cluster. These 15 categories ARE the editor's intended breadth;
 * the generator now plans, prompts, and curates against them.
 *
 * RELATIONSHIP TO `topic_domain`
 * `topic_domain` stays as a legacy/compat column (DB CHECK enum, taste model,
 * mood presets all key off it). Each category maps to its closest legacy domain
 * so persistence and existing UI keep working. The mapping is intentionally
 * lossy (several categories share a legacy domain) — the *category* is the real
 * axis now; the domain is just a compatibility shadow. The precise category is
 * persisted in its own `topic_category` column so cross-batch balance is exact.
 *
 * Pure values + pure helpers only. No I/O, no DB.
 */

import type { KhatMapEpisodeType, KhatMapTopicDomain } from "@/types/khat-map"

export interface SeasonCategory {
  /** Stable slug — persisted in `topic_category`, used by the planner + prompt. */
  id: string
  /** Arabic label shown to the model and on the card. */
  label_ar: string
  /** One-line Arabic scope note — sharpens what belongs in this category. */
  scope_ar: string
  /** Closest legacy `topic_domain` for backward-compatible persistence. */
  legacy_domain: KhatMapTopicDomain
  /** Sensible default `episode_type` when the model leaves it ambiguous. */
  default_episode_type: KhatMapEpisodeType
}

/**
 * The 15 categories, in a deliberate presentation order (heavier "anchor"
 * themes first, lighter ones last). Order only affects display + tie-breaks;
 * the planner treats them as a flat set.
 */
export const SEASON_CATEGORIES: readonly SeasonCategory[] = [
  {
    id: "real_world",
    label_ar: "قضايا واقعية وأحداث راهنة",
    scope_ar: "ما يعيشه الناس الآن فعلاً — أحداث، تحوّلات، وأسئلة الساعة (بعمق لا بسطحية الترند).",
    legacy_domain: "social_issues",
    default_episode_type: "social",
  },
  {
    id: "history",
    label_ar: "تاريخ",
    scope_ar: "أحداث ومحطات تاريخية وقراءات جديدة لها — عربية، خليجية، أو عالمية.",
    legacy_domain: "historical",
    default_episode_type: "historical",
  },
  {
    id: "culture",
    label_ar: "ثقافة وفنون",
    scope_ar: "الأدب، السينما، الموسيقى، الفن، الرياضة، والظواهر الثقافية التي تشكّل الذوق العام.",
    legacy_domain: "modern_society",
    default_episode_type: "social",
  },
  {
    id: "psychology",
    label_ar: "علم النفس",
    scope_ar: "النفس البشرية، السلوك، والعقل — بفهم علمي لا بكلام إنشائي.",
    legacy_domain: "psychology",
    default_episode_type: "psychological",
  },
  {
    id: "science",
    label_ar: "علوم",
    scope_ar: "اكتشافات وأفكار علمية — فيزياء، أحياء، فضاء، طب — مقدّمة بحسّ قصصي يشدّ غير المختص.",
    legacy_domain: "technology_ai",
    default_episode_type: "intellectual",
  },
  {
    id: "self_development",
    label_ar: "تطوير الذات",
    scope_ar: "عادات، إنتاجية، انضباط، ونموّ شخصي — بمحتوى عملي حقيقي لا كليشيهات تحفيزية.",
    legacy_domain: "emotions_inner_life",
    default_episode_type: "inspirational",
  },
  {
    id: "business",
    label_ar: "أعمال وريادة",
    scope_ar: "بناء المشاريع، القيادة، النجاح والفشل، واقتصاد ريادة الأعمال في المنطقة.",
    legacy_domain: "money_career",
    default_episode_type: "economic",
  },
  {
    id: "personal_finance",
    label_ar: "المال الشخصي",
    scope_ar: "إدارة المال، الادخار، الاستثمار، الديون — ذكاء مالي يفيد الفرد العادي.",
    legacy_domain: "money_career",
    default_episode_type: "economic",
  },
  {
    id: "social_issues",
    label_ar: "قضايا اجتماعية",
    scope_ar: "الأسرة، الهوية، الضغوط البنيوية، والتوترات التي تشكّل المجتمع.",
    legacy_domain: "social_issues",
    default_episode_type: "social",
  },
  {
    id: "technology",
    label_ar: "تقنية",
    scope_ar: "الذكاء الاصطناعي، الإنترنت، الأدوات، وأثر التقنية على حياتنا اليومية.",
    legacy_domain: "technology_ai",
    default_episode_type: "social",
  },
  {
    id: "health",
    label_ar: "صحة",
    scope_ar: "الجسد، التغذية، النوم، اللياقة، والصحة الذهنية — بمعلومة موثوقة وقابلة للتطبيق.",
    legacy_domain: "modern_society",
    default_episode_type: "social",
  },
  {
    id: "future",
    label_ar: "مستقبل واتجاهات",
    scope_ar: "إلى أين تتجه التقنية والمجتمع والعمل — استشراف مبني على إشارات حقيقية.",
    legacy_domain: "technology_ai",
    default_episode_type: "intellectual",
  },
  {
    id: "human_stories",
    label_ar: "قصص إنسانية",
    scope_ar: "تجارب فردية مؤثرة تجعل المشاهد يتأمّل — صعود، سقوط، نجاة، أو تحوّل.",
    legacy_domain: "relationships",
    default_episode_type: "personal_story",
  },
  {
    id: "controversial",
    label_ar: "نقاشات جدلية",
    scope_ar: "أسئلة خلافية تستحق نقاشاً ناضجاً — جرأة بمسؤولية، لا إثارة فارغة.",
    legacy_domain: "power_manipulation",
    default_episode_type: "controversial",
  },
  {
    id: "lifestyle",
    label_ar: "أسلوب حياة",
    scope_ar: "العلاقات اليومية، العادات الاجتماعية، الاستهلاك، والاختيارات التي تصنع نمط الحياة.",
    legacy_domain: "internet_culture",
    default_episode_type: "social",
  },
] as const

export type SeasonCategoryId = (typeof SEASON_CATEGORIES)[number]["id"]

export const SEASON_CATEGORY_IDS: readonly string[] = SEASON_CATEGORIES.map((c) => c.id)

const BY_ID = new Map<string, SeasonCategory>(SEASON_CATEGORIES.map((c) => [c.id, c]))
const BY_LABEL = new Map<string, SeasonCategoryId>(
  SEASON_CATEGORIES.map((c) => [c.label_ar.trim(), c.id as SeasonCategoryId]),
)

/** Lookup a category by id. Returns null for unknown ids. */
export function categoryById(id: string | null | undefined): SeasonCategory | null {
  if (!id) return null
  return BY_ID.get(id.trim().toLowerCase()) ?? null
}

/** True when `id` is one of the 15 canonical categories. */
export function isSeasonCategory(id: string | null | undefined): id is SeasonCategoryId {
  return !!id && BY_ID.has(id.trim().toLowerCase())
}

/**
 * Coerce a free-form model value to a valid category id, or null. Tolerant of
 * the common model variants: bracketed ids it copies from the prompt menu
 * (`"[business]"`), surrounding quotes/whitespace, casing, and the Arabic label
 * returned instead of the id.
 */
export function clampCategory(v: string | null | undefined): SeasonCategoryId | null {
  if (!v) return null
  const id = v
    .trim()
    .replace(/^["'\[\s]+|["'\]\s]+$/g, "")
    .toLowerCase()
  if (BY_ID.has(id)) return id as SeasonCategoryId
  const byLabel = BY_LABEL.get(v.trim())
  return byLabel ?? null
}

/** The legacy `topic_domain` a category persists as (compat shadow). */
export function legacyDomainForCategory(id: string | null | undefined): KhatMapTopicDomain {
  return categoryById(id)?.legacy_domain ?? "none"
}

/** The default `episode_type` for a category when the model is ambiguous. */
export function defaultEpisodeTypeForCategory(
  id: string | null | undefined,
): KhatMapEpisodeType {
  return categoryById(id)?.default_episode_type ?? "signature_khat"
}

/** Empty per-category counter, zero-filled — every category present. */
export function zeroCategoryCounts(): Record<SeasonCategoryId, number> {
  const out = {} as Record<SeasonCategoryId, number>
  for (const c of SEASON_CATEGORIES) out[c.id as SeasonCategoryId] = 0
  return out
}
