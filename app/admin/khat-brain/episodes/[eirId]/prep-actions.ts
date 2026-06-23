"use server"

/**
 * UX-5.1 — Inline-edit server actions for prep_v2.
 *
 * Operates on `episode_preparations.prep_v2` (a JSONB column). Each
 * action is a partial merge — it touches only the field the operator
 * edits, leaving the rest of the payload (and provenance metadata like
 * `generator_version` / `ai_run_ids`) untouched.
 *
 * No new pipeline, no new validation: the existing shape contract in
 * `lib/preparation/v2/types.ts` is preserved. Arrays are normalized
 * line-by-line; structured fields (questions) preserve their metadata
 * when count/order matches.
 */

import { revalidatePath } from "next/cache"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { requireAdmin, getAdminAuthUser } from "@/lib/api-utils"
import {
  validateJsonbWrite,
  prepV2Schema,
  PREP_V2_TABLE,
  PREP_V2_COLUMN,
} from "@/lib/db/validators"
import {
  setInsightStatus,
  editInsight,
  removeInsight,
  addManualInsight,
  bulkApproveVerified,
  type InsightEditPatch,
  type ManualInsightInput,
  type ReviewStamp,
} from "@/lib/preparation/v2/insight-review"
import type {
  InsightLiveStatus,
  PrepV2Payload,
  PrepV2Question,
  SectionKind,
} from "@/lib/preparation/v2/types"

export interface PrepEditField {
  /** Field key the operator edited. */
  field:
    | "thesis"
    | "axes_of_tension"
    | "sensitive_zones"
    | "host_guidance.overall_tone"
    | "host_guidance.do_list"
    | "host_guidance.dont_list"
    | "director_guidance.shot_priorities"
    | "opening_options.0.text"
    | "must_ask_questions"
  /** Raw textarea value as the operator typed it. */
  value: string
}

export interface PrepEditResult {
  ok: boolean
  message: string
}

export async function updatePrepFieldAction(
  prepId: string,
  edit: PrepEditField,
): Promise<PrepEditResult> {
  await requireAdmin()
  const lines = parseLines(edit.value)
  let supported = true

  const r = await mutatePrepV2(prepId, (current) => {
    const next: PrepV2Payload = JSON.parse(JSON.stringify(current))
    switch (edit.field) {
      case "thesis":
        next.thesis = edit.value.trim()
        break
      case "axes_of_tension":
        // axes_of_tension is contractually 6, but inline editing can drift
        // outside that — we accept whatever the operator types and trust
        // the next regen pass (or the validator on next pipeline run) to
        // re-establish the canonical shape.
        next.axes_of_tension = lines
        break
      case "sensitive_zones":
        next.sensitive_zones = lines
        break
      case "host_guidance.overall_tone":
        next.host_guidance.overall_tone = edit.value.trim()
        break
      case "host_guidance.do_list":
        next.host_guidance.do_list = lines
        break
      case "host_guidance.dont_list":
        next.host_guidance.dont_list = lines
        break
      case "director_guidance.shot_priorities":
        next.director_guidance.shot_priorities = lines
        break
      case "opening_options.0.text":
        if (next.opening_options.length === 0) {
          next.opening_options = [{ approach: "default", text: edit.value.trim() }]
        } else {
          next.opening_options[0].text = edit.value.trim()
        }
        break
      case "must_ask_questions":
        next.question_bank = mergeMustAskQuestions(next.question_bank, lines)
        break
      default:
        supported = false
    }
    return { next, changed: supported }
  })

  if (!supported) return { ok: false, message: "حقل غير مدعوم." }
  if (!r.ok) return { ok: false, message: r.message }
  revalidateEir(r.eirId)
  return { ok: true, message: "تم حفظ التعديل." }
}

// ─── Locked prep_v2 read-modify-write ────────────────────────────────
//
// Every prep_v2 mutation (inline-edit AND insight review) goes through this
// helper so concurrent writers serialize instead of clobbering each other.
// The row is SELECT … FOR UPDATE inside a transaction, so a second writer
// blocks until the first commits — closing the last-writer-wins race where,
// e.g., approving an insight could silently revert a concurrent thesis edit.
// `fn` receives the current payload and returns the next one + whether it
// changed; an unchanged result skips the write. JSONB is validated (same guard
// the pipeline uses) before persist. revalidatePath is the caller's job, after
// the transaction commits.

type MutateResult =
  | { ok: true; eirId: string | null; changed: boolean }
  | { ok: false; message: string }

async function mutatePrepV2(
  prepId: string,
  fn: (current: PrepV2Payload) => { next: PrepV2Payload; changed: boolean },
): Promise<MutateResult> {
  if (!db) return { ok: false, message: "قاعدة البيانات غير متوفرة." }
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: episodePreparations.id,
        eir_id: episodePreparations.eir_id,
        prep_v2: episodePreparations.prep_v2,
      })
      .from(episodePreparations)
      .where(eq(episodePreparations.id, prepId))
      .for("update")
      .limit(1)
    if (!row) return { ok: false as const, message: "سجلّ الإعداد غير موجود." }
    const current = row.prep_v2 as PrepV2Payload | null
    if (!current) {
      return {
        ok: false as const,
        message: "لا توجد بنية Prep V2 — استخدم «إعادة توليد الإعداد» أولاً.",
      }
    }

    const { next, changed } = fn(current)
    if (!changed) return { ok: true as const, eirId: row.eir_id ?? null, changed: false }

    // Same JSONB guard the pipeline uses on persist (report/enforce per env).
    validateJsonbWrite(
      { table: PREP_V2_TABLE, column: PREP_V2_COLUMN, rowId: prepId },
      next,
      prepV2Schema,
    )
    await tx
      .update(episodePreparations)
      .set({
        prep_v2: next as unknown as Record<string, unknown>,
        updated_at: new Date(),
      })
      .where(eq(episodePreparations.id, prepId))
    return { ok: true as const, eirId: row.eir_id ?? null, changed: true }
  })
}

function revalidateEir(eirId: string | null) {
  if (eirId) revalidatePath(`/admin/khat-brain/episodes/${eirId}`)
}

// ─── Insight review-gate actions ─────────────────────────────────────

async function reviewStamp(): Promise<ReviewStamp> {
  const user = await getAdminAuthUser()
  return { reviewer: user?.email ?? null, at: new Date().toISOString() }
}

export async function setInsightStatusAction(
  prepId: string,
  questionId: string,
  insightId: string,
  status: InsightLiveStatus,
): Promise<PrepEditResult> {
  await requireAdmin()
  const stamp = await reviewStamp()
  const r = await mutatePrepV2(prepId, (cur) => {
    const { bank, changed } = setInsightStatus(cur.question_bank, questionId, insightId, status, stamp)
    return { next: { ...cur, question_bank: bank }, changed }
  })
  if (!r.ok) return { ok: false, message: r.message }
  if (!r.changed) return { ok: false, message: "لم يتم العثور على البطاقة." }
  revalidateEir(r.eirId)
  const label =
    status === "approved" ? "اعتُمدت للبث" : status === "hidden" ? "أُخفيت" : "أُعيدت للمراجعة"
  return { ok: true, message: label }
}

export async function editInsightAction(
  prepId: string,
  questionId: string,
  insightId: string,
  patch: InsightEditPatch,
): Promise<PrepEditResult> {
  await requireAdmin()
  const stamp = await reviewStamp()
  const r = await mutatePrepV2(prepId, (cur) => {
    const { bank, changed } = editInsight(cur.question_bank, questionId, insightId, patch, stamp)
    return { next: { ...cur, question_bank: bank }, changed }
  })
  if (!r.ok) return { ok: false, message: r.message }
  if (!r.changed) return { ok: false, message: "لم يتم العثور على البطاقة." }
  revalidateEir(r.eirId)
  return { ok: true, message: "تم حفظ التعديل." }
}

export async function removeInsightAction(
  prepId: string,
  questionId: string,
  insightId: string,
): Promise<PrepEditResult> {
  await requireAdmin()
  const r = await mutatePrepV2(prepId, (cur) => {
    const { bank, changed } = removeInsight(cur.question_bank, questionId, insightId)
    return { next: { ...cur, question_bank: bank }, changed }
  })
  if (!r.ok) return { ok: false, message: r.message }
  if (!r.changed) return { ok: false, message: "لم يتم العثور على البطاقة." }
  revalidateEir(r.eirId)
  return { ok: true, message: "حُذفت البطاقة." }
}

export async function addManualInsightAction(
  prepId: string,
  questionId: string,
  input: ManualInsightInput,
): Promise<PrepEditResult> {
  await requireAdmin()
  const stamp = await reviewStamp()
  const r = await mutatePrepV2(prepId, (cur) => {
    const res = addManualInsight(cur.question_bank, questionId, input, stamp)
    return { next: { ...cur, question_bank: res.bank }, changed: res.changed }
  })
  if (!r.ok) return { ok: false, message: r.message }
  if (!r.changed) {
    return { ok: false, message: "تعذّر إضافة البطاقة — تحقّق من الحقول المطلوبة." }
  }
  revalidateEir(r.eirId)
  return { ok: true, message: "أُضيفت بطاقة يدوية (معتمدة للبث)." }
}

export async function approveAllVerifiedInsightsAction(
  prepId: string,
): Promise<PrepEditResult> {
  await requireAdmin()
  const stamp = await reviewStamp()
  let approved = 0
  const r = await mutatePrepV2(prepId, (cur) => {
    const { bank, count } = bulkApproveVerified(cur.question_bank, stamp)
    approved = count
    return { next: { ...cur, question_bank: bank }, changed: count > 0 }
  })
  if (!r.ok) return { ok: false, message: r.message }
  if (!r.changed) return { ok: false, message: "لا توجد بطاقات موثوقة بانتظار الاعتماد." }
  revalidateEir(r.eirId)
  return { ok: true, message: `اعتُمدت ${approved} بطاقة موثوقة للبث.` }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}

function mergeMustAskQuestions(
  existing: PrepV2Question[],
  newTexts: string[],
): PrepV2Question[] {
  const mustAsk = existing.filter((q) => q.priority === "must_ask")
  const ifTime = existing.filter((q) => q.priority !== "must_ask")

  const merged: PrepV2Question[] = newTexts.map((text, i) => {
    const carry = mustAsk[i]
    if (carry) {
      return { ...carry, text }
    }
    return {
      id: `inline-${cryptoId()}`,
      section: ("deep_dive" as SectionKind),
      text,
      types: ["reflective"],
      priority: "must_ask",
      purpose: "",
      follow_up_prompt: "",
      risk_level: "low",
    }
  })

  return [...merged, ...ifTime]
}

function cryptoId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}
