/**
 * Verifier — Step 5 / final gate before claims are accepted.
 *
 * For every proposed claim, we ask the model to decide whether the claim is
 * actually supported by its cited sources. The verifier runs on OpenAI via the
 * AI Router (`runAiTask`, task_kind "verification" — strict, low temperature),
 * a separate LLM call over a fixed corpus (no search tool) so it cannot pull in
 * outside knowledge — it operates strictly on claim + source excerpts, each
 * wrapped in <untrusted_source> so injection payloads inside them are inert.
 *
 * Classification:
 *   verified    — at least one cited source clearly supports the claim
 *   weak        — a cited source loosely supports but cannot confirm
 *   unverified  — no cited source supports the claim (will be DROPPED)
 */

import type { PreparationResearchSource } from "@/types/preparation"
import { runAiTask } from "@/lib/ai-router"
import {
  UNTRUSTED_SOURCE_SAFETY_HEADER,
  wrapUntrustedSource,
} from "@/lib/ai/grounded-evidence"
import type { ProposedClaim, VerifierDecision } from "./types"

/** ai_runs actor attribution for the preparation research reasoning passes. */
const PREPARATION_ACTOR = "system:preparation-research"

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
  // Web-derived text — wrap so an injection payload inside a snippet can't
  // steer the verifier into mislabeling a claim. [id] stays inside (our own id).
  return wrapUntrustedSource(s.id, `[${s.id}] ${s.title}\n    ${meta}\n    ${body}`, `provider=${s.provider}`)
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
    UNTRUSTED_SOURCE_SAFETY_HEADER,
    "",
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
  // Verification moved OFF Gemini reasoning onto OpenAI via the AI Router
  // (task_kind "verification" — luna, strict low-temperature classification).
  // The router owns JSON repair + telemetry; retrieval stays on Gemini upstream.
  const completion = await runAiTask<VerifierPayload>({
    taskKind: "verification",
    subjectTable: "episode_preparations",
    actorId: PREPARATION_ACTOR,
    input: { stage: "verify", claim_count: proposed.length },
    prompt: [
      { role: "system", content: SYSTEM },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.1 },
  })

  if (completion.status !== "succeeded") {
    throw new Error(
      `فشل التحقق من الادعاءات عبر AI Router (${completion.errorClass ?? "unknown"}): ` +
        `${completion.errorMessage ?? "لا مخرجات"}`,
    )
  }
  const out = completion.parsed
  if (!out || !isVerifierShape(out)) {
    throw new Error("التحقق أنتج JSON غير صالح الشكل بعد سلّم الإصلاح")
  }

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
