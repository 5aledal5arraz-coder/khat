/**
 * Thinking Lenses — the angles a single topic is examined through.
 *
 * A category answers "what is this about." A lens answers "from which angle do
 * we make it powerful." The strongest Khat episodes are not single-category —
 * they take one subject and refract it through several lenses at once: a money
 * topic seen through the `history` + `power` + `psychology` lenses becomes a far
 * richer episode than a flat "personal finance" segment.
 *
 * The generator is told to tag each idea with the 2-5 lenses that genuinely
 * sharpen it (not a checklist) and to let the lens combination drive the hook,
 * the debate axis, and the questions. The Editorial Court checks the lenses are
 * real, and the UI shows them as chips so the operator sees the angle at a glance.
 *
 * Pure values + pure helpers. No I/O.
 */

export interface ThinkingLens {
  /** Stable snake_case slug — persisted + used by the prompt + UI chip. */
  id: string
  /** Arabic label for the chip + prompt menu. */
  label_ar: string
  /** Generative Arabic hint — what looking through this lens surfaces. */
  hint_ar: string
}

export const THINKING_LENSES: readonly ThinkingLens[] = [
  { id: "historical", label_ar: "تاريخي", hint_ar: "أين يقف الموضوع في الزمن — جذوره، تكراره، وما يعلّمنا إياه الماضي." },
  { id: "psychological", label_ar: "نفسي", hint_ar: "ما الذي يجري داخل الإنسان — الدافع، الخوف، والحاجة الخفية." },
  { id: "philosophical", label_ar: "فلسفي", hint_ar: "السؤال الأعمق تحت السطح — المعنى، الحقيقة، والقيمة." },
  { id: "economic", label_ar: "اقتصادي", hint_ar: "من يربح ومن يخسر، تدفّق المال، والحوافز التي تحرّك كل شيء." },
  { id: "religious", label_ar: "ديني", hint_ar: "كيف يتقاطع الموضوع مع الإيمان والمقدّس والموروث الديني — باحترام." },
  { id: "social", label_ar: "اجتماعي", hint_ar: "أثره على الأسرة والمجتمع والعلاقات، والضغط الجماعي حوله." },
  { id: "political", label_ar: "سياسي", hint_ar: "من يحكم، من يقرّر، وكيف تتوزّع السلطة والقرار." },
  { id: "legal", label_ar: "قانوني", hint_ar: "ما المسموح والممنوع، الحقوق والعدالة، والفجوة بين القانون والواقع." },
  { id: "scientific", label_ar: "علمي", hint_ar: "ماذا يقول الدليل والبحث فعلاً، بعيداً عن الانطباع والشائعة." },
  { id: "technological", label_ar: "تقني", hint_ar: "كيف تغيّر التقنية اللعبة — تُسرّعها، تقلبها، أو تخلق المشكلة." },
  { id: "future", label_ar: "استشرافي", hint_ar: "إلى أين يتجه هذا، والسيناريوهات التي تنتظرنا." },
  { id: "cultural", label_ar: "ثقافي", hint_ar: "كيف يتجلّى في الفن واللغة والذوق والهوية الجمعية." },
  { id: "ethical", label_ar: "أخلاقي", hint_ar: "أين الصواب والخطأ، والمعضلة التي لا إجابة سهلة لها." },
  { id: "human_story", label_ar: "قصة إنسانية", hint_ar: "وجه إنساني واحد يجسّد الفكرة ويجعلها تُحَسّ لا تُشرَح فقط." },
  { id: "controversy", label_ar: "جدلي", hint_ar: "نقطة الخلاف الحادّة التي تشعل النقاش وتقسم الآراء." },
  { id: "power", label_ar: "سلطة", hint_ar: "من يملك القوة هنا، كيف اكتسبها، وكيف يحافظ عليها." },
  { id: "money", label_ar: "مال", hint_ar: "البُعد المالي — الثروة، الطمع، والثمن المخفي." },
  { id: "identity", label_ar: "هوية", hint_ar: "ما يقوله الموضوع عن من نكون، وانتماءاتنا وصورتنا عن أنفسنا." },
  { id: "media", label_ar: "إعلامي", hint_ar: "كيف تُصاغ الرواية وتُدار الصورة، ومن يصنع ما نصدّقه." },
  { id: "crime_conflict", label_ar: "جريمة وصراع", hint_ar: "التوتر، المواجهة، الخطر، والجانب المظلم من القصة." },
  { id: "global_relevance", label_ar: "صلة عالمية", hint_ar: "لماذا يهمّ هذا العالم كله، لا منطقتنا فقط — جسر للجمهور الأممي." },
  { id: "gcc_relevance", label_ar: "صلة خليجية", hint_ar: "لماذا يلمس هذا الخليجي والكويتي تحديداً — في واقعه وقيمه ويومه." },
] as const

export type ThinkingLensId = (typeof THINKING_LENSES)[number]["id"]

const LENS_BY_ID = new Map<string, ThinkingLens>(
  THINKING_LENSES.map((l) => [l.id, l]),
)
const LENS_BY_LABEL = new Map<string, ThinkingLensId>(
  THINKING_LENSES.map((l) => [l.label_ar.trim(), l.id as ThinkingLensId]),
)

export const THINKING_LENS_IDS: readonly string[] = THINKING_LENSES.map((l) => l.id)

/** Lookup a lens by id. */
export function lensById(id: string | null | undefined): ThinkingLens | null {
  if (!id) return null
  return LENS_BY_ID.get(id.trim().toLowerCase()) ?? null
}

/** Arabic label for a lens id (falls back to the raw id). */
export function lensLabel(id: string | null | undefined): string {
  if (!id) return "—"
  return LENS_BY_ID.get(id.trim().toLowerCase())?.label_ar ?? id
}

/**
 * Coerce a model-supplied lens array into a clean, de-duplicated, capped list of
 * valid lens ids. Tolerant of brackets/quotes/casing and Arabic labels. Drops
 * unknowns silently. Capped at `max` (default 5) — a topic refracted through
 * more than five lenses is unfocused, not deep.
 */
export function clampLenses(value: unknown, max = 5): ThinkingLensId[] {
  if (!Array.isArray(value)) return []
  const out: ThinkingLensId[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== "string") continue
    const id = raw.trim().replace(/^["'[\s]+|["'\]\s]+$/g, "").toLowerCase()
    let lensId = LENS_BY_ID.has(id) ? (id as ThinkingLensId) : undefined
    if (!lensId) lensId = LENS_BY_LABEL.get(raw.trim())
    if (!lensId || seen.has(lensId)) continue
    seen.add(lensId)
    out.push(lensId)
    if (out.length >= max) break
  }
  return out
}
