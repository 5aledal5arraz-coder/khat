/**
 * Phase X Step 4 — Preparation V2 pipeline orchestrator.
 *
 *   runPrepV2Pipeline(input)
 *
 *   Pass 1 — Research synthesis (structural model)
 *   Pass 2 — Episode structure (editorial)
 *   Pass 3 — Question banks (editorial)
 *   Pass 4 — Critique + compression (editorial)
 *   Validation — guard + ONE retry of Pass 4 if validation fails
 *   Persist — UPDATE episode_preparations.prep_v2
 *
 * Feature gate: PREP_V2_ENABLED env var. When false at the call site
 * the pipeline returns a no-op result. Conversion-flow integration uses
 * this gate to keep legacy behavior intact.
 */

import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { episodeIntelligenceRecords } from "@/lib/db/schema/eir"
import { khatMapEpisodeCandidates } from "@/lib/db/schema/khat-map"
// Phase 1.3 — JSONB validation wrapper.
import {
  validateJsonbWrite,
  prepV2Schema,
  PREP_V2_COLUMN,
  PREP_V2_TABLE,
} from "@/lib/db/validators"
import { runResearchSynthesis, type Pass1Input } from "./research"
import { runStructureBuild } from "./structure"
import { runQuestionBankGeneration } from "./question-banks"
import { runCritiquePass } from "./critique"
import {
  validatePrepV2Payload,
  type ValidationResult,
} from "./validation"
import {
  PREP_V2_VERSION,
  type PrepV2Payload,
  type PrepV2Question,
} from "./types"

export interface RunPrepV2Input {
  preparationId: string
  language?: "ar" | "en"
  /** Force-run even if PREP_V2_ENABLED=false (for the npm script). */
  force?: boolean
}

export interface RunPrepV2Result {
  ok: boolean
  preparation_id: string
  payload: PrepV2Payload | null
  validation: ValidationResult
  ai_run_ids: PrepV2Payload["ai_run_ids"]
  reason?:
    | "feature_disabled"
    | "preparation_not_found"
    | "pass1_failed"
    | "pass2_failed"
    | "pass3_failed"
    | "pass4_failed"
    | "validation_failed_after_retry"
}

export async function runPrepV2Pipeline(
  input: RunPrepV2Input,
): Promise<RunPrepV2Result> {
  const language = input.language ?? "ar"
  const ai_run_ids: PrepV2Payload["ai_run_ids"] = {
    pass1_research: null,
    pass2_structure: null,
    pass3_questions: null,
    pass4_critique: null,
  }

  if (!input.force && process.env.PREP_V2_ENABLED === "false") {
    return {
      ok: false,
      preparation_id: input.preparationId,
      payload: null,
      validation: { ok: false, failures: [] },
      ai_run_ids,
      reason: "feature_disabled",
    }
  }

  // Load prep + EIR + (optional) candidate provenance.
  const ctx = await loadContext(input.preparationId)
  if (!ctx) {
    return {
      ok: false,
      preparation_id: input.preparationId,
      payload: null,
      validation: { ok: false, failures: [] },
      ai_run_ids,
      reason: "preparation_not_found",
    }
  }

  const pass1Input: Pass1Input = {
    episode_title: ctx.title,
    episode_goal: ctx.episode_goal,
    topic_domain: ctx.topic_domain,
    episode_type: ctx.episode_type,
    language,
    editorial_intent: ctx.editorial_intent,
    hybrid_provenance: ctx.hybrid_provenance,
    guest_identity: ctx.guest_identity,
    eir_id: ctx.eir_id,
    preparation_id: input.preparationId,
  }

  // ── Pass 1 ────────────────────────────────────────────────────────
  const p1 = await runResearchSynthesis(pass1Input)
  ai_run_ids.pass1_research = p1.ai_run_id
  if (!p1.ok || !p1.output) {
    return {
      ok: false,
      preparation_id: input.preparationId,
      payload: null,
      validation: { ok: false, failures: [] },
      ai_run_ids,
      reason: "pass1_failed",
    }
  }

  // ── Pass 2 ────────────────────────────────────────────────────────
  const p2 = await runStructureBuild({
    language,
    preparation_id: input.preparationId,
    eir_id: ctx.eir_id,
    pass1: p1.output,
  })
  ai_run_ids.pass2_structure = p2.ai_run_id
  if (!p2.ok || !p2.output) {
    return {
      ok: false,
      preparation_id: input.preparationId,
      payload: null,
      validation: { ok: false, failures: [] },
      ai_run_ids,
      reason: "pass2_failed",
    }
  }

  // ── Pass 3 ────────────────────────────────────────────────────────
  const p3 = await runQuestionBankGeneration({
    language,
    preparation_id: input.preparationId,
    eir_id: ctx.eir_id,
    pass1: p1.output,
    pass2: p2.output,
  })
  ai_run_ids.pass3_questions = p3.ai_run_id
  if (!p3.ok || !p3.output) {
    return {
      ok: false,
      preparation_id: input.preparationId,
      payload: null,
      validation: { ok: false, failures: [] },
      ai_run_ids,
      reason: "pass3_failed",
    }
  }

  // ── Pass 4 ────────────────────────────────────────────────────────
  let p4 = await runCritiquePass({
    language,
    preparation_id: input.preparationId,
    eir_id: ctx.eir_id,
    pass1: p1.output,
    pass2: p2.output,
    pass3: p3.output,
  })
  ai_run_ids.pass4_critique = p4.ai_run_id
  if (!p4.ok || !p4.output) {
    return {
      ok: false,
      preparation_id: input.preparationId,
      payload: null,
      validation: { ok: false, failures: [] },
      ai_run_ids,
      reason: "pass4_failed",
    }
  }

  // Deterministic safety net before validation — pull the count into
  // the valid window when the model is just barely short. We never
  // synthesize more than 4 questions; below 20 we let the validator
  // fail honestly so the editor knows the run was bad.
  const backfilledQuestions = backfillQuestionFloor(
    p4.revised_questions,
    p4.revised_sections,
    p1.output,
  )

  let payload = assemblePayload({
    pass1: p1.output,
    pass2Sections: p4.revised_sections,
    pass3Questions: backfilledQuestions,
    pass4: p4.output,
    ai_run_ids,
  })

  // Production-readiness fix sprint — context-aware validation.
  const validationCtx = {
    topic_domain: ctx.topic_domain,
    linkedGuestName: ctx.linked_guest_name,
  }

  let validation = validatePrepV2Payload(payload, validationCtx)
  if (!validation.ok) {
    // Retry critique once. Pass the validator failures back so the model
    // can target the exact gap.
    const retryHint =
      "Previous draft failed validation. Issues: " +
      validation.failures.map((f) => `${f.code}: ${f.message}`).join(" | ")
    const retry = await runCritiquePass({
      language,
      preparation_id: input.preparationId,
      eir_id: ctx.eir_id,
      pass1: { ...p1.output, sensitive_zones: [...p1.output.sensitive_zones, retryHint] },
      pass2: { sections: p4.revised_sections },
      pass3: { questions: backfilledQuestions },
    })
    if (retry.ok && retry.output) {
      ai_run_ids.pass4_critique = retry.ai_run_id // overwrite with successful retry
      p4 = retry
      const backfilledRetry = backfillQuestionFloor(
        retry.revised_questions,
        retry.revised_sections,
        p1.output,
      )
      payload = assemblePayload({
        pass1: p1.output,
        pass2Sections: retry.revised_sections,
        pass3Questions: backfilledRetry,
        pass4: retry.output,
        ai_run_ids,
      })
      validation = validatePrepV2Payload(payload, validationCtx)
    }
  }

  // Production-readiness fix sprint — last-resort sanitization. If the
  // only remaining failure is `unverified_guest_reference`, scrub the
  // hallucinated name(s) to "[الضيف]" and keep going. Anything else
  // remains a hard failure.
  if (
    !validation.ok &&
    validation.failures.length === 1 &&
    validation.failures[0].code === "unverified_guest_reference"
  ) {
    const { sanitizeGuestReferences } = await import("./validation")
    const sanitized = sanitizeGuestReferences(payload)
    payload = sanitized.payload
    validation = validatePrepV2Payload(payload, validationCtx)
    // We log the sanitization outcome on the run so an audit can trace
    // which preparations had to be scrubbed.
    if (sanitized.replacements > 0) {
      console.warn(
        `[prep-v2] sanitized ${sanitized.replacements} unverified guest reference(s) ` +
          `in prep ${input.preparationId}`,
      )
    }
  }

  // Persist — even if validation failed, we still save the payload so
  // the editor can see what the model produced, but we mark the result
  // unsuccessful so the conversion flow knows.
  await persistPrepV2(input.preparationId, payload)

  if (!validation.ok) {
    return {
      ok: false,
      preparation_id: input.preparationId,
      payload,
      validation,
      ai_run_ids,
      reason: "validation_failed_after_retry",
    }
  }

  return {
    ok: true,
    preparation_id: input.preparationId,
    payload,
    validation,
    ai_run_ids,
  }
}

// ─── Persist ───────────────────────────────────────────────────────────

async function persistPrepV2(
  preparationId: string,
  payload: PrepV2Payload,
): Promise<void> {
  // Phase 1.3 — strict JSONB validation of the assembled payload before
  // the UPDATE lands. REPORT mode logs drift and proceeds; ENFORCE mode
  // throws a typed JsonbValidationError that the pipeline orchestrator's
  // try/catch handles upstream.
  validateJsonbWrite(
    { table: PREP_V2_TABLE, column: PREP_V2_COLUMN, rowId: preparationId },
    payload,
    prepV2Schema,
  )

  await db!
    .update(episodePreparations)
    .set({
      prep_v2: payload as never,
      updated_at: new Date(),
    })
    .where(eq(episodePreparations.id, preparationId))
}

// ─── Context loader ───────────────────────────────────────────────────

interface PrepContext {
  preparation_id: string
  title: string
  episode_goal: string | null
  guest_identity: Record<string, unknown> | null
  /**
   * Production-readiness fix sprint — the linked guest's actual name
   * pulled either from the preparation row's `guest_name` column or
   * from the candidate's suggested_guest_candidate_id. Used by the
   * hallucinated-guest validator to decide whether a name reference
   * in opening/closing copy is verified.
   */
  linked_guest_name: string | null
  eir_id: string | null
  editorial_intent: Record<string, unknown> | null
  topic_domain: string | null
  episode_type: string | null
  hybrid_provenance: {
    market_inspiration?: string | null
    original_lens?: string | null
    conflict_angle?: string | null
  } | null
}

async function loadContext(preparationId: string): Promise<PrepContext | null> {
  const [prep] = await db!
    .select({
      id: episodePreparations.id,
      title: episodePreparations.title,
      episode_goal: episodePreparations.episode_goal,
      guest_identity: episodePreparations.guest_identity,
      guest_name: episodePreparations.guest_name,
      eir_id: episodePreparations.eir_id,
    })
    .from(episodePreparations)
    .where(eq(episodePreparations.id, preparationId))
    .limit(1)
  if (!prep) return null

  let editorial_intent: Record<string, unknown> | null = null
  let topic_domain: string | null = null
  let episode_type: string | null = null
  let hybrid_provenance: PrepContext["hybrid_provenance"] = null

  if (prep.eir_id) {
    const [eir] = await db!
      .select({
        editorial_intent: episodeIntelligenceRecords.editorial_intent,
        topic_domain: episodeIntelligenceRecords.topic_domain,
        episode_type: episodeIntelligenceRecords.episode_type,
      })
      .from(episodeIntelligenceRecords)
      .where(eq(episodeIntelligenceRecords.id, prep.eir_id))
      .limit(1)
    if (eir) {
      editorial_intent = (eir.editorial_intent ?? null) as Record<string, unknown> | null
      topic_domain = eir.topic_domain ?? null
      episode_type = eir.episode_type ?? null
    }
    // Detect hybrid-topic provenance: a candidate row stamped by
    // lib/hybrid-topics/persist.ts.
    if (editorial_intent?.source_id) {
      const [cand] = await db!
        .select({
          production_notes: khatMapEpisodeCandidates.production_notes,
        })
        .from(khatMapEpisodeCandidates)
        .where(eq(khatMapEpisodeCandidates.id, String(editorial_intent.source_id)))
        .limit(1)
      if (cand?.production_notes) {
        try {
          const parsed = JSON.parse(cand.production_notes) as Record<string, unknown>
          if (parsed?.source === "hybrid_topics") {
            hybrid_provenance = {
              market_inspiration: (parsed.market_inspiration as string | null) ?? null,
              original_lens: (parsed.original_lens as string | null) ?? null,
              conflict_angle: null, // optional
            }
          }
        } catch {
          // ignore non-JSON production_notes
        }
      }
    }
  }

  // Production-readiness fix sprint — derive the linked guest name.
  // First try `episode_preparations.guest_name`. Fall back to the
  // identity payload when it carries a name field.
  let linked_guest_name: string | null =
    (prep.guest_name ?? "").trim().length > 0 ? prep.guest_name : null
  if (!linked_guest_name) {
    const id = (prep.guest_identity ?? null) as Record<string, unknown> | null
    const candidate =
      (id?.full_name as string | undefined) ??
      (id?.name as string | undefined) ??
      null
    if (candidate && candidate.trim().length > 0) {
      linked_guest_name = candidate
    }
  }
  // Reject obvious placeholders so the validator doesn't accept names
  // that match a stub.
  if (
    linked_guest_name &&
    /^\[?يحتاج اقتراح ضيف\]?$/.test(linked_guest_name.trim())
  ) {
    linked_guest_name = null
  }

  return {
    preparation_id: prep.id,
    title: prep.title,
    episode_goal: prep.episode_goal,
    guest_identity: (prep.guest_identity ?? null) as Record<string, unknown> | null,
    linked_guest_name,
    eir_id: prep.eir_id ?? null,
    editorial_intent,
    topic_domain,
    episode_type,
    hybrid_provenance,
  }
}

// ─── Assembly ─────────────────────────────────────────────────────────

function assemblePayload(args: {
  pass1: {
    thesis: string
    axes_of_tension: string[]
    guest_extraction_strategy: string
    sensitive_zones: string[]
  }
  pass2Sections: PrepV2Payload["episode_sections"]
  pass3Questions: PrepV2Question[]
  pass4: {
    host_guidance: PrepV2Payload["host_guidance"]
    director_guidance: PrepV2Payload["director_guidance"]
    opening_options: PrepV2Payload["opening_options"]
    closing_options: PrepV2Payload["closing_options"]
    critic_notes: string[]
  }
  ai_run_ids: PrepV2Payload["ai_run_ids"]
}): PrepV2Payload {
  // Strip sensitive_zones retry-hint marker if it leaked in.
  const sensitive_zones = args.pass1.sensitive_zones.filter(
    (z) => !z.startsWith("Previous draft failed validation"),
  )
  const total_estimated_minutes = args.pass2Sections.reduce(
    (a, s) => a + (s.estimated_minutes || 0),
    0,
  )
  return {
    thesis: args.pass1.thesis,
    axes_of_tension: args.pass1.axes_of_tension,
    guest_extraction_strategy: args.pass1.guest_extraction_strategy,
    episode_sections: args.pass2Sections,
    question_bank: args.pass3Questions,
    host_guidance: args.pass4.host_guidance,
    director_guidance: args.pass4.director_guidance,
    sensitive_zones,
    opening_options: args.pass4.opening_options,
    closing_options: args.pass4.closing_options,
    total_estimated_minutes,
    generator_version: PREP_V2_VERSION,
    generated_at: new Date().toISOString(),
    ai_run_ids: args.ai_run_ids,
  }
}

// ─── Deterministic backfill safety net ────────────────────────────────
//
// Never grows the bank by more than `MAX_FILL` questions. Designed to
// close the small gap when the model lands at 20–23 questions. Below 20
// we leave it alone — the validator will surface the honest failure.

const MAX_FILL = 4
const FLOOR = 24

function backfillQuestionFloor(
  questions: PrepV2Question[],
  sections: ReturnType<typeof Object>[] | unknown,
  pass1: { axes_of_tension: string[] },
): PrepV2Question[] {
  if (questions.length >= FLOOR) return questions
  const need = FLOOR - questions.length
  if (need > MAX_FILL) return questions // honest failure path

  // Find the most-starved section.
  const counts = new Map<string, number>()
  for (const q of questions) {
    counts.set(q.section, (counts.get(q.section) ?? 0) + 1)
  }
  const sectionList = (sections as Array<{ kind: string; intent: string }>) ?? []
  const starved = [...sectionList]
    .sort((a, b) => (counts.get(a.kind) ?? 0) - (counts.get(b.kind) ?? 0))
    .slice(0, need)

  const fillers: PrepV2Question[] = starved.map((s, i) => ({
    id: `fill-${i}-${Math.random().toString(36).slice(2, 8)}`,
    section: s.kind as PrepV2Question["section"],
    text:
      pass1.axes_of_tension[i % Math.max(1, pass1.axes_of_tension.length)] !==
      undefined
        ? `بأي قدر تشعر أن "${pass1.axes_of_tension[i % pass1.axes_of_tension.length]}" حاضرة في حياتك الآن — وكيف؟`
        : `What part of "${s.intent}" still costs you something to say out loud?`,
    types: ["reflective", "personal"],
    priority: "if_time",
    purpose: "deterministic backfill — closes question-count floor without inventing content",
    follow_up_prompt: "اصمت قليلاً ثم اسأل: «ما الذي لم تقله بعد؟»",
    risk_level: "low",
  }))

  return [...questions, ...fillers]
}

// Re-export validation helpers for convenience.
export { validatePrepV2Payload } from "./validation"
export type { PrepV2Payload } from "./types"
