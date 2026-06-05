/**
 * Verifier — Step 5 / final gate before claims are accepted.
 *
 * For every proposed claim, we ask Gemini to decide whether the claim is
 * actually supported by its cited sources. The verifier is a separate
 * LLM call (no search tool, JSON mode) so it cannot pull in outside
 * knowledge — it operates strictly on claim + source excerpts.
 *
 * Classification:
 *   verified    — at least one cited source clearly supports the claim
 *   weak        — a cited source loosely supports but cannot confirm
 *   unverified  — no cited source supports the claim (will be DROPPED)
 */

import type { PreparationResearchSource } from "@/types/preparation"
import { geminiJson } from "./gemini"
import type { ProposedClaim, VerifierDecision } from "./types"

const SYSTEM = `أنت مُدقّق حقائق صارم. مهمتك تصنيف كل ادعاء إلى:
- verified: مدعوم بوضوح من المصادر المرفقة
- weak: هناك إشارة جزئية ولكن لا يرقى للتأكيد القاطع
- unverified: لا يوجد دعم كافٍ في المصادر — يجب حذف الادعاء

قواعد:
1. لا تعتمد على معرفتك الخارجية. استعمل فقط ما هو مكتوب في حقول المصادر.
2. إذا كانت المصادر المرفقة لا تحوي نصاً كافياً، اعتبر الادعاء weak أو unverified.
3. كن حازماً. ميول نحو الحذر أفضل من التساهل.

قواعد الإخراج (صارمة):
- كائن JSON واحد فقط، بدون أي نص قبله أو بعده.
- ممنوع markdown أو \`\`\`json أو شرح.
- المفتاح "decisions" مطلوب حتى لو كان فارغاً ([]).
- ممنوع الفاصلة بعد آخر عنصر.

الشكل المطلوب:
{
  "decisions": [
    { "claim_id": "c1", "status": "verified", "note": "string" }
  ]
}`

function formatSourceForVerifier(s: PreparationResearchSource): string {
  const meta = [s.provider, s.publisher, s.url].filter(Boolean).join(" | ")
  const body = s.snippet ? s.snippet.replace(/\s+/g, " ").slice(0, 500) : "(no snippet)"
  return `[${s.id}] ${s.title}\n    ${meta}\n    ${body}`
}

export async function verifyClaims(
  proposed: ProposedClaim[],
  sources: PreparationResearchSource[],
): Promise<VerifierDecision[]> {
  if (proposed.length === 0) return []

  // Assign stable claim ids for the round trip.
  const withIds = proposed.map((c, i) => ({ id: `c${i + 1}`, ...c }))
  const srcById = new Map(sources.map((s) => [s.id, s]))

  const user = [
    "# الادعاءات المقترحة",
    withIds
      .map((c) => {
        const cited = c.source_ids
          .map((id) => srcById.get(id))
          .filter((s): s is PreparationResearchSource => Boolean(s))
        const cites = cited.length > 0
          ? cited.map((s) => formatSourceForVerifier(s)).join("\n")
          : "(لا توجد مصادر صالحة)"
        return `## ${c.id} [${c.category}]\nالادعاء: ${c.claim}\nالمصادر المستشهد بها:\n${cites}`
      })
      .join("\n\n"),
    "",
    "# المطلوب",
    "صنّف كل ادعاء إلى verified / weak / unverified. أعد JSON كما هو موصوف.",
  ].join("\n")

  type VerifierPayload = { decisions?: Array<Partial<VerifierDecision>> }
  const isVerifierShape = (value: unknown): value is VerifierPayload => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const v = value as Record<string, unknown>
    // `decisions` may be absent or empty — we treat that as "verifier
    // returned nothing" and fail-closed downstream. Only reject if the
    // field exists and is not an array.
    return v.decisions === undefined || Array.isArray(v.decisions)
  }
  const out = await geminiJson<VerifierPayload>(
    SYSTEM,
    user,
    "verify",
    0.1,
    isVerifierShape,
  )

  const byId = new Map<string, VerifierDecision>()
  for (const d of out.decisions ?? []) {
    if (!d.claim_id) continue
    const status: VerifierDecision["status"] =
      d.status === "verified" || d.status === "weak" || d.status === "unverified"
        ? d.status
        : "unverified"
    byId.set(d.claim_id, {
      claim_id: d.claim_id,
      status,
      note: d.note?.trim(),
    })
  }

  // Any claim the verifier forgot is treated as unverified (fail-closed).
  return withIds.map((c) =>
    byId.get(c.id) ?? { claim_id: c.id, status: "unverified", note: "لم يتم تصنيفه" },
  )
}
