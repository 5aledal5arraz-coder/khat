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

/**
 * Persian / Urdu letter forms that Arabic text from Wikidata and Wikipedia
 * really carries (Q108052824's description spells «سیاسي» with U+06CC) and
 * `foldVerbatim` does not map. Without this the lexicon never saw «سياسي».
 */
export function normalizeArabicVariants(s: string): string {
  return (s ?? "").replace(/[ی\u06D0]/g, "ي").replace(/ک/g, "ك").replace(/ە/g, "ه")
}

function stripNegated(text: string): { folded: string; lower: string } {
  const folded: string[] = []
  const lower: string[] = []
  for (const clause of normalizeArabicVariants(text ?? "").split(CLAUSE_SPLIT)) {
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

// ─── Guest side ──────────────────────────────────────────────────────────────
//
// The topic lexicon above judges a TITLE. A guest is judged on who he is:
// his name, role, Wikidata description, Wikipedia summary, the verified
// quotes and the story summary (2026-09-29: ياسر البحري — «محلل سياسي»,
// convicted of a sexual offence — reached «مرشّح قويّ» because no gate ever
// read those texts). Same two signals, same rule: reject when EITHER fires.
//
// Prison itself is a constitution field («السجن والعودة للمجتمع»), so
// «سجن / السجن / الإفراج / محكوميته» never trip anything here. What does:
// a political role, a public scandal, and a CONVICTION (or charge) of him
// for a sexual offence — cue and offence in the same sentence, and not a
// sentence that records an acquittal or a wrongful arrest. A financial
// conviction is a review, not a reject (FINANCIAL_RECORD_POLICY).

/** The classifier's per-person vocabulary. Anything else is ignored. */
export const GUEST_SENSITIVITY_FLAGS = [
  "politics",
  "religious_dispute",
  "scandal",
  "third_party_exposure",
  "ongoing_case",
] as const
export type GuestSensitivityFlag = (typeof GUEST_SENSITIVITY_FLAGS)[number]

/** Operator copy for a rejected guest: «مخالف لدستور خط: …». */
export const GUEST_POLICY_LABEL_AR: Record<GuestSensitivityFlag, string> = {
  politics: "سياسة",
  religious_dispute: "خلاف ديني",
  scandal: "فضيحة/إدانة",
  third_party_exposure: "كشف خصوصيات الغير",
  ongoing_case: "قضية منظورة",
}

/**
 * What a SERVED financial conviction (fraud / embezzlement / forgery /
 * bribery) does to a guest. Default pending Khaled (noura QA, 2026-09-29):
 * "review" — not a reject; the card goes to «للمراجعة» with
 * FINANCIAL_RECORD_REVIEW_AR. Flip to "reject" to treat it like a sexual
 * offence. Sexual offences and public scandal are always a hard reject.
 */
export const FINANCIAL_RECORD_POLICY: "review" | "reject" = "review"
export const FINANCIAL_RECORD_REVIEW_AR = "سابقة مالية — قرار خالد"

// Political roles, folded, matched as phrases. Bare «حقوقي» / «المعارضة» are
// NOT here: «مستشار حقوقي في قضايا الأسرة», «باحث حقوقي», «واجه المعارضة
// من أهله» are not politics.
const GUEST_POLITICAL_PHRASES = [
  "ناشط حقوقي",
  "ناشطه حقوقيه",
  "ناشط سياسي",
  "ناشطه سياسيه",
  "محلل سياسي",
  "معارض سياسي",
  "المعارضه السياسيه",
]
// Removed before the POLITICAL check only: a quoted title («السجين السياسي»)
// and political-science teaching («مدرس علوم سياسية») are not a political role.
const QUOTED_SPANS = /«[^»]*»|"[^"]*"|“[^”]*”/g
const POLITICAL_SCIENCE = /(?:ال)?علوم\s+(?:ال)?سياسي[ةه]/g

// Exoneration is judged per SENTENCE (a «،» inside «اتُّهم بالتزوير، ثم
// ثبتت براءته» must not separate the charge from the acquittal).
const SENTENCE_SPLIT = /[.!?؟؛\n]+/

// He is the one convicted / charged: passive or subject forms only.
const CUE_DIRECT = ["ادين", "ادينت", "ادانته", "ادانتها", "ادانه", "مدان", "مدانا", "متهم", "متهما", "اتهامه"]
const CUE_PHRASES = ["حكم عليه", "صدر بحقه", "صدر ضده"]
// «اتُّهم» and «اتَّهم» fold to the same «اتهم»: it counts only when the
// charge follows directly («اتهم بالتزوير»), not an object («اتهم شريكه»).
const CUE_AMBIGUOUS = ["اتهم", "اتهمت"]
// «بتهمة» counts after an arrest / sentence word («سُجن بتهمة…»).
const CHARGE = ["تهمه", "تهم"]
const ARREST = ["سجن", "حبس", "اعتقل", "احتجز", "اوقف", "عليه", "القبض", "ظلما", "بالخطا"]

const SEXUAL_STEMS = ["تحرش", "اغتصاب", "هتك"]
const SEXUAL_PHRASES = ["اعتداء جنسي", "الاعتداء الجنسي"]
const FINANCIAL_STEMS = ["احتيال", "اختلاس", "تزوير", "رشوه", "رشاوي"]

// An acquittal or a wrongful arrest — a FACT, not his denial: «أدلة على
// براءته» (البحري) is a claim and does not count; bare «خطأ» neither.
const EXONERATION_TOKENS = ["ظلما", "براته", "براتني", "تبريته", "ببراءته"]
const EXONERATION_PHRASES = ["ثبتت براءته", "ظهرت براءته", "ثبوت براءته", "اعلنت براءته"]
const WRONGFUL_ARREST = /(?:^| )(?:[وبل]?تشابه (?:في )?(?:ال)?اسماء|[وب]?خطا في (?:ال)?بصمات|(?:سجن|حبس|اعتقل|احتجز|اوقف|عليه) بالخطا)(?= |$)/

function hasForm(tokens: string[][], list: string[]): boolean {
  return tokens.some((forms) => forms.some((f) => list.includes(f)))
}

/**
 * The guest-side scan: the topic lexicon (politics judged with quoted titles
 * and political-science teaching removed), political roles, and — per
 * sentence — a conviction or charge of HIM for a sexual offence (hit) or a
 * financial one (a record for review, or a hit if FINANCIAL_RECORD_POLICY is
 * "reject"), unless the same sentence records an acquittal / wrongful arrest.
 * Negation-aware like the topic lexicon. Pure.
 */
export function guestPolicyScan(text: string): { hits: PolicyCategory[]; financialRecord: boolean } {
  const norm = normalizeArabicVariants(text ?? "")
  const unquoted = norm.replace(QUOTED_SPANS, " ").replace(POLITICAL_SCIENCE, " ")
  const hits = new Set<PolicyCategory>(lexiconPolicyHits(norm).filter((c) => c !== "politics"))
  if (lexiconPolicyHits(unquoted).includes("politics")) hits.add("politics")
  const { folded: unquotedFolded } = stripNegated(unquoted)
  if (GUEST_POLITICAL_PHRASES.some((p) => ` ${unquotedFolded} `.includes(` ${p} `))) hits.add("politics")

  let financialRecord = false
  for (const sentence of norm.split(SENTENCE_SPLIT)) {
    const { folded } = stripNegated(sentence)
    if (!folded) continue
    const padded = ` ${folded} `
    const raw = folded.split(" ")
    const toks = raw.map(bareForms)
    const cue =
      hasForm(toks, CUE_DIRECT) ||
      CUE_PHRASES.some((p) => padded.includes(` ${p} `)) ||
      toks.some((forms, i) => forms.some((f) => CUE_AMBIGUOUS.includes(f)) && /^ب/.test(raw[i + 1] ?? "")) ||
      toks.some(
        (forms, i) =>
          forms.some((f) => CHARGE.includes(f)) &&
          toks.slice(Math.max(0, i - 2), i).some((prev) => prev.some((f) => ARREST.includes(f))),
      )
    if (!cue) continue
    const exonerated =
      hasForm(toks, EXONERATION_TOKENS) ||
      EXONERATION_PHRASES.some((p) => padded.includes(` ${p} `)) ||
      WRONGFUL_ARREST.test(folded)
    if (exonerated) continue
    const stemHit = (stems: string[]) => toks.some((forms) => forms.some((f) => stems.some((s) => f.startsWith(s))))
    if (stemHit(SEXUAL_STEMS) || SEXUAL_PHRASES.some((p) => padded.includes(` ${p} `))) hits.add("scandal")
    else if (stemHit(FINANCIAL_STEMS)) {
      if (FINANCIAL_RECORD_POLICY === "reject") hits.add("scandal")
      else financialRecord = true
    }
  }
  return { hits: [...hits], financialRecord }
}

/** Avoided categories in a GUEST's text (see guestPolicyScan). */
export function guestPolicyHits(text: string): PolicyCategory[] {
  return guestPolicyScan(text).hits
}

/** Keep only the known guest flags, lower-cased and unique. */
export function normalizeGuestSensitivityFlags(raw: unknown): GuestSensitivityFlag[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,\s|]+/) : []
  const out = new Set<GuestSensitivityFlag>()
  for (const v of list) {
    const k = String(v ?? "").trim().toLowerCase() as GuestSensitivityFlag
    if ((GUEST_SENSITIVITY_FLAGS as readonly string[]).includes(k)) out.add(k)
  }
  return [...out]
}

/**
 * The single guest-policy gate. `ok: false` → the candidate is rejected
 * before it can be strong / needs_review; `reasonAr` is the operator copy.
 */
export function judgeGuestPolicy(
  text: string,
  modelFlags?: unknown,
): {
  ok: boolean
  lexicon: PolicyCategory[]
  flagged: GuestSensitivityFlag[]
  reasonAr: string | null
  /** Not a reject: send to «للمراجعة» with this note (a served financial record). */
  review: string | null
} {
  const { hits: lexicon, financialRecord } = guestPolicyScan(text)
  const flagged = normalizeGuestSensitivityFlags(modelFlags)
  const all = [...new Set<GuestSensitivityFlag>([...lexicon, ...flagged])]
  const ok = all.length === 0
  return {
    ok,
    lexicon,
    flagged,
    reasonAr: ok ? null : `مخالف لدستور خط: ${all.map((f) => GUEST_POLICY_LABEL_AR[f]).join("، ")}`,
    review: ok && financialRecord ? FINANCIAL_RECORD_REVIEW_AR : null,
  }
}
