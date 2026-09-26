/**
 * v2 step 1 — propose real named people, story-first.
 *
 * The LLM is used ONLY to generate names + light context + a story
 * HYPOTHESIS (`story_claim`). Nothing here is trusted: identity confidence
 * comes from Wikidata, the story from live sources whose quotes are
 * verified verbatim in code (story-classify.ts). `story_claim` only steers
 * the evidence search and the order candidates are checked in — it never
 * scores. We ask for MORE names than we need; the footprint floor and the
 * story check prune the unreal and the storyless.
 *
 * Quality levers (added after the selection-quality audit):
 *   - cross-run memory: names we already interviewed / promoted /
 *     operator-rejected are excluded inside the prompt; recently
 *     surfaced names are soft-discouraged so runs stop repeating the
 *     same celebrities.
 *   - story-first priority: at least two thirds of the list must be people
 *     who LIVED the topic and are not public figures (witnesses,
 *     participants, ordinary citizens with a known public account); public
 *     officials / MPs / celebrities are capped to a minority (v2-propose-4,
 *     after the 2026-09-26 trial came back mostly ministers, MPs and actors);
 *   - bounded cost + latency (v2-propose-5, after the v2-propose-4 trial
 *     timed out at 240s on "high" effort): the same rules, said once, and
 *     per-field length caps on the output — the visible list was ~5k of
 *     the 12k output tokens. Effort/timeout live in the registry.
 *   - exact count + one top-up (v2-propose-6, after the v2-propose-5 trial
 *     returned 7 names for want = 24): the count is asked as an exact
 *     number, and pipeline.ts makes ONE follow-up call for the missing
 *     names (`alreadyProposed` excluded) when the reply is short.
 *   - strict gender: the filter is stated as a prohibition, and each person
 *     carries the model's own `gender` so a self-contradicting proposal is
 *     dropped before any paid step (pipeline.ts). Verification is elsewhere.
 */

import { runAiTask } from "@/lib/ai-router"
import type { DiscoveryMemory } from "./memory"
import { GEOGRAPHY_LABEL, resolveGeography } from "./story-evidence"
import type { ProposedName, V2RunInput } from "./types"

/** Output budget for one propose call (reasoning + visible JSON). */
export const PROPOSE_MAX_OUTPUT_TOKENS = 12_000

export const PROPOSE_PROMPT_VERSION = "v2-propose-6"

export interface ProposeOptions {
  /**
   * Top-up call: names this run already proposed. Excluded in the prompt
   * (pipeline.ts still dedupes on folded names — the model can respell).
   */
  alreadyProposed?: string[]
  /** Top-up call only: the time the job budget can still spare. */
  timeoutMs?: number
}

export async function proposeNames(
  input: V2RunInput,
  want: number,
  memory?: DiscoveryMemory,
  opts: ProposeOptions = {},
): Promise<{ names: ProposedName[]; runId: string; error?: string }> {
  const f = input.filters ?? {}
  const genderLine =
    f.gender === "male"
      ? "الجنس: رجال فقط. لا تقترح أيّ امرأة مهما كانت مناسبة للموضوع."
      : f.gender === "female"
        ? "الجنس: نساء فقط. لا تقترح أيّ رجل مهما كان مناسباً للموضوع."
        : "أيّ جنس."
  // Geography (Khaled, 2026-09-26): Kuwait only by default; Saudi Arabia
  // and the rest of the Gulf are opt-in from the discovery form.
  const geo = resolveGeography(input)
  const geoLine = `من: ${geo.map((g) => GEOGRAPHY_LABEL[g]).join("، ")} فقط.`
  const natLine =
    f.nationality === "kuwaiti"
      ? "كويتيون فقط."
      : f.nationality === "non_kuwaiti"
        ? `من خارج الكويت. لا تقترح أيّ كويتي. ${geoLine}`
        : f.country
          ? `يفضّل من: ${f.country}. ${geoLine}`
          : geoLine
  const tasteLine =
    input.taste === "famous"
      ? "يُسمح بنسبة أكبر من المعروفين، مع بقاء القصة الشخصية شرطاً للأولوية."
      : input.taste === "hidden_gems"
        ? "فضّل أصواتاً عميقة أقلّ شهرة لكنها حقيقية وموثّقة."
        : "القصة التي عاشها الشخص أهمّ من شهرته."
  // Public figures are a minority in every taste; "famous" only loosens the cap.
  const publicCap = input.taste === "famous" ? "أقلّ من نصف القائمة" : "ربع القائمة على الأكثر"

  const hardExclusions = memory?.excludeNames ?? []
  const softExclusions = memory?.recentlySurfacedNames ?? []
  const already = opts.alreadyProposed ?? []

  const system = [
    "أنت باحث ترشيحات ضيوف لبودكاست عربي حواري عميق اسمه «خط». اقترح أفراداً حقيقيين موجودين فعلاً، عاشوا الموضوع بأنفسهم — لا قنوات ولا برامج ولا مؤسسات، ولا تختلق.",
    "قواعد:",
    `- ${genderLine}`,
    `- ${natLine}`,
    `- ${tasteLine}`,
    "- ثلثا القائمة على الأقل: أشخاص عاشوا الحدث أو التجربة بأنفسهم وليسوا من المشاهير ولا الشخصيات العامة — شهود، مشاركون ميدانيون، ناجون، أسرى سابقون، عسكريون وأطباء ومتطوّعون، مواطنون عاديون — ولكلّ منهم رواية علنية معروفة (شهادة في صحيفة، مقابلة، لقاء تلفزيوني، مقطع يوتيوب، كتاب مذكّرات).",
    `- الشخصيات العامة — وزراء، نواب، مسؤولون حكوميون، دبلوماسيون، أفراد الأسر الحاكمة، فنانون وممثلون ومشاهير، رياضيون معروفون — أقلية: ${publicCap}، وبشرط أن تكون لكلّ منهم قصة شخصية عاشها هو، لا منصب شغله.`,
    "- الأولوية الأدنى: صوت من مجال مجاور بزاوية غير متوقّعة، ثم متخصّص له هو نفسه قصة شخصية مع الموضوع. لا يشترط وجود صفحة ويكيبيديا، لكن لا تقترح اسماً لا تعرف له أثراً علنياً واحداً على الأقل.",
    ...(hardExclusions.length
      ? [
          "- ممنوع نهائياً اقتراح هذه الأسماء (سبق استضافتهم أو رُفضوا):",
          "  " + hardExclusions.join("، "),
        ]
      : []),
    ...(already.length
      ? [
          "- هذه أسماء اقترحتها في هذه الجولة — لا تكرّر أيّاً منها ولا بتهجئة أخرى، وأعطِ أشخاصاً آخرين:",
          "  " + already.join("، "),
        ]
      : []),
    ...(softExclusions.length
      ? [
          "- تجنّب تكرار هذه الأسماء المقترحة مؤخراً إلا إذا كان الاسم مثالياً بشكل استثنائي لهذا الموضوع تحديداً:",
          "  " + softExclusions.join("، "),
        ]
      : []),
    `- أعطِ ${want} اسماً بالضبط — عُدّها قبل الإجابة. أقلّ من ذلك فقط إن نفدت الأسماء الحقيقية؛ لا تختلق اسماً لإكمال العدد. بإيجاز: name بالعربية؛ name_en إن وُجد (مهمّ للتحقّق)؛ role بست كلمات على الأكثر؛ country؛ gender (male أو female)؛ why جملة واحدة لا تتجاوز ١٥ كلمة؛ story_claim: الحدث المحدد الذي عاشه بنفسه (مكان وزمان إن عرفتهما) في ٢٥ كلمة على الأكثر، أو فارغ إن لم تعرف قصة محددة؛ story_type: first_hand (عاشها بنفسه) أو second_hand (يروي عن قرب ما عاشه أهله) أو adjacent أو expert.`,
    "- story_claim فرضية ستُفحص لاحقاً في مصادر حيّة ولن تُحتسب بدونها — لا تخمّن ولا تختلق قصة لشخص لتمنحه أولوية.",
    'أعد JSON فقط: {"people":[{"name":"","name_en":"","role":"","country":"","gender":"","why":"","story_claim":"","story_type":""}]}',
  ].join("\n")

  const user = JSON.stringify({
    topic: input.topic,
    want,
  })

  const r = await runAiTask<{ people?: ProposedName[] }>({
    taskKind: "discovery",
    subjectTable: "discovery_runs",
    subjectId: input.runId ?? null,
    seasonId: input.seasonId ?? null,
    promptVersion: PROPOSE_PROMPT_VERSION,
    input: {
      topic: input.topic,
      want,
      top_up: already.length > 0,
      already_proposed: already.length,
      exclusions: hardExclusions.length,
      soft_exclusions: softExclusions.length,
      geography: geo,
      gender: f.gender ?? null,
      taste: input.taste ?? "balanced",
    },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    // No temperature: the OpenAI adapter drops samplers unless effort is
    // "none" — it never applied. Effort ("medium") and the 180s timeout are
    // the discovery registry defaults (lib/ai-router/registry.ts), so
    // Settings can still override the effort.
    //
    // max_output_tokens counts reasoning + the visible list. v2-propose-3
    // at "high" spent 12,152 for 24 names (~5k visible, before the brevity
    // caps above). 12k bounds a runaway to ~$0.24 and roughly matches what
    // sol emits (~65 tok/s) inside the 180s timeout, so the cap and the
    // clock agree; a truncated tail is salvaged by the router's JSON repair.
    providerOptions: { max_output_tokens: PROPOSE_MAX_OUTPUT_TOKENS },
    // Only the top-up passes a timeout (what the job budget can spare); the
    // first call keeps the registry default so Settings stays in control.
    ...(opts.timeoutMs ? { timeoutMs: opts.timeoutMs } : {}),
    expectJson: true,
  })

  if (r.status !== "succeeded") {
    return { names: [], runId: r.runId, error: r.errorMessage ?? "propose failed" }
  }
  const names = (r.parsed?.people ?? [])
    .filter((p): p is ProposedName => Boolean(p && typeof p.name === "string" && p.name.trim()))
    .map((p) => ({
      name: p.name.trim(),
      name_en: p.name_en?.trim() || null,
      role: p.role?.trim() || null,
      country: p.country?.trim() || null,
      why: p.why?.trim() || null,
      story_claim: typeof p.story_claim === "string" ? p.story_claim.trim() || null : null,
      story_type:
        p.story_type === "first_hand" ||
        p.story_type === "second_hand" ||
        p.story_type === "adjacent" ||
        p.story_type === "expert"
          ? p.story_type
          : null,
      gender: p.gender === "male" || p.gender === "female" ? p.gender : null,
    }))
  return { names, runId: r.runId }
}
