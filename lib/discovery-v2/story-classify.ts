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
 * Honest limit: a web source's text is Gemini's grounded snippet — text it
 * ATTRIBUTED to the URL, not the raw page. Verbatim-in-snippet proves the
 * quote is in the attributed evidence of a live page; fetching the page to
 * re-check is the optional phase 2.
 */

import { runAiTask } from "@/lib/ai-router"
import {
  UNTRUSTED_SOURCE_SAFETY_HEADER,
  wrapUntrustedSource,
} from "@/lib/ai/grounded-evidence"
import { buildVerbatimHaystack, foldVerbatim, isVerbatimIn } from "@/lib/studio/verbatim"
import { mentionsName, notCheckedStory } from "./story-evidence"
import type { StoryCheck, StorySource, TopicRelevance, TopicRelevanceValue } from "./types"

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
export const STORY_PROMPT_VERSION = "v2-story-3"

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
}

type Item = { source: StorySource; quote: string }

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
  const sourceText = `${source.title} ${source.text}`
  if (!isVerbatimIn(quote, buildVerbatimHaystack(sourceText))) return null
  if (!mentionsName(quote, variants) && !mentionsName(sourceText, variants)) return null
  return { source, quote }
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

  // Self-told counts only with a verified quote about THIS person, and only
  // for a story that survived — a label on nothing is a claim.
  const selfRaw = r.self_told as { value?: unknown } | null | undefined
  const selfItem = surviving.length > 0 ? attrItem(selfRaw) : null
  const selfTold =
    selfItem && typeof selfRaw?.value === "boolean"
      ? { value: selfRaw.value, url: selfItem.source.url, quote: selfItem.quote }
      : null

  return {
    assessment: {
      status: verified ? "verified" : "unverified",
      not_checked_reason: null,
      story_type: storyType,
      summary,
      evidence: surviving.map((k) => ({ url: k.source.url, domain: k.source.domain, quote: k.quote })),
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
    '"same_person":true}',
].join("\n")

function renderSources(sources: StorySource[]): string {
  return sources
    .map((s, i) =>
      wrapUntrustedSource(
        i + 1,
        [`العنوان: ${s.title}`, `الرابط: ${s.url}`, `النص: ${s.text || "(لا يوجد)"}`].join("\n"),
        `domain=${s.domain ?? "غير معروف"} verified=${s.verified}`,
      ),
    )
    .join("\n\n")
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
  runId?: string | null
  seasonId?: string | null
  /** Per-attempt abort + retry count; unset = the `verification` registry default (120s × 3). */
  timeoutMs?: number
  maxRetries?: number
}): Promise<StoryCheck> {
  const user = [
    `الشخص: ${opts.name}${opts.nameEn ? ` (${opts.nameEn})` : ""}${opts.role ? ` — ${opts.role}` : ""}`,
    `موضوع الحلقة: ${opts.topic}`,
    "",
    renderSources(opts.sources),
  ].join("\n")

  const r = await runAiTask<RawStoryClassification>({
    taskKind: "verification",
    subjectTable: "discovery_runs",
    subjectId: opts.runId ?? null,
    seasonId: opts.seasonId ?? null,
    promptVersion: STORY_PROMPT_VERSION,
    input: { stage: "story_classify", name: opts.name, topic: opts.topic, sources: opts.sources.length },
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
