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
import { requireAdmin } from "@/lib/api-utils"
import type {
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
  if (!db) return { ok: false, message: "قاعدة البيانات غير متوفرة." }

  const [row] = await db
    .select({
      id: episodePreparations.id,
      eir_id: episodePreparations.eir_id,
      prep_v2: episodePreparations.prep_v2,
    })
    .from(episodePreparations)
    .where(eq(episodePreparations.id, prepId))
    .limit(1)
  if (!row) return { ok: false, message: "سجلّ الإعداد غير موجود." }
  const current = row.prep_v2 as PrepV2Payload | null
  if (!current) {
    return {
      ok: false,
      message:
        "لا توجد بنية Prep V2 لتعديلها — استخدم زر «إعادة توليد الإعداد» أولاً.",
    }
  }

  const next: PrepV2Payload = JSON.parse(JSON.stringify(current))
  const lines = parseLines(edit.value)

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
      return { ok: false, message: "حقل غير مدعوم." }
  }

  await db
    .update(episodePreparations)
    .set({ prep_v2: next as unknown as Record<string, unknown>, updated_at: new Date() })
    .where(eq(episodePreparations.id, prepId))

  if (row.eir_id) {
    revalidatePath(`/admin/khat-brain/episodes/${row.eir_id}`)
  }

  return { ok: true, message: "تم حفظ التعديل." }
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
