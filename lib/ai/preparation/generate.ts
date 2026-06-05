/**
 * Episode Preparation — section generators.
 *
 * Each generator:
 *   - Accepts the full EpisodePreparation record (so it sees the inputs + the
 *     research corpus already produced by research.ts).
 *   - Routes through the AI Router (`runAiTask`) with task_kind="editorial"
 *     which the Router maps to gpt-4o. Every section is editorial/creative.
 *   - Returns a strict typed object matching types/preparation.ts.
 *
 * The generator dispatcher `generateSection` is consumed by both the full
 * "generate everything" endpoint and the partial-regenerate endpoint.
 */

// Phase 2.0 Batch 2 — every section now routes through runAiTask.
// Prompt builders live in `lib/ai/prompts/preparation-sections.ts`.
import { safeParseJSON } from "../client"
import { runAiTask } from "@/lib/ai-router"
import {
  PREP_SYSTEM_BASE,
  PREP_EXEC_SUMMARY_SYSTEM,
  PREP_EXEC_SUMMARY_PROMPT_VERSION,
  PREP_KNOWLEDGE_BANK_SYSTEM,
  PREP_KNOWLEDGE_BANK_PROMPT_VERSION,
  PREP_GUEST_INTELLIGENCE_SYSTEM,
  PREP_GUEST_INTELLIGENCE_PROMPT_VERSION,
  PREP_CONVERSATION_AXES_SYSTEM,
  PREP_CONVERSATION_AXES_PROMPT_VERSION,
  buildPrepEpisodeFlowSystem,
  PREP_EPISODE_FLOW_PROMPT_VERSION,
  buildPrepQuestionSystemSystem,
  PREP_QUESTION_SYSTEM_PROMPT_VERSION,
  PREP_HOST_INSTRUCTIONS_SYSTEM,
  PREP_HOST_INSTRUCTIONS_PROMPT_VERSION,
  PREP_QUOTES_REFERENCES_SYSTEM,
  PREP_QUOTES_REFERENCES_PROMPT_VERSION,
  PREP_VIRAL_MOMENTS_SYSTEM,
  PREP_VIRAL_MOMENTS_PROMPT_VERSION,
} from "@/lib/ai/prompts/preparation-sections"
import type {
  EpisodePreparation,
  PreparationSectionKey,
  PreparationExecutiveSummary,
  PreparationKnowledgeBank,
  PreparationGuestIntelligence,
  PreparationConversationAxes,
  PreparationEpisodeFlow,
  PreparationEpisodeFlowPhase,
  PreparationEpisodeFlowPhaseKey,
  PreparationQuestionSystem,
  PreparationQuestionBucket,
  PreparationHostInstructions,
  PreparationQuotesReferences,
  PreparationViralMoments,
} from "@/types/preparation"

/** Phase 2.0 Batch 2 — fallback actor id for legacy call sites. */
const LEGACY_ACTOR = "system:legacy-callsite"

// ─── Context builder ────────────────────────────────────────────────────────

function describeInputs(prep: EpisodePreparation): string {
  const lines: string[] = []
  lines.push(`موضوع الحلقة: ${prep.title}`)
  if (prep.guest_name) lines.push(`الضيف: ${prep.guest_name}`)
  if (prep.short_description) lines.push(`الوصف المختصر: ${prep.short_description}`)
  if (prep.episode_goal) lines.push(`هدف الحلقة: ${prep.episode_goal}`)
  if (prep.tone_type) lines.push(`النبرة: ${prep.tone_type}`)
  if (prep.focus_mode) lines.push(`نمط التركيز: ${prep.focus_mode}`)
  if (prep.expected_duration_min) lines.push(`المدة المتوقعة: ${prep.expected_duration_min} دقيقة`)
  lines.push(`مستوى العمق (1-5): ${prep.depth_level}`)
  lines.push(`مستوى الجرأة (1-5): ${prep.boldness_level}`)
  if (prep.content_focus.length > 0)
    lines.push(`محاور التركيز: ${prep.content_focus.join("، ")}`)
  if (prep.key_questions.length > 0) {
    lines.push(`الأسئلة الأساسية للمضيف:`)
    prep.key_questions.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`))
  }
  return lines.join("\n")
}

function describeResearch(prep: EpisodePreparation): string {
  const r = prep.research_data
  if (!r) return "لم يُنفّذ البحث بعد."

  const srcById = new Map(r.sources.map((s) => [s.id, s]))
  const citeStr = (ids: number[]): string =>
    ids.length
      ? ` [مصادر: ${ids.map((id) => `#${id}`).join(", ")}]`
      : ""

  // Group claims by category so the editorial model gets a clean dossier.
  const byCategory: Record<string, typeof r.claims> = {}
  for (const c of r.claims) {
    if (!byCategory[c.category]) byCategory[c.category] = []
    byCategory[c.category].push(c)
  }

  const labelMap: Record<string, string> = {
    key_fact: "حقائق موثّقة",
    controversial_angle: "زوايا خلافية",
    hidden_insight: "رؤى خفية",
    personality_trait: "سمات شخصية",
    repeated_opinion: "آراء مكررة",
    contradiction: "تناقضات",
    unique_angle: "زوايا نادرة",
    public_stance_vs_criticism: "الموقف العلني مقابل النقد",
  }

  const lines: string[] = []

  // Render sources first so downstream generators can cite them by id.
  if (r.sources.length > 0) {
    lines.push("المصادر المتاحة (للاستشهاد بالـ id):")
    r.sources.forEach((s) => {
      lines.push(
        `- [#${s.id}] ${s.title} (${s.provider}${s.publisher ? ` — ${s.publisher}` : ""}) ${s.url}`,
      )
    })
    lines.push("")
  }

  for (const [cat, items] of Object.entries(byCategory)) {
    lines.push(`${labelMap[cat] || cat}:`)
    items.forEach((c) => {
      const weakTag = c.status === "weak" ? " [ضعيف — تعامل بحذر]" : ""
      const crossTag = c.cross_source_verified
        ? ` [تحقّق متقاطع: ${c.provider_types.join("+")}]`
        : ""
      lines.push(`- ${c.claim}${citeStr(c.source_ids)}${crossTag}${weakTag}`)
    })
    lines.push("")
  }

  if (r.quotes.length > 0) {
    lines.push("اقتباسات موثّقة:")
    r.quotes.forEach((q) => {
      const src = q.source_ids
        .map((id) => srcById.get(id)?.publisher || `#${id}`)
        .join(", ")
      lines.push(`- "${q.text}" — ${q.attributed_to} [${src}]`)
    })
    lines.push("")
  }

  if (r.past_interviews.length > 0) {
    lines.push("ظهورات سابقة:")
    r.past_interviews.forEach((i) => {
      lines.push(
        `- ${i.title}${i.publisher ? ` (${i.publisher})` : ""}${i.note ? ` — ${i.note}` : ""}`,
      )
    })
    lines.push("")
  }

  if (r.notes) {
    lines.push(`ملاحظات المُدقق: ${r.notes}`)
  }

  return lines.length > 0
    ? lines.join("\n")
    : "البحث موجود لكنه فارغ — لم يتم العثور على ادعاءات موثّقة."
}

function buildContext(prep: EpisodePreparation): string {
  return `# مدخلات الحلقة
${describeInputs(prep)}

# نتائج البحث
${describeResearch(prep)}`
}

/**
 * Phase 2.0 Batch 2 — Router-mediated JSON call shared by every prep
 * section generator. Concatenates PREP_SYSTEM_BASE with the section's
 * own system prompt to preserve byte-equivalent behavior with the
 * pre-migration `jsonCall` helper.
 */
async function jsonCall<T>(args: {
  sectionSystem: string
  user: string
  label: string
  promptVersion: string
  prepId: string | null
  eirId: string | null
  actorId?: string | null
  temperature?: number
}): Promise<T> {
  const result = await runAiTask<T>({
    taskKind: "editorial",
    eirId: args.eirId,
    subjectTable: "episode_preparations",
    subjectId: args.prepId,
    actorId: args.actorId ?? LEGACY_ACTOR,
    promptVersion: args.promptVersion,
    input: { section: args.label, prepId: args.prepId },
    prompt: [
      { role: "system", content: `${PREP_SYSTEM_BASE}\n\n${args.sectionSystem}` },
      { role: "user", content: args.user },
    ],
    expectJson: true,
    providerOptions: { temperature: args.temperature ?? 0.6 },
  })
  if (result.status !== "succeeded") {
    throw new Error(result.errorMessage || `${args.label} generation failed`)
  }
  // Prefer router-parsed result; fall back to safeParseJSON of rawText
  // for parity with the previous helper.
  if (result.parsed) return result.parsed
  const fallback = result.rawText
    ? safeParseJSON<T>(result.rawText, args.label)
    : null
  if (fallback && fallback.success) return fallback.data
  throw new Error(fallback && !fallback.success ? fallback.error : `${args.label}: empty response`)
}

/**
 * Shared context for every prep generator: which preparation + which
 * EIR (if any) the section is for, plus an optional actor. Threaded
 * through `generateSection` as a single parameter.
 */
export interface PrepGenerationContext {
  prepId: string | null
  eirId?: string | null
  actorId?: string | null
}

// ─── Executive Summary ──────────────────────────────────────────────────────

async function generateExecutiveSummary(
  prep: EpisodePreparation,
  ctx: PrepGenerationContext,
): Promise<PreparationExecutiveSummary> {
  return jsonCall<PreparationExecutiveSummary>({
    sectionSystem: PREP_EXEC_SUMMARY_SYSTEM,
    user: buildContext(prep),
    label: "executive_summary",
    promptVersion: PREP_EXEC_SUMMARY_PROMPT_VERSION,
    prepId: ctx.prepId,
    eirId: ctx.eirId ?? null,
    actorId: ctx.actorId,
    temperature: 0.5,
  })
}

// ─── Knowledge Bank ─────────────────────────────────────────────────────────

async function generateKnowledgeBank(
  prep: EpisodePreparation,
  ctx: PrepGenerationContext,
): Promise<PreparationKnowledgeBank> {
  return jsonCall<PreparationKnowledgeBank>({
    sectionSystem: PREP_KNOWLEDGE_BANK_SYSTEM,
    user: buildContext(prep),
    label: "knowledge_bank",
    promptVersion: PREP_KNOWLEDGE_BANK_PROMPT_VERSION,
    prepId: ctx.prepId,
    eirId: ctx.eirId ?? null,
    actorId: ctx.actorId,
  })
}

// ─── Guest Intelligence ─────────────────────────────────────────────────────

async function generateGuestIntelligence(
  prep: EpisodePreparation,
  ctx: PrepGenerationContext,
): Promise<PreparationGuestIntelligence> {
  return jsonCall<PreparationGuestIntelligence>({
    sectionSystem: PREP_GUEST_INTELLIGENCE_SYSTEM,
    user: buildContext(prep),
    label: "guest_intelligence",
    promptVersion: PREP_GUEST_INTELLIGENCE_PROMPT_VERSION,
    prepId: ctx.prepId,
    eirId: ctx.eirId ?? null,
    actorId: ctx.actorId,
  })
}

// ─── Conversation Axes ──────────────────────────────────────────────────────

async function generateConversationAxes(
  prep: EpisodePreparation,
  ctx: PrepGenerationContext,
): Promise<PreparationConversationAxes> {
  return jsonCall<PreparationConversationAxes>({
    sectionSystem: PREP_CONVERSATION_AXES_SYSTEM,
    user: buildContext(prep),
    label: "conversation_axes",
    promptVersion: PREP_CONVERSATION_AXES_PROMPT_VERSION,
    prepId: ctx.prepId,
    eirId: ctx.eirId ?? null,
    actorId: ctx.actorId,
  })
}

// ─── Episode Flow (Timeline + Phases) ───────────────────────────────────────

async function generateEpisodeFlow(
  prep: EpisodePreparation,
  ctx: PrepGenerationContext,
): Promise<PreparationEpisodeFlow> {
  const duration = prep.expected_duration_min || 60
  return jsonCall<PreparationEpisodeFlow>({
    sectionSystem: buildPrepEpisodeFlowSystem(duration),
    user: buildContext(prep),
    label: "episode_flow",
    promptVersion: PREP_EPISODE_FLOW_PROMPT_VERSION,
    prepId: ctx.prepId,
    eirId: ctx.eirId ?? null,
    actorId: ctx.actorId,
    temperature: 0.65,
  })
}

// ─── Question System ────────────────────────────────────────────────────────

async function generateQuestionSystem(
  prep: EpisodePreparation,
  ctx: PrepGenerationContext,
): Promise<PreparationQuestionSystem> {
  // Seed with existing flow so questions map to real sections.
  const flowSummary = prep.episode_flow
    ? prep.episode_flow.timeline
        .map((b) => `${b.id}: [${b.from_min}-${b.to_min}] ${b.label} — ${b.purpose}`)
        .join("\n")
    : "لا يوجد خط زمني بعد. أنشئ أقساماً منطقية حسب المدة."

  return jsonCall<PreparationQuestionSystem>({
    sectionSystem: buildPrepQuestionSystemSystem(prep.boldness_level, flowSummary),
    user: buildContext(prep),
    label: "question_system",
    promptVersion: PREP_QUESTION_SYSTEM_PROMPT_VERSION,
    prepId: ctx.prepId,
    eirId: ctx.eirId ?? null,
    actorId: ctx.actorId,
    temperature: 0.7,
  })
}

// ─── Host Instructions ──────────────────────────────────────────────────────

async function generateHostInstructions(
  prep: EpisodePreparation,
  ctx: PrepGenerationContext,
): Promise<PreparationHostInstructions> {
  return jsonCall<PreparationHostInstructions>({
    sectionSystem: PREP_HOST_INSTRUCTIONS_SYSTEM,
    user: buildContext(prep),
    label: "host_instructions",
    promptVersion: PREP_HOST_INSTRUCTIONS_PROMPT_VERSION,
    prepId: ctx.prepId,
    eirId: ctx.eirId ?? null,
    actorId: ctx.actorId,
    temperature: 0.55,
  })
}

// ─── Quotes & References ────────────────────────────────────────────────────

async function generateQuotesReferences(
  prep: EpisodePreparation,
  ctx: PrepGenerationContext,
): Promise<PreparationQuotesReferences> {
  return jsonCall<PreparationQuotesReferences>({
    sectionSystem: PREP_QUOTES_REFERENCES_SYSTEM,
    user: buildContext(prep),
    label: "quotes_references",
    promptVersion: PREP_QUOTES_REFERENCES_PROMPT_VERSION,
    prepId: ctx.prepId,
    eirId: ctx.eirId ?? null,
    actorId: ctx.actorId,
    temperature: 0.4,
  })
}

// ─── Viral Moments Prediction ───────────────────────────────────────────────

async function generateViralMoments(
  prep: EpisodePreparation,
  ctx: PrepGenerationContext,
): Promise<PreparationViralMoments> {
  return jsonCall<PreparationViralMoments>({
    sectionSystem: PREP_VIRAL_MOMENTS_SYSTEM,
    user: buildContext(prep),
    label: "viral_moments",
    promptVersion: PREP_VIRAL_MOMENTS_PROMPT_VERSION,
    prepId: ctx.prepId,
    eirId: ctx.eirId ?? null,
    actorId: ctx.actorId,
    temperature: 0.75,
  })
}

// ─── Dispatcher ─────────────────────────────────────────────────────────────

export type GenerateableSection = Exclude<PreparationSectionKey, "research">

/**
 * Phase 2.0 Batch 2 — `generateSection` now accepts an optional ctx
 * with eirId / actorId so the AI Router gets full attribution. The
 * legacy 2-arg signature still works; ctx defaults derive prepId from
 * prep.id with `system:legacy-callsite` as the actor fallback.
 */
export async function generateSection(
  section: GenerateableSection,
  prep: EpisodePreparation,
  ctxOverride?: { eirId?: string | null; actorId?: string | null },
): Promise<unknown> {
  const ctx: PrepGenerationContext = {
    prepId: prep.id ?? null,
    eirId: ctxOverride?.eirId ?? null,
    actorId: ctxOverride?.actorId ?? LEGACY_ACTOR,
  }
  switch (section) {
    case "executive_summary":
      return generateExecutiveSummary(prep, ctx)
    case "knowledge_bank":
      return generateKnowledgeBank(prep, ctx)
    case "guest_intelligence":
      return generateGuestIntelligence(prep, ctx)
    case "conversation_axes":
      return generateConversationAxes(prep, ctx)
    case "episode_flow":
      return generateEpisodeFlow(prep, ctx)
    case "question_system":
      return generateQuestionSystem(prep, ctx)
    case "host_instructions":
      return generateHostInstructions(prep, ctx)
    case "quotes_references":
      return generateQuotesReferences(prep, ctx)
    case "viral_moments":
      return generateViralMoments(prep, ctx)
  }
}

/** Ordered list for "generate everything" — later sections reuse earlier ones. */
export const GENERATION_ORDER: GenerateableSection[] = [
  "executive_summary",
  "knowledge_bank",
  "guest_intelligence",
  "conversation_axes",
  "episode_flow",
  "question_system",
  "host_instructions",
  "quotes_references",
  "viral_moments",
]

// Re-export so API routes can import everything from one place.
export { runPreparationResearch } from "./research"

// Expose type utilities to consumers
export type {
  PreparationQuestionBucket,
  PreparationEpisodeFlowPhase,
  PreparationEpisodeFlowPhaseKey,
}
