/**
 * AI Interview Card Generation.
 *
 * Three functions:
 *   1. generateInterviewCards(prepId) — transform question_system → interview_cards rows
 *   2. enrichCard(cardId) — fill rich fields (spoken_kuwaiti, entry styles, guidance)
 *   3. populateCardMaterials(prepId) — extract supporting materials from research_data
 *
 * spoken_kuwaiti is the most important output. It must sound like natural,
 * warm, conversational Kuwaiti Arabic — not formal, not robotic, not stiff.
 */

// Phase 2.0 Batch 2 — both AI calls now route through runAiTask.
// Prompt bodies live in `lib/ai/prompts/interview-cards.ts`.
import { safeParseJSON } from "./client"
import { runAiTask } from "@/lib/ai-router"
import {
  CARD_ENRICHMENT_SYSTEM,
  CARD_ENRICHMENT_PROMPT_VERSION,
  buildCardEnrichmentUser,
  CARD_MATERIALS_SYSTEM,
  CARD_MATERIALS_PROMPT_VERSION,
  buildCardMaterialsUser,
} from "@/lib/ai/prompts/interview-cards"
import { db } from "@/lib/db"

/** Phase 2.0 Batch 2 — fallback actor id for legacy call sites. */
const LEGACY_ACTOR = "system:legacy-callsite"
import { episodePreparations, interviewCards, cardMaterials } from "@/lib/db/schema"
import { eq, and, inArray } from "drizzle-orm"
import {
  getCardsByPreparation,
  bulkCreateCards,
  updateCard,
  bulkCreateMaterials,
} from "@/lib/collaboration/cards"
import type {
  CreateInterviewCardInput,
  CreateCardMaterialInput,
  InterviewCardBucket,
  CardFollowUp,
} from "@/types/collaboration"
import type {
  PreparationQuestionSystem,
  PreparationResearch,
} from "@/types/preparation"

// ─── Text quality validation ────────────────────────────────────────

/**
 * Normalize whitespace in AI-generated Arabic text.
 * Fixes: multiple spaces, zero-width chars, stray newlines, leading/trailing space.
 */
function normalizeArabicText(text: string): string {
  return text
    // Remove zero-width characters (common AI artifact)
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, "")
    // Collapse multiple spaces/tabs into single space
    .replace(/[ \t]+/g, " ")
    // Collapse multiple newlines into single newline
    .replace(/\n{3,}/g, "\n\n")
    // Trim each line
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .trim()
}

/**
 * Detect obviously malformed Arabic text.
 * Returns reason string if broken, null if OK.
 */
function detectMalformedText(text: string): string | null {
  if (!text || text.trim().length === 0) return "empty"

  // Detect merged words: 3+ Arabic chars followed immediately by a digit
  // followed immediately by Arabic chars (e.g. "شركته3الثانية")
  if (/[\u0600-\u06FF]{2,}\d+[\u0600-\u06FF]{2,}/.test(text)) {
    return "merged_words_with_digits"
  }

  // Detect long runs of characters without any spaces (>60 chars = likely merged)
  if (/\S{60,}/.test(text)) {
    return "no_spaces_long_run"
  }

  // Detect obvious encoding garbage (high proportion of replacement chars)
  const replacementCount = (text.match(/\uFFFD/g) || []).length
  if (replacementCount > 2) {
    return "encoding_garbage"
  }

  // Detect text that's mostly non-Arabic/non-space (likely corruption)
  const arabicOrSpace = text.match(/[\u0600-\u06FF\s.,،؛:!؟?()"\-]/g) || []
  if (text.length > 10 && arabicOrSpace.length / text.length < 0.5) {
    return "low_arabic_ratio"
  }

  return null
}

/**
 * Attempt to repair common AI text artifacts.
 * Returns repaired text, or null if unrepairable.
 */
function repairText(text: string): string | null {
  let repaired = normalizeArabicText(text)

  // Try to fix merged digit-word patterns by adding spaces around digits
  // e.g. "شركته3الثانية" → "شركته 3 الثانية"
  repaired = repaired.replace(/([\u0600-\u06FF])(\d+)([\u0600-\u06FF])/g, "$1 $2 $3")

  // Re-check after repair
  const stillBroken = detectMalformedText(repaired)
  if (stillBroken) return null

  return repaired
}

interface MaterialValidationResult {
  valid: CreateCardMaterialInput[]
  skipped: Array<{ card_id: string; title: string; reason: string }>
}

/**
 * Validate and clean a batch of material candidates.
 * Returns valid items and logs of skipped ones.
 */
function validateMaterialBatch(
  candidates: CreateCardMaterialInput[],
): MaterialValidationResult {
  const valid: CreateCardMaterialInput[] = []
  const skipped: MaterialValidationResult["skipped"] = []

  for (const m of candidates) {
    // Normalize all text fields
    const title = normalizeArabicText(m.title)
    const content = normalizeArabicText(m.content)

    // Check title
    const titleIssue = detectMalformedText(title)
    if (titleIssue) {
      const repaired = repairText(m.title)
      if (repaired) {
        // Repaired — use it
        valid.push({ ...m, title: repaired, content })
        continue
      }
      skipped.push({ card_id: m.card_id, title: m.title.slice(0, 50), reason: `title: ${titleIssue}` })
      continue
    }

    // Check content
    const contentIssue = detectMalformedText(content)
    if (contentIssue) {
      const repaired = repairText(m.content)
      if (repaired) {
        valid.push({ ...m, title, content: repaired })
        continue
      }
      skipped.push({ card_id: m.card_id, title: title.slice(0, 50), reason: `content: ${contentIssue}` })
      continue
    }

    // All good
    valid.push({ ...m, title, content })
  }

  return { valid, skipped }
}

// ─── Helpers ────────────────────────────────────────────────────────

function getPrep(id: string) {
  return db!
    .select()
    .from(episodePreparations)
    .where(eq(episodePreparations.id, id))
    .limit(1)
    .then((rows) => rows[0] ?? null)
}

function prepToContext(prep: {
  title: string
  guest_name: string | null
  short_description: string | null
  episode_goal: string | null
  tone_type: string | null
  depth_level: number
  boldness_level: number
}): string {
  const lines = [
    `الحلقة: ${prep.title}`,
    prep.guest_name ? `الضيف: ${prep.guest_name}` : null,
    prep.short_description ? `الوصف: ${prep.short_description}` : null,
    prep.episode_goal ? `الهدف: ${prep.episode_goal}` : null,
    prep.tone_type ? `النبرة: ${prep.tone_type}` : null,
    `العمق: ${prep.depth_level}/5 | الجرأة: ${prep.boldness_level}/5`,
  ]
  return lines.filter(Boolean).join("\n")
}

// ═══════════════════════════════════════════════════════════════════
// 1. generateInterviewCards — question_system → interview_cards rows
// ═══════════════════════════════════════════════════════════════════

export interface GenerateCardsResult {
  cards_created: number
  cards_existing: number
  skipped_reason?: string
}

/**
 * Transform preparation's question_system into interview_cards DB rows.
 *
 * Duplication protection:
 * - If cards already exist for this prep, returns early with count.
 * - To regenerate, caller must pass `force: true` which soft-deletes
 *   existing cards first.
 */
export async function generateInterviewCards(
  prepId: string,
  options: { force?: boolean } = {},
): Promise<GenerateCardsResult> {
  const prep = await getPrep(prepId)
  if (!prep) throw new Error("التحضير غير موجود")

  const qs = prep.question_system as PreparationQuestionSystem | null
  if (!qs?.sections?.length) {
    throw new Error("يجب توليد نظام الأسئلة أولاً قبل إنشاء البطاقات")
  }

  // Check for existing cards
  const existing = await getCardsByPreparation(prepId)
  if (existing.length > 0 && !options.force) {
    return {
      cards_created: 0,
      cards_existing: existing.length,
      skipped_reason: "بطاقات موجودة بالفعل — استخدم force لإعادة التوليد",
    }
  }

  // If force-regenerating, soft-delete existing cards
  if (existing.length > 0 && options.force) {
    await db!
      .update(interviewCards)
      .set({ is_deleted: true })
      .where(and(
        eq(interviewCards.preparation_id, prepId),
        eq(interviewCards.is_deleted, false),
      ))
  }

  // Transform question_system sections → card inputs
  const inputs: CreateInterviewCardInput[] = []
  let globalOrder = 0

  for (const section of qs.sections) {
    for (const q of section.questions) {
      inputs.push({
        preparation_id: prepId,
        section_id: section.section_id,
        section_label: section.section_label,
        bucket: mapBucket(q.bucket),
        short_title: q.text.slice(0, 80),
        spoken_kuwaiti: q.text, // Initial: raw text. Enrichment replaces this.
        source_question_id: q.id,
        sort_order: globalOrder++,
        // Follow-ups from question_system
        follow_ups: (q.follow_ups || []).map((f, i) => ({
          id: `fu-${q.id}-${i}`,
          text: f,
        })),
        // Map intent and support to guidance fields
        why_this_matters: q.support?.context || q.intent || undefined,
        if_guest_avoids: q.support?.follow_up_angles?.join(" | ") || undefined,
        // Content potential flags from bucket type
        clip_potential: q.bucket === "surprise" || q.bucket === "escalation",
        quote_potential: q.bucket === "deep" || q.bucket === "escalation",
        emotional_peak: q.bucket === "escalation" || q.bucket === "surprise",
      })
    }
  }

  const created = await bulkCreateCards(inputs)

  // Update cards_generated_at
  await db!
    .update(episodePreparations)
    .set({ cards_generated_at: new Date() })
    .where(eq(episodePreparations.id, prepId))

  return { cards_created: created.length, cards_existing: 0 }
}

function mapBucket(bucket: string): InterviewCardBucket {
  const valid: InterviewCardBucket[] = ["opening", "deep", "escalation", "surprise", "backup", "recovery"]
  return valid.includes(bucket as InterviewCardBucket)
    ? (bucket as InterviewCardBucket)
    : "deep"
}

// ═══════════════════════════════════════════════════════════════════
// 2. enrichCard / enrichAllCards — fill rich Kuwaiti + guidance fields
// ═══════════════════════════════════════════════════════════════════

interface EnrichedCardFields {
  spoken_kuwaiti: string
  formal_version: string
  shorter_version: string
  deeper_version: string
  softer_version: string
  entry_soft: string
  entry_direct: string
  entry_emotional: string
  entry_provocative: string
  transition_out: string
  follow_ups: CardFollowUp[]
  emotional_tone: string
  when_to_ask: string
  how_to_ask: string
  if_guest_avoids: string
  if_guest_emotional: string
  if_answer_weak: string
  sensitivity_note: string | null
}

/**
 * Enrich a single card with full Kuwaiti phrasing and host guidance.
 *
 * Phase 2.0 Batch 2 — routed via the AI Router with extracted builder.
 */
export async function enrichCard(
  cardId: string,
  prepContext: string,
  options?: { actorId?: string | null; eirId?: string | null },
): Promise<EnrichedCardFields> {
  // Fetch the card
  const [card] = await db!
    .select()
    .from(interviewCards)
    .where(eq(interviewCards.id, cardId))
    .limit(1)

  if (!card) throw new Error("البطاقة غير موجودة")

  const userPrompt = buildCardEnrichmentUser({
    prepContext,
    sectionLabel: card.section_label,
    bucket: card.bucket,
    shortTitle: card.short_title,
    spokenKuwaitiOriginal: card.spoken_kuwaiti,
    whyThisMatters: card.why_this_matters,
    ifGuestAvoids: card.if_guest_avoids,
  })

  const res = await runAiTask<EnrichedCardFields>({
    taskKind: "editorial",
    eirId: options?.eirId ?? null,
    subjectTable: "interview_cards",
    subjectId: cardId,
    actorId: options?.actorId ?? LEGACY_ACTOR,
    promptVersion: CARD_ENRICHMENT_PROMPT_VERSION,
    input: { cardId, section: card.section_label, bucket: card.bucket },
    prompt: [
      { role: "system", content: CARD_ENRICHMENT_SYSTEM },
      { role: "user", content: userPrompt },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.7 },
  })

  if (res.status !== "succeeded") {
    throw new Error(res.errorMessage || "enrich_card generation failed")
  }
  const content = res.rawText || ""
  const parsed = safeParseJSON<EnrichedCardFields>(content, "enrich_card")
  if (!parsed.success) throw new Error(parsed.error)

  // Validate spoken_kuwaiti quality
  const sk = parsed.data.spoken_kuwaiti
  if (!sk || sk.length < 30) {
    throw new Error("spoken_kuwaiti قصير جداً — يجب أن يكون سؤالاً كاملاً وطبيعياً")
  }

  // Save enriched fields to DB
  await updateCard(cardId, {
    spoken_kuwaiti: parsed.data.spoken_kuwaiti,
    formal_version: parsed.data.formal_version,
    shorter_version: parsed.data.shorter_version,
    deeper_version: parsed.data.deeper_version,
    softer_version: parsed.data.softer_version,
    entry_soft: parsed.data.entry_soft,
    entry_direct: parsed.data.entry_direct,
    entry_emotional: parsed.data.entry_emotional,
    entry_provocative: parsed.data.entry_provocative,
    transition_out: parsed.data.transition_out,
    follow_ups: parsed.data.follow_ups || [],
    emotional_tone: parsed.data.emotional_tone,
    when_to_ask: parsed.data.when_to_ask,
    how_to_ask: parsed.data.how_to_ask,
    if_guest_avoids: parsed.data.if_guest_avoids,
    if_guest_emotional: parsed.data.if_guest_emotional,
    if_answer_weak: parsed.data.if_answer_weak,
    sensitivity_note: parsed.data.sensitivity_note,
  })

  return parsed.data
}

/**
 * Enrich a single card by prepId + cardId (convenience wrapper).
 * Builds context from the preparation, then delegates to enrichCard().
 */
export async function enrichSingleCard(prepId: string, cardId: string): Promise<EnrichedCardFields> {
  const prep = await getPrep(prepId)
  if (!prep) throw new Error("التحضير غير موجود")
  const context = prepToContext(prep as unknown as Parameters<typeof prepToContext>[0])
  return enrichCard(cardId, context)
}

/**
 * Enrich all cards for a preparation. Processes sequentially to
 * respect rate limits and allow partial progress.
 */
export async function enrichAllCards(
  prepId: string,
  onProgress?: (done: number, total: number) => void,
): Promise<{ enriched: number; errors: Array<{ cardId: string; error: string }> }> {
  const prep = await getPrep(prepId)
  if (!prep) throw new Error("التحضير غير موجود")

  const context = prepToContext(prep as unknown as Parameters<typeof prepToContext>[0])
  const cards = await getCardsByPreparation(prepId)
  const errors: Array<{ cardId: string; error: string }> = []
  let enriched = 0

  for (let i = 0; i < cards.length; i++) {
    try {
      await enrichCard(cards[i].id, context)
      enriched++
    } catch (err) {
      errors.push({
        cardId: cards[i].id,
        error: err instanceof Error ? err.message : "فشل الإثراء",
      })
    }
    onProgress?.(i + 1, cards.length)
  }

  return { enriched, errors }
}

// ═══════════════════════════════════════════════════════════════════
// 3. populateCardMaterials — extract supporting materials from research
// ═══════════════════════════════════════════════════════════════════

interface MaterialsOutput {
  materials: Array<{
    card_id: string
    items: Array<{
      type: string
      title: string
      content: string
      source_url?: string
      source_name?: string
      credibility: string
    }>
  }>
}

/**
 * Populate supporting materials for all cards in a preparation,
 * extracted from research_data. Quality over quantity.
 */
export async function populateCardMaterials(
  prepId: string,
): Promise<{ materials_created: number; skipped: number }> {
  const prep = await getPrep(prepId)
  if (!prep) throw new Error("التحضير غير موجود")

  const research = prep.research_data as PreparationResearch | null
  if (!research?.claims?.length && !research?.quotes?.length) {
    return { materials_created: 0, skipped: 0 }
  }

  const cards = await getCardsByPreparation(prepId)
  if (cards.length === 0) return { materials_created: 0, skipped: 0 }

  // Build research summary for the AI
  const researchBlock = buildResearchBlock(research)

  // Build card summaries
  const cardBlock = cards.map((c) =>
    `[${c.id}] ${c.section_label} / ${c.bucket} — "${c.short_title}"`
  ).join("\n")

  // Phase 2.0 Batch 2 — routed via the AI Router.
  const res = await runAiTask<MaterialsOutput>({
    taskKind: "editorial",
    eirId: null,
    subjectTable: "episode_preparations",
    subjectId: prepId,
    actorId: LEGACY_ACTOR,
    promptVersion: CARD_MATERIALS_PROMPT_VERSION,
    input: { prepId, cardCount: cards.length },
    prompt: [
      { role: "system", content: CARD_MATERIALS_SYSTEM },
      { role: "user", content: buildCardMaterialsUser(researchBlock, cardBlock) },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.3 },
  })

  if (res.status !== "succeeded") {
    throw new Error(res.errorMessage || "card_materials generation failed")
  }
  const content = res.rawText || ""
  const parsed = safeParseJSON<MaterialsOutput>(content, "card_materials")
  if (!parsed.success) throw new Error(parsed.error)

  // Flatten AI output into material candidates
  const rawInputs: CreateCardMaterialInput[] = []
  const validCardIds = new Set(cards.map((c) => c.id))

  for (const group of parsed.data.materials || []) {
    if (!validCardIds.has(group.card_id)) continue
    for (let i = 0; i < (group.items || []).length; i++) {
      const item = group.items[i]
      rawInputs.push({
        card_id: group.card_id,
        type: item.type as CreateCardMaterialInput["type"],
        title: item.title,
        content: item.content,
        source_url: item.source_url || undefined,
        source_name: item.source_name || undefined,
        credibility: item.credibility as CreateCardMaterialInput["credibility"],
        sort_order: i,
      })
    }
  }

  // Validate and clean text quality
  const { valid: allInputs, skipped } = validateMaterialBatch(rawInputs)

  if (skipped.length > 0) {
    console.warn(
      `[interview-cards] populateCardMaterials: skipped ${skipped.length} malformed materials:`,
      skipped,
    )
  }

  // Delete existing AI-generated materials (preserve manually added ones)
  const cardIds = cards.map((c) => c.id)
  await db!
    .delete(cardMaterials)
    .where(
      and(
        inArray(cardMaterials.card_id, cardIds),
        eq(cardMaterials.ai_generated, true),
      ),
    )

  if (allInputs.length > 0) {
    await bulkCreateMaterials(allInputs)
  }

  return { materials_created: allInputs.length, skipped: skipped.length }
}

function buildResearchBlock(research: PreparationResearch): string {
  const lines: string[] = []

  // Sources
  if (research.sources.length > 0) {
    lines.push("المصادر:")
    for (const s of research.sources) {
      lines.push(`  [#${s.id}] ${s.title} — ${s.provider}${s.publisher ? ` (${s.publisher})` : ""} ${s.url}`)
    }
    lines.push("")
  }

  // Claims
  if (research.claims.length > 0) {
    lines.push("الادعاءات الموثّقة:")
    for (const c of research.claims) {
      const status = c.status === "weak" ? " [ضعيف]" : c.status === "verified" ? " [موثّق]" : ""
      const sources = c.source_ids.map((id) => `#${id}`).join(", ")
      lines.push(`  - ${c.claim}${status} [${sources}] (${c.category})`)
    }
    lines.push("")
  }

  // Quotes
  if (research.quotes.length > 0) {
    lines.push("اقتباسات:")
    for (const q of research.quotes) {
      lines.push(`  - "${q.text}" — ${q.attributed_to}`)
    }
    lines.push("")
  }

  // Past interviews
  if (research.past_interviews.length > 0) {
    lines.push("ظهورات سابقة:")
    for (const i of research.past_interviews) {
      lines.push(`  - ${i.title}${i.publisher ? ` (${i.publisher})` : ""}${i.note ? ` — ${i.note}` : ""}`)
    }
  }

  return lines.join("\n")
}
