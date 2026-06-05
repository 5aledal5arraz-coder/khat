/**
 * Interview Cards — CRUD operations.
 */

import { db } from "@/lib/db"
import { interviewCards, cardMaterials } from "@/lib/db/schema"
import { eq, and, asc, inArray } from "drizzle-orm"
import type {
  InterviewCard,
  InterviewCardWithMaterials,
  CardMaterial,
  CreateInterviewCardInput,
  UpdateInterviewCardInput,
  CreateCardMaterialInput,
} from "@/types/collaboration"

// ─── Cards ──────────────────────────────────────────────────────────

export async function getCardsByPreparation(preparationId: string): Promise<InterviewCardWithMaterials[]> {
  const cards = await db!
    .select()
    .from(interviewCards)
    .where(and(
      eq(interviewCards.preparation_id, preparationId),
      eq(interviewCards.is_deleted, false),
    ))
    .orderBy(asc(interviewCards.sort_order))

  if (cards.length === 0) return []

  const cardIds = cards.map((c) => c.id)
  const materials = await db!
    .select()
    .from(cardMaterials)
    .where(inArray(cardMaterials.card_id, cardIds))
    .orderBy(asc(cardMaterials.sort_order))

  const materialsByCard = new Map<string, CardMaterial[]>()
  for (const m of materials) {
    const list = materialsByCard.get(m.card_id) || []
    list.push(rowToMaterial(m))
    materialsByCard.set(m.card_id, list)
  }

  return cards.map((c) => ({
    ...rowToCard(c),
    materials: materialsByCard.get(c.id) || [],
  }))
}

export async function getCardById(id: string): Promise<InterviewCard | null> {
  const [row] = await db!
    .select()
    .from(interviewCards)
    .where(eq(interviewCards.id, id))
    .limit(1)
  return row ? rowToCard(row) : null
}

export async function createCard(input: CreateInterviewCardInput): Promise<InterviewCard> {
  const [row] = await db!
    .insert(interviewCards)
    .values({
      preparation_id: input.preparation_id,
      section_id: input.section_id,
      section_label: input.section_label,
      bucket: input.bucket,
      short_title: input.short_title,
      spoken_kuwaiti: input.spoken_kuwaiti,
      sort_order: input.sort_order ?? 0,
      source_question_id: input.source_question_id ?? null,
      formal_version: input.formal_version ?? null,
      shorter_version: input.shorter_version ?? null,
      deeper_version: input.deeper_version ?? null,
      softer_version: input.softer_version ?? null,
      entry_soft: input.entry_soft ?? null,
      entry_direct: input.entry_direct ?? null,
      entry_emotional: input.entry_emotional ?? null,
      entry_provocative: input.entry_provocative ?? null,
      transition_out: input.transition_out ?? null,
      follow_ups: input.follow_ups ?? [],
      why_this_matters: input.why_this_matters ?? null,
      when_to_ask: input.when_to_ask ?? null,
      how_to_ask: input.how_to_ask ?? null,
      emotional_tone: input.emotional_tone ?? null,
      if_guest_avoids: input.if_guest_avoids ?? null,
      if_guest_emotional: input.if_guest_emotional ?? null,
      if_answer_weak: input.if_answer_weak ?? null,
      sensitivity_note: input.sensitivity_note ?? null,
      clip_potential: input.clip_potential ?? false,
      quote_potential: input.quote_potential ?? false,
      emotional_peak: input.emotional_peak ?? false,
    })
    .returning()
  return rowToCard(row)
}

export async function updateCard(id: string, input: UpdateInterviewCardInput): Promise<InterviewCard | null> {
  const [row] = await db!
    .update(interviewCards)
    .set(input)
    .where(eq(interviewCards.id, id))
    .returning()
  return row ? rowToCard(row) : null
}

export async function softDeleteCard(id: string): Promise<boolean> {
  const [row] = await db!
    .update(interviewCards)
    .set({ is_deleted: true })
    .where(eq(interviewCards.id, id))
    .returning({ id: interviewCards.id })
  return !!row
}

export async function reorderCards(preparationId: string, orderedIds: string[]): Promise<void> {
  // Update sort_order for each card in one transaction
  await db!.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(interviewCards)
        .set({ sort_order: i })
        .where(and(
          eq(interviewCards.id, orderedIds[i]),
          eq(interviewCards.preparation_id, preparationId),
        ))
    }
  })
}

export async function bulkCreateCards(cards: CreateInterviewCardInput[]): Promise<InterviewCard[]> {
  if (cards.length === 0) return []
  const rows = await db!
    .insert(interviewCards)
    .values(
      cards.map((input, i) => ({
        preparation_id: input.preparation_id,
        section_id: input.section_id,
        section_label: input.section_label,
        bucket: input.bucket,
        short_title: input.short_title,
        spoken_kuwaiti: input.spoken_kuwaiti,
        sort_order: input.sort_order ?? i,
        source_question_id: input.source_question_id ?? null,
        formal_version: input.formal_version ?? null,
        shorter_version: input.shorter_version ?? null,
        deeper_version: input.deeper_version ?? null,
        softer_version: input.softer_version ?? null,
        entry_soft: input.entry_soft ?? null,
        entry_direct: input.entry_direct ?? null,
        entry_emotional: input.entry_emotional ?? null,
        entry_provocative: input.entry_provocative ?? null,
        transition_out: input.transition_out ?? null,
        follow_ups: input.follow_ups ?? [],
        why_this_matters: input.why_this_matters ?? null,
        when_to_ask: input.when_to_ask ?? null,
        how_to_ask: input.how_to_ask ?? null,
        emotional_tone: input.emotional_tone ?? null,
        if_guest_avoids: input.if_guest_avoids ?? null,
        if_guest_emotional: input.if_guest_emotional ?? null,
        if_answer_weak: input.if_answer_weak ?? null,
        sensitivity_note: input.sensitivity_note ?? null,
        clip_potential: input.clip_potential ?? false,
        quote_potential: input.quote_potential ?? false,
        emotional_peak: input.emotional_peak ?? false,
        ai_generated: true,
      }))
    )
    .returning()
  return rows.map(rowToCard)
}

// ─── Materials ──────────────────────────────────────────────────────

export async function getMaterialsByCard(cardId: string): Promise<CardMaterial[]> {
  const rows = await db!
    .select()
    .from(cardMaterials)
    .where(eq(cardMaterials.card_id, cardId))
    .orderBy(asc(cardMaterials.sort_order))
  return rows.map(rowToMaterial)
}

export async function createMaterial(
  input: CreateCardMaterialInput,
  options?: { ai_generated?: boolean },
): Promise<CardMaterial> {
  const [row] = await db!
    .insert(cardMaterials)
    .values({
      card_id: input.card_id,
      type: input.type,
      title: input.title,
      content: input.content,
      source_url: input.source_url ?? null,
      source_name: input.source_name ?? null,
      credibility: input.credibility ?? "unverified",
      sort_order: input.sort_order ?? 0,
      ai_generated: options?.ai_generated ?? true,
    })
    .returning()
  return rowToMaterial(row)
}

export async function updateMaterial(
  id: string,
  updates: { title?: string; content?: string },
): Promise<CardMaterial | null> {
  const [row] = await db!
    .update(cardMaterials)
    .set(updates)
    .where(eq(cardMaterials.id, id))
    .returning()
  return row ? rowToMaterial(row) : null
}

export async function deleteMaterial(id: string): Promise<boolean> {
  const [row] = await db!
    .delete(cardMaterials)
    .where(eq(cardMaterials.id, id))
    .returning({ id: cardMaterials.id })
  return !!row
}

export async function bulkCreateMaterials(materials: CreateCardMaterialInput[]): Promise<CardMaterial[]> {
  if (materials.length === 0) return []
  const rows = await db!
    .insert(cardMaterials)
    .values(
      materials.map((m, i) => ({
        card_id: m.card_id,
        type: m.type,
        title: m.title,
        content: m.content,
        source_url: m.source_url ?? null,
        source_name: m.source_name ?? null,
        credibility: m.credibility ?? "unverified",
        sort_order: m.sort_order ?? i,
      }))
    )
    .returning()
  return rows.map(rowToMaterial)
}

// ─── Row → Type helpers ─────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCard(row: any): InterviewCard {
  return {
    ...row,
    follow_ups: row.follow_ups ?? [],
    created_at: row.created_at?.toISOString?.() ?? row.created_at,
    updated_at: row.updated_at?.toISOString?.() ?? row.updated_at,
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToMaterial(row: any): CardMaterial {
  return {
    ...row,
    created_at: row.created_at?.toISOString?.() ?? row.created_at,
  }
}
