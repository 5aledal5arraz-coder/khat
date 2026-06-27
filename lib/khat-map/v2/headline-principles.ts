/**
 * Headline Intelligence — the principles of a powerful title, abstracted.
 *
 * The engine does NOT copy headlines from anywhere. It learns the *craft* the
 * best editors at the world's strongest newsrooms and magazines use, expressed
 * as principles, and applies them to generate several title options per episode
 * in Arabic — then picks the strongest and says why.
 *
 * Two parts:
 *   1. TITLE VARIANT KINDS — the angles a title can take (premium, curiosity,
 *      controversial, emotional, global, local, youtube, apple). The generator
 *      writes one of each so the operator can choose, and the engine recommends.
 *   2. HEADLINE PRINCIPLES — a prompt block that teaches the model what makes a
 *      title pull WITHOUT being cheap clickbait (the line Khat must never cross).
 *
 * Pure values + pure helpers. No I/O.
 */

export interface TitleVariantKind {
  /** Stable key — also the JSON field the model fills + the persisted key. */
  id: string
  /** Arabic label for the UI. */
  label_ar: string
  /** What this variant optimizes for (prompt guidance + UI tooltip). */
  guidance_ar: string
}

/**
 * The eight title angles every generated episode carries. Order is the menu
 * order shown to the model and the UI.
 */
export const TITLE_VARIANT_KINDS: readonly TitleVariantKind[] = [
  { id: "premium", label_ar: "راقٍ", guidance_ar: "عنوان رصين أنيق يوحي بالعمق والمصداقية — يليق بمجلة محترمة، لا يصرخ." },
  { id: "curiosity", label_ar: "فضولي", guidance_ar: "يفتح فجوة معرفية تجعل الدماغ يطلب الإجابة — وعدٌ بسرٍّ سيُكشف." },
  { id: "controversial", label_ar: "جريء", guidance_ar: "يضع التوتر أو التناقض في الواجهة ويستفزّ النقاش — بمسؤولية لا بابتذال." },
  { id: "emotional", label_ar: "عاطفي", guidance_ar: "يلمس وتراً إنسانياً — خوف، حنين، ألم، أو أمل — يجعل القلب يتوقّف لحظة." },
  { id: "global", label_ar: "عالمي", guidance_ar: "صياغة تخاطب أي إنسان في العالم — سؤال كوني يتجاوز المنطقة." },
  { id: "local", label_ar: "خليجي", guidance_ar: "صياغة تلمس الخليجي والكويتي مباشرة — بواقعه ولغته وما يعنيه له." },
  { id: "youtube", label_ar: "يوتيوب", guidance_ar: "عنوان يصمد في صف نتائج يوتيوب — واضح، مشحون، يستدعي النقرة دون كذب." },
  { id: "apple", label_ar: "أبل بودكاست", guidance_ar: "عنوان أنظف وأكثر وصفية يليق بدليل أبل بودكاست — يُفهم خارج السياق." },
] as const

export type TitleVariantId = (typeof TITLE_VARIANT_KINDS)[number]["id"]

export const TITLE_VARIANT_IDS: readonly string[] = TITLE_VARIANT_KINDS.map((k) => k.id)

/** The set of title options for one episode + the engine's recommendation. */
export interface TitleSet {
  variants: Partial<Record<TitleVariantId, string>>
  /** Which variant the system recommends as the headline. */
  recommended: TitleVariantId | null
  /** The recommended title text (denormalized for convenience/UI). */
  recommended_title: string | null
  /** One Arabic line: why this title wins over the others. */
  recommended_reason: string | null
}

const VARIANT_BY_LABEL = new Map<string, TitleVariantId>(
  TITLE_VARIANT_KINDS.map((k) => [k.label_ar.trim(), k.id as TitleVariantId]),
)

/** Arabic label for a variant id. */
export function titleVariantLabel(id: string | null | undefined): string {
  if (!id) return "—"
  return TITLE_VARIANT_KINDS.find((k) => k.id === id)?.label_ar ?? id
}

function coerceVariantId(v: string | null | undefined): TitleVariantId | null {
  if (!v) return null
  const id = v.trim().replace(/^["'[\s]+|["'\]\s]+$/g, "").toLowerCase()
  if (TITLE_VARIANT_IDS.includes(id)) return id as TitleVariantId
  return VARIANT_BY_LABEL.get(v.trim()) ?? null
}

/**
 * Coerce raw model output into a clean TitleSet. Accepts either a flat object
 * `{ premium, curiosity, ... }` or `{ variants, recommended, recommended_reason }`.
 * Falls back to picking the first available variant as the recommendation, and
 * to `fallbackTitle` (the working_title) when the model gave nothing usable.
 */
export function clampTitleSet(raw: unknown, fallbackTitle: string): TitleSet {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  const source =
    o.variants && typeof o.variants === "object"
      ? (o.variants as Record<string, unknown>)
      : o

  const variants: Partial<Record<TitleVariantId, string>> = {}
  for (const kind of TITLE_VARIANT_KINDS) {
    const val = source[kind.id]
    if (typeof val === "string" && val.trim()) variants[kind.id] = val.trim()
  }

  let recommended = coerceVariantId(typeof o.recommended === "string" ? o.recommended : null)
  if (!recommended || !variants[recommended]) {
    recommended = (Object.keys(variants)[0] as TitleVariantId) ?? null
  }
  const recommended_title = recommended ? variants[recommended] ?? null : null
  const recommended_reason =
    typeof o.recommended_reason === "string" && o.recommended_reason.trim()
      ? o.recommended_reason.trim()
      : null

  return {
    variants,
    recommended,
    recommended_title: recommended_title ?? fallbackTitle,
    recommended_reason,
  }
}

// ─── The prompt block ────────────────────────────────────────────────────────

/**
 * The headline-principles teaching block injected into the generation prompt.
 * Principles, not examples to copy. Returns a ready-to-join string.
 */
export function buildHeadlinePrinciplesBlock(): string {
  const variantMenu = TITLE_VARIANT_KINDS.map(
    (k) => `  · ${k.id} (${k.label_ar}): ${k.guidance_ar}`,
  ).join("\n")

  return [
    "# Headline craft (principles, never copied)",
    "Write titles the way the best editors do — earn the click, never trick it. A premium",
    "title pulls because of what it PROMISES, not because it hides the truth. The levers:",
    "- Curiosity gap: open a question the reader must close — but the answer must be real.",
    "- Tension / contradiction: two things that shouldn't go together, side by side.",
    "- Surprise: invert an assumption the reader didn't know they held.",
    "- Specificity: one concrete detail (a number, a name, a place) beats ten adjectives.",
    "- Emotional pull: name the feeling under the topic — fear, longing, awe, injustice.",
    "- Authority: sound like someone who knows, not someone shouting for attention.",
    "- Mystery vs clarity: intrigue, but the reader must still grasp what the episode IS.",
    "- Stakes: make clear why it matters to ME, now.",
    "",
    "## The clickbait line (do NOT cross)",
    "- No false promises, no withholding the obvious just to force a click, no fake urgency,",
    "  no 'you won't believe', no rage-bait. If the title would embarrass a serious editor,",
    "  it's wrong for Khat. Premium > viral-but-cheap, every time.",
    "",
    "## Produce a title set",
    "For each episode, write ONE title for each of these angles (Arabic, each a real option):",
    variantMenu,
    "Then choose the single strongest as `recommended` and explain in one line WHY it wins",
    "(which lever it pulls, for which audience) in `recommended_reason`.",
  ].join("\n")
}
