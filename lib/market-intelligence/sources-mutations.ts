/**
 * Phase 3 — Trusted Sources mutation layer.
 *
 * Validation lives here so server actions can stay thin:
 *   • display_name non-empty
 *   • identifier non-empty + URL-shaped when type ∈ {youtube,podcast,website,rss}
 *   • trust_score / editorial_alignment_score clamped to [0,1]
 *   • (source_type, identifier) duplicate pre-checked + DB unique index catches races
 *
 * Phase 3 contract: NO scoring or pipeline behavior change. We write to
 * market_trusted_sources only — no signal_score recompute, no taste
 * weight updates. Phase 5 will wire these into the scorer.
 */

import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  marketTrustedSources,
  TRUSTED_SOURCE_TYPES,
  type TrustedSourceType,
} from "@/lib/db/schema/editorial-intelligence"

export interface MutationContext {
  actorId: string
}

export interface CreateSourceInput {
  source_type: TrustedSourceType
  identifier: string
  display_name: string
  language?: string
  geography?: string | null
  trust_score?: number
  editorial_alignment_score?: number
  active?: boolean
  notes?: string | null
}

export interface UpdateSourceInput {
  id: string
  source_type?: TrustedSourceType
  identifier?: string
  display_name?: string
  language?: string
  geography?: string | null
  trust_score?: number
  editorial_alignment_score?: number
  notes?: string | null
}

export type MutationResult<T = { id: string }> =
  | { ok: true; data: T }
  | { ok: false; error: MutationError; message: string }

export type MutationError =
  | "actor_required"
  | "db_unavailable"
  | "invalid_type"
  | "invalid_identifier"
  | "invalid_url"
  | "invalid_score_range"
  | "display_name_required"
  | "duplicate_identifier"
  | "source_not_found"

const URL_REQUIRED_TYPES = new Set<TrustedSourceType>([
  "youtube",
  "podcast",
  "website",
  "rss",
])

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

function looksLikeUrl(s: string): boolean {
  try {
    const u = new URL(s.trim())
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function err(error: MutationError, message: string): MutationResult {
  return { ok: false, error, message }
}

function validateCreate(input: CreateSourceInput): MutationError | null {
  if (!input.display_name?.trim()) return "display_name_required"
  if (!(TRUSTED_SOURCE_TYPES as readonly string[]).includes(input.source_type))
    return "invalid_type"
  if (!input.identifier?.trim()) return "invalid_identifier"
  if (URL_REQUIRED_TYPES.has(input.source_type) && !looksLikeUrl(input.identifier))
    return "invalid_url"
  if (
    input.trust_score !== undefined &&
    (!Number.isFinite(input.trust_score) ||
      input.trust_score < 0 ||
      input.trust_score > 1)
  )
    return "invalid_score_range"
  if (
    input.editorial_alignment_score !== undefined &&
    (!Number.isFinite(input.editorial_alignment_score) ||
      input.editorial_alignment_score < 0 ||
      input.editorial_alignment_score > 1)
  )
    return "invalid_score_range"
  return null
}

function validateUpdate(input: UpdateSourceInput): MutationError | null {
  if (input.display_name !== undefined && !input.display_name.trim())
    return "display_name_required"
  if (input.source_type !== undefined &&
    !(TRUSTED_SOURCE_TYPES as readonly string[]).includes(input.source_type))
    return "invalid_type"
  if (input.identifier !== undefined && !input.identifier.trim())
    return "invalid_identifier"
  if (
    input.source_type &&
    input.identifier &&
    URL_REQUIRED_TYPES.has(input.source_type) &&
    !looksLikeUrl(input.identifier)
  )
    return "invalid_url"
  for (const v of [input.trust_score, input.editorial_alignment_score]) {
    if (v !== undefined && (!Number.isFinite(v) || v < 0 || v > 1))
      return "invalid_score_range"
  }
  return null
}

// ─── create ──────────────────────────────────────────────────────────

export async function createTrustedSource(
  input: CreateSourceInput,
  ctx: MutationContext,
): Promise<MutationResult> {
  if (!db) return err("db_unavailable", "قاعدة البيانات غير متاحة.")
  if (!ctx.actorId) return err("actor_required", "يلزم تسجيل دخول مشغّل.")
  const validation = validateCreate(input)
  if (validation) return err(validation, errorMessage(validation))

  // Pre-check duplicate. The unique index still guards against races.
  const existing = await db
    .select({ id: marketTrustedSources.id })
    .from(marketTrustedSources)
    .where(
      and(
        eq(marketTrustedSources.source_type, input.source_type),
        eq(marketTrustedSources.identifier, input.identifier.trim()),
      ),
    )
    .limit(1)
  if (existing.length > 0)
    return err("duplicate_identifier", errorMessage("duplicate_identifier"))

  try {
    const [row] = await db
      .insert(marketTrustedSources)
      .values({
        source_type: input.source_type,
        identifier: input.identifier.trim(),
        display_name: input.display_name.trim(),
        language: input.language?.trim() || "ar",
        geography: input.geography?.trim() || null,
        trust_score: clamp01(input.trust_score ?? 0.5),
        editorial_alignment_score: clamp01(
          input.editorial_alignment_score ?? 0.5,
        ),
        active: input.active ?? true,
        notes: input.notes?.trim() || null,
        created_by: ctx.actorId,
      })
      .returning({ id: marketTrustedSources.id })
    return { ok: true, data: { id: row.id } }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (/duplicate key value/.test(message))
      return err("duplicate_identifier", errorMessage("duplicate_identifier"))
    throw e
  }
}

// ─── update ──────────────────────────────────────────────────────────

export async function updateTrustedSource(
  input: UpdateSourceInput,
  ctx: MutationContext,
): Promise<MutationResult> {
  if (!db) return err("db_unavailable", "قاعدة البيانات غير متاحة.")
  if (!ctx.actorId) return err("actor_required", "يلزم تسجيل دخول مشغّل.")
  const validation = validateUpdate(input)
  if (validation) return err(validation, errorMessage(validation))

  const [current] = await db
    .select()
    .from(marketTrustedSources)
    .where(eq(marketTrustedSources.id, input.id))
    .limit(1)
  if (!current) return err("source_not_found", errorMessage("source_not_found"))

  // Dup check when identifier or type changes.
  if (
    (input.identifier !== undefined && input.identifier !== current.identifier) ||
    (input.source_type !== undefined && input.source_type !== current.source_type)
  ) {
    const nextType = input.source_type ?? current.source_type
    const nextIdentifier = (input.identifier ?? current.identifier).trim()
    const existing = await db
      .select({ id: marketTrustedSources.id })
      .from(marketTrustedSources)
      .where(
        and(
          eq(marketTrustedSources.source_type, nextType),
          eq(marketTrustedSources.identifier, nextIdentifier),
        ),
      )
      .limit(1)
    if (existing.length > 0 && existing[0].id !== input.id)
      return err("duplicate_identifier", errorMessage("duplicate_identifier"))
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date(),
  }
  if (input.source_type !== undefined) patch.source_type = input.source_type
  if (input.identifier !== undefined) patch.identifier = input.identifier.trim()
  if (input.display_name !== undefined)
    patch.display_name = input.display_name.trim()
  if (input.language !== undefined)
    patch.language = input.language.trim() || "ar"
  if (input.geography !== undefined)
    patch.geography = input.geography?.trim() || null
  if (input.trust_score !== undefined)
    patch.trust_score = clamp01(input.trust_score)
  if (input.editorial_alignment_score !== undefined)
    patch.editorial_alignment_score = clamp01(input.editorial_alignment_score)
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null

  try {
    await db
      .update(marketTrustedSources)
      .set(patch)
      .where(eq(marketTrustedSources.id, input.id))
    return { ok: true, data: { id: input.id } }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (/duplicate key value/.test(message))
      return err("duplicate_identifier", errorMessage("duplicate_identifier"))
    throw e
  }
}

// ─── state toggles ───────────────────────────────────────────────────

export async function setSourceActive(
  id: string,
  active: boolean,
  ctx: MutationContext,
): Promise<MutationResult> {
  if (!db) return err("db_unavailable", "قاعدة البيانات غير متاحة.")
  if (!ctx.actorId) return err("actor_required", "يلزم تسجيل دخول مشغّل.")
  const r = await db
    .update(marketTrustedSources)
    .set({ active, updated_at: new Date() })
    .where(eq(marketTrustedSources.id, id))
    .returning({ id: marketTrustedSources.id })
  if (r.length === 0)
    return err("source_not_found", errorMessage("source_not_found"))
  return { ok: true, data: { id } }
}

export async function archiveSource(
  id: string,
  ctx: MutationContext,
): Promise<MutationResult> {
  if (!db) return err("db_unavailable", "قاعدة البيانات غير متاحة.")
  if (!ctx.actorId) return err("actor_required", "يلزم تسجيل دخول مشغّل.")
  const r = await db
    .update(marketTrustedSources)
    .set({ archived_at: new Date(), active: false, updated_at: new Date() })
    .where(eq(marketTrustedSources.id, id))
    .returning({ id: marketTrustedSources.id })
  if (r.length === 0)
    return err("source_not_found", errorMessage("source_not_found"))
  return { ok: true, data: { id } }
}

export async function restoreSource(
  id: string,
  ctx: MutationContext,
): Promise<MutationResult> {
  if (!db) return err("db_unavailable", "قاعدة البيانات غير متاحة.")
  if (!ctx.actorId) return err("actor_required", "يلزم تسجيل دخول مشغّل.")
  const r = await db
    .update(marketTrustedSources)
    .set({ archived_at: null, active: true, updated_at: new Date() })
    .where(eq(marketTrustedSources.id, id))
    .returning({ id: marketTrustedSources.id })
  if (r.length === 0)
    return err("source_not_found", errorMessage("source_not_found"))
  return { ok: true, data: { id } }
}

// ─── adjust scores (sliders) ─────────────────────────────────────────

export function adjustTrustScore(
  id: string,
  score: number,
  ctx: MutationContext,
): Promise<MutationResult> {
  return updateTrustedSource({ id, trust_score: score }, ctx)
}

export function adjustAlignmentScore(
  id: string,
  score: number,
  ctx: MutationContext,
): Promise<MutationResult> {
  return updateTrustedSource(
    { id, editorial_alignment_score: score },
    ctx,
  )
}

// ─── notes ───────────────────────────────────────────────────────────

export function setSourceNotes(
  id: string,
  notes: string,
  ctx: MutationContext,
): Promise<MutationResult> {
  return updateTrustedSource({ id, notes }, ctx)
}

// Suppress unused import — sql is reserved for future raw queries.
void sql

// ─── operator-language error map ─────────────────────────────────────

function errorMessage(e: MutationError): string {
  switch (e) {
    case "actor_required":
      return "يلزم تسجيل دخول مشغّل."
    case "db_unavailable":
      return "قاعدة البيانات غير متاحة حالياً."
    case "invalid_type":
      return "نوع المصدر غير معتمد."
    case "invalid_identifier":
      return "حقل المعرّف فارغ."
    case "invalid_url":
      return "الرابط غير صالح. استخدم http أو https."
    case "invalid_score_range":
      return "قيمة الدرجة يجب أن تكون بين 0 و 1."
    case "display_name_required":
      return "اسم المصدر مطلوب."
    case "duplicate_identifier":
      return "هذا المصدر مسجَّل من قبل بنفس النوع والمعرّف."
    case "source_not_found":
      return "المصدر غير موجود."
  }
}
