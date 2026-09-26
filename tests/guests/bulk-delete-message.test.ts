import { describe, it, expect } from "vitest"
import { bulkDeleteSummary } from "@/app/admin/guests/bulk-delete-message"

describe("bulkDeleteSummary — Arabic agreement for every count", () => {
  it("all deleted → success, noun agrees", () => {
    expect(bulkDeleteSummary({ deleted: 1, skipped: 0, failed: 0 })).toEqual({ text: "تم حذف ضيف واحد", tone: "success" })
    expect(bulkDeleteSummary({ deleted: 2, skipped: 0, failed: 0 }).text).toBe("تم حذف ضيفان")
    expect(bulkDeleteSummary({ deleted: 5, skipped: 0, failed: 0 }).text).toBe("تم حذف 5 ضيوف")
    expect(bulkDeleteSummary({ deleted: 12, skipped: 0, failed: 0 }).text).toBe("تم حذف 12 ضيف")
  })

  it("skipped: the pronoun and predicate agree (لأنه / لأنهما / لأنهم)", () => {
    expect(bulkDeleteSummary({ deleted: 3, skipped: 1, failed: 0 }).text).toBe(
      "تم حذف 3 ضيوف، وتُرك ضيف واحد لأنه مرتبط بحلقة أو بسجل حلقة",
    )
    expect(bulkDeleteSummary({ deleted: 3, skipped: 2, failed: 0 }).text).toBe(
      "تم حذف 3 ضيوف، وتُرك ضيفان لأنهما مرتبطان بحلقات أو بسجلات حلقات",
    )
    expect(bulkDeleteSummary({ deleted: 3, skipped: 4, failed: 0 }).text).toBe(
      "تم حذف 3 ضيوف، وتُرك 4 ضيوف لأنهم مرتبطون بحلقات أو بسجلات حلقات",
    )
    expect(bulkDeleteSummary({ deleted: 3, skipped: 4, failed: 0 }).tone).toBe("error")
  })

  it("nothing deleted never says «تم حذف 0»", () => {
    const r = bulkDeleteSummary({ deleted: 0, skipped: 2, failed: 1 })
    expect(r.text).toBe("لم يُحذف أي ضيف، وتُرك ضيفان لأنهما مرتبطان بحلقات أو بسجلات حلقات، وتعذّر حذف ضيف واحد")
    expect(r.text).not.toMatch(/\b0\b/)
  })
})
