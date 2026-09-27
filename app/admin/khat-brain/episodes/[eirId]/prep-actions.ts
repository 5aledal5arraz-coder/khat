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
 * `lib/preparation/v2/types.ts` is preserved. Plain string lists are
 * normalized line-by-line. Questions are NOT edited as lines: each one is
 * addressed by its id through the pure transforms in
 * `lib/preparation/v2/question-edit.ts` (the old textarea merge re-attached
 * metadata and fact cards by POSITION and put them under the wrong text).
 */

import { revalidatePath } from "next/cache"
import { formatArabicCount } from "@/lib/shared/formatters"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { episodePreparations } from "@/lib/db/schema/preparation"
import { requireActionRole, getAdminAuthUser } from "@/lib/api-utils"
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
import {
  addQuestion,
  deleteQuestion,
  editQuestion,
  moveQuestion,
  questionEditContext,
  reorderQuestion,
  MANUAL_QUESTION_ID,
  type QuestionEditPatch,
  type QuestionEditReason,
} from "@/lib/preparation/v2/question-edit"
import {
  QUESTION_PRIORITIES,
  SECTION_KINDS,
  type InsightLiveStatus,
  type PrepV2Payload,
  type QuestionPriority,
  type SectionKind,
} from "@/lib/preparation/v2/types"
import { getActiveLinkForEir, updateGuestLinkFields } from "@/lib/guest-link/service"
import { parseSampleOverrides } from "@/lib/guest-link/view"

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
  /** Raw textarea value as the operator typed it. */
  value: string
}

export interface PrepEditResult {
  ok: boolean
  message: string
  /**
   * Question edits only: set when the edit was refused because someone else
   * changed the question first — the text now stored, for the editor to show.
   */
  current?: string
}

export async function updatePrepFieldAction(
  prepId: string,
  edit: PrepEditField,
): Promise<PrepEditResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
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
  let written: PrepV2Payload | null = null
  const r = await lockedMutate(prepId, fn, (next) => {
    written = next
  })
  // Same push the pipeline does after a regeneration (pipeline.ts): a live
  // recording room already open on this prep otherwise keeps the questions
  // and approved cards it was rendered with. After commit, outside the lock,
  // and never allowed to fail an edit that already persisted.
  if (r.ok && r.changed && written) {
    try {
      const { broadcastPrepV2Update } = await import("@/lib/collaboration/prep-live")
      await broadcastPrepV2Update(prepId, written)
    } catch (err) {
      console.warn(
        `[prep-v2] live room broadcast failed for prep ${prepId} (non-fatal):`,
        err instanceof Error ? err.message : err,
      )
    }
  }
  return r
}

async function lockedMutate(
  prepId: string,
  fn: (current: PrepV2Payload) => { next: PrepV2Payload; changed: boolean },
  onWrite: (next: PrepV2Payload) => void,
): Promise<MutateResult> {
  return db!.transaction(async (tx) => {
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
    onWrite(next)
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
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
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
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
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
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
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
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
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
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
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

// ─── Question bank — one question at a time, by id ──────────────────
//
// Each action runs one pure transform from question-edit.ts inside the locked
// mutatePrepV2. An id that no longer exists (deleted, or the prep was
// regenerated) is refused, never guessed; an edit made against text someone
// else has since changed is refused with the current text.

const QUESTION_GONE = "السؤال تغيّر أو حُذف — حدّث الصفحة."

function questionFailure(reason: QuestionEditReason | undefined, current?: string): PrepEditResult {
  switch (reason) {
    case "stale":
      return { ok: false, message: "عدّل أحد هذا السؤال قبلك — راجع النص الحالي.", current }
    case "bad_section":
      return { ok: false, message: "القسم غير موجود في الإعداد." }
    case "empty":
      return { ok: false, message: "نص السؤال فارغ." }
    default:
      return { ok: false, message: QUESTION_GONE }
  }
}

function isSectionKind(v: unknown): v is SectionKind {
  return typeof v === "string" && (SECTION_KINDS as readonly string[]).includes(v)
}

function isQuestionId(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 200
}

function optionalText(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}

function cleanPatch(patch: QuestionEditPatch): QuestionEditPatch {
  const out: QuestionEditPatch = {}
  if (typeof patch?.text === "string") out.text = patch.text
  if (typeof patch?.purpose === "string") out.purpose = patch.purpose
  if (typeof patch?.follow_up_prompt === "string") out.follow_up_prompt = patch.follow_up_prompt
  if ((QUESTION_PRIORITIES as readonly unknown[]).includes(patch?.priority)) {
    out.priority = patch.priority as QuestionPriority
  }
  return out
}

/** Text / purpose / follow-up / «أساسي ↔ إن سمح الوقت» of one question. */
export async function editPrepQuestionAction(
  prepId: string,
  questionId: string,
  patch: QuestionEditPatch,
  /** The text the editor was showing — the stale-edit check. */
  expectedText: string,
): Promise<PrepEditResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  if (!isQuestionId(questionId)) return { ok: false, message: QUESTION_GONE }
  const clean = cleanPatch(patch)
  let res: ReturnType<typeof editQuestion> | null = null
  const r = await mutatePrepV2(prepId, (cur) => {
    res = editQuestion(cur.question_bank, questionId, clean, optionalText(expectedText))
    return { next: { ...cur, question_bank: res.bank }, changed: res.changed }
  })
  if (!r.ok) return { ok: false, message: r.message }
  const out = res as ReturnType<typeof editQuestion> | null
  if (!r.changed) {
    if (out?.reason === "noop") return { ok: true, message: "بدون تغيير." }
    return questionFailure(out?.reason, out?.current)
  }
  revalidateEir(r.eirId)
  return { ok: true, message: "تم حفظ السؤال." }
}

/** Move a question to another section (to its end, or before `beforeId`). */
export async function movePrepQuestionAction(
  prepId: string,
  questionId: string,
  toSection: SectionKind,
  beforeId: string | null,
): Promise<PrepEditResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  if (!isQuestionId(questionId)) return { ok: false, message: QUESTION_GONE }
  if (!isSectionKind(toSection)) return questionFailure("bad_section")
  const before = isQuestionId(beforeId) ? beforeId : null
  let reason: QuestionEditReason | undefined
  const r = await mutatePrepV2(prepId, (cur) => {
    const res = moveQuestion(cur.question_bank, questionId, toSection, before, questionEditContext(cur))
    reason = res.reason
    return { next: { ...cur, question_bank: res.bank }, changed: res.changed }
  })
  if (!r.ok) return { ok: false, message: r.message }
  if (!r.changed) return reason === "noop" ? { ok: true, message: "بدون تغيير." } : questionFailure(reason)
  revalidateEir(r.eirId)
  return { ok: true, message: "نُقل السؤال." }
}

/** ↑ / ↓ within its section. */
export async function reorderPrepQuestionAction(
  prepId: string,
  questionId: string,
  dir: "up" | "down",
): Promise<PrepEditResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  if (!isQuestionId(questionId) || (dir !== "up" && dir !== "down")) {
    return { ok: false, message: QUESTION_GONE }
  }
  let reason: QuestionEditReason | undefined
  const r = await mutatePrepV2(prepId, (cur) => {
    const res = reorderQuestion(cur.question_bank, questionId, dir)
    reason = res.reason
    return { next: { ...cur, question_bank: res.bank }, changed: res.changed }
  })
  if (!r.ok) return { ok: false, message: r.message }
  if (!r.changed) return reason === "noop" ? { ok: true, message: "بدون تغيير." } : questionFailure(reason)
  revalidateEir(r.eirId)
  return { ok: true, message: "تم الترتيب." }
}

/**
 * «+ سؤال في هذا القسم». The editor generates `id` (`manual-<uuid>`) so its
 * optimistic row and the stored one are the same question, and a double
 * click is one add, not two.
 */
export async function addPrepQuestionAction(
  prepId: string,
  section: SectionKind,
  afterId: string | null,
  input: { id: string; text: string; priority?: QuestionPriority },
): Promise<PrepEditResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  if (!isSectionKind(section)) return questionFailure("bad_section")
  if (typeof input?.id !== "string" || !MANUAL_QUESTION_ID.test(input.id)) {
    return { ok: false, message: "معرّف السؤال غير صالح." }
  }
  const after = isQuestionId(afterId) ? afterId : null
  let reason: QuestionEditReason | undefined
  const r = await mutatePrepV2(prepId, (cur) => {
    const res = addQuestion(
      cur.question_bank,
      section,
      after,
      {
        id: input.id,
        text: String(input.text ?? ""),
        priority: (QUESTION_PRIORITIES as readonly unknown[]).includes(input.priority)
          ? input.priority
          : "must_ask",
        origin: "manual",
      },
      questionEditContext(cur),
    )
    reason = res.reason
    return { next: { ...cur, question_bank: res.bank }, changed: res.changed }
  })
  if (!r.ok) return { ok: false, message: r.message }
  if (!r.changed) {
    return reason === "exists" ? { ok: true, message: "السؤال مضاف." } : questionFailure(reason)
  }
  revalidateEir(r.eirId)
  return { ok: true, message: "أُضيف السؤال." }
}

/**
 * Delete one question and its support cards. If the guest link curates this
 * question as a sample (hide / pin / reworded text), that override goes too.
 */
export async function deletePrepQuestionAction(
  prepId: string,
  questionId: string,
  expectedText: string,
): Promise<PrepEditResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  if (!isQuestionId(questionId)) return { ok: false, message: QUESTION_GONE }
  let res: ReturnType<typeof deleteQuestion> | null = null
  const r = await mutatePrepV2(prepId, (cur) => {
    res = deleteQuestion(cur.question_bank, questionId, optionalText(expectedText))
    return { next: { ...cur, question_bank: res.bank }, changed: res.changed }
  })
  if (!r.ok) return { ok: false, message: r.message }
  const out = res as ReturnType<typeof deleteQuestion> | null
  if (!r.changed) return questionFailure(out?.reason, out?.current)

  if (r.eirId) {
    try {
      const link = await getActiveLinkForEir(r.eirId)
      const overrides = link ? parseSampleOverrides(link.sample_overrides) : {}
      if (link && overrides[questionId]) {
        delete overrides[questionId]
        await updateGuestLinkFields(link.id, { sample_overrides: overrides as Record<string, unknown> })
      }
    } catch (err) {
      // The question is already gone; a leftover override for a missing id
      // is inert (the projection only reads overrides of existing questions).
      console.warn("[prep-v2] could not clear guest-link override:", err instanceof Error ? err.message : err)
    }
  }
  revalidateEir(r.eirId)
  const cards = out?.removed?.insights?.length ?? 0
  return {
    ok: true,
    message: cards ? `حُذف السؤال مع ${formatArabicCount(cards, "بطاقة إسناد")}.` : "حُذف السؤال.",
  }
}

// ─── «نسخة الضيف» — apply an accepted guest suggestion ───────────────
//
// Never automatic: the admin accepts a suggestion in the inbox, then chooses
// to add it here as an `if_time` question in a section they pick. It is an
// ordinary `addQuestion` with origin `guest` and an id derived from the
// suggestion — so pressing «أضف للإعداد» twice adds it once, and the question
// survives a regeneration like any authored question.

const SUGGESTION_ID = /^[A-Za-z0-9-]{1,64}$/

export async function addGuestQuestionToPrepAction(
  prepId: string,
  suggestionId: string,
  section: SectionKind,
  text: string,
): Promise<PrepEditResult> {
  const gate = await requireActionRole("EDITOR")
  if (!gate.ok) return { ok: false, message: gate.error }
  if (typeof suggestionId !== "string" || !SUGGESTION_ID.test(suggestionId)) {
    return { ok: false, message: "اقتراح غير صالح." }
  }
  if (!isSectionKind(section)) return questionFailure("bad_section")
  const clean = String(text ?? "").normalize("NFC").trim().slice(0, 500)
  if (!clean) return { ok: false, message: "النص فارغ." }
  let reason: QuestionEditReason | undefined
  const r = await mutatePrepV2(prepId, (cur) => {
    const res = addQuestion(
      cur.question_bank,
      section,
      null,
      {
        id: `guest-${suggestionId}`,
        text: clean,
        priority: "if_time",
        purpose: "اقتراح من الضيف (نسخة الضيف)",
        origin: "guest",
      },
      questionEditContext(cur),
    )
    reason = res.reason
    return { next: { ...cur, question_bank: res.bank }, changed: res.changed }
  })
  if (!r.ok) return { ok: false, message: r.message }
  if (!r.changed) {
    return reason === "exists"
      ? { ok: true, message: "السؤال مضاف للإعداد مسبقاً." }
      : questionFailure(reason)
  }
  revalidateEir(r.eirId)
  return { ok: true, message: "أُضيف السؤال للإعداد." }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
}
