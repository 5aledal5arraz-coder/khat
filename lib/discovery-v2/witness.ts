/**
 * D2 step 0 — witness profiles.
 *
 * Before any name is proposed, one cheap model call (router `structural` →
 * luna, low effort) describes WHO lived this topic: 4–6 kinds of Kuwaiti man
 * with a first-hand, self-told account, where such a man would have told it,
 * and the words to search for it. The profiles steer propose (v2-propose-7)
 * and the grounded harvest (harvest.ts). They are a plan, not evidence: they
 * never score, and a failed call just means propose runs without them.
 *
 * Bounded on purpose: WITNESS_TIMEOUT_MS, no retry — it runs on the critical
 * path before propose, and the discovery job budget (pipeline.ts) counts it.
 */

import { runAiTask } from "@/lib/ai-router"
import { khatConstitutionBlock } from "@/lib/khat-map/core/constitution"
import { GEOGRAPHY_LABEL, resolveGeography } from "./story-evidence"
import type { V2RunInput, WitnessProfile } from "./types"

export const WITNESS_PROMPT_VERSION = "v2-witness-1"

/** One attempt, this long. Counted in the discovery job budget. */
export const WITNESS_TIMEOUT_MS = 45_000

export const WITNESS_MIN = 4
export const WITNESS_MAX = 6

/** Coerce the model's JSON into at most WITNESS_MAX usable profiles. Pure. */
export function coerceWitnessProfiles(raw: unknown): WitnessProfile[] {
  const list = (raw as { profiles?: unknown } | null)?.profiles
  if (!Array.isArray(list)) return []
  const strList = (v: unknown, max: number) =>
    Array.isArray(v)
      ? v
          .map((x) => String(x ?? "").trim())
          .filter(Boolean)
          .slice(0, max)
      : []
  const out: WitnessProfile[] = []
  for (const item of list) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    const profile = String(o.profile ?? "").trim()
    if (profile.length < 8) continue
    out.push({
      profile: profile.slice(0, 200),
      where_told: strList(o.where_told, 4),
      search_terms: strList(o.search_terms, 5),
    })
    if (out.length >= WITNESS_MAX) break
  }
  return out
}

export async function proposeWitnessProfiles(
  input: V2RunInput,
): Promise<{ profiles: WitnessProfile[]; runId: string | null; error?: string }> {
  const geo = resolveGeography(input)
  const where = geo.map((g) => GEOGRAPHY_LABEL[g]).join("، ")
  const gender =
    input.filters?.gender === "female" ? "نساء" : input.filters?.gender === "male" ? "رجال" : "أشخاص"

  const system = [
    khatConstitutionBlock("compact"),
    "",
    "أنت تخطّط لبحث عن ضيوف لحلقة واحدة. لا تقترح أسماء.",
    `صِف من ${WITNESS_MIN} إلى ${WITNESS_MAX} «ملامح شاهد»: أنواع ${gender} من ${where} عاشوا هذا الموضوع بأنفسهم ورووه بأنفسهم علناً.`,
    "كل ملمح: تجربة معاشة محددة (لا مهنة عامة ولا «خبير في…»)، وأين يرويها مثله عادة",
    "(مقابلة صحفية، بودكاست أو برنامج حواري كويتي، يوتيوب، TEDx Kuwait، كتاب مذكرات، حساب شخصي)،",
    "وكلمات بحث عربية قصيرة لهذه التجربة.",
    "استبعد: السياسيين، من له قضية منظورة أمام المحاكم، وأي قصة تفضح غيره أو تكشف خصوصية طرف ثالث.",
    'أعد JSON فقط: {"profiles":[{"profile":"","where_told":[""],"search_terms":[""]}]}',
  ].join("\n")

  const r = await runAiTask<{ profiles?: unknown }>({
    taskKind: "structural",
    subjectTable: "discovery_runs",
    subjectId: input.runId ?? null,
    seasonId: input.seasonId ?? null,
    promptVersion: WITNESS_PROMPT_VERSION,
    input: { stage: "witness_profiles", topic: input.topic, geography: geo },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: JSON.stringify({ topic: input.topic }) },
    ],
    expectJson: true,
    providerOptions: { max_output_tokens: 2_000 },
    timeoutMs: WITNESS_TIMEOUT_MS,
    maxRetries: 0,
  })
  if (r.status !== "succeeded") {
    return { profiles: [], runId: r.runId ?? null, error: r.errorMessage ?? "witness profiles failed" }
  }
  return { profiles: coerceWitnessProfiles(r.parsed), runId: r.runId }
}
