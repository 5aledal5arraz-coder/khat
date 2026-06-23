/**
 * Prep V2 — Pass 5: Insight Cards (generation + grounded verification).
 *
 * For each eligible question we draft 1–2 candidate "support cards" (a stat, a
 * study, a date, a reference, a humorous beat, or a CORRECTION the host can
 * deploy if the guest misspeaks), then verify every candidate against the live
 * web before it is allowed to attach to a question:
 *
 *   draft (AI router, editorial)        — creative, UNTRUSTED candidates
 *     → ground (Gemini Google-Search)   — real source URLs, not model-typed
 *       → verify (Gemini JSON, no tool) — does the evidence actually support it?
 *         → keep (verified | partial) / DROP (weak | refuted | insufficient)
 *
 * The hard rule: an insight only survives if the verifier judged the retrieved
 * sources to support its underlying factual claim. The `sources` we store are
 * the grounding-chunk URLs — so a card can never cite a fabricated source.
 *
 * This pass is BEST-EFFORT enrichment: it never throws into the pipeline and
 * never flips a preparation to "failed". If Gemini is unconfigured, the env
 * gate is off, or anything errors, the question bank is returned untouched.
 */

import { runAiTask } from "@/lib/ai-router"
import {
  geminiSearchWeb,
  geminiJson,
  isGeminiConfigured,
} from "@/lib/ai/preparation/research/gemini"
import type { RawRetrievedSource } from "@/lib/ai/preparation/research/types"
import {
  INSIGHT_TIMINGS,
  INSIGHT_TYPES,
  SECTION_KINDS,
  type InsightConfidence,
  type InsightTiming,
  type InsightType,
  type PrepV2Insight,
  type PrepV2InsightSource,
  type PrepV2Payload,
  type PrepV2Question,
  type SectionKind,
} from "./types"

// ─── Tunables ─────────────────────────────────────────────────────────

/** Cards kept per question (the host reads at a glance — keep it few + sharp). */
const MAX_INSIGHTS_PER_QUESTION = 2
/** Candidates a section may draft per question (verifier prunes the rest). */
const MAX_DRAFTS_PER_QUESTION = 2
/**
 * Per-run grounding budget. Each candidate costs ~2 Gemini calls (search +
 * verify); this caps cost/latency on a large bank. Excess candidates are left
 * un-grounded (and therefore dropped) — logged, never silently swallowed.
 */
const MAX_GROUNDING_CANDIDATES = 30
/** How many candidates we ground at once. */
const GROUNDING_CONCURRENCY = 4
/** Web results pulled per claim before verification. */
const SOURCES_PER_CLAIM = 6
/** Sources cited on a kept insight. */
const MAX_SOURCES_PER_INSIGHT = 3

/** Question types where a fact intrudes on a vulnerable moment. */
const PROTECTED_ONLY_TYPES = new Set(["emotional", "personal"])
/** Types that clearly benefit from a supporting fact. */
const INSIGHT_ELIGIBLE_TYPES = new Set([
  "factual",
  "philosophical",
  "confrontational",
  "reflective",
])

// ─── Public API ───────────────────────────────────────────────────────

export interface InsightGenInput {
  language: "ar" | "en"
  preparation_id: string
  eir_id: string | null
  payload: PrepV2Payload
  guestName: string | null
}

export interface InsightGenStats {
  drafted: number
  kept: number
  grounded: number
  capped: boolean
}

export interface InsightGenResult {
  ok: boolean
  /** question_bank with verified insights attached (a fresh array). */
  questions: PrepV2Question[]
  ai_run_ids: string[]
  stats: InsightGenStats
}

/** True when a question is worth enriching (skip vulnerable-only moments). */
export function isInsightEligible(q: PrepV2Question): boolean {
  if (q.types.length > 0 && q.types.every((t) => PROTECTED_ONLY_TYPES.has(t))) {
    return false
  }
  return q.priority === "must_ask" || q.types.some((t) => INSIGHT_ELIGIBLE_TYPES.has(t))
}

/**
 * Generate + ground insights for a prepared question bank. Returns a NEW
 * questions array; the input payload is never mutated.
 */
export async function runInsightGeneration(
  input: InsightGenInput,
): Promise<InsightGenResult> {
  const baseQuestions = input.payload.question_bank
  const noop: InsightGenResult = {
    ok: false,
    questions: baseQuestions,
    ai_run_ids: [],
    stats: { drafted: 0, kept: 0, grounded: 0, capped: false },
  }

  if (process.env.PREP_V2_INSIGHTS_ENABLED === "false") return noop
  if (!isGeminiConfigured()) {
    console.warn("[prep-v2/insights] Gemini not configured — skipping Pass 5")
    return noop
  }

  // 1) Draft candidates per section (parallel, independent).
  const sectionsWithEligible = SECTION_KINDS.map((kind) => ({
    kind,
    questions: baseQuestions.filter(
      (q) => q.section === kind && isInsightEligible(q),
    ),
  })).filter((s) => s.questions.length > 0)

  const ai_run_ids: string[] = []
  let drafted: DraftCandidate[] = []

  const drafts = await Promise.all(
    sectionsWithEligible.map((s) =>
      draftSectionInsights({
        language: input.language,
        preparation_id: input.preparation_id,
        eir_id: input.eir_id,
        guestName: input.guestName,
        thesis: input.payload.thesis,
        axes_of_tension: input.payload.axes_of_tension,
        section: s.kind,
        questions: s.questions,
      }).catch((err) => {
        console.warn(
          `[prep-v2/insights] draft failed for section ${s.kind}:`,
          err instanceof Error ? err.message : err,
        )
        return { candidates: [] as DraftCandidate[], runId: null }
      }),
    ),
  )
  for (const d of drafts) {
    if (d.runId) ai_run_ids.push(d.runId)
    drafted.push(...d.candidates)
  }

  const totalDrafted = drafted.length
  if (totalDrafted === 0) {
    console.warn(
      `[prep-v2/insights] prep ${input.preparation_id}: 0 candidates drafted ` +
        `across ${sectionsWithEligible.length} eligible section(s) ` +
        `(${ai_run_ids.length} draft call(s)) — no insights attached.`,
    )
    return { ok: true, questions: baseQuestions, ai_run_ids, stats: { drafted: 0, kept: 0, grounded: 0, capped: false } }
  }

  // 2) Apply the grounding budget (candidates arrive in section order).
  const capped = totalDrafted > MAX_GROUNDING_CANDIDATES
  if (capped) {
    console.warn(
      `[prep-v2/insights] ${totalDrafted} candidates exceed grounding budget ` +
        `${MAX_GROUNDING_CANDIDATES} — grounding the first ${MAX_GROUNDING_CANDIDATES}, ` +
        `${totalDrafted - MAX_GROUNDING_CANDIDATES} dropped un-grounded.`,
    )
    drafted = drafted.slice(0, MAX_GROUNDING_CANDIDATES)
  }

  // 3) Ground every candidate (bounded concurrency). Survivors carry sources.
  const grounded = await mapWithConcurrency(
    drafted,
    GROUNDING_CONCURRENCY,
    async (cand) => {
      try {
        // Verify the claim the HOST WILL ACTUALLY SAY — the displayed `text`,
        // or the accurate half of a correction — NOT a search-optimised proxy.
        // verify_query only steers the web search; the verdict is about the
        // displayed claim, so a card can never pair real sources with text the
        // sources don't actually support.
        const { confidence, sources } = await groundClaim(
          searchQueryFor(cand),
          verifyClaimFor(cand),
        )
        if ((confidence !== "verified" && confidence !== "partial") || sources.length === 0) {
          return null
        }
        const insight: PrepV2Insight = {
          id: `ins-${cand.section}-${cand.question_id.slice(0, 6)}-${rand()}`,
          type: cand.type,
          text: cand.text,
          timing: cand.timing,
          sources,
          confidence,
          ...(cand.type === "correction" && cand.correction
            ? { correction: cand.correction }
            : {}),
          generated_at: new Date().toISOString(),
          // Generated insights are grounded but NOT yet human-approved — they
          // stay out of the live cockpit until a producer approves them in the
          // "Fact-Check & Enrich" tab (the review gate).
          live_status: "pending",
        }
        return { question_id: cand.question_id, insight }
      } catch (err) {
        // Best-effort: a single failing candidate must never sink the batch
        // (and Promise.all would otherwise reject the whole pass).
        console.warn(
          "[prep-v2/insights] grounding candidate errored (dropped):",
          err instanceof Error ? err.message : err,
        )
        return null
      }
    },
  )

  // 4) Attach survivors to a fresh questions array (≤ MAX per question).
  const byQuestion = new Map<string, PrepV2Insight[]>()
  let kept = 0
  for (const g of grounded) {
    if (!g) continue
    const arr = byQuestion.get(g.question_id) ?? []
    if (arr.length >= MAX_INSIGHTS_PER_QUESTION) continue
    arr.push(g.insight)
    byQuestion.set(g.question_id, arr)
    kept++
  }

  const questions = baseQuestions.map((q) => {
    const ins = byQuestion.get(q.id)
    return ins && ins.length > 0 ? { ...q, insights: ins } : q
  })

  return {
    ok: true,
    questions,
    ai_run_ids,
    stats: { drafted: totalDrafted, kept, grounded: drafted.length, capped },
  }
}

// ─── Drafting (AI router) ─────────────────────────────────────────────

interface DraftCandidate {
  question_id: string
  section: SectionKind
  type: InsightType
  text: string
  timing: InsightTiming
  verify_query: string
  correction?: { inaccuracy: string; accurate: string }
}

interface SectionDraftInput {
  language: "ar" | "en"
  preparation_id: string
  eir_id: string | null
  guestName: string | null
  thesis: string
  axes_of_tension: string[]
  section: SectionKind
  questions: PrepV2Question[]
}

async function draftSectionInsights(
  input: SectionDraftInput,
): Promise<{ candidates: DraftCandidate[]; runId: string | null }> {
  const langLabel = input.language === "ar" ? "Arabic" : "English"

  const system = [
    `You enrich a ${langLabel}-language podcast interview. For each question you receive, propose up to ${MAX_DRAFTS_PER_QUESTION} SHORT support cards the host can use live to deepen the conversation.`,
    "",
    "A card is one of these types:",
    "  fact       — a concrete enriching fact",
    "  stat       — a surprising, specific statistic",
    "  research   — a real study / research finding",
    "  date       — a historical fact or important date",
    "  reference  — a scientist, researcher, book, theory, or work to name-drop",
    "  correction — a likely inaccuracy the guest might state + the accurate counter-fact",
    "  levity     — a short, tasteful, genuinely funny fact",
    "",
    "Output JSON ONLY. Shape:",
    "{ \"insights\": [ {",
    "   \"question_id\": string,            // EXACT id from the input",
    "   \"type\": one of the types above,",
    "   \"text\": string,                   // the card, ≤2 short lines, ready to read aloud",
    "   \"timing\": \"before\" | \"during\" | \"after\",  // when in the answer the host uses it",
    "   \"verify_query\": string,           // a precise, checkable factual statement to web-search",
    "   \"correction\": { \"inaccuracy\": string, \"accurate\": string }  // ONLY when type=correction",
    "} ] }",
    "",
    "HARD RULES:",
    "1. ONLY propose claims that are REAL and independently checkable on the public web. If you are not confident a claim is verifiable, DO NOT propose it. Fewer real cards beat many shaky ones — proposing zero for a question is fine.",
    "2. NEVER invent statistics, study names, dates, or attributions. The `verify_query` must state the exact factual assertion a fact-checker would search for.",
    "3. For `correction`: `accurate` MUST be a checkable fact; `verify_query` must target the accurate fact. The `inaccuracy` is the common misconception the guest might voice.",
    "4. Do NOT propose cards for purely emotional beats — keep enrichment factual and additive, never intrusive.",
    "5. Match `type` to the question: confrontational → stat/correction; philosophical → reference/research; factual → fact/date.",
    `6. Output language for \"text\", \"correction\": ${langLabel}. \"verify_query\" may be ${langLabel} or English — whichever searches better.`,
  ].join("\n")

  const questionBlock = input.questions
    .map((q) =>
      JSON.stringify({
        id: q.id,
        text: q.text,
        types: q.types,
        purpose: q.purpose,
      }),
    )
    .join("\n")

  const user = [
    `Episode thesis: ${input.thesis}`,
    `Axes of tension: ${input.axes_of_tension.join(" | ")}`,
    input.guestName ? `Guest: ${input.guestName}` : "Guest: (not yet assigned)",
    `Section: ${input.section}`,
    "",
    "Questions (propose cards for these, by id):",
    questionBlock,
    "",
    `Return JSON only. Up to ${MAX_DRAFTS_PER_QUESTION} cards per question; zero is acceptable.`,
  ].join("\n")

  const r = await runAiTask<{ insights?: Array<Record<string, unknown>> }>({
    taskKind: "editorial",
    eirId: input.eir_id,
    subjectTable: "episode_preparations",
    subjectId: input.preparation_id,
    input: {
      pass: "prep_v2.insights",
      preparation_id: input.preparation_id,
      language: input.language,
      section: input.section,
      question_count: input.questions.length,
    },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.5 },
  })

  if (r.status !== "succeeded" || !r.parsed) {
    return { candidates: [], runId: r.runId }
  }

  const validIds = new Set(input.questions.map((q) => q.id))
  const perQuestion = new Map<string, number>()
  const candidates: DraftCandidate[] = []

  for (const raw of r.parsed.insights ?? []) {
    const cand = coerceCandidate(raw, input.section, validIds)
    if (!cand) continue
    const n = perQuestion.get(cand.question_id) ?? 0
    if (n >= MAX_DRAFTS_PER_QUESTION) continue
    perQuestion.set(cand.question_id, n + 1)
    candidates.push(cand)
  }

  return { candidates, runId: r.runId }
}

function coerceCandidate(
  raw: Record<string, unknown>,
  section: SectionKind,
  validIds: Set<string>,
): DraftCandidate | null {
  const question_id = String(raw["question_id"] ?? "").trim()
  if (!validIds.has(question_id)) return null

  const type = String(raw["type"] ?? "").trim().toLowerCase()
  if (!(INSIGHT_TYPES as readonly string[]).includes(type)) return null

  const text = String(raw["text"] ?? "").trim()
  if (text.length < 4) return null

  const timingRaw = String(raw["timing"] ?? "during").trim().toLowerCase()
  const timing: InsightTiming = (INSIGHT_TIMINGS as readonly string[]).includes(timingRaw)
    ? (timingRaw as InsightTiming)
    : "during"

  let correction: DraftCandidate["correction"]
  if (type === "correction") {
    const c = (raw["correction"] ?? {}) as Record<string, unknown>
    const inaccuracy = String(c["inaccuracy"] ?? "").trim()
    const accurate = String(c["accurate"] ?? "").trim()
    // Both halves are required: `accurate` is the checkable fact, `inaccuracy`
    // is the "if the guest says X" line the card renders — an empty one breaks
    // the correction's whole framing.
    if (accurate.length < 4 || inaccuracy.length < 4) return null
    correction = { inaccuracy, accurate }
  }

  const verify_query =
    String(raw["verify_query"] ?? "").trim() ||
    correction?.accurate ||
    text

  return {
    question_id,
    section,
    type: type as InsightType,
    text,
    timing,
    verify_query,
    correction,
  }
}

/**
 * The exact factual assertion we fact-check — the claim the host will read
 * aloud. For a correction it is the accurate half; otherwise the displayed
 * text itself, so the verdict is always about what the host will actually say.
 */
function verifyClaimFor(cand: DraftCandidate): string {
  if (cand.type === "correction" && cand.correction) {
    return cand.correction.accurate
  }
  return cand.text
}

/**
 * The web-search query used only to FIND candidate sources. Verification is
 * still performed against verifyClaimFor(), so a loose query can never widen
 * what counts as "supported".
 */
function searchQueryFor(cand: DraftCandidate): string {
  return cand.verify_query || verifyClaimFor(cand)
}

// ─── Grounding + verification (direct Gemini, like the research pipeline) ──

interface VerifierVerdict {
  verdict: "supported" | "partial" | "refuted" | "insufficient"
  supporting_source_indices?: number[]
  note?: string
}

function isVerdict(v: unknown): v is VerifierVerdict {
  if (!v || typeof v !== "object") return false
  const verdict = (v as { verdict?: unknown }).verdict
  return (
    verdict === "supported" ||
    verdict === "partial" ||
    verdict === "refuted" ||
    verdict === "insufficient"
  )
}

/**
 * Search the web for a claim, then judge whether the retrieved sources support
 * it. Returns a confidence band + the supporting source URLs. Any failure maps
 * to `weak` (→ the candidate is dropped), so a card never ships un-grounded.
 */
async function groundClaim(
  searchQuery: string,
  verifyClaim: string,
): Promise<{ confidence: InsightConfidence; sources: PrepV2InsightSource[] }> {
  let raw: RawRetrievedSource[]
  try {
    raw = await geminiSearchWeb(searchQuery, SOURCES_PER_CLAIM)
  } catch (err) {
    console.warn(
      "[prep-v2/insights] grounding search failed:",
      err instanceof Error ? err.message : err,
    )
    return { confidence: "weak", sources: [] }
  }
  if (raw.length === 0) return { confidence: "weak", sources: [] }

  const verdict = await verifyAgainstSources(verifyClaim, raw)
  const confidence: InsightConfidence =
    verdict.verdict === "supported"
      ? "verified"
      : verdict.verdict === "partial"
        ? "partial"
        : "weak"
  if (confidence === "weak") return { confidence, sources: [] }

  const idxs =
    verdict.supporting_source_indices && verdict.supporting_source_indices.length > 0
      ? verdict.supporting_source_indices
      : raw.map((_, i) => i)
  const sources = idxs
    .map((i) => raw[i])
    .filter((s): s is RawRetrievedSource => Boolean(s))
    .slice(0, MAX_SOURCES_PER_INSIGHT)
    .map(toInsightSource)

  if (sources.length === 0) return { confidence: "weak", sources: [] }
  return { confidence, sources }
}

async function verifyAgainstSources(
  claim: string,
  raw: RawRetrievedSource[],
): Promise<VerifierVerdict> {
  const corpus = raw
    .map((s, i) => `[${i}] ${s.publisher ?? safeHost(s.url)} — ${s.snippet || s.title}`)
    .join("\n")

  const system =
    "You are a strict fact-checker. Decide whether the retrieved web sources SUPPORT the claim. " +
    "Output JSON only: {\"verdict\":\"supported\"|\"partial\"|\"refuted\"|\"insufficient\", " +
    "\"supporting_source_indices\":number[], \"note\":string}. " +
    "Rules: 'supported' = at least two sources DIRECTLY and EXPLICITLY state or strongly imply the claim. " +
    "'partial' = exactly one source directly and explicitly supports the claim. " +
    "'refuted' = the sources contradict the claim. " +
    "'insufficient' = the sources only mention related keywords or the same topic WITHOUT addressing the specific claim, or do not address it at all. " +
    "A source merely on the same subject is NOT support — the specific assertion (the exact number, date, name, or fact) must appear. " +
    "When uncertain, choose 'insufficient'. NEVER invent support that is not explicitly in the sources. " +
    "supporting_source_indices lists ONLY indices that directly and explicitly support the claim."

  const user = `Claim:\n${claim}\n\nRetrieved sources:\n${corpus}`

  try {
    return await geminiJson<VerifierVerdict>(system, user, "insight-verify", 0.1, isVerdict)
  } catch (err) {
    console.warn(
      "[prep-v2/insights] verifier failed:",
      err instanceof Error ? err.message : err,
    )
    return { verdict: "insufficient", supporting_source_indices: [], note: "verifier error" }
  }
}

function toInsightSource(s: RawRetrievedSource): PrepV2InsightSource {
  return {
    title: (s.title || s.publisher || safeHost(s.url) || s.url).slice(0, 160),
    url: s.url,
    ...(s.publisher ? { publisher: s.publisher } : {}),
    ...(s.published_at ? { published_at: s.published_at } : {}),
  }
}

// ─── Small utilities ──────────────────────────────────────────────────

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function rand(): string {
  return Math.random().toString(36).slice(2, 8)
}

/** Map with a fixed concurrency limit; preserves input order in the output. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = cursor++
      if (i >= items.length) return
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}
