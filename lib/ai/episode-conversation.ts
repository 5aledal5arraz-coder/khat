/**
 * ص-٨ — generator for the five "conversation" fields on the episode page.
 *
 * See `lib/ai/prompts/episode-conversation.ts` for what each field is and
 * why `exclusive_clip` is deliberately absent.
 *
 * Two rules shape this module:
 *
 *  1. **Never overwrite a human.** `setEpisodeEnrichment` merges per
 *     COLUMN, not per sub-key — handing it
 *     `before_you_watch: { who_is_it_for }` silently drops the other two
 *     cards even though it looks like a partial update. So the merge here
 *     is explicit and sub-key aware, and it only ever fills a hole.
 *  2. **Ask only for what's missing.** The request sent to the model is
 *     derived from the existing enrichment, so a field Khaled already
 *     wrote is not regenerated, not paid for, and not at risk.
 */

import { env } from "@/lib/env"
import { runAiTask } from "@/lib/ai-router"
import type { EpisodeEnrichment } from "@/types/episodes"
import { prepareTranscript } from "./client"
import type { GlobalEpisodeIntelligence } from "./episode-intelligence"
import { formatIntelligenceContext } from "./episode-intelligence"
import {
  buildEpisodeConversationPrompt,
  EPISODE_CONVERSATION_PROMPT_VERSION,
  type ConversationDialect,
  type ConversationFieldRequest,
  type ConversationModelOutput,
} from "./prompts/episode-conversation"

/** The five generatable fields, in page order. `exclusive_clip` is not one. */
export type ConversationField = keyof ConversationFieldRequest

export const CONVERSATION_FIELDS: ConversationField[] = [
  "why_this_conversation",
  "central_question",
  "before_you_watch",
  "conversation_map",
  "unsaid_reflections",
]

export type ConversationPatch = Pick<
  EpisodeEnrichment,
  | "why_this_conversation"
  | "central_question"
  | "before_you_watch"
  | "conversation_map"
  | "unsaid_reflections"
>

export interface GenerateConversationResult {
  success: boolean
  /** Only fields that were EMPTY and are now filled. Safe to persist as-is. */
  patch?: ConversationPatch
  /** Which fields the patch actually fills. */
  filled?: ConversationField[]
  /** Requested but the model returned nothing usable. */
  empty?: ConversationField[]
  /** Already had human content and were never requested. */
  skipped?: ConversationField[]
  error?: string
  runId?: string
}

// ---------------------------------------------------------------------------
// Emptiness — one definition, used for both "what to ask" and "what to keep"
// ---------------------------------------------------------------------------

function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim().length === 0
}

/**
 * Is this field empty ENOUGH to be worth generating?
 *
 * For the two object fields the answer is per sub-key: a
 * `before_you_watch` holding only `who_is_it_for` still has two empty
 * cards, and those are worth filling.
 */
export function conversationFieldIsEmpty(
  field: ConversationField,
  existing: Partial<EpisodeEnrichment> | null | undefined,
): boolean {
  if (!existing) return true
  switch (field) {
    case "why_this_conversation":
      return isBlank(existing.why_this_conversation)
    case "central_question":
      return isBlank(existing.central_question)
    case "before_you_watch": {
      const b = existing.before_you_watch
      if (!b) return true
      return (
        isBlank(b.who_is_it_for) ||
        isBlank(b.who_is_it_not_for) ||
        isBlank(b.what_you_gain)
      )
    }
    case "conversation_map": {
      const m = existing.conversation_map
      if (!m) return true
      return (["beginning", "middle", "conclusion"] as const).some((k) => {
        const node = m[k]
        return !node || isBlank(node.title) || isBlank(node.description)
      })
    }
    case "unsaid_reflections":
      return !existing.unsaid_reflections || existing.unsaid_reflections.length === 0
  }
}

// ---------------------------------------------------------------------------
// Merge — the generated value may only ever land in a hole
// ---------------------------------------------------------------------------

function cleanString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined
}

/**
 * Build the patch to persist: existing human content wins on every leaf,
 * generated content fills the rest.
 *
 * A field is included in the patch ONLY if generation actually changed
 * something, so a no-op generation writes nothing at all.
 */
export function mergeConversationFields(
  existing: Partial<EpisodeEnrichment> | null | undefined,
  generated: ConversationModelOutput,
): { patch: ConversationPatch; filled: ConversationField[] } {
  const patch: ConversationPatch = {}
  const filled: ConversationField[] = []

  // --- plain strings -------------------------------------------------
  for (const key of ["why_this_conversation", "central_question"] as const) {
    const current = cleanString(existing?.[key])
    if (current) continue
    const next = cleanString(generated[key])
    if (next) {
      patch[key] = next
      filled.push(key)
    }
  }

  // --- before_you_watch: three independent cards ---------------------
  {
    const cur = existing?.before_you_watch
    const gen = generated.before_you_watch
    const keys = ["who_is_it_for", "who_is_it_not_for", "what_you_gain"] as const

    const merged: NonNullable<EpisodeEnrichment["before_you_watch"]> = {}
    let changed = false
    for (const k of keys) {
      const current = cleanString(cur?.[k])
      if (current) {
        merged[k] = current
        continue
      }
      const next = cleanString(gen?.[k])
      if (next) {
        merged[k] = next
        changed = true
      }
    }
    if (changed) {
      patch.before_you_watch = merged
      filled.push("before_you_watch")
    }
  }

  // --- conversation_map: three independent nodes ---------------------
  {
    const cur = existing?.conversation_map
    const gen = generated.conversation_map
    const merged: NonNullable<EpisodeEnrichment["conversation_map"]> = {}
    let changed = false

    for (const k of ["beginning", "middle", "conclusion"] as const) {
      const curNode = cur?.[k]
      const curTitle = cleanString(curNode?.title)
      const curDesc = cleanString(curNode?.description)
      if (curTitle && curDesc) {
        merged[k] = { title: curTitle, description: curDesc }
        continue
      }
      const genNode = gen?.[k]
      const title = curTitle ?? cleanString(genNode?.title)
      const description = curDesc ?? cleanString(genNode?.description)
      // The component renders BOTH lines unconditionally, so a half node
      // would print an empty paragraph. Keep only complete nodes.
      if (title && description) {
        merged[k] = { title, description }
        if (!curTitle || !curDesc) changed = true
      } else if (curTitle || curDesc) {
        // Pre-existing partial node — leave exactly as found.
        merged[k] = {
          title: curTitle ?? "",
          description: curDesc ?? "",
        }
      }
    }
    if (changed) {
      patch.conversation_map = merged
      filled.push("conversation_map")
    }
  }

  // --- unsaid_reflections: all-or-nothing ----------------------------
  {
    const cur = existing?.unsaid_reflections
    if (!cur || cur.length === 0) {
      const gen = Array.isArray(generated.unsaid_reflections)
        ? generated.unsaid_reflections.map(cleanString).filter((s): s is string => !!s)
        : []
      if (gen.length > 0) {
        patch.unsaid_reflections = gen
        filled.push("unsaid_reflections")
      }
    }
  }

  return { patch, filled }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export async function generateEpisodeConversation(input: {
  transcript: string
  videoTitle: string
  /** Current enrichment — drives BOTH what is asked for and what is kept. */
  existing?: Partial<EpisodeEnrichment> | null
  episodeIntelligence?: GlobalEpisodeIntelligence | null
  /** Force a subset. Default: every field that is currently empty. */
  only?: ConversationField[]
  dialect?: ConversationDialect
  eirContext?: { eirId?: string | null; subjectTable?: string | null; subjectId?: string | null }
}): Promise<GenerateConversationResult> {
  if (!env.OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  const candidates = input.only ?? CONVERSATION_FIELDS

  const request: ConversationFieldRequest = {}
  const skipped: ConversationField[] = []
  for (const field of CONVERSATION_FIELDS) {
    if (!candidates.includes(field)) continue
    if (conversationFieldIsEmpty(field, input.existing)) {
      request[field] = true
    } else {
      skipped.push(field)
    }
  }

  const requested = CONVERSATION_FIELDS.filter((f) => request[f])
  if (requested.length === 0) {
    // Nothing to do — and importantly, no AI call and no cost.
    return { success: true, patch: {}, filled: [], empty: [], skipped }
  }

  try {
    const transcriptText = await prepareTranscript(null as never, input.transcript)
    const intelligenceBlock = input.episodeIntelligence
      ? `\n\n${formatIntelligenceContext(input.episodeIntelligence)}`
      : ""

    const built = buildEpisodeConversationPrompt({
      videoTitle: input.videoTitle,
      transcriptText,
      intelligenceBlock,
      request,
      dialect: input.dialect,
    })

    const result = await runAiTask<ConversationModelOutput>({
      taskKind: "editorial",
      eirId: input.eirContext?.eirId ?? null,
      subjectTable: input.eirContext?.subjectTable ?? "episode_enrichments",
      subjectId: input.eirContext?.subjectId ?? null,
      promptVersion: EPISODE_CONVERSATION_PROMPT_VERSION,
      input: {
        videoTitle: input.videoTitle,
        requestedFields: requested,
        hasIntelligence: Boolean(input.episodeIntelligence),
      },
      prompt: [
        { role: "system", content: built.system },
        { role: "user", content: built.user },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.5 },
    })

    if (result.status !== "succeeded" || !result.parsed) {
      return {
        success: false,
        error: result.errorMessage || "حدث خطأ أثناء توليد أقسام الحوار",
        runId: result.runId,
      }
    }

    const { patch, filled } = mergeConversationFields(input.existing, result.parsed)

    return {
      success: true,
      patch,
      filled,
      empty: requested.filter((f) => !filled.includes(f)),
      skipped,
      runId: result.runId,
    }
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : "حدث خطأ أثناء توليد أقسام الحوار"
    return { success: false, error: msg }
  }
}
