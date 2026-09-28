/**
 * Khat content policy — the code half of the constitution's avoid list
 * (lib/khat-map/core/constitution.ts, KHAT_AVOID_AR): politics, religious /
 * sectarian dispute, scandal, privacy intrusion.
 *
 * Two independent signals, and a topic is rejected when EITHER fires:
 *   1. a deterministic lexicon over the topic's own text (this file) — it
 *      cannot be talked out of a hit, but it only knows words;
 *   2. the model's own `sensitivity_flags` — it knows meaning, but it is a
 *      claim. We only ever let it REJECT, never approve.
 *
 * The lexicon is deliberately narrow: whole folded tokens / stems / phrases,
 * negated spans stripped, and callers feed it the TITLE + HOOK only (the rest
 * of a topic is the model's job via sensitivity_flags), chosen so that the
 * lived-experience fields the constitution WANTS do not trip it — «الحروب واللجوء», «الأسر والمعتقلات», «الإيمان كتجربة شخصية»,
 * «الألم الحاد», «الطائف», «الوظيفة الحكومية» all pass (tests pin both
 * directions). Pure — no I/O.
 */

import { foldVerbatim } from "@/lib/studio/verbatim"

export type PolicyCategory = "politics" | "religious_dispute" | "scandal"

/** The model-side vocabulary. Anything else the model emits is ignored. */
export const SENSITIVITY_FLAGS = [
  "politics",
  "religious_dispute",
  "scandal",
  "privacy_intrusion",
] as const
export type SensitivityFlag = (typeof SENSITIVITY_FLAGS)[number]

interface Lexicon {
  /** A folded token matches when it STARTS with one of these (after proclitics are stripped). */
  stems: string[]
  /** A folded token matches only when it EQUALS one of these (after proclitics are stripped). */
  exact: string[]
  /** Folded multi-word phrases, matched on word boundaries. */
  phrases: string[]
  /** Latin-script patterns (lower-cased text). */
  latin: RegExp
}

// Folded forms (foldVerbatim): أ/إ/آ → ا, ة → ه, ئ → ي, ى → ي, no tashkeel.
//
// QA (noura, 2026-09-28): the bare stem «سياس» rejected «سياسة الادخار»,
// «سياسات التسعير», «السياسة المالية للأسرة» — the core of العمل والمال. So
// the NOUN «سياسة» never matches on its own; only the political ADJECTIVE
// (سياسي/سياسية) and named political phrases do. Same for «انتخاب» (الانتخاب
// الطبيعي), «برلمان» (برلمان الطلبة), «مذهبي» (مذهبي في الحياة), «تسريبات»
// (تسريبات المياه) and «تشهير» (a victim telling how he recovered from it):
// those are left to the model's sensitivity_flags.
const LEXICON: Record<PolicyCategory, Lexicon> = {
  politics: {
    stems: ["جيوسياس", "ديمقراط", "دكتاتور"],
    exact: [
      "سياسي",
      "سياسيه",
      "سياسيا",
      "سياسيون",
      "سياسيين",
      "انتخابات",
      "انتخابيه",
      "برلماني",
      "برلمانيه",
      "حزب",
      "احزاب",
      "حزبي",
      "حزبيه",
      "التطبيع",
    ],
    phrases: [
      "السياسه الكويتيه",
      "السياسه المحليه",
      "السياسه الخارجيه",
      "السياسه العربيه",
      "مجلس الامه",
      "النواب والحكومه",
      "الحكومه والنواب",
      "الربيع العربي",
      "نظام الحكم",
    ],
    latin: /\b(?:politic\w*|geopolitic\w*|elections?|electoral|parliamentary|partisan)\b/,
  },
  religious_dispute: {
    // «طايفي» (طائفي), never «طايف» — that is the city of Taif.
    stems: ["طايفي", "تكفير", "ملحد"],
    // «الالحاد» only with its article: bare «الحاد» is also «الحادّ» (acute).
    exact: ["الالحاد", "شيعي", "شيعيه", "الشيعه", "مذهبيه", "المذهبيه", "البدعه", "بدعه", "البدع"],
    phrases: [
      "السنه والشيعه",
      "سني وشيعي",
      "جدل ديني",
      "الجدل الديني",
      "خلاف ديني",
      "الخلاف الديني",
      "خلافات دينيه",
      "الخلافات الدينيه",
      "خلاف مذهبي",
      "خلافات مذهبيه",
      "الخلافات المذهبيه",
      "مناظره دينيه",
      "الاخوان المسلمين",
      "الاخوان المسلمون",
      "جماعه الاخوان",
      "السلفيه والصوفيه",
      "الصوفيه والسلفيه",
    ],
    latin: /\b(?:sectarian\w*|sunni|shia|shiite|atheis\w*|blasphem\w*|muslim brotherhood)\b/,
  },
  scandal: {
    stems: ["فضيح", "فضايح"],
    exact: [],
    phrases: [],
    latin: /\bscandal\w*/,
  },
}

/**
 * A mention inside a negation is the opposite of the topic: «بعيداً عن
 * السياسة»، «نتجنب الجدل الديني»، «بلا تشهير ولا فضيحة». Everything from the
 * cue to the end of its clause is dropped before matching.
 */
const NEGATION_CUES_AR = ["بعيدا عن", "لا علاقه", "نتجنب", "يتجنب", "تتجنب", "نبتعد عن", "بلا", "بدون", "دون", "من غير"]
const NEGATION_CUES_EN = ["away from", "without", "avoiding", "avoids", "avoid", "not about", "no "]
const CLAUSE_SPLIT = /[،,.؛;:!?؟\n()«»"“”…\-–—]+/

function stripNegated(text: string): { folded: string; lower: string } {
  const folded: string[] = []
  const lower: string[] = []
  for (const clause of (text ?? "").split(CLAUSE_SPLIT)) {
    const f = ` ${foldVerbatim(clause)} `
    let cut = f.length
    for (const cue of NEGATION_CUES_AR) {
      const i = f.indexOf(` ${cue} `)
      if (i >= 0 && i < cut) cut = i
    }
    folded.push(f.slice(0, cut).trim())
    const l = ` ${clause.toLowerCase()} `
    let lcut = l.length
    for (const cue of NEGATION_CUES_EN) {
      const i = l.indexOf(` ${cue}`)
      if (i >= 0 && i < lcut) lcut = i
    }
    lower.push(l.slice(0, lcut))
  }
  return { folded: folded.filter(Boolean).join(" "), lower: lower.join(" ") }
}

/** A token's candidate bare forms: itself, minus و/ف, minus ب/ل/ك, minus ال. */
function bareForms(tok: string): string[] {
  const out = new Set<string>([tok])
  let t = tok
  if (t.length > 3 && (t.startsWith("و") || t.startsWith("ف"))) {
    t = t.slice(1)
    out.add(t)
  }
  if (t.length > 3 && /^[بلك]/.test(t)) {
    out.add(t.slice(1))
    if (t.slice(1).startsWith("ال")) out.add(t.slice(3))
    // «لل» = ل + ال with the alef dropped («للسياسة»).
    if (t.startsWith("لل")) out.add(t.slice(2))
  }
  if (t.length > 4 && t.startsWith("ال")) out.add(t.slice(2))
  return [...out].filter((x) => x.length >= 2)
}

/** The avoided categories the lexicon finds in `text` (empty = clean). */
export function lexiconPolicyHits(text: string): PolicyCategory[] {
  const { folded, lower } = stripNegated(text ?? "")
  if (!folded && !lower.trim()) return []
  const padded = ` ${folded} `
  const tokens = folded.split(" ").flatMap(bareForms)
  const hits: PolicyCategory[] = []
  for (const cat of Object.keys(LEXICON) as PolicyCategory[]) {
    const lx = LEXICON[cat]
    const hit =
      tokens.some((t) => lx.exact.includes(t) || lx.stems.some((s) => t.startsWith(s))) ||
      lx.phrases.some((p) => padded.includes(` ${p} `)) ||
      lx.latin.test(lower)
    if (hit) hits.push(cat)
  }
  return hits
}

/** Keep only the known flags, lower-cased and unique. Anything else is noise. */
export function normalizeSensitivityFlags(raw: unknown): SensitivityFlag[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\s|]+/) : []
  const out = new Set<SensitivityFlag>()
  for (const v of list) {
    const k = String(v ?? "").trim().toLowerCase() as SensitivityFlag
    if ((SENSITIVITY_FLAGS as readonly string[]).includes(k)) out.add(k)
  }
  return [...out]
}

export interface PolicyDecision {
  ok: boolean
  lexicon: PolicyCategory[]
  flagged: SensitivityFlag[]
}

/** Reject when either the lexicon or the model's own flags fire. */
export function judgePolicy(text: string, modelFlags?: unknown): PolicyDecision {
  const lexicon = lexiconPolicyHits(text)
  const flagged = normalizeSensitivityFlags(modelFlags)
  return { ok: lexicon.length === 0 && flagged.length === 0, lexicon, flagged }
}

/** The instruction every topic generator carries for `sensitivity_flags`. */
export const SENSITIVITY_FLAGS_SPEC =
  `sensitivity_flags: string[] — list EVERY one of ${SENSITIVITY_FLAGS.map((f) => `"${f}"`).join(", ")} the topic touches (empty array if none). A flagged topic is dropped, so flag honestly rather than soften the wording.`
