/**
 * v2 step 1 — propose real named people.
 *
 * The LLM has strong recall of real public figures; we use it ONLY to
 * generate names + light context. Truth/verification comes later from
 * Wikidata. We deliberately ask for MORE names than we need because
 * Wikidata resolution will prune the unreal ones.
 *
 * Quality levers (added after the selection-quality audit):
 *   - cross-run memory: names we already interviewed / promoted /
 *     operator-rejected are excluded inside the prompt; recently
 *     surfaced names are soft-discouraged so runs stop repeating the
 *     same celebrities.
 *   - explicit diversity quotas: the prompt asks for a spread across
 *     proximity-to-topic angles (core experts, adjacent voices, lived
 *     experience) instead of one undifferentiated list.
 */

import { runAiTask } from "@/lib/ai-router"
import type { DiscoveryMemory } from "./memory"
import type { ProposedName, V2RunInput } from "./types"

export async function proposeNames(
  input: V2RunInput,
  want: number,
  memory?: DiscoveryMemory,
): Promise<{ names: ProposedName[]; runId: string; error?: string }> {
  const f = input.filters ?? {}
  const genderLine =
    f.gender === "male"
      ? "رجال فقط."
      : f.gender === "female"
        ? "نساء فقط."
        : "أيّ جنس."
  const natLine =
    f.nationality === "kuwaiti"
      ? "كويتيون فقط."
      : f.nationality === "non_kuwaiti"
        ? "من خارج الكويت (يفضّل عرب). لا تقترح أيّ كويتي."
        : f.country
          ? `يفضّل من: ${f.country}.`
          : "يفضّل شخصيات عربية معروفة."
  const tasteLine =
    input.taste === "famous"
      ? "فضّل الأكثر شهرة وبروزاً."
      : input.taste === "hidden_gems"
        ? "فضّل أصواتاً عميقة أقلّ شهرة لكنها حقيقية وموثّقة."
        : "وازن بين الشهرة والعمق."

  const hardExclusions = memory?.excludeNames ?? []
  const softExclusions = memory?.recentlySurfacedNames ?? []

  const system = [
    "أنت باحث ترشيحات ضيوف لبودكاست عربي حواري عميق اسمه «خط».",
    "اقترح أشخاصاً حقيقيين معروفين — أفراداً من البشر فقط — يصلحون ضيوفاً حول الموضوع.",
    "قواعد:",
    "- أسماء حقيقية لأشخاص موجودين فعلاً فقط. لا تختلق. لا تقترح قنوات أو برامج أو مؤسسات.",
    `- ${genderLine}`,
    `- ${natLine}`,
    `- ${tasteLine}`,
    "- نوّع زوايا الترشيح عمداً — قسّم القائمة تقريباً إلى:",
    "  • متخصّصون في صلب الموضوع (أكاديميون/باحثون/ممارسون)،",
    "  • أصوات من مجالات مجاورة تضيء الموضوع من زاوية غير متوقّعة،",
    "  • أصحاب تجربة شخصية حقيقية موثّقة مع الموضوع.",
    "- الضيف المثالي «حكّاء»: له ظهور إعلامي أو محاضرات أو كتب — لا أسماء ورقية بلا حضور.",
    ...(hardExclusions.length
      ? [
          "- ممنوع نهائياً اقتراح هذه الأسماء (سبق استضافتهم أو رُفضوا):",
          "  " + hardExclusions.join("، "),
        ]
      : []),
    ...(softExclusions.length
      ? [
          "- تجنّب تكرار هذه الأسماء المقترحة مؤخراً إلا إذا كان الاسم مثالياً بشكل استثنائي لهذا الموضوع تحديداً:",
          "  " + softExclusions.join("، "),
        ]
      : []),
    `- أعطِ حتى ${want} اسماً. لكلّ اسم: الاسم بالعربية، الاسم بالإنجليزية إن وُجد (مهمّ للتحقّق)، الدور/التخصّص، البلد، وسبب قصير لملاءمته.`,
    'أعد JSON فقط: {"people":[{"name":"","name_en":"","role":"","country":"","why":""}]}',
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
    promptVersion: "v2-propose-2",
    input: {
      topic: input.topic,
      want,
      exclusions: hardExclusions.length,
      soft_exclusions: softExclusions.length,
    },
    prompt: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    expectJson: true,
    providerOptions: { temperature: 0.6 },
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
    }))
  return { names, runId: r.runId }
}
