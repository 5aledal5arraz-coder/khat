/**
 * Guest Discovery v2 — first-hand story classifier + the code-side guard
 * that makes it impossible to hallucinate a story into a score.
 *
 * Three layers, only the last produces anything the scorer reads:
 *   1. propose (sol) writes a `story_claim` hypothesis — weight 0, it only
 *      steers the search (story-evidence.ts);
 *   2. Gemini + Google Search gathers live sources (story-evidence.ts);
 *   3. this classifier (router task_kind "verification" → luna) reads the
 *      numbered sources and must cite `{source, quote}` for every claim.
 *
 * The guard (`verifyStoryClassification`) is enforced HERE, not requested
 * in the prompt. An item survives only if
 *   - `source` indexes a gathered source that is LIVE (verified === true),
 *   - the quote is ≥ STORY_MIN_QUOTE_WORDS folded words and a word-bounded
 *     verbatim span of that source's text (`isVerbatimIn`, lib/studio/
 *     verbatim.ts — the same guard that protects published Studio quotes),
 *   - the quote or its source names THIS person.
 * Anything else is dropped; a story with no surviving evidence is "none".
 * The model never sets a number: score.ts derives S from what survived.
 *
 * What the guard is checked against (2026-09-29): a web source's `text` is
 * Gemini's grounding SUMMARY of the page (its own answer segments), so a
 * quote found only there is labelled a summary (`on_page: false`), never a
 * quote. When the page itself was read (source-page.ts) the quote is checked
 * against it too, and only then is it `on_page`. `self_told = true` comes
 * ONLY from the page (`pageSpeaker`) — never from the model.
 */

import { runAiTask } from "@/lib/ai-router"
import {
  UNTRUSTED_SOURCE_SAFETY_HEADER,
  wrapUntrustedSource,
} from "@/lib/ai/grounded-evidence"
import { buildVerbatimHaystack, foldVerbatim, isVerbatimIn } from "@/lib/studio/verbatim"
import { normalizeGuestSensitivityFlags } from "@/lib/khat-map/core/policy"
import {
  HISTORICAL_BIRTH_BEFORE,
  mentionsName,
  notCheckedStory,
  yearsIn,
} from "./story-evidence"
import { pageAllText, pageExcerpt, pageSpeaker, quoteIsAboutHim, quoteOnPage } from "./source-page"
import type { StoryAssessment, StoryCheck, StorySource, TopicRelevance, TopicRelevanceValue, WikiFacts } from "./types"

/**
 * A story quote must be at least this many folded words. The Studio floor
 * (MIN_VERBATIM_WORDS = 3) proves a transcript span; three words of a
 * press snippet match by accident far too easily to prove a lived story.
 */
export const STORY_MIN_QUOTE_WORDS = 6

// v2-story-2 (2026-09-28): the classifier now sees the episode topic and
// returns `topic_relevance`, verified like every other claim.
// v2-story-3 (2026-09-28, D3): `self_told` — did he tell it himself, or was
// it written about him? Verified like every other attribute.
// v2-story-4 (2026-09-29, batch 3): the classifier SEES the Wikidata entity
// the name resolved to (description, occupation, birth year) and answers
// `wikidata_match` — it used to judge same_person against the proposal only,
// so a footballer born 2003 passed as a man jailed by a name mix-up (D2).
// It also returns `sensitivity_flags` for the person (constitution avoid
// list — D1): a claim that may only reject.
// v2-story-5 (2026-09-29): each source shows the PAGE's own text (title,
// channel/byline, excerpt) apart from the search engine's summary, and the
// model is told to quote the page. self_told=true is decided in code from the
// page (source-page.ts), never from this reply.
// v2-story-6 (2026-09-30, live pilot): `deceased` is defined (the prompt used
// to show only its JSON shape) and `era` asks for his birth year with a quote
// (no «last activity»: an absence of later mentions is not inactivity) — historical figures outside Wikidata reached review.
// `third_party_exposure` must now be BACKED by a quote of a private fact about
// a named third party, with examples of what is not exposure: the bare flag
// rejected a player's anecdote about a team official.
export const STORY_PROMPT_VERSION = "v2-story-6"

const STORY_TYPES = ["first_hand", "second_hand", "expert_only", "none"] as const
type StoryType = (typeof STORY_TYPES)[number]
const RELEVANCE_VALUES: readonly TopicRelevanceValue[] = ["on_topic", "adjacent", "off_topic"]

/** The classifier's raw JSON — untrusted until verified below. */
export interface RawStoryClassification {
  story_type?: unknown
  story_summary?: unknown
  evidence?: unknown
  gulf_event?: unknown
  is_individual?: unknown
  deceased?: unknown
  gender?: unknown
  nationality?: unknown
  same_person?: unknown
  topic_relevance?: unknown
  self_told?: unknown
  sensitivity_flags?: unknown
  wikidata_match?: unknown
  era?: unknown
  third_party_exposure?: unknown
}

/** What may back a third_party_exposure flag: a PRIVATE fact of one of these kinds. */
export const EXPOSURE_KINDS = ["health", "family", "sexual", "criminal", "financial"] as const

type Item = { source: StorySource; quote: string; onPage: boolean }

/** Everything a source says: the search summary AND, when read, the page. */
export function sourceHaystackText(source: StorySource): string {
  return source.page ? `${source.title} ${source.text} ${pageAllText(source.page)}` : `${source.title} ${source.text}`
}

/** The guard for ONE cited item. Returns the item only if it proves itself. */
function checkItem(raw: unknown, sources: StorySource[], variants: string[]): Item | null {
  if (!raw || typeof raw !== "object") return null
  const r = raw as { source?: unknown; quote?: unknown }
  const idx = typeof r.source === "number" ? r.source : Number(r.source)
  if (!Number.isInteger(idx) || idx < 1 || idx > sources.length) return null
  const source = sources[idx - 1]
  if (!source.verified) return null
  const quote = typeof r.quote === "string" ? r.quote.trim() : ""
  const folded = foldVerbatim(quote)
  if (!folded || folded.split(" ").length < STORY_MIN_QUOTE_WORDS) return null
  const sourceText = sourceHaystackText(source)
  if (!isVerbatimIn(quote, buildVerbatimHaystack(sourceText))) return null
  if (!mentionsName(quote, variants) && !mentionsName(sourceText, variants)) return null
  return { source, quote, onPage: quoteOnPage(quote, source.page) }
}

/**
 * `self_told`, decided in this order:
 *   1. the model says NOT self-told with a verified quote → false (a
 *      downgrade is always kept; a page cue never overrides it);
 *   2. a page that is EVIDENCE for this story (a surviving item's source —
 *      not any gathered source) names him AND shows he is the speaker → true;
 *   3. otherwise absent = not verified.
 */
function decideSelfTold(
  raw: unknown,
  surviving: Item[],
  variants: string[],
  attrItem: (v: unknown) => Item | null,
): StoryAssessment["self_told"] {
  if (surviving.length === 0) return null
  const r = raw as { value?: unknown } | null | undefined
  const item = attrItem(r)
  if (item && r?.value === false) return { value: false, url: item.source.url, quote: item.quote, basis: "classifier" }
  for (const src of new Set(surviving.map((k) => k.source))) {
    if (!src.verified || !src.page) continue
    const found = pageSpeaker(src.page, variants)
    if (found) return { value: true, url: src.url, quote: found.cue, basis: found.basis }
  }
  return null
}

/**
 * Turn the classifier's raw output into a StoryCheck using ONLY what
 * survives the guard. Pure — no I/O — so the guard is testable in both
 * directions (a paraphrase is dropped; the same quote made verbatim counts).
 */
export function verifyStoryClassification(
  raw: RawStoryClassification | null | undefined,
  sources: StorySource[],
  variants: string[],
  claim: string | null,
): StoryCheck {
  const r = raw ?? {}
  const evidenceRaw = Array.isArray(r.evidence) ? r.evidence : []
  const kept: Item[] = []
  for (const e of evidenceRaw) {
    const item = checkItem(e, sources, variants)
    if (item && !kept.some((k) => foldVerbatim(k.quote) === foldVerbatim(item.quote))) kept.push(item)
  }

  let storyType: StoryType = STORY_TYPES.includes(r.story_type as StoryType)
    ? (r.story_type as StoryType)
    : "none"
  if (kept.length === 0) storyType = "none"

  // A classifier that says the sources are about a namesake has just told
  // us none of this evidence is about OUR person — nothing of it may count.
  const samePerson = r.same_person !== false
  const surviving = samePerson ? kept : []
  if (!samePerson) storyType = "none"

  const gulfRaw = r.gulf_event as { event?: unknown } | null | undefined
  const gulfItem = samePerson ? checkItem(gulfRaw, sources, variants) : null
  const gulfEvent =
    gulfItem && typeof gulfRaw?.event === "string" && gulfRaw.event.trim()
      ? { event: gulfRaw.event.trim().slice(0, 60), url: gulfItem.source.url, quote: gulfItem.quote }
      : null

  const verified = surviving.length > 0 && (storyType === "first_hand" || storyType === "second_hand")
  const summary =
    verified && typeof r.story_summary === "string" && r.story_summary.trim()
      ? r.story_summary.trim().slice(0, 300)
      : null

  const attrItem = (v: unknown) => (samePerson ? checkItem(v, sources, variants) : null)
  const genderRaw = r.gender as { value?: unknown } | null | undefined
  const natRaw = r.nationality as { value?: unknown } | null | undefined
  const gender =
    attrItem(genderRaw) && (genderRaw?.value === "male" || genderRaw?.value === "female")
      ? genderRaw.value
      : null
  const nationality =
    attrItem(natRaw) && typeof natRaw?.value === "string" && natRaw.value.trim()
      ? natRaw.value.trim()
      : null

  // Topic relevance counts only with a verified quote about THIS person —
  // the model's label alone is a claim, and a claim never scores.
  const relRaw = r.topic_relevance as { value?: unknown } | null | undefined
  const relItem = attrItem(relRaw)
  const topicRelevance: TopicRelevance | null =
    relItem && RELEVANCE_VALUES.includes(relRaw?.value as TopicRelevanceValue)
      ? { value: relRaw!.value as TopicRelevanceValue, url: relItem.source.url, quote: relItem.quote }
      : null

  // Self-told: TRUE only from the page itself; the model may only say false.
  const selfTold = decideSelfTold(r.self_told, surviving, variants, attrItem)

  // Era (v2-story-6): his birth year, counted only when a verified quote
  // CARRIES that year and is about HIM, not a relative (quoteIsAboutHim).
  // A review hint only (historicalFigureCue) — never a reject.
  const eraRaw = r.era as { birth_year?: unknown } | null | undefined
  const eraItem = attrItem(eraRaw)
  const birth = typeof eraRaw?.birth_year === "number" ? eraRaw.birth_year : Number(eraRaw?.birth_year ?? NaN)
  const historical =
    !!eraItem &&
    Number.isInteger(birth) &&
    birth < HISTORICAL_BIRTH_BEFORE &&
    yearsIn(eraItem.quote).includes(birth) &&
    quoteIsAboutHim(eraItem.quote, variants)

  // third_party_exposure rejects only when backed (v2-story-6): a verbatim
  // quote, a private-fact kind from EXPOSURE_KINDS, and WHO it is about.
  // Unbacked, it is removed and the card goes to review with the flag shown.
  const flags = samePerson ? normalizeGuestSensitivityFlags(r.sensitivity_flags) : []
  let exposureUnbacked = false
  if (flags.includes("third_party_exposure")) {
    const ex = r.third_party_exposure as { kind?: unknown; about?: unknown } | null | undefined
    const backed =
      !!attrItem(ex) &&
      (EXPOSURE_KINDS as readonly string[]).includes(String(ex?.kind ?? "")) &&
      typeof ex?.about === "string" &&
      ex.about.trim().length > 0
    if (!backed) {
      exposureUnbacked = true
      flags.splice(flags.indexOf("third_party_exposure"), 1)
    }
  }

  return {
    assessment: {
      status: verified ? "verified" : "unverified",
      not_checked_reason: null,
      story_type: storyType,
      summary,
      evidence: surviving.map((k) => ({ url: k.source.url, domain: k.source.domain, quote: k.quote, on_page: k.onPage })),
      gulf_event: gulfEvent,
      claim_from_propose: claim,
      topic_relevance: topicRelevance,
      self_told: selfTold,
    },
    sources,
    attrs: {
      deceased: attrItem(r.deceased) !== null,
      // "not an individual" needs the model to say so AND at least one
      // verified item to show it read real sources.
      not_individual: r.is_individual === false && kept.length > 0,
      same_person: samePerson,
      gender,
      nationality,
      // Flags about a namesake's sources say nothing about OUR person.
      sensitivity_flags: flags,
      exposure_unbacked: exposureUnbacked,
      historical,
      // Only a `false` is acted on (it drops the QID); nothing here adds trust.
      wikidata_match: r.wikidata_match === false ? false : r.wikidata_match === true ? true : null,
    },
  }
}

const SYSTEM = [
  "أنت مدقّق مصادر لبودكاست «خط». أمامك مصادر ويب مرقّمة عن شخص واحد.",
  "مهمتك: هل روى هذا الشخص بنفسه، علناً، تجربة شخصية عاشها؟",
  "- first_hand: يروي هو بنفسه ما عاشه (شاهد، ناجٍ، أسير سابق، صاحب مهنة أو حدث مفصلي).",
  "- second_hand: يروي عن قرب قصة عاشها أبوه أو عائلته أو مجتمعه القريب.",
  "- expert_only: يتحدث كمتخصّص أو محلّل فقط، بلا تجربة شخصية.",
  "- none: لا يظهر في المصادر ما يدلّ على ذلك.",
  "قواعد صارمة:",
  "- لكل مصدر قد يوجد «نص الصفحة» (من الصفحة نفسها) و«ملخص البحث» (كلام محرك البحث عن الصفحة، ليس كلامها).",
  "  انسخ اقتباساتك من «نص الصفحة» كلما وُجد؛ ما يُنسخ من «ملخص البحث» يُعرض ملخصاً لا اقتباساً.",
  "- كل ادعاء يجب أن يُسند إلى مصدر برقمه، مع اقتباس منسوخ حرفياً من نص ذلك المصدر:",
  "  ست كلمات متتالية على الأقل، دون إعادة صياغة ودون حذف كلمات من الوسط.",
  "  أي اقتباس غير حرفي أو من مصدر لا يذكر الشخص سيُحذف آلياً ولن يُحتسب.",
  "- لا تعتمد على معرفتك السابقة إطلاقاً — المصادر وحدها.",
  "- إن كانت المصادر عن شخص آخر يحمل الاسم نفسه فاجعل same_person = false.",
  "- topic_relevance: ما صلة ما تقوله المصادر عن هذا الشخص بموضوع الحلقة المذكور أعلاه تحديداً؟",
  "  on_topic: قصته أو خبرته عن صلب هذا الموضوع نفسه. adjacent: مجال قريب منه لكن ليس هو.",
  "  off_topic: لا صلة (مثلاً قصة تأسيس شركة لحلقة موضوعها شيء آخر).",
  "  أسندها باقتباس حرفي يُظهر ما تقوله المصادر عنه — وإن لم يوجد فاجعلها null.",
  "- self_told: هل روى القصة بنفسه (مقابلة معه، حديثه هو، منشوره أو كتابه) = true،",
  "  أم كُتبت عنه بقلم غيره دون أن يتكلم هو = false؟ أسندها باقتباس حرفي، وإلا فاجعلها null.",
  "- اترك الحقل null إن لم يوجد له اقتباس حرفي.",
  "- deceased: إن ذكرت المصادر وفاته («توفي»، «الراحل»، «المرحوم»، «رحمه الله»، «الفقيد»، سنة وفاة) فأسندها باقتباس، وإلا null.",
  "- era: سنة ميلاده هو (birth_year) كما تذكرها المصادر، مع اقتباس حرفي عنه هو يحتوي السنة نفسها.",
  "  لا تستعمل سنة ميلاد أبيه أو جده أو أي قريب. null إن لم تذكر المصادر سنة ميلاده. لا تخمّن من معرفتك ولا من سنوات الأحداث.",
  "- wikidata_match: إن عُرض عليك «كيان ويكي‌داتا» فهل هو الشخص نفسه الذي تتحدث عنه المصادر؟",
  "  false إن ناقضت مهنته أو سنة ميلاده أو وصفه ما تقوله المصادر (مثلاً لاعب كرة وُلد 2003 والمصادر عن رجل قضى سنوات في السجن)،",
  "  أو إن لم تذكر المصادر مهنته إطلاقاً. true فقط إن أكّدته المصادر. null إن لم يُعرض كيان.",
  "- sensitivity_flags: ما ينطبق على هذا الشخص من: politics (دور سياسي: نائب، ناشط أو محلل سياسي، معارض)،",
  "  religious_dispute (خلاف ديني أو مذهبي)، scandal (فضيحة عامة، أو إدانة/اتهام بتحرش أو اغتصاب أو احتيال)،",
  "  third_party_exposure (قصته تكشف معلومة خاصة حسّاسة عن شخص آخر محدد: مرضه، أسراره العائلية أو الزوجية،",
  "  حياته الجنسية، جريمة أو تهمة لم تُعلن، أو وضعه المالي الخاص)، ongoing_case (قضية منظورة أمام القضاء الآن).",
  "  ليست third_party_exposure: موقف عادي مع مدرب أو إداري أو زميل أو مدير (منعه إداري الفريق من إعطاء قميصه لمنافس،",
  "  وبّخه مدربه، اختلف مع رئيسه في العمل)، ولا ذكر أشخاص عامين بأدوارهم العامة.",
  "  إن وضعت third_party_exposure فيجب أن تسندها في الحقل third_party_exposure: اقتباس حرفي للمعلومة الخاصة،",
  "  kind واحد من health|family|sexual|criminal|financial، وabout: من هو الشخص الآخر. بدون ذلك لا تضعها.",
  "  السجن بحد ذاته ليس علامة — «السجن والعودة للمجتمع» من مجالات خط. مصفوفة فارغة إن لم ينطبق شيء، ولا تجامل.",
  UNTRUSTED_SOURCE_SAFETY_HEADER,
  'أعد JSON فقط بهذا الشكل: {"story_type":"first_hand|second_hand|expert_only|none",' +
    '"story_summary":"جملة واحدة: ماذا عاش هو شخصياً",' +
    '"evidence":[{"source":1,"quote":"نص حرفي من المصدر 1"}],' +
    '"gulf_event":{"event":"اسم الحدث باختصار","source":1,"quote":"..."} أو null,' +
    '"is_individual":true,"deceased":{"source":1,"quote":"..."} أو null,' +
    '"gender":{"value":"male|female","source":1,"quote":"..."} أو null,' +
    '"nationality":{"value":"Kuwait","source":1,"quote":"..."} أو null,' +
    '"topic_relevance":{"value":"on_topic|adjacent|off_topic","source":1,"quote":"..."} أو null,' +
    '"self_told":{"value":true,"source":1,"quote":"..."} أو null,' +
    '"era":{"birth_year":1950,"source":1,"quote":"..."} أو null,' +
    '"third_party_exposure":{"kind":"health|family|sexual|criminal|financial","about":"من هو","source":1,"quote":"..."} أو null,' +
    '"same_person":true,"wikidata_match":true|false|null,"sensitivity_flags":[]}',
].join("\n")

/**
 * One numbered source for a model: the page's own words (when read) apart
 * from the search engine's summary of it. Shared with the harvest extractor.
 */
export function renderSourceBody(s: StorySource, variants: string[] | null): string {
  const lines = [`الرابط: ${s.url}`]
  if (s.page) {
    lines.push(`عنوان الصفحة: ${s.page.title}`)
    if (s.page.author) lines.push(`القناة/الكاتب: ${s.page.author}`)
    const ex = pageExcerpt(s.page, variants)
    if (ex) lines.push(`نص الصفحة: ${ex}`)
  } else {
    lines.push(`العنوان: ${s.title}`)
  }
  if (s.kind === "web") lines.push(`ملخص البحث (ليس نص الصفحة): ${s.text || "(لا يوجد)"}`)
  else if (!s.page) lines.push(`النص: ${s.text || "(لا يوجد)"}`)
  return lines.join("\n")
}

function renderSources(sources: StorySource[], variants: string[]): string {
  return sources
    .map((s, i) =>
      wrapUntrustedSource(
        i + 1,
        renderSourceBody(s, variants),
        `domain=${s.domain ?? "غير معروف"} verified=${s.verified} page=${s.page ? "read" : "unread"}`,
      ),
    )
    .join("\n\n")
}

/** The resolved Wikidata entity, for `wikidata_match`. Empty when none resolved. */
function renderEntity(e: WikiFacts | null | undefined): string[] {
  if (!e?.resolved) return []
  const facts = [
    e.description ? `الوصف: ${e.description}` : null,
    e.occupations?.length ? `المهنة: ${e.occupations.join("، ")}` : null,
    e.birth_year ? `مواليد: ${e.birth_year}` : null,
    e.nationality_country ? `الجنسية: ${e.nationality_country}` : null,
  ].filter(Boolean)
  return [`كيان ويكي‌داتا المطابَق بالاسم (قد يكون شخصاً آخر بنفس الاسم) ${e.qid ?? ""}: ${facts.join(" · ") || "بلا وصف"}`]
}

/**
 * Classify one person's story from gathered sources and return ONLY the
 * verified result. Never throws: a failed model call → `not_checked`
 * ("error"), never a silent "no story".
 */
export async function classifyStory(opts: {
  name: string
  nameEn?: string | null
  role?: string | null
  claim: string | null
  /** The episode topic — what `topic_relevance` is judged against. */
  topic: string
  sources: StorySource[]
  variants: string[]
  /** The Wikidata entity the name resolved to (any confidence) — judged, never trusted. */
  entity?: WikiFacts | null
  runId?: string | null
  seasonId?: string | null
  /** Per-attempt abort + retry count; unset = the `verification` registry default (120s × 3). */
  timeoutMs?: number
  maxRetries?: number
}): Promise<StoryCheck> {
  const user = [
    `الشخص: ${opts.name}${opts.nameEn ? ` (${opts.nameEn})` : ""}${opts.role ? ` — ${opts.role}` : ""}`,
    `موضوع الحلقة: ${opts.topic}`,
    ...renderEntity(opts.entity),
    "",
    renderSources(opts.sources, opts.variants),
  ].join("\n")

  const r = await runAiTask<RawStoryClassification>({
    taskKind: "verification",
    subjectTable: "discovery_runs",
    subjectId: opts.runId ?? null,
    seasonId: opts.seasonId ?? null,
    promptVersion: STORY_PROMPT_VERSION,
    input: {
      stage: "story_classify",
      name: opts.name,
      topic: opts.topic,
      sources: opts.sources.length,
      entity: opts.entity?.resolved ? (opts.entity.qid ?? null) : null,
    },
    prompt: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    expectJson: true,
    // max_output_tokens on the Responses API includes reasoning tokens; the
    // spec's 900 left too little room for a multi-quote Arabic JSON after
    // luna's low-effort reasoning, and a truncated reply is a lost story.
    providerOptions: { max_tokens: 1600 },
    timeoutMs: opts.timeoutMs,
    maxRetries: opts.maxRetries,
  })

  if (r.status !== "succeeded" || !r.parsed || typeof r.parsed !== "object") {
    console.warn(
      "[discovery-v2/story] classify failed:",
      r.errorClass ?? r.status,
      (r.errorMessage ?? "").split("\n")[0],
    )
    return {
      assessment: notCheckedStory("error", opts.claim),
      sources: opts.sources,
      attrs: { deceased: false, not_individual: false, same_person: true, gender: null, nationality: null },
    }
  }
  return verifyStoryClassification(r.parsed, opts.sources, opts.variants, opts.claim)
}
