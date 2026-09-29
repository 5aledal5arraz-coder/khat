/**
 * D1 — search-first grounded name harvest.
 *
 * Propose names people from model MEMORY, which is thin on ordinary Kuwaiti
 * witnesses (6 of 6 real ones were outside Wikidata, 2026-08-07). This step
 * goes the other way: for each witness profile (witness.ts) it searches the
 * live web — Kuwaiti press features, Kuwaiti podcasts / YouTube talk shows,
 * TEDx Kuwait — for men who told that experience THEMSELVES, then extracts
 * name + URL + a verbatim quote.
 *
 *   gather (Gemini + Google Search, the shared grounded-evidence service —
 *           paid, daily-budget-capped, one ai_runs row per attempt)
 *     → read each live page itself (source-page.ts — plain HTTP, bounded;
 *       Gemini's per-URL "snippet" is its OWN summary, not the page)
 *     → extract (ONE router `verification` call → luna over all sources)
 *     → verify in CODE: live source, ≥ STORY_MIN_QUOTE_WORDS words, verbatim
 *       span of that source's text, and the quote or its source names him
 *       (the same guard story-classify.ts enforces), plus the policy lexicon;
 *       and a page that WAS read must name him — else the name is Gemini's.
 *
 * A harvested name arrives WITH the sources that name him, so the story check
 * classifies those instead of paying for a second search (pipeline.ts).
 *
 * Budget-aware: at most `harvestMaxQueries()` searches per run
 * (DISCOVERY_HARVEST_MAX_QUERIES, default 3, 0 = off), each bounded by the
 * run's deadline; a spent daily retrieval budget or any failure yields fewer
 * names, never a failed run.
 */

import { runAiTask } from "@/lib/ai-router"
import {
  gatherGroundedEvidence,
  isVertexRedirect,
  UNTRUSTED_SOURCE_SAFETY_HEADER,
  wrapUntrustedSource,
} from "@/lib/ai/grounded-evidence"
import { buildVerbatimHaystack, foldVerbatim, isVerbatimIn } from "@/lib/studio/verbatim"
import { guestPolicyHits } from "@/lib/khat-map/core/policy"
import { isStoryGroundingEnabled, mentionsName, nameVariants } from "./story-evidence"
import { renderSourceBody, sourceHaystackText, STORY_MIN_QUOTE_WORDS } from "./story-classify"
import { attachSourcePages, pageNamesPerson, pageReadable, pageSpeaker } from "./source-page"
import { classifyWebSearchFailure, type WebSearchFailureKind } from "./web-search-health"
import type { ProposedName, StorySource, V2RunInput, WitnessProfile } from "./types"

// v2-harvest-extract-2 (2026-09-29): sources show the page's own text apart
// from the search summary; quote the page.
export const HARVEST_EXTRACT_PROMPT_VERSION = "v2-harvest-extract-2"

const DEFAULT_HARVEST_QUERIES = 3
/** Max sources kept per search (best-snippet-first). */
const HARVEST_SOURCES_PER_QUERY = 8
/** One search never gets more than this, whatever the deadline allows. */
export const HARVEST_SEARCH_TIMEOUT_MS = 90_000
/** Held back for the extraction call after the searches. */
export const HARVEST_EXTRACT_TIMEOUT_MS = 60_000
/** Page reads stop this long before the harvest deadline (extraction needs ≥15s). */
export const HARVEST_PAGE_RESERVE_MS = 25_000

/** How many grounded searches one run may spend on the harvest. [0, 6]. */
export function harvestMaxQueries(): number {
  const raw = process.env.DISCOVERY_HARVEST_MAX_QUERIES
  if (raw == null || raw === "") return DEFAULT_HARVEST_QUERIES
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_HARVEST_QUERIES
  return Math.min(6, Math.floor(n))
}

export function buildHarvestQuery(profile: WitnessProfile, topic: string): string {
  const terms = profile.search_terms.length ? ` كلمات مفيدة: ${profile.search_terms.join("، ")}.` : ""
  return (
    `ابحث في الصحافة الكويتية (تقارير ومقابلات)، وفي البودكاستات والبرامج الحوارية الكويتية على يوتيوب، ` +
    `وفي محاضرات TEDx Kuwait، عن رجال كويتيين رووا بأنفسهم تجربة: ${profile.profile}. ` +
    `موضوع الحلقة: ${topic}.${terms} ` +
    `أريد الاسم الكامل لكل شخص وما قاله هو عن تجربته، مع المصدر. ` +
    `استبعد السياسيين ومن يتحدث كخبير فقط دون تجربة شخصية.`
  )
}

interface RawHarvestPerson {
  name?: unknown
  name_en?: unknown
  source?: unknown
  quote?: unknown
  story_claim?: unknown
}

/**
 * Keep only the people whose quote proves itself against the gathered
 * sources. Pure — the guard is testable in both directions.
 */
export function verifyHarvest(raw: unknown, sources: StorySource[]): ProposedName[] {
  const people = (raw as { people?: unknown } | null)?.people
  if (!Array.isArray(people)) return []
  const out: ProposedName[] = []
  const seen = new Set<string>()
  for (const item of people as RawHarvestPerson[]) {
    if (!item || typeof item !== "object") continue
    const name = typeof item.name === "string" ? item.name.trim() : ""
    if (foldVerbatim(name).split(" ").filter(Boolean).length < 2) continue // a full name, not «أبو فلان»
    const nameEn = typeof item.name_en === "string" ? item.name_en.trim() || null : null
    const idx = typeof item.source === "number" ? item.source : Number(item.source)
    if (!Number.isInteger(idx) || idx < 1 || idx > sources.length) continue
    const src = sources[idx - 1]
    if (!src.verified) continue
    const quote = typeof item.quote === "string" ? item.quote.trim() : ""
    const folded = foldVerbatim(quote)
    if (!folded || folded.split(" ").length < STORY_MIN_QUOTE_WORDS) continue
    const srcText = sourceHaystackText(src)
    if (!isVerbatimIn(quote, buildVerbatimHaystack(srcText))) continue
    const variants = nameVariants([name, nameEn])
    if (!mentionsName(quote, variants) && !mentionsName(srcText, variants)) continue
    // The page itself was read and does not name him: the name came from
    // Gemini's summary, not the source. (An unread or too-thin page proves
    // nothing either way — kept, and labelled unverified below.)
    if (src.page && pageReadable(src.page) && !pageNamesPerson(src.page, variants)) continue
    const claim = typeof item.story_claim === "string" ? item.story_claim.trim().slice(0, 200) : ""
    if (guestPolicyHits(`${quote} ${claim}`).length > 0) continue
    const key = foldVerbatim(name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      name,
      name_en: nameEn,
      role: null,
      country: null,
      why: harvestWhy(src, variants),
      story_claim: claim || null,
      story_type: "first_hand",
      gender: null,
      origin: "harvest_web",
      public_account_ref: src.url,
      // Every gathered source that names him — the story check reads these.
      harvest_sources: sources.filter((s) => mentionsName(sourceHaystackText(s), variants)),
    })
  }
  return out
}

/** What the source page itself shows — never more than it shows. */
function harvestWhy(src: StorySource, variants: string[]): string {
  const where = src.domain ?? "مصدر حيّ"
  if (!src.page) return `ذُكر في ${where} — لم تُقرأ الصفحة، ولم يُتحقق أنه رواها بنفسه`
  if (pageSpeaker(src.page, variants)) return `وُجد في ${where} يروي تجربته بنفسه`
  return `ذُكر في ${where} — لم يُتحقق أنه رواها بنفسه`
}

const EXTRACT_SYSTEM = [
  "أمامك مصادر ويب مرقّمة. استخرج الأشخاص (أفراداً بأسمائهم الكاملة) الذين يروي كلٌّ منهم بنفسه تجربة شخصية عاشها.",
  "لكل مصدر قد يوجد «نص الصفحة» (من الصفحة نفسها) و«ملخص البحث» (كلام محرك البحث، ليس كلام الصفحة). انسخ من «نص الصفحة» كلما وُجد.",
  "لكل شخص: رقم المصدر، واقتباس منسوخ حرفياً من نص ذلك المصدر (ست كلمات متتالية على الأقل، دون إعادة صياغة)",
  "يُظهر تجربته، وجملة قصيرة story_claim عمّا عاشه.",
  "لا تذكر: السياسيين، من يتحدث كخبير فقط، من تُروى قصته بقلم غيره دون أن يتكلم هو، ولا من لا يرد اسمه الكامل في المصدر.",
  "لا تعتمد على معرفتك السابقة — المصادر وحدها. أي اقتباس غير حرفي سيُحذف آلياً.",
  UNTRUSTED_SOURCE_SAFETY_HEADER,
  'أعد JSON فقط: {"people":[{"name":"","name_en":"","source":1,"quote":"","story_claim":""}]}',
].join("\n")

export interface HarvestResult {
  names: ProposedName[]
  /** Grounded searches that ran (each is one ai_runs row or more). */
  queries: number
  /** Sum of the searches' estimated cost (the extraction call is in ai_runs too). */
  searchCostUsd: number
  errors: string[]
  /** Grounded searches that FAILED (after the service's own retries), and why. */
  failed: number
  failureKinds: WebSearchFailureKind[]
}

export async function harvestGroundedNames(
  input: V2RunInput,
  profiles: WitnessProfile[],
  opts: { deadlineAt: number },
): Promise<HarvestResult> {
  const result: HarvestResult = { names: [], queries: 0, searchCostUsd: 0, errors: [], failed: 0, failureKinds: [] }
  const max = harvestMaxQueries()
  if (max === 0 || profiles.length === 0 || !isStoryGroundingEnabled()) return result

  const picked = profiles.slice(0, max)
  const gathered = await Promise.all(
    picked.map(async (profile) => {
      const left = opts.deadlineAt - Date.now() - HARVEST_EXTRACT_TIMEOUT_MS
      if (left < 20_000) return [] as StorySource[]
      try {
        const ev = await gatherGroundedEvidence(buildHarvestQuery(profile, input.topic), {
          maxResults: HARVEST_SOURCES_PER_QUERY,
          subjectTable: "discovery_runs",
          subjectId: input.runId ?? null,
          actorId: null,
          timeoutMs: Math.min(HARVEST_SEARCH_TIMEOUT_MS, left),
        })
        result.queries++
        result.searchCostUsd += ev.estimatedCostUsd ?? 0
        return ev.sources
          .filter((s) => s.domain && !isVertexRedirect(s.url))
          .map(
            (s): StorySource => ({
              kind: "web",
              title: s.title,
              url: s.url,
              domain: s.domain,
              text: s.snippet ?? "",
              verified: s.verified,
            }),
          )
      } catch (err) {
        // Budget spent / search never ran / overload / deadline — fewer names,
        // not a failed run. Counted, so the run page can say the web search
        // failed instead of showing a quiet short list.
        result.failed++
        result.failureKinds.push(classifyWebSearchFailure(err))
        result.errors.push(err instanceof Error ? err.message.split("\n")[0] : String(err))
        return [] as StorySource[]
      }
    }),
  )

  // One source list, deduped by URL, numbered for the extractor.
  const byUrl = new Map<string, StorySource>()
  for (const s of gathered.flat()) if (!byUrl.has(s.url)) byUrl.set(s.url, s)
  if (![...byUrl.values()].some((s) => s.verified)) return result

  // Read the pages themselves — bounded so the extraction keeps its reserve.
  const sources = await attachSourcePages([...byUrl.values()], {
    deadlineAt: opts.deadlineAt - HARVEST_PAGE_RESERVE_MS,
  })

  const left = opts.deadlineAt - Date.now()
  if (left < 15_000) {
    result.errors.push("harvest: no time left for extraction")
    return result
  }
  const user = sources
    .map((s, i) =>
      wrapUntrustedSource(
        i + 1,
        renderSourceBody(s, null),
        `domain=${s.domain ?? "غير معروف"} verified=${s.verified} page=${s.page ? "read" : "unread"}`,
      ),
    )
    .join("\n\n")
  const r = await runAiTask<{ people?: unknown }>({
    taskKind: "verification",
    subjectTable: "discovery_runs",
    subjectId: input.runId ?? null,
    seasonId: input.seasonId ?? null,
    promptVersion: HARVEST_EXTRACT_PROMPT_VERSION,
    input: { stage: "harvest_extract", topic: input.topic, sources: sources.length, queries: result.queries },
    prompt: [
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "user", content: `موضوع الحلقة: ${input.topic}\n\n${user}` },
    ],
    expectJson: true,
    providerOptions: { max_tokens: 2_500 },
    timeoutMs: Math.min(HARVEST_EXTRACT_TIMEOUT_MS, left),
    maxRetries: 0,
  })
  if (r.status !== "succeeded") {
    result.errors.push(r.errorMessage ?? "harvest extraction failed")
    return result
  }
  result.names = verifyHarvest(r.parsed, sources)
  return result
}
