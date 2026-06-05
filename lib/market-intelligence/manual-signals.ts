/**
 * Phase 4 — Manual Signal creation mutation.
 *
 * Operator-authored signals enter the same downstream flow as ingested
 * signals (extraction skips them — they already have themes set;
 * clustering and the future scorer consume them via the standard
 * filters).
 *
 * Hard contract:
 *   • operator_created = true on every row
 *   • review_status = 'approved' by default (manual signals are
 *     intentional human editorial inputs — no auto-approval risk
 *     because the human's *creation act* IS the approval)
 *   • source = 'manual' (added to the CHECK vocab in Phase 4 migration)
 *   • external_id encodes the dedup key (URL or sha-of-title+summary)
 *   • audit row written with action='create', previous_status=null,
 *     new_status='approved'
 *
 * Dedup paths (in order):
 *   1. URL collision — when source_link is provided, external_id =
 *      canonicalized URL → the (source, external_id) unique index
 *      blocks duplicates.
 *   2. Title+summary collision — when no URL, external_id =
 *      "manual:" + sha256(normalized title + "\n" + normalized summary).
 *      Same unique index blocks duplicates.
 *   3. Trusted source + title collision — pre-checked explicitly
 *      because the title-hash path differs when summaries differ.
 */

import crypto from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  marketTopicSignals,
  MANUAL_SIGNAL_KINDS,
  type ManualSignalKind,
} from "@/lib/db/schema/market-intelligence"
import {
  marketSignalReviewEvents,
  SIGNAL_EDITORIAL_TAGS,
  type SignalEditorialTag,
} from "@/lib/db/schema/editorial-intelligence"
import { applyReviewEventLearning } from "./taste-learning"

export interface ManualSignalInput {
  title: string
  summary: string
  manual_kind: ManualSignalKind
  source_link?: string | null
  trusted_source_id?: string | null
  language?: string
  geography?: string | null
  theme?: string | null
  emotional_trigger?: string | null
  controversy_score?: number | null
  editorial_tags?: SignalEditorialTag[]
  operator_notes?: string | null
}

export interface MutationContext {
  actorId: string
}

export type ManualSignalError =
  | "actor_required"
  | "db_unavailable"
  | "title_required"
  | "summary_required"
  | "invalid_url"
  | "invalid_kind"
  | "invalid_range"
  | "invalid_tag"
  | "duplicate_signal"
  | "trusted_source_not_found"

export type ManualSignalResult =
  | {
      ok: true
      data: {
        signal_id: string
        event_id: string
        dedup_key: string
        external_id: string
      }
    }
  | { ok: false; error: ManualSignalError; message: string }

// ─── Normalization + hashing ─────────────────────────────────────────

function normalizeForHash(s: string): string {
  return s.trim().normalize("NFC").replace(/\s+/g, " ").toLowerCase()
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex")
}

function hashTitleSummary(title: string, summary: string): string {
  return sha256(
    `${normalizeForHash(title)}\n${normalizeForHash(summary)}`,
  ).slice(0, 32)
}

function canonicalizeUrl(u: string): string {
  try {
    const url = new URL(u.trim())
    url.hash = ""
    url.host = url.host.toLowerCase()
    let s = url.toString()
    // Strip a single trailing slash that isn't the path root.
    if (s.endsWith("/") && url.pathname !== "/") s = s.slice(0, -1)
    return s
  } catch {
    return u.trim()
  }
}

function looksLikeUrl(s: string): boolean {
  try {
    const u = new URL(s.trim())
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

// ─── Validation ──────────────────────────────────────────────────────

function validate(input: ManualSignalInput): ManualSignalError | null {
  if (!input.title?.trim()) return "title_required"
  if (!input.summary?.trim()) return "summary_required"
  if (!(MANUAL_SIGNAL_KINDS as readonly string[]).includes(input.manual_kind))
    return "invalid_kind"
  if (input.source_link && !looksLikeUrl(input.source_link))
    return "invalid_url"
  if (
    input.controversy_score !== undefined &&
    input.controversy_score !== null &&
    (!Number.isFinite(input.controversy_score) ||
      input.controversy_score < 0 ||
      input.controversy_score > 1)
  )
    return "invalid_range"
  if (input.editorial_tags && input.editorial_tags.length > 0) {
    for (const t of input.editorial_tags) {
      if (!(SIGNAL_EDITORIAL_TAGS as readonly string[]).includes(t))
        return "invalid_tag"
    }
  }
  return null
}

function err(error: ManualSignalError, message: string): ManualSignalResult {
  return { ok: false, error, message }
}

function errorMessage(e: ManualSignalError): string {
  switch (e) {
    case "actor_required":
      return "يلزم تسجيل دخول مشغّل."
    case "db_unavailable":
      return "قاعدة البيانات غير متاحة."
    case "title_required":
      return "العنوان مطلوب."
    case "summary_required":
      return "الملاحظة / الوصف مطلوب."
    case "invalid_url":
      return "الرابط غير صالح. استخدم http أو https."
    case "invalid_kind":
      return "نوع الإشارة غير معتمد."
    case "invalid_range":
      return "قيمة الإثارة يجب أن تكون بين 0 و 1."
    case "invalid_tag":
      return "أحد الوسوم خارج المفردات المعتمدة."
    case "duplicate_signal":
      return "هذه الإشارة مسجَّلة من قبل."
    case "trusted_source_not_found":
      return "المصدر الموثوق المختار غير موجود."
  }
}

// ─── Create ──────────────────────────────────────────────────────────

export async function createManualSignal(
  input: ManualSignalInput,
  ctx: MutationContext,
): Promise<ManualSignalResult> {
  if (!db) return err("db_unavailable", errorMessage("db_unavailable"))
  if (!ctx.actorId)
    return err("actor_required", errorMessage("actor_required"))
  const v = validate(input)
  if (v) return err(v, errorMessage(v))

  // Resolve dedup key + external_id.
  const cleanTitle = input.title.trim()
  const cleanSummary = input.summary.trim()
  const url = input.source_link?.trim() || null
  let external_id: string
  let dedup_key: string
  if (url) {
    const canonical = canonicalizeUrl(url)
    external_id = canonical.slice(0, 500)
    dedup_key = `url:${canonical}`
  } else {
    const h = hashTitleSummary(cleanTitle, cleanSummary)
    external_id = `manual:${h}`
    dedup_key = `hash:${h}`
  }

  // Path 3 — trusted_source + title pre-check (when summaries differ
  // so the hash path wouldn't trigger).
  if (input.trusted_source_id) {
    const existing = await db
      .select({ id: marketTopicSignals.id })
      .from(marketTopicSignals)
      .where(
        and(
          eq(marketTopicSignals.trusted_source_id, input.trusted_source_id),
          sql`lower(${marketTopicSignals.title}) = lower(${cleanTitle})`,
        ),
      )
      .limit(1)
    if (existing.length > 0)
      return err("duplicate_signal", errorMessage("duplicate_signal"))
  }

  try {
    return await db.transaction(async (tx) => {
      const [signal] = await tx
        .insert(marketTopicSignals)
        .values({
          source: "manual",
          external_id,
          title: cleanTitle,
          description: cleanSummary,
          language: input.language?.trim() || "ar",
          theme: input.theme?.trim() || null,
          emotional_trigger: input.emotional_trigger?.trim() || null,
          controversy_score:
            input.controversy_score === null ||
            input.controversy_score === undefined
              ? null
              : Math.max(0, Math.min(1, input.controversy_score)),
          raw: {
            manual_kind: input.manual_kind,
            source_link: url,
            geography: input.geography?.trim() || null,
            dedup_key,
            authored_by: ctx.actorId,
          },
          review_status: "approved",
          editorial_tags:
            input.editorial_tags && input.editorial_tags.length > 0
              ? Array.from(new Set(input.editorial_tags))
              : null,
          reviewed_by: ctx.actorId,
          reviewed_at: new Date(),
          operator_notes: input.operator_notes?.trim() || null,
          operator_created: true,
          trusted_source_id: input.trusted_source_id || null,
        })
        .returning({ id: marketTopicSignals.id })

      const [event] = await tx
        .insert(marketSignalReviewEvents)
        .values({
          signal_id: signal.id,
          actor_id: ctx.actorId,
          action: "create",
          previous_status: null,
          new_status: "approved",
          note: input.operator_notes?.trim() || null,
        })
        .returning({ id: marketSignalReviewEvents.id })

      return {
        ok: true as const,
        data: {
          signal_id: signal.id,
          event_id: event.id,
          dedup_key,
          external_id,
        },
      }
    }).then(async (r) => {
      if (r.ok) {
        // Best-effort soft learning. Manual signals carry slightly
        // stronger positive influence (action="create" delta = 0.07).
        await applyReviewEventLearning({
          action: "create",
          ctx: {
            theme: input.theme?.trim() || null,
            language: input.language?.trim() || "ar",
            trusted_source_id: input.trusted_source_id || null,
            operator_created: true,
          },
        })
      }
      return r
    })
  } catch (e) {
    // Drizzle wraps the underlying pg error in `cause`. Check both
    // surfaces so the trap fires regardless of which wrapper handed
    // us the error.
    const direct = e instanceof Error ? e.message : String(e)
    const cause =
      e instanceof Error && e.cause instanceof Error
        ? e.cause.message
        : ""
    const combined = `${direct}\n${cause}`
    if (/duplicate key value/i.test(combined))
      return err("duplicate_signal", errorMessage("duplicate_signal"))
    if (/foreign key|fk_market_signals_trusted_source/i.test(combined))
      return err(
        "trusted_source_not_found",
        errorMessage("trusted_source_not_found"),
      )
    throw e
  }
}

// Exported for the smoke + dev tooling.
export {
  hashTitleSummary,
  canonicalizeUrl,
  normalizeForHash,
  looksLikeUrl,
}
