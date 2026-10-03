/**
 * Nationality and gender as EVIDENCE STATES (Decision 3, B10). Pure.
 *
 * What episode metadata can ever produce is PROBABLE — never VERIFIED:
 *   • a nationality claim counts only when its evidence text is an exact
 *     substring of the title/description, contains the guest's name, AND
 *     carries an explicit demonym/origin marker for the claimed country
 *     («الكويتي», «كويتية», «من الكويت», "Kuwaiti") that is not describing a
 *     podcast, a team, a market… («البودكاست الكويتي فلان» is not a claim
 *     about فلان);
 *   • the channel's country, the place it was filmed, a generic mention of
 *     Kuwait, and the look of a name are NOT claims and never reach here as
 *     one — they are not in the evidence at all.
 * Automatic derivation never produces VERIFIED — not from metadata, and not
 * from a linked guest_candidates row (its country can be LLM-derived). In M1
 * VERIFIED is a manual decision with a written source; the DB CHECK allows a
 * verified status only with basis `khat_guest` / `manual`.
 */
import type {
  PodcastEvidenceBasis,
  PodcastEvidenceStatus,
  PodcastGenderMarker,
} from "@/lib/db/schema/podcast-universe"
import { containsNormalized, findNameSpan, findTokenSpan, normalizeNameKey, tokensOf } from "./normalize"

/**
 * Demonym / origin markers per ISO country code, in NORMALIZED form
 * (normalizeText: alef folded, ة kept). Matched as whole tokens / phrases.
 * A bare place name («الكويت») is deliberately NOT a marker — «من الكويت» is.
 */
const MARKERS: Record<string, string[]> = {
  KW: ["الكويتي", "الكويتية", "كويتي", "كويتية", "من الكويت", "kuwaiti", "from kuwait"],
  SA: ["السعودي", "السعودية", "سعودي", "سعودية", "من السعودية", "saudi"],
  AE: ["الاماراتي", "الاماراتية", "اماراتي", "اماراتية", "من الامارات", "emirati"],
  BH: ["البحريني", "البحرينية", "بحريني", "بحرينية", "من البحرين", "bahraini"],
  QA: ["القطري", "القطرية", "قطري", "قطرية", "من قطر", "qatari"],
  OM: ["العماني", "العمانية", "عماني", "عمانية", "من عمان", "omani"],
  EG: ["المصري", "المصرية", "مصري", "مصرية", "من مصر", "egyptian"],
  JO: ["الاردني", "الاردنية", "اردني", "اردنية", "من الاردن", "jordanian"],
  LB: ["اللبناني", "اللبنانية", "لبناني", "لبنانية", "من لبنان", "lebanese"],
  IQ: ["العراقي", "العراقية", "عراقي", "عراقية", "من العراق", "iraqi"],
  SY: ["السوري", "السورية", "سوري", "سورية", "من سوريا", "syrian"],
  YE: ["اليمني", "اليمنية", "يمني", "يمنية", "من اليمن", "yemeni"],
  PS: ["الفلسطيني", "الفلسطينية", "فلسطيني", "فلسطينية", "من فلسطين", "palestinian"],
  SD: ["السوداني", "السودانية", "سوداني", "سودانية", "من السودان", "sudanese"],
  MA: ["المغربي", "المغربية", "مغربي", "مغربية", "من المغرب", "moroccan"],
}

export const SUPPORTED_NATIONALITY_CODES = Object.keys(MARKERS)

/**
 * A marker preceded by one of these describes the THING, not the person:
 * «البودكاست الكويتي», «المنتخب السعودي», «السوق الكويتي».
 */
const NON_PERSON_HEADS = new Set([
  "بودكاست", "البودكاست", "برنامج", "البرنامج", "قناة", "القناة", "السوق", "سوق",
  "الاقتصاد", "اقتصاد", "المجتمع", "مجتمع", "الدوري", "دوري", "المنتخب", "منتخب",
  "الشارع", "الاعلام", "اعلام", "التلفزيون", "تلفزيون", "المسرح", "مسرح", "الفن",
  "الشعب", "شعب", "الدستور", "البرلمان", "مجلس", "المطبخ", "مطبخ", "التاريخ",
  "تاريخ", "الادب", "ادب", "الشعر", "شعر", "الجيش", "جيش", "النادي", "نادي",
  "العلم", "علم", "الدينار", "دينار", "الوطن", "الطابع", "التراث", "تراث",
  "الشركات", "شركات", "الشركة", "شركة", "المنتجات", "منتجات", "الحكومة", "حكومة",
  "الجامعة", "جامعة", "الصحافة", "الكرة", "السينما", "الدراما",
  "podcast", "show", "market", "team", "league", "companies", "company", "channel",
])

/** Every token span of a marker for `code` in `tokens` that is not describing a THING. */
function markerSpans(tokens: string[], code: string): Array<[number, number]> {
  const markers = MARKERS[code.toUpperCase()]
  if (!markers) return []
  const out: Array<[number, number]> = []
  for (const m of markers) {
    const mt = m.split(" ")
    for (let i = 0; i + mt.length <= tokens.length; i++) {
      if (!mt.every((t, k) => tokens[i + k] === t)) continue
      const prev = tokens[i - 1]
      if (mt.length === 1 && prev && NON_PERSON_HEADS.has(prev)) continue
      out.push([i, i + mt.length])
    }
  }
  return out
}

/** Does `evidence` carry a person-directed marker for `code` anywhere? (Not sufficient on its own.) */
export function hasNationalityMarker(evidence: string, code: string): boolean {
  return markerSpans(tokensOf(evidence), code).length > 0
}

const LATIN = /^[a-z0-9]+$/

/**
 * English order "Kuwaiti <role> <Name>": the words between demonym and name
 * must be a ROLE NOUN for the guest (allowlist). "Kuwaiti podcast with X",
 * "Kuwaiti host with X" describe something else and never count (noura).
 */
const EN_ROLE_NOUNS = new Set([
  "entrepreneur", "businessman", "businesswoman", "founder", "cofounder", "ceo", "investor",
  "artist", "actor", "actress", "singer", "musician", "composer", "poet", "writer", "author", "novelist",
  "player", "footballer", "athlete", "coach", "champion", "swimmer", "runner", "boxer", "fighter",
  "doctor", "physician", "surgeon", "dentist", "engineer", "scientist", "researcher", "professor", "academic",
  "economist", "lawyer", "judge", "diplomat", "politician", "minister", "ambassador", "officer", "pilot",
  "journalist", "filmmaker", "director", "photographer", "designer", "architect", "chef", "activist",
  "influencer", "youtuber", "comedian", "historian", "inventor", "adventurer", "explorer", "veteran",
])

/**
 * «سالم العتيبي الكويتية للبترول» — a demonym AFTER the name that is followed
 * by «لل…» / «ل…» is the start of an organisation's name (Kuwait Petroleum,
 * …), not the person's nationality.
 */
function startsOrgName(next: string | undefined): boolean {
  return !!next && /^لل|^ل[^ا]/.test(next) && next.length > 3
}

/**
 * The demonym is ATTACHED to this guest (noura 2026-10-03): it must sit
 * immediately before the guest's name («رائد الأعمال الكويتي فلان»,
 * «ضيفنا من الكويت فلان»), immediately after it («فلان الكويتي»), or — English
 * word order — before it with at most two Latin role words in between
 * ("Kuwaiti entrepreneur X"). A demonym on the host («المذيع الكويتي خالد
 * يحاور سالم»), the channel («قناة … الكويتية») or a generic noun («الشركات
 * الكويتية») is not attached to the guest and does not count.
 */
export function nationalityAttachedToName(evidence: string, code: string, displayName: string): boolean {
  const tokens = tokensOf(evidence)
  for (const name of [tokensOf(displayName), tokensOf(normalizeNameKey(displayName))]) {
    const ns = findNameSpan(tokens, name)
    if (ns < 0) continue
    const ne = ns + name.length
    for (const [ms, me] of markerSpans(tokens, code)) {
      if (institutionOwnsMarker(tokens, ms, me, ns, ne)) continue
      if (negatedMarker(tokens, ms, me, ns, ne)) continue
      if (me === ns) return true
      if (ms === ne && !startsOrgName(tokens[me])) return true
      if (
        me < ns &&
        ns - me <= 2 &&
        tokens.slice(me, ns).every((t) => EN_ROLE_NOUNS.has(t)) &&
        tokens.slice(ms, me).every((t) => LATIN.test(t))
      ) {
        return true
      }
    }
  }
  return false
}

// ─── Addendum 2 (d): the Arabic «كويتي/كويتية» clause-window rule ──────────

/** The Arabic Kuwaiti adjective, normalized (ة kept). */
const AR_KW_ADJ = new Set(["كويتي", "كويتية", "الكويتي", "الكويتية"])
/** Max tokens between the name and the adjective (Addendum 2 d). */
export const KW_ADJ_MAX_GAP = 6
/**
 * Sentence ends (hard): the claim never crosses them. A one-letter
 * abbreviation dot («د.», «م.») is not a sentence end.
 */
const SENTENCE_END = /[.!?؟;؛|]/
/**
 * Soft separators (comma, newline, colon, dash, brackets): crossing one is
 * allowed only AFTER the name, where what follows describes the guest —
 * «فارس عاشور، ممثل ويوتيوبر كويتي», «خالد المظفر⏎فنان كويتي» (noura). An
 * adjective BEFORE the name must sit in the same piece as the name.
 */
const SOFT_SEP = /[،,:\n()\[\]{}\-–—]+/
const SOFT = "§"
const CLAUSE_BREAK_TOKENS = new Set([
  "مع", "وهو", "وهي", "بينما", "حيث", "الذي", "التي", "ثم", "لكن", "بل",
  "يحاور", "يحاوره", "يحاورها", "تحاور", "يستضيف", "تستضيف", "نستضيف", "يلتقي", "تلتقي", "يقدم", "تقدم",
  "with", "while", "who",
])
/** Words that point at ANOTHER person («الفنان الآخر وهو كويتي»). Normalized. */
const OTHER_PERSON_TOKENS = new Set([
  "الاخر", "اخر", "الاخري", "اخري", "الثاني", "الثانية", "زميله", "زميلها", "صديقه", "صديقها", "ضيفه", "ضيفها",
  "والده", "والدته", "ابنه", "ابنته", "اخوه", "اخته", "زوجته", "زوجها", "شريكه", "مقدم", "المقدم", "المذيع", "المحاور",
])
/** Heads that make the adjective describe the HOST, not the guest. */
const HOST_HEADS = new Set(["المذيع", "مذيع", "المذيعة", "مذيعة", "المقدم", "مقدم", "المقدمة", "مقدمة", "المحاور", "محاور", "host", "presenter", "anchor"])
/**
 * Institution nouns (bare form). In the span — or among the three words
 * before the adjective — they make the adjective the INSTITUTION's:
 * «بيت التمويل الكويتي», «الجمعية الاقتصادية الكويتية».
 */
const ORG_NOUNS = new Set([
  "بيت", "جمعية", "شركة", "شركات", "بنك", "مصرف", "مؤسسة", "نادي", "جامعة", "كلية", "مدرسة", "معهد", "مركز",
  "هيئة", "وزارة", "مجلس", "اتحاد", "منتخب", "صندوق", "مستشفي", "مستشفى", "برنامج", "بودكاست", "قناة", "حلقة",
  "دار", "مجموعة", "غرفة", "لجنة", "رابطة", "نقابة", "سفارة", "حكومة", "سوق", "بورصة", "جريدة", "صحيفة", "مجلة",
  "تلفزيون", "اذاعة", "منظمة", "ديوان", "جيش", "شرطة", "محكمة", "انتاج",
  "حركة", "تيار", "حزب", "تجمع", "كتلة", "منتدي", "منتدى", "ملتقي", "ملتقى", "اكاديمية", "مكتب", "فريق", "دوري",
  "تمويل", "استثمار", "اتصالات", "بترول", "نفط", "طيران", "خطوط", "موانئ", "بلدية", "ادارة", "امانة", "هيئه",
  "company", "bank", "university", "association", "society", "club", "ministry", "council", "fund", "institute",
])
function bareNoun(t: string): string {
  let x = t
  if (x.length > 3 && /^[وفبل]/.test(x) && x.slice(1).startsWith("ال")) x = x.slice(1)
  if (x.length > 3 && x.startsWith("لل")) x = x.slice(2)
  if (x.length > 3 && x.startsWith("ال")) x = x.slice(2)
  return x
}
/**
 * Institution noun, after stripping ONE attached proclitic and the article:
 * «لبيت» (ل + بيت), «والحركة», «للمركز», «المنتخب» all count (noura).
 */
const isOrgNoun = (t: string) => {
  const forms = [t, bareNoun(t)]
  if (t.length > 3 && /^[وفبل]/.test(t)) forms.push(t.slice(1), bareNoun(t.slice(1)))
  return forms.some((f) => ORG_NOUNS.has(f))
}

/**
 * Does an institution own this adjective? True when an institution noun sits
 * between the name and the marker, or among the three words before the
 * marker (the name's own words excluded) — «… لبيت التمويل الكويتي»,
 * «المركز المالي الكويتي جو حطاب», «لاعب المنتخب الكويتي فلان». Applied on
 * EVERY acceptance path.
 */
/**
 * Negators, normalized: «ليس / ليست / غير / لا / مو / مش / مب / ماهو» and
 * English not / non (non-Kuwaiti → «non kuwaiti»). Matched after stripping
 * one attached proclitic, so «وليس» counts.
 */
const NEGATORS = new Set(["ليس", "ليست", "لست", "غير", "لا", "مو", "مش", "مب", "ماهو", "ماهي", "مهو", "not", "non", "isnt", "never"])
const isNegator = (t: string) => NEGATORS.has(t) || (t.length > 2 && /^[وفبل]/.test(t) && NEGATORS.has(t.slice(1)))

/**
 * Is the demonym NEGATED? A negator between the name and the marker, or in
 * the two words right before the marker: «سالم العتيبي ليس كويتي», «غير
 * كويتي», «سعودي وليس كويتي». Applied on EVERY acceptance path.
 */
function negatedMarker(tokens: string[], ms: number, me: number, ns: number, ne: number): boolean {
  const between = me <= ns ? tokens.slice(me, ns) : tokens.slice(ne, ms)
  const before = tokens.slice(Math.max(0, ms - 2), ms)
  return [...between, ...before].some((t) => t !== SOFT && isNegator(t))
}

function institutionOwnsMarker(tokens: string[], ms: number, me: number, ns: number, ne: number): boolean {
  const between = me <= ns ? tokens.slice(me, ns) : tokens.slice(ne, ms)
  const lead: string[] = []
  for (let i = Math.max(0, ms - 3); i < ms; i++) if (i < ns || i >= ne) lead.push(tokens[i])
  return [...between, ...lead].some((t) => t !== SOFT && isOrgNoun(t))
}

/**
 * Constructions where the adjective is part of a NICKNAME or a title of fame,
 * not a nationality: «المشهور بـ الهاوي الكويتي», «الملقب بـ …». Normalized.
 */
const NICKNAME_TOKENS = new Set([
  "المشهور", "المشهورة", "الشهير", "الشهيرة", "المعروف", "المعروفة", "الملقب", "الملقبة", "يلقب", "ويلقب", "تلقب", "لقبه", "لقبها", "المكني", "المكنى", "الملقبه",
  "aka", "nicknamed", "known",
])

/** Guards that apply to EVERY nationality acceptance path (noura, M1 close). */
export function nationalityContextBlocked(evidence: string, displayName: string, code = "KW"): string | null {
  const names = [tokensOf(displayName), tokensOf(normalizeNameKey(displayName))].filter((n) => n.length > 0)
  for (const sentence of sentencesOf(evidence)) {
    if (!sentence.question) continue
    const toks = tokensOf(sentence.text)
    if (names.some((n) => findNameSpan(toks, n) >= 0)) return "the sentence naming the guest is a question"
  }
  // The demonym is inside the nickname phrase — from «المشهور/الملقب…» to the
  // next comma/newline: «المشهور بـ الهاوي الكويتي». A nickname that ENDS
  // before the demonym leaves it intact: «فلان، المعروف بـ ساهر، هو شاعر كويتي».
  for (const sentence of sentencesOf(evidence)) {
    const toks = softTokens(sentence.text)
    const markers = markerSpans(toks, code).map(([ms]) => ms)
    if (code === "KW") for (let i = 0; i < toks.length; i++) if (AR_KW_ADJ.has(toks[i])) markers.push(i)
    for (let n = 0; n < toks.length; n++) {
      if (!NICKNAME_TOKENS.has(toks[n])) continue
      let end = toks.indexOf(SOFT, n + 1)
      if (end < 0) end = toks.length
      if (markers.some((m) => m > n && m < end)) return "the demonym is part of a nickname, not a nationality"
    }
  }
  return null
}

/** Sentences of the evidence, each with whether it is a question. */
function sentencesOf(evidence: string): Array<{ text: string; question: boolean }> {
  // «د.» / «م.» / "Dr." are abbreviations, not sentence ends.
  // The dot becomes a SPACE, not nothing: «د.فهد» must stay «د فهد», or the
  // honorific glues onto the name and the name is never found (noura).
  const guarded = evidence.replace(/(^|[\s(])([\p{L}]{1,2})\./gu, "$1$2 ")
  const out: Array<{ text: string; question: boolean }> = []
  let buf = ""
  for (const ch of guarded) {
    buf += ch
    if (SENTENCE_END.test(ch)) {
      out.push({ text: buf, question: /[?؟]/.test(ch) })
      buf = ""
    }
  }
  if (buf.trim()) out.push({ text: buf, question: false })
  return out.map((s) => ({ ...s, question: s.question || tokensOf(s.text).includes("هل") }))
}

/** Tokens of a sentence with a SOFT marker token where a soft separator was. */
function softTokens(sentence: string): string[] {
  const out: string[] = []
  sentence.split(SOFT_SEP).forEach((piece, i) => {
    if (i > 0) out.push(SOFT)
    out.push(...tokensOf(piece))
  })
  return out
}

/**
 * PROBABLE KW from Arabic metadata only when ALL hold (Addendum 2 d, refined
 * by noura 2026-10-03):
 *   the guest's name is present · «كويتي/كويتية» is present · same sentence,
 *   not a question («؟», «هل») · ≤ KW_ADJ_MAX_GAP words between them · no
 *   second person (another named guest/host, «الآخر», «زميله»…) between them
 *   · no institution noun in the span or right before the adjective
 *   («بيت التمويل الكويتي») · a soft separator (، / newline) only AFTER the
 *   name («فارس عاشور، ممثل ويوتيوبر كويتي»).
 * Plus the earlier guards: the adjective may not describe a thing
 * («البودكاست الكويتي») or the host («المذيع الكويتي»), and an adjective after
 * the name may not open an organisation's name («… الكويتية للبترول»).
 */
export function kuwaitiAdjectiveInGuestClause(evidence: string, displayName: string, otherNames: string[] = []): boolean {
  const names = [tokensOf(displayName), tokensOf(normalizeNameKey(displayName))].filter((n) => n.length > 0)
  const others = otherNames.map((n) => tokensOf(n)).filter((n) => n.length > 0)
  for (const sentence of sentencesOf(evidence)) {
    if (sentence.question) continue
    const tokens = softTokens(sentence.text)
    for (const name of names) {
      const ns = findNameSpan(tokens, name)
      if (ns < 0) continue
      const ne = ns + name.length
      for (let a = 0; a < tokens.length; a++) {
        if (!AR_KW_ADJ.has(tokens[a])) continue
        if (a >= ns && a < ne) continue
        const prev = tokens[a - 1]
        if (prev && (NON_PERSON_HEADS.has(prev) || HOST_HEADS.has(prev))) continue
        const after = a >= ne
        if (after && startsOrgName(tokens[a + 1])) continue
        const rawGap = after ? tokens.slice(ne, a) : tokens.slice(a + 1, ns)
        if (!after && rawGap.includes(SOFT)) continue
        const gap = rawGap.filter((t) => t !== SOFT)
        if (gap.length > KW_ADJ_MAX_GAP) continue
        if (gap.some((t) => CLAUSE_BREAK_TOKENS.has(t) || OTHER_PERSON_TOKENS.has(t))) continue
        if (others.some((o) => findNameSpan(gap, o) >= 0)) continue
        // Institution in the span, or in the three words leading up to the adjective.
        if (institutionOwnsMarker(tokens, a, a + 1, ns, ne)) continue
        if (negatedMarker(tokens, a, a + 1, ns, ne)) continue
        return true
      }
    }
  }
  return false
}

/**
 * Is this nationality claim admissible as PROBABLE evidence for this guest?
 * `evidence` must already be proven an exact (word-bounded) substring of the metadata.
 */
export function admissibleNationalityClaim(input: {
  code: string | null | undefined
  evidence: string | null | undefined
  displayName: string
  /** Every other person named for the episode (other guests, hosts). */
  otherNames?: string[]
}): { ok: true; code: string } | { ok: false; reason: string } {
  const code = (input.code ?? "").trim().toUpperCase()
  if (!code) return { ok: false, reason: "no country code" }
  if (!/^[A-Z]{2}$/.test(code)) return { ok: false, reason: `invalid country code "${code}"` }
  const ev = input.evidence ?? ""
  if (!ev.trim()) return { ok: false, reason: "no nationality evidence" }
  if (!MARKERS[code]) return { ok: false, reason: `no demonym markers known for ${code}` }
  const evTokens = tokensOf(ev)
  const named =
    containsNormalized(ev, input.displayName) ||
    containsNormalized(ev, normalizeNameKey(input.displayName)) ||
    findNameSpan(evTokens, tokensOf(input.displayName)) >= 0
  if (!named) {
    return { ok: false, reason: "nationality evidence does not name the guest" }
  }
  const blocked = nationalityContextBlocked(ev, input.displayName, code)
  if (blocked) return { ok: false, reason: blocked }
  // KW (Arabic adjective): the Addendum 2 clause-window rule. The attached
  // rule below still covers «من الكويت فلان» and the English order.
  if (code === "KW" && kuwaitiAdjectiveInGuestClause(ev, input.displayName, input.otherNames ?? [])) {
    return { ok: true, code }
  }
  if (!nationalityAttachedToName(ev, code, input.displayName)) {
    return { ok: false, reason: `no explicit ${code} demonym attached to the guest's name` }
  }
  return { ok: true, code }
}

/**
 * Words that carry no gender: «مع» («مع فلان») says nothing about فلان.
 * Normalized form.
 */
const NON_GENDERED = new Set([
  "مع", "و", "في", "من", "على", "عن", "الى", "الي", "ل", "ب", "يا", "هو", "هي",
  "حلقة", "الحلقة", "بودكاست", "البودكاست", "لقاء", "حوار", "مقابلة", "قصة", "تجربة",
  "الموسم", "موسم", "العدد", "عدد", "رقم", "الجزء", "جزء", "الحلقه", "حلقه", "اليوم", "الليلة", "الحلقات",
  "with", "and", "the", "of", "in", "on", "a", "an", "ft", "feat", "featuring", "episode", "podcast", "interview",
  "season", "part", "ep", "no", "vol", "number",
])

/** Words that are unambiguously feminine / masculine descriptions. Normalized form. */
const FEMININE_MARKERS = new Set([
  "ضيفة", "الضيفة", "ضيفتنا", "الدكتورة", "دكتورة", "المهندسة", "مهندسة", "الاستاذة", "استاذة",
  "الكاتبة", "كاتبة", "الفنانة", "فنانة", "اللاعبة", "لاعبة", "رائدة", "الرائدة", "السيدة", "سيدة",
  "الشاعرة", "شاعرة", "الاعلامية", "اعلامية", "المذيعة", "مذيعة", "الطبيبة", "طبيبة", "الباحثة", "باحثة",
  "المخرجة", "مخرجة", "الممثلة", "ممثلة", "المدربة", "مدربة", "الناشطة", "ناشطة", "المؤسسة", "مؤسسة",
  "ms", "mrs", "miss", "she", "her", "woman", "actress", "businesswoman", "madam",
])
const MASCULINE_MARKERS = new Set([
  "السيد", "الاستاذ", "استاذ", "الدكتور", "دكتور", "المهندس", "مهندس", "الشيخ", "اللاعب", "لاعب",
  "الفنان", "فنان", "الكاتب", "كاتب", "الشاعر", "شاعر", "رجل", "المذيع", "مذيع", "الطبيب", "طبيب",
  "mr", "he", "his", "him", "man", "businessman", "actor", "sir",
])

/**
 * Is this gender evidence a gendered description OF THIS GUEST? (Decision 3)
 *   • at least one token beyond the name and beyond non-gendered function
 *     words — a name alone, or «مع فلان», is never a signal;
 *   • when the guest's own evidence_text is given, the gender evidence must
 *     touch the name inside it (contain it, end right before it, or start
 *     right after it) — «المذيع خالد يحاور سالم» is not a signal for سالم.
 */
export function admissibleGenderEvidence(input: {
  signal: PodcastGenderMarker | null | undefined
  evidence: string | null | undefined
  displayName: string
  guestEvidence?: string | null
}): boolean {
  if (input.signal !== "male" && input.signal !== "female") return false
  const ev = tokensOf(input.evidence)
  if (ev.length === 0) return false
  const nameTokens = new Set([...tokensOf(input.displayName), ...tokensOf(normalizeNameKey(input.displayName))])
  // Digits («الحلقة 12», "Ep 3") are never a gender marker.
  const rest = ev.filter((t) => !nameTokens.has(t) && !NON_GENDERED.has(t) && !/^[0-9٠-٩]+$/.test(t))
  if (rest.length === 0) return false
  // The evidence must AGREE with the signal: «ضيفة» / «الدكتورة» is never
  // evidence for "male", «السيد» never for "female" (noura). A contradicting
  // word drops the gender claim — the guest itself is kept by the validator.
  const opposite = input.signal === "male" ? FEMININE_MARKERS : MASCULINE_MARKERS
  if (ev.some((t) => opposite.has(t) || (input.signal === "male" && /^ضيفت/.test(t)))) return false
  if (input.guestEvidence == null) return true
  const host = tokensOf(input.guestEvidence)
  const gs = findTokenSpan(host, ev)
  if (gs < 0) {
    // The gender text may itself contain the name and extend past the guest evidence.
    return findTokenSpan(ev, tokensOf(input.displayName)) >= 0
  }
  const ge = gs + ev.length
  const name = tokensOf(input.displayName)
  const ns = findTokenSpan(host, name)
  if (ns < 0) return false
  const ne = ns + name.length
  const overlaps = gs < ne && ns < ge
  return overlaps || ge === ns || gs === ne
}

// ─── Person-level derivation (B10) ───────────────────────────────────────

export interface AppearanceEvidence {
  nationality_claim_code: string | null
  gender_signal: PodcastGenderMarker
  /** Rejected (unlinked) and superseded appearances do not count. */
  verification_status: "extracted" | "verified" | "review" | "rejected" | "superseded"
}

export interface PersonEvidenceState {
  nationality_code: string | null
  nationality_status: PodcastEvidenceStatus
  nationality_basis: PodcastEvidenceBasis
  gender_marker: PodcastGenderMarker
  gender_status: PodcastEvidenceStatus
  gender_basis: PodcastEvidenceBasis
}

/**
 * A country from a LINKED guest_candidates row. That column can be written by
 * discovery-v2 from model output (propose/score), so it is PROBABLE-grade
 * evidence — exactly like an episode's metadata claim — and never VERIFIED.
 * The `guests` table carries no nationality at all; VERIFIED therefore comes
 * only from a manual decision with a written source (identity-actions.ts).
 */
export interface LinkedCandidateNationality {
  nationality_code: string | null
}

/**
 * Derive a person's evidence state. Automatic derivation tops out at PROBABLE.
 * A `manual` basis already on the person is NEVER overwritten (an admin's
 * decision outranks re-derivation).
 */
export function derivePersonEvidence(
  current: PersonEvidenceState,
  appearances: AppearanceEvidence[],
  candidate: LinkedCandidateNationality | null,
): PersonEvidenceState {
  const live = appearances.filter((a) => a.verification_status !== "rejected" && a.verification_status !== "superseded")
  const out: PersonEvidenceState = { ...current }

  if (current.nationality_basis !== "manual") {
    const fromEpisodes = new Set(live.map((a) => a.nationality_claim_code).filter((c): c is string => !!c))
    const claims = new Set(fromEpisodes)
    if (candidate?.nationality_code) claims.add(candidate.nationality_code)
    const basis = fromEpisodes.size > 0 ? "episode_metadata" : "khat_candidate"
    if (claims.size > 1) {
      out.nationality_code = null
      out.nationality_status = "conflicted"
      out.nationality_basis = basis
    } else if (claims.size === 1) {
      out.nationality_code = [...claims][0]
      out.nationality_status = "probable"
      out.nationality_basis = basis
    } else {
      out.nationality_code = null
      out.nationality_status = "unknown"
      out.nationality_basis = "none"
    }
  }

  if (current.gender_basis !== "manual") {
    const signals = new Set(live.map((a) => a.gender_signal).filter((g) => g !== "unknown"))
    if (signals.size > 1) {
      out.gender_marker = "unknown"
      out.gender_status = "conflicted"
      out.gender_basis = "episode_metadata"
    } else if (signals.size === 1) {
      out.gender_marker = [...signals][0]
      out.gender_status = "probable"
      out.gender_basis = "episode_metadata"
    } else {
      out.gender_marker = "unknown"
      out.gender_status = "unknown"
      out.gender_basis = "none"
    }
  }
  return out
}

/** «كويتي محتمل» etc. — the strict filter needs both VERIFIED (Decision 3). */
export function isVerifiedKuwaitiMale(p: PersonEvidenceState): boolean {
  return (
    p.nationality_code === "KW" &&
    p.nationality_status === "verified" &&
    p.gender_marker === "male" &&
    p.gender_status === "verified"
  )
}

export function isLikelyKuwaitiMale(p: PersonEvidenceState): boolean {
  return (
    p.nationality_code === "KW" &&
    (p.nationality_status === "probable" || p.nationality_status === "verified") &&
    p.gender_marker === "male" &&
    (p.gender_status === "probable" || p.gender_status === "verified")
  )
}
