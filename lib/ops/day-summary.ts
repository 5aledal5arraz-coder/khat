/**
 * «ملخّص اليوم» — the one sentence under the admin-home title.
 *
 * WHAT REPLACED WHAT
 * ------------------
 * The header used to carry a fixed marketing line («كل أدواتك في مكان واحد —
 * لمحة سريعة، ثم انطلق إلى العمل»). It said the same thing on the busiest day
 * of the season and on a day with nothing to do, which makes it decoration:
 * the operator's eye learns to skip the largest text on the page.
 *
 * WHY THIS IS ARITHMETIC AND NOT AN AI CALL
 * -----------------------------------------
 * An AI summary was considered and rejected: it would add latency and cost to
 * the single most-opened page in the product, it would be a paraphrase of
 * numbers rendered a few hundred pixels below it, and — decisively — it can be
 * WRONG. The home page is the reference the operator trusts when deciding
 * whether anything is on fire. Every clause below is a direct read of a number
 * already on the page, so the summary and the sections under it cannot disagree.
 *
 * Three clauses, always in this order: who is waiting → what is due → is the
 * machine healthy. Pure — `now` is injected so the "due in" boundary is
 * deterministic in tests. `./agenda` and `./home-metrics` are imported for
 * TYPES ONLY (`agenda.ts` pulls in `lib/db`), so this module stays runnable
 * without a database.
 */

import { formatArabicCount } from "@/lib/shared/formatters"
import { humanizeDueIn } from "./format"
import type { Agenda } from "./agenda"
import type { SystemHealth } from "./home-metrics"

export type DaySummaryClauseKey = "inbox" | "agenda" | "health"

export interface DaySummaryClause {
  key: DaySummaryClauseKey
  text: string
}

export interface DaySummary {
  clauses: DaySummaryClause[]
  /** The rendered sentence — clauses joined by « · ». */
  text: string
}

/**
 * Clause 1 — the human queue. `null` is "we could not read it", which must
 * never be phrased as an empty inbox; that is the same absence-is-not-success
 * rule the rest of `lib/ops/` follows.
 */
function inboxClause(total: number | null): string {
  if (total === null) return "تعذّر قراءة الوارد"
  if (total === 0) return "ما فيه وارد جديد"
  // `formatArabicCount` handles singular/dual/plural from the shared table:
  // 1 → «طلب واحد», 2 → «طلبان», 3–10 → «3 طلبات», 11+ → «15 طلب».
  return `${formatArabicCount(total, "طلب")} بانتظارك`
}

/**
 * Clause 2 — the nearest dated commitment. `buildAgenda` already sorted
 * ascending, so `items[0]` IS the nearest, and an overdue row is by definition
 * the earliest. Overdue is named as such rather than rendered as a negative
 * "بعد …" duration.
 */
function agendaClause(agenda: Agenda | null, now: number): string {
  if (agenda === null) return "تعذّر قراءة المواعيد"
  const next = agenda.items[0]
  if (!next) return "ما فيه مواعيد قريبة"
  const due = Date.parse(next.due_at)
  if (!Number.isFinite(due)) return "ما فيه مواعيد قريبة"
  return next.overdue
    ? `${next.kindLabel} متأخر`
    : `${next.kindLabel} ${humanizeDueIn(due - now)}`
}

/**
 * Clause 3 — system state, phrased to match the health band directly below so
 * the two can never read as different verdicts. The band paints red for
 * `hasCritical` or a confirmed-dead worker; this clause uses the same test.
 *
 * The attention case deliberately carries NO count: the band renders one chip
 * per issue immediately underneath, and a number here that disagreed with the
 * chips (they are the same array, but a future edit could split them) would be
 * worse than no number at all.
 */
function healthClause(health: SystemHealth): string {
  if (health.hasCritical || health.workerAlive === false)
    return "الإنتاج متوقف — يحتاج تدخّل الآن"
  if (health.level === "unknown") return "تعذّر التأكد من حالة الأنظمة"
  if (health.level === "healthy") return "كل الأنظمة سليمة"
  return "فيه ما يحتاج انتباهك"
}

export function deriveDaySummary(input: {
  /** `totalWaiting(inboxCounts)` — null when any channel is unreadable. */
  inboxTotal: number | null
  /** `buildAgenda(rows)` — null when the agenda query failed. */
  agenda: Agenda | null
  health: SystemHealth
  now?: number
}): DaySummary {
  const now = input.now ?? Date.now()
  const clauses: DaySummaryClause[] = [
    { key: "inbox", text: inboxClause(input.inboxTotal) },
    { key: "agenda", text: agendaClause(input.agenda, now) },
    { key: "health", text: healthClause(input.health) },
  ]
  return { clauses, text: clauses.map((c) => c.text).join(" · ") }
}
