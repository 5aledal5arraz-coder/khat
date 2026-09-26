/**
 * The operator-facing summary of a bulk guest delete, grammatical for every
 * count: Arabic agrees the noun (ضيف / ضيفان / ضيوف), the pronoun (لأنه /
 * لأنهما / لأنهم) and the predicate (مرتبط / مرتبطان / مرتبطون) with the
 * number. Pure, so it is tested without rendering the list.
 */
import { formatArabicCount } from "@/lib/shared/formatters"

export function bulkDeleteSummary(r: { deleted: number; skipped: number; failed: number }): {
  text: string
  tone: "success" | "error"
} {
  const parts = [r.deleted > 0 ? `تم حذف ${formatArabicCount(r.deleted, "ضيف")}` : "لم يُحذف أي ضيف"]
  if (r.skipped > 0) {
    const why =
      r.skipped === 1
        ? "لأنه مرتبط بحلقة أو بسجل حلقة"
        : r.skipped === 2
          ? "لأنهما مرتبطان بحلقات أو بسجلات حلقات"
          : "لأنهم مرتبطون بحلقات أو بسجلات حلقات"
    parts.push(`وتُرك ${formatArabicCount(r.skipped, "ضيف")} ${why}`)
  }
  if (r.failed > 0) parts.push(`وتعذّر حذف ${formatArabicCount(r.failed, "ضيف")}`)
  return { text: parts.join("، "), tone: r.skipped > 0 || r.failed > 0 ? "error" : "success" }
}
