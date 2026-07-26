/**
 * Retrieval-prompt guard — keeps Gemini's Google-Search tool ALIVE.
 *
 * WHY this file exists (measured, not theorised). Rashid ran a 2×2 smoke
 * matrix on 2026-07-26 ($1.34, real KHAT workloads, same question, no
 * chunking) over the two live retrieval models:
 *
 *   model | JSON wording IN the prompt | responseMimeType | groundingChunks
 *   ------+----------------------------+------------------+----------------
 *   flash | no                         | no               | 10  ✅
 *   flash | YES                        | no               |  0  ❌
 *   flash | YES                        | yes              |  0  ❌ (empty output,
 *         |                            |                  |     6,396 thinking
 *         |                            |                  |     tokens burnt)
 *   pro   | no                         | no               | 13  ✅
 *   pro   | no                         | yes              |  8  ✅
 *   pro   | YES                        | no               |  0  ❌
 *   pro   | YES                        | yes              |  0  ❌
 *
 * Read the third column: **any sentence asking for structured output inside
 * the prompt text kills web search — 0/4 cells, on BOTH models.** The model
 * re-reads the job as a formatting task and answers from memory: no error, no
 * warning, no empty result — a confident, well-formed, SOURCELESS answer. It
 * is the worst failure shape we have, because every downstream check still
 * passes.
 *
 * The retrieval prompts in this repo are clean today. That is exactly the
 * problem: they are a landmine. The first person who "improves" one by asking
 * for `{"sources": [...]}` turns retrieval into hallucination, and nothing —
 * not a test, not a log line, not the cost dashboard — would say so.
 *
 * So this module makes that edit impossible or loud, in three layers:
 *
 *   1. COMPILE TIME (`RetrievalOnlyConfig`) — the search-tool call's config
 *      cannot carry `responseMimeType` / `responseSchema` / a
 *      `systemInstruction`. Adding one is a type error at the keystroke,
 *      which is the only layer that stops the mistake before it ships.
 *   2. WRITE TIME (`findStructuredOutputDirectives` + the retrieval-guard
 *      test) — the instruction text of every retrieval prompt in the repo is
 *      scanned by `npm run test`. A formatting directive fails the suite.
 *   3. RUN TIME (`buildRetrievalPrompt`) — a pre-flight throw before the paid
 *      call, so a prompt edited without running the tests costs nothing and
 *      fails visibly instead of silently returning memory.
 *
 * ── The false-positive rule (deliberate, and the reason for the split) ──
 * "JSON" is a perfectly legitimate word in a research QUESTION ("ما أبرز
 * النقاشات حول صيغة JSON؟"). A guard that blocked that would break real
 * searches. So the scan runs on the INSTRUCTION segment ONLY — the text WE
 * write to steer the model — and NEVER on the caller's query, which
 * `buildRetrievalPrompt` appends after the scan. That split is structural,
 * not a heuristic: a false positive in the instructions costs one rewording,
 * a false positive in a user question would cost a search we can't run.
 * Within the instruction segment the scan is intentionally aggressive: a
 * format noun near an output verb is a directive, full stop.
 *
 * The tail of this file (`deriveRetrievalCounts`) is the other half of the
 * same problem: the three layers above stop US from disabling search, and
 * `searchRan` catches it disabled for ANY other reason — a model change, a
 * quota quirk, a future SDK default. Prevention plus detection, because the
 * failure is silent either way.
 */

import type { GenerateContentConfig } from "@google/genai"

/**
 * The config shape a Google-Search retrieval call is allowed to use.
 *
 * `responseMimeType`/`responseSchema` are banned because the matrix above
 * shows them at best halving the grounded chunks (pro: 13 → 8) and at worst
 * returning an empty body while still billing thinking tokens. Structured
 * output belongs in the OpenAI composition step (`runAiTask`), never in the
 * retrieval step — that separation IS the Gemini-grounds/OpenAI-composes
 * model.
 *
 * `systemInstruction` is banned too, and not for pedantry: it is model-facing
 * text that `buildRetrievalPrompt` never sees, so it would be a hole straight
 * through layers 2 and 3. Anything you would put there belongs in the
 * instruction segment, where it gets scanned.
 */
export type RetrievalOnlyConfig = Omit<
  GenerateContentConfig,
  "responseMimeType" | "responseSchema" | "responseJsonSchema" | "systemInstruction"
> & {
  responseMimeType?: never
  responseSchema?: never
  responseJsonSchema?: never
  systemInstruction?: never
}

/**
 * Thrown before the provider call when a retrieval prompt carries a
 * structured-output directive. Pre-flight by design: a retrieval call that
 * cannot retrieve should cost nothing. Mirrors `GroundingContractError`
 * (lib/ai-router/grounding.ts) — same idea, opposite end of the pipeline.
 */
export class RetrievalPromptContractError extends Error {
  readonly site: string
  readonly hits: string[]
  constructor(site: string, hits: string[]) {
    super(
      `تعليمات الاسترجاع في "${site}" تحتوي على توجيه بصيغة مخرجات منظّمة ` +
        `(${hits.join(" | ")}) — هذا يُعطّل بحث Google في Gemini تماماً ` +
        `(٠ مصادر في ٤ من ٤ حالات مقاسة) ويجعل النموذج يجيب من ذاكرته بلا أي مصدر. ` +
        `انقل التنسيق إلى خطوة التركيب عبر runAiTask.`,
    )
    this.name = "RetrievalPromptContractError"
    this.site = site
    this.hits = hits
  }
}

// ─── Pattern layer ───────────────────────────────────────────────────────────

/**
 * Markers that are a formatting directive on sight — no context needed.
 * A prompt containing an API field name, a JSON code fence, or a literal
 * object skeleton is asking for a shape, not for research.
 */
const HARD_MARKERS: Array<{ name: string; re: RegExp }> = [
  { name: "application/json", re: /application\/(json|x-ndjson)/i },
  { name: "responseMimeType", re: /response[_-]?mime[_-]?type/i },
  { name: "responseSchema", re: /response[_-]?(json[_-]?)?schema/i },
  { name: "json-code-fence", re: /```[ \t]*(json|jsonl|yaml|xml)\b/i },
  // A literal object skeleton pasted into the prompt: {"key": …
  { name: "inline-json-skeleton", re: /\{\s*"[^"\n]{1,60}"\s*:/ },
]

/**
 * Output-format nouns. Matched as whole words (Arabic has no `\b`, so the
 * boundary is "not a letter" via `\p{L}` lookarounds) — otherwise "jsonp" or
 * an Arabic word merely containing these letters would match.
 */
const FORMAT_TOKEN = /(?<!\p{L})(json|jsonl|yaml|xml|csv|جيسون)(?!\p{L})/giu

/**
 * Directive cues — the verbs/nouns that turn a format noun into an ORDER.
 * Arabic first (our prompts are Arabic), English second (model-steering text
 * often slips into English).
 */
const DIRECTIVE_CUE =
  new RegExp(
    "(?<!\\p{L})(" +
      // Arabic: output verbs, shape nouns, exclusivity words
      "بصيغة|صيغة|بتنسيق|تنسيق|هيئة|شكل|هيكل|بنية|" +
      "أخرج|أخرِج|اخرج|أعد|أعِد|اعد|أرجع|أرجِع|ارجع|رد|ردّ|رُدّ|اكتب|التزم|أنتج|" +
      "مخرجات|المخرجات|الإخراج|الرد|الجواب|الإجابة|" +
      "فقط|حصرا|حصراً|كائن|مصفوفة|حقول|حقل|مفاتيح|مخطط|" +
      // English
      "output|outputs|return|returns|respond|response|reply|replies|" +
      "format|formatted|valid|only|strict|strictly|structured|schema|" +
      "object|array|keys|fields|wrap|emit|must|produce|answer" +
      ")(?!\\p{L})",
    "giu",
  )

/** How far from a format noun a cue still counts as pointing at it. */
const CUE_WINDOW_CHARS = 40

/**
 * Find every structured-output directive in an INSTRUCTION segment.
 *
 * Returns the offending excerpts (for the error message and for tests);
 * an empty array means the instructions are safe to send with a search tool.
 *
 * Never call this on a caller-supplied query — see the false-positive rule in
 * the file header.
 */
export function findStructuredOutputDirectives(instructions: string): string[] {
  const hits: string[] = []

  for (const { name, re } of HARD_MARKERS) {
    const m = re.exec(instructions)
    if (m) hits.push(`${name}: «${excerpt(instructions, m.index, m[0].length)}»`)
  }

  // A format noun alone is not a directive ("مقالات عن JSON" is a topic).
  // It becomes one when an output verb / shape noun sits next to it.
  for (const m of instructions.matchAll(FORMAT_TOKEN)) {
    const at = m.index ?? 0
    const from = Math.max(0, at - CUE_WINDOW_CHARS)
    const to = Math.min(instructions.length, at + m[0].length + CUE_WINDOW_CHARS)
    const window = instructions.slice(from, to)
    // Blank out the token itself so "schema"/"object" inside it can't self-cue.
    const context =
      window.slice(0, at - from) + " ".repeat(m[0].length) + window.slice(at - from + m[0].length)
    const cue = new RegExp(DIRECTIVE_CUE.source, "iu").exec(context)
    if (cue) {
      hits.push(`${m[0]}+${cue[0]}: «${excerpt(instructions, at, m[0].length)}»`)
    }
  }

  return hits
}

/** A short, single-line quote around a match, for error messages. */
function excerpt(text: string, at: number, len: number): string {
  const from = Math.max(0, at - 30)
  const to = Math.min(text.length, at + len + 30)
  return text.slice(from, to).replace(/\s+/g, " ").trim()
}

/**
 * Throw unless `instructions` are free of structured-output directives.
 * `site` names the call site so the failure points at a file, not a string.
 */
export function assertRetrievalInstructions(site: string, instructions: string): void {
  const hits = findStructuredOutputDirectives(instructions)
  if (hits.length > 0) throw new RetrievalPromptContractError(site, hits)
}

/**
 * Compose the prompt for a Google-Search retrieval call.
 *
 * The ONLY sanctioned way to build one: it validates the instruction segment
 * (which we author) and then appends the query (which we must not police),
 * so the guard can never fire on a legitimate question.
 */
export function buildRetrievalPrompt(
  site: string,
  instructions: string,
  query: string,
): string {
  assertRetrievalInstructions(site, instructions)
  return `${instructions}\n\nالسؤال: ${query}`
}

// ─── Did the search actually run? ────────────────────────────────────────────

/** The two grounding-metadata fields that prove a search happened. */
export interface RetrievalGroundingMetadata {
  groundingChunks?: unknown[]
  webSearchQueries?: unknown[]
}

/** What one retrieval response says about the search that produced it. */
export interface RetrievalCounts {
  /** Web-search queries the model ran — the grounding BILLING unit. */
  queryCount: number
  /** Attributed sources returned. */
  sourcesFound: number
  /**
   * Did the tool fire at all? `false` is a MALFUNCTION, not a finding — the
   * counterpart of layer 1 above: a prompt directive silently disables search,
   * and this is how we notice when it (or anything else) did.
   */
  searchRan: boolean
}

/**
 * Read the search counts off one response's grounding metadata.
 *
 * Lives here — shared by both retrieval implementations
 * (`lib/ai/grounded-evidence.ts` and `lib/ai/preparation/research/gemini.ts`)
 * — because `searchRan` must be derived identically everywhere: a
 * `search_ran: true` in `ai_runs` next to a `searchRan: false` returned to the
 * caller would make the `/admin/ops` alert lie.
 *
 * `queryCount` falls back to 1 when the query list is empty but grounding
 * chunks exist: the tool clearly fired, and billing must not round that to
 * free. `searchRan` therefore means "queries listed OR chunks returned"; its
 * negation is "neither" — exactly the dead-retrieval case.
 */
export function deriveRetrievalCounts(
  meta: RetrievalGroundingMetadata | undefined,
): RetrievalCounts {
  const listed = meta?.webSearchQueries?.length ?? 0
  const sourcesFound = meta?.groundingChunks?.length ?? 0
  const queryCount = listed > 0 ? listed : sourcesFound > 0 ? 1 : 0
  return { queryCount, sourcesFound, searchRan: queryCount > 0 }
}

/**
 * Thrown when a retrieval call came back SUCCESSFUL but the search tool never
 * fired — after the re-roll below had its chance.
 *
 * Why an error and not an empty result: the two are not the same fact.
 * "We searched, the web has nothing" is a finding a caller can record. "We
 * never searched" carries no information at all, and handing it over as an
 * empty list is what let a candidate be stamped «لا حضور علني» by a search
 * that never happened. Every caller of the shared service already catches and
 * degrades (discovery skips the stamp, the market adapter writes a note, the
 * analysers run profile-only), and none of them awaits retrieval inside an
 * HTTP response — so failing loudly here hangs nothing and hides nothing.
 */
export class RetrievalSearchNotRunError extends Error {
  readonly attempts: number
  constructor(modelName: string, attempts: number) {
    super(
      `الاسترجاع فشل: ${modelName} ما شغّل بحث Google ولا مرة في ${attempts} محاولة ` +
        `(٠ استعلام، ٠ مصدر) — هذه ليست نتيجة "ما فيه شي"، هذي عملية بحث ما صارت.`,
    )
    this.name = "RetrievalSearchNotRunError"
    this.attempts = attempts
  }
}
