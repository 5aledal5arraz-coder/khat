/**
 * `season.batch_generate` — the guided-wizard engines, in the worker.
 *
 * Modes (lib/jobs/season-jobs.ts):
 *   generate         — a fresh batch of N cards (the «ولّد» button, and the
 *                      refill after «أعد توليد الضعيفة»);
 *   auto_complete    — one card per missing season role;
 *   regenerate_slot  — one replacement for a retired accepted slot;
 *   inject_guest     — 3 topics anchored on a guest the operator typed in;
 *   alternative      — «موضوع جديد لنفس الضيف»: 1 topic for a kept guest.
 *
 * Everything cheap and decision-shaped (journaling a reject, flipping a card's
 * status, computing the missing roles) still happens synchronously in the
 * Server Action; only the AI generation moved here. The engines persist their
 * cards themselves, so the result carries counts, titles and the operator
 * message — the wizard refreshes to pick the cards up.
 *
 * Outcomes the operator must act on (filters too strict, every candidate a
 * near-duplicate, the strict angle bank exhausted) complete the job with
 * `{ ok:false, code, messageAr }` — shown, never retried. A provider out of
 * credit throws from the router and is dead-lettered by the worker.
 */

import { registerHandler } from "../registry"
import { NonRetryableJobError } from "../types"
import {
  SEASON_BATCH_GENERATE_JOB,
  type SeasonBatchJobPayload,
  type SeasonBatchJobResult,
} from "../season-jobs"
import { generateBatch, generateGuestFirstCards } from "@/lib/khat-map/v2"
import type { BatchCard } from "@/lib/khat-map/v2/types"
import { AngleBankExhaustedError } from "@/lib/khat-map/v2/strict"
import { getSeasonById } from "@/lib/khat-map/core/queries"
import type { KhatMapV2Mode } from "@/types/khat-map"

const ANGLE_BANK_MESSAGE: Record<SeasonBatchJobPayload["mode"], (e: AngleBankExhaustedError) => string> = {
  generate: (e) =>
    `بنك الزوايا نفد — ${e.available} زاوية متاحة، ${e.required} مطلوبة. بدّل الوضع إلى "موجّه" أو "استكشاف" لتكملة الموسم.`,
  auto_complete: () => "بنك الزوايا نفد — بدّل الوضع لإكمال الموسم.",
  regenerate_slot: () => "بنك الزوايا نفد — لا يمكن توليد بديل في الوضع الصارم.",
  inject_guest: () => "بنك الزوايا نفد — بدّل الوضع لإكمال الموسم.",
  alternative: () => "بنك الزوايا نفد — بدّل الوضع لإكمال الموسم.",
}

function done(
  payload: SeasonBatchJobPayload,
  cards: BatchCard[],
  batchIndex?: number,
): SeasonBatchJobResult {
  const n = cards.length
  return {
    ok: true,
    mode: payload.mode,
    cards: n,
    titles: cards.slice(0, 6).map((c) => c.topic_candidate.working_title),
    ...(batchIndex !== undefined ? { batch_index: batchIndex } : {}),
    messageAr:
      n === 0
        ? "لم يُنتج المولّد بطاقة جديدة هذه المرة."
        : `أُضيفت ${n} بطاقة جديدة إلى قائمة المراجعة.`,
  }
}

export async function runSeasonBatchGenerate(
  payload: SeasonBatchJobPayload,
  reportProgress: (p: Record<string, unknown>) => Promise<void>,
): Promise<SeasonBatchJobResult> {
  if (!payload?.seasonId || !payload.mode) {
    throw new NonRetryableJobError("مهمة توليد الموسم بلا موسم أو وضع.")
  }
  await reportProgress({ pass: 1, of: 1, label: "توليد البطاقات" })

  try {
    if (payload.mode === "inject_guest" || payload.mode === "alternative") {
      if (!payload.guest?.full_name) {
        throw new NonRetryableJobError("لا يوجد ضيف لتوليد مواضيع حوله.")
      }
      const res = await generateGuestFirstCards({
        season_id: payload.seasonId,
        admin_id: payload.adminId,
        batch_index: payload.batchIndex ?? 0,
        angle_count: payload.angleCount ?? (payload.mode === "alternative" ? 1 : 3),
        guest: {
          full_name: payload.guest.full_name,
          bio: payload.guest.bio,
          social_accounts: payload.guest.social_accounts ?? {},
          official_website: payload.guest.official_website,
        },
      })
      return done(payload, res.cards)
    }

    const season = await getSeasonById(payload.seasonId)
    if (!season) throw new NonRetryableJobError("الموسم غير موجود.")
    const mode = (season.v2_mode as KhatMapV2Mode | null) ?? "guided"
    if (mode === "manual") {
      return {
        ok: false,
        mode: payload.mode,
        cards: 0,
        titles: [],
        retryable: false,
        messageAr: "الوضع اليدوي لا يولّد تلقائياً — أضف حلقة يدوياً",
      }
    }

    const size =
      payload.mode === "regenerate_slot"
        ? 1
        : payload.mode === "auto_complete"
          ? payload.requiredRoles?.length ?? payload.size ?? 1
          : payload.size ?? 4
    const res = await generateBatch({
      season_id: payload.seasonId,
      admin_id: payload.adminId,
      size,
      // Mode → engine knobs mapping. See PR3 design doc in the brief.
      use_cross_season_negatives: mode !== "open_ai",
      invasion_policy: "optional",
      mode,
      ...(payload.mode === "auto_complete" && payload.requiredRoles?.length
        ? { required_roles: payload.requiredRoles }
        : {}),
    })

    // The LLM produced candidates but every one was filtered out. Explain WHICH
    // filter so the operator can act, instead of an unexplained empty batch.
    if (payload.mode === "generate" && res.cards.length === 0 && res.stats.oversampled > 0) {
      const editorialDropped = res.stats.editorial_dropped > 0
      const dedupDropped = res.stats.dedup_dropped > 0
      const base = { ok: false, mode: payload.mode, cards: 0, titles: [], batch_index: res.batch_index }
      if (editorialDropped && !dedupDropped) {
        return {
          ...base,
          code: "EDITORIAL_FILTERS_TOO_STRICT",
          messageAr: `الفلاتر التحريرية صارمة جدًا — أُسقطت كل ${res.stats.editorial_dropped} بطاقة. خفّف الفلاتر (الجنس / الجغرافيا / المواضيع الممنوعة) ثم أعد التوليد.`,
        }
      }
      if (dedupDropped) {
        return {
          ...base,
          code: "ALL_CANDIDATES_DEDUPED",
          messageAr: `كل الاقتراحات كانت قريبة جدًا من مواضيعك المختارة (أُسقطت ${res.stats.dedup_dropped}). نوّع البذور اليدوية أو قلّلها، ثم أعد التوليد.`,
        }
      }
      return {
        ...base,
        code: "EMPTY_BATCH",
        messageAr: "لم يقترح المولّد مواضيع جديدة كافية — أعد التوليد أو عدّل الإعدادات.",
      }
    }
    return done(payload, res.cards, res.batch_index)
  } catch (e) {
    if (e instanceof AngleBankExhaustedError) {
      return {
        ok: false,
        mode: payload.mode,
        cards: 0,
        titles: [],
        code: "ANGLE_BANK_EXHAUSTED",
        retryable: false,
        messageAr: ANGLE_BANK_MESSAGE[payload.mode](e),
      }
    }
    throw e
  }
}

registerHandler<SeasonBatchJobPayload, SeasonBatchJobResult>(
  SEASON_BATCH_GENERATE_JOB,
  (payload, ctx) => runSeasonBatchGenerate(payload, ctx.reportProgress),
)
