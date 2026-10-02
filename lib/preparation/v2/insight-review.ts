/**
 * Prep V2 — Insight review-gate transitions (pure).
 *
 * The "Fact-Check & Enrich" tab drives these: approve / hide / reset an
 * insight, edit its claim, add a human-authored one, remove one, or bulk-
 * approve all verified candidates. Every function is pure and immutable — it
 * returns a NEW question bank, never mutates the input — so the server action
 * stays a thin load → transform → validate → write wrapper, and the logic is
 * unit-testable without a DB.
 */

import {
  INSIGHT_TIMINGS,
  INSIGHT_TYPES,
  insightLiveStatus,
  type InsightLiveStatus,
  type InsightTiming,
  type InsightType,
  type PrepV2Insight,
  type PrepV2InsightSource,
  type PrepV2Payload,
  type PrepV2Question,
} from "./types"
import { formatArabicCount } from "@/lib/shared/formatters"

/** Who/when an edit happened — stamped onto every reviewed insight. */
export interface ReviewStamp {
  reviewer: string | null
  at: string
}

type Bank = PrepV2Question[]

/**
 * Transform exactly one insight (matched by question + insight id). `fn`
 * returning null removes it. Returns a new bank + whether anything changed.
 */
function mapOneInsight(
  bank: Bank,
  questionId: string,
  insightId: string,
  fn: (i: PrepV2Insight) => PrepV2Insight | null,
): { bank: Bank; changed: boolean } {
  let changed = false
  const next = bank.map((q) => {
    if (q.id !== questionId || !q.insights) return q
    const idx = q.insights.findIndex((i) => i.id === insightId)
    if (idx < 0) return q
    const updated = fn(q.insights[idx])
    changed = true
    const nextInsights =
      updated === null
        ? q.insights.filter((_, j) => j !== idx)
        : q.insights.map((i, j) => (j === idx ? updated : i))
    return { ...q, insights: nextInsights }
  })
  return { bank: next, changed }
}

/** Approve / hide / reset-to-pending a single insight. */
export function setInsightStatus(
  bank: Bank,
  questionId: string,
  insightId: string,
  status: InsightLiveStatus,
  stamp: ReviewStamp,
): { bank: Bank; changed: boolean } {
  return mapOneInsight(bank, questionId, insightId, (i) => ({
    ...i,
    live_status: status,
    reviewed_by: stamp.reviewer,
    reviewed_at: stamp.at,
  }))
}

export interface InsightEditPatch {
  text?: string
  correction?: { inaccuracy: string; accurate: string }
  review_note?: string
}

/**
 * Edit an insight's claim/note. Editing the displayed claim away from the
 * grounded original makes it human-owned (`manual: true`) — the producer now
 * vouches for it, which is exactly what the review gate is for.
 */
export function editInsight(
  bank: Bank,
  questionId: string,
  insightId: string,
  patch: InsightEditPatch,
  stamp: ReviewStamp,
): { bank: Bank; changed: boolean } {
  return mapOneInsight(bank, questionId, insightId, (i) => {
    const next: PrepV2Insight = {
      ...i,
      reviewed_by: stamp.reviewer,
      reviewed_at: stamp.at,
    }
    let touchedClaim = false
    if (typeof patch.text === "string" && patch.text.trim().length > 0) {
      next.text = patch.text.trim()
      touchedClaim = true
    }
    if (patch.correction && i.type === "correction") {
      const inaccuracy = patch.correction.inaccuracy.trim()
      const accurate = patch.correction.accurate.trim()
      if (inaccuracy && accurate) {
        next.correction = { inaccuracy, accurate }
        touchedClaim = true
      }
    }
    if (typeof patch.review_note === "string") {
      next.review_note = patch.review_note.trim() || null
    }
    if (touchedClaim) next.manual = true
    return next
  })
}

/** Remove an insight entirely. */
export function removeInsight(
  bank: Bank,
  questionId: string,
  insightId: string,
): { bank: Bank; changed: boolean } {
  return mapOneInsight(bank, questionId, insightId, () => null)
}

export interface ManualInsightInput {
  type: InsightType
  text: string
  timing: InsightTiming
  sourceUrl?: string
  sourceTitle?: string
  correction?: { inaccuracy: string; accurate: string }
  /**
   * Optional caller-supplied id. The review UI generates it client-side and
   * passes the SAME id to its optimistic update and to the server action, so
   * the two never diverge (a freshly-added card stays actionable immediately).
   */
  id?: string
}

/**
 * Add a human-authored insight to a question. It is `manual`, lands
 * `approved` (authoring it in the review tab IS approving it), and is
 * human-vouched (`confidence: "verified"`). An optional source URL is the
 * only one attached — we never fabricate sources.
 */
export function addManualInsight(
  bank: Bank,
  questionId: string,
  input: ManualInsightInput,
  stamp: ReviewStamp,
): { bank: Bank; changed: boolean; insight: PrepV2Insight | null } {
  const text = input.text.trim()
  if (text.length < 2) return { bank, changed: false, insight: null }
  if (!(INSIGHT_TYPES as readonly string[]).includes(input.type)) {
    return { bank, changed: false, insight: null }
  }
  const timing: InsightTiming = (INSIGHT_TIMINGS as readonly string[]).includes(input.timing)
    ? input.timing
    : "during"

  const sources: PrepV2InsightSource[] = []
  const rawUrl = (input.sourceUrl ?? "").trim()
  if (rawUrl) {
    try {
      const u = new URL(rawUrl)
      // Only accept real http(s) URLs; new URL() also normalizes the value.
      if (u.protocol === "http:" || u.protocol === "https:") {
        const host = hostOf(u.href)
        sources.push({
          title: ((input.sourceTitle ?? "").trim() || host).slice(0, 160),
          url: u.href,
          publisher: host,
        })
      }
    } catch {
      // Not a parseable URL — drop it rather than store junk. We never
      // fabricate a source, so an empty sources[] is fine.
    }
  }

  let correction: PrepV2Insight["correction"]
  if (input.type === "correction") {
    const inaccuracy = (input.correction?.inaccuracy ?? "").trim()
    const accurate = (input.correction?.accurate ?? "").trim()
    if (!inaccuracy || !accurate) return { bank, changed: false, insight: null }
    correction = { inaccuracy, accurate }
  }

  const insight: PrepV2Insight = {
    id: input.id?.trim() || `ins-manual-${rand()}`,
    type: input.type,
    text,
    timing,
    sources,
    confidence: "verified",
    ...(correction ? { correction } : {}),
    generated_at: stamp.at,
    live_status: "approved",
    reviewed_by: stamp.reviewer,
    reviewed_at: stamp.at,
    manual: true,
  }

  let changed = false
  const next = bank.map((q) => {
    if (q.id !== questionId) return q
    changed = true
    return { ...q, insights: [...(q.insights ?? []), insight] }
  })
  return { bank: next, changed, insight: changed ? insight : null }
}

/** Approve every still-pending, grounded-`verified` insight in one action. */
export function bulkApproveVerified(
  bank: Bank,
  stamp: ReviewStamp,
): { bank: Bank; count: number } {
  let count = 0
  const next = bank.map((q) => {
    if (!q.insights || q.insights.length === 0) return q
    const insights = q.insights.map((i) => {
      if (insightLiveStatus(i) === "pending" && i.confidence === "verified") {
        count++
        return {
          ...i,
          live_status: "approved" as InsightLiveStatus,
          reviewed_by: stamp.reviewer,
          reviewed_at: stamp.at,
        }
      }
      return i
    })
    return { ...q, insights }
  })
  return { bank: next, count }
}

// ─── helpers ──────────────────────────────────────────────────────────

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
}

function rand(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

// ─── Honest state from Pass-5 counters ────────────────────────────────

export interface InsightNotice {
  tone: "info" | "warn" | "error"
  text: string
}

/**
 * What the review tab says about the Pass-5 RUN — read from the persisted
 * `insight_stats`, never inferred from the card count. The tab used to render
 * NOTHING when no card survived, so "provider down", "budget cut 30 drafts",
 * "nothing drafted" and "never ran" all looked the same: an empty tab.
 *
 * `cardCount` is the number of cards currently in the bank (manual ones
 * included), used only to decide whether "no cards" is still true.
 */
export function insightRunNotices(
  stats: PrepV2Payload["insight_stats"],
  cardCount: number,
): InsightNotice[] {
  const out: InsightNotice[] = []
  if (!stats) {
    if (cardCount === 0) out.push({ tone: "info", text: "لم تُولَّد بطاقات لهذا التحضير" })
    return out
  }
  if (stats.outcome === "skipped") {
    out.push({ tone: "warn", text: "لم تُولَّد بطاقات — التوليد معطّل أو مزوّد البحث غير مُعدّ" })
    return out
  }
  if (stats.outcome === "error") {
    out.push({ tone: "error", text: "تعذّر توليد البطاقات — توقّف التوليد بخطأ" })
    return out
  }
  if (stats.drafted === 0) {
    out.push({ tone: "info", text: "لم تُولَّد بطاقات — لم يقترح النموذج أي بطاقة" })
    return out
  }
  const failed = stats.grounding_failed ?? 0
  if (failed > 0) {
    out.push({
      tone: stats.outcome === "degraded" ? "error" : "warn",
      text: `فشل التحقق من ${failed} من ${stats.grounded} (مزوّد البحث)`,
    })
  }
  const overBudget = stats.drafted - stats.grounded
  if (stats.capped && overBudget > 0) {
    out.push({
      tone: "info",
      text: `تم تجاوز ${formatArabicCount(overBudget, "مسودة")} بسبب الحد (${stats.grounded})`,
    })
  }
  const unsupported = stats.grounded - failed - stats.kept
  if (stats.kept === 0 && cardCount === 0 && unsupported > 0) {
    out.push({
      tone: "info",
      text: `لم تجتز أي بطاقة التحقق — ${formatArabicCount(unsupported, "مسودة")} بلا مصادر كافية`,
    })
  }
  return out
}

/** «14 بطاقة بانتظار اعتمادك» — null when nothing waits. */
export function pendingApprovalLabel(pending: number): string | null {
  return pending > 0 ? `${formatArabicCount(pending, "بطاقة")} بانتظار اعتمادك` : null
}
