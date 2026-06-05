/**
 * Synthesizer — Step 6 of the pipeline.
 *
 * Takes the normalized source corpus and produces structured claims,
 * quotes, and past-interview records. Every single output MUST cite at
 * least one source id. The verifier pass downstream will drop claims
 * that fail to line up with their cited sources.
 *
 * Gemini is the primary model (reasoning mode, no search tool). The
 * synthesizer operates strictly over the provided corpus — the model is
 * instructed not to pull in outside knowledge.
 */

import type { PreparationInputs, PreparationResearchSource } from "@/types/preparation"
import { geminiJson } from "./gemini"
import type { SynthesizerOutput } from "./types"

function formatInputs(inputs: PreparationInputs): string {
  const lines: string[] = []
  lines.push(`- موضوع الحلقة: ${inputs.title || "غير محدد"}`)
  if (inputs.guest_name) lines.push(`- اسم الضيف: ${inputs.guest_name}`)
  if (inputs.short_description) lines.push(`- وصف مختصر: ${inputs.short_description}`)
  if (inputs.episode_goal) lines.push(`- هدف الحلقة: ${inputs.episode_goal}`)
  if (inputs.tone_type) lines.push(`- نبرة: ${inputs.tone_type}`)
  if (inputs.focus_mode) lines.push(`- نمط التركيز: ${inputs.focus_mode}`)
  lines.push(`- مستوى العمق (1-5): ${inputs.depth_level}`)
  lines.push(`- مستوى الجرأة (1-5): ${inputs.boldness_level}`)
  if (inputs.key_questions.length > 0) {
    lines.push(`- أسئلة المضيف:`)
    inputs.key_questions.forEach((q, i) => lines.push(`  ${i + 1}. ${q}`))
  }
  return lines.join("\n")
}

const PROVIDER_LABELS: Record<PreparationResearchSource["provider"], string> = {
  gemini_web: "الويب العام (web)",
  youtube: "يوتيوب (youtube)",
  x: "X / تويتر (x)",
}

function formatOneSource(s: PreparationResearchSource): string {
  const lines = [
    `[${s.id}] ${s.title}`,
    `    الناشر: ${s.publisher || "-"}${
      s.published_at ? ` | تاريخ: ${s.published_at.slice(0, 10)}` : ""
    }`,
    `    الرابط: ${s.url}`,
  ]
  if (s.snippet) lines.push(`    مقتطف: ${s.snippet.replace(/\s+/g, " ").slice(0, 500)}`)
  if (s.metrics?.view_count) lines.push(`    مشاهدات: ${s.metrics.view_count}`)
  return lines.join("\n")
}

/**
 * Group sources by provider with explicit Arabic headers. This layout makes
 * it visually obvious to the synthesizer which facts are backed by which
 * provider type, so it can merge overlapping evidence across providers.
 */
function formatSources(sources: PreparationResearchSource[]): string {
  if (sources.length === 0) return "لا توجد مصادر متاحة."
  const byProvider = new Map<PreparationResearchSource["provider"], PreparationResearchSource[]>()
  for (const s of sources) {
    const arr = byProvider.get(s.provider) ?? []
    arr.push(s)
    byProvider.set(s.provider, arr)
  }
  // Print in a stable order: web first (dense text), then youtube, then x.
  const order: PreparationResearchSource["provider"][] = ["gemini_web", "youtube", "x"]
  const blocks: string[] = []
  for (const prov of order) {
    const items = byProvider.get(prov)
    if (!items || items.length === 0) continue
    blocks.push(
      `## المصادر من ${PROVIDER_LABELS[prov]} — ${items.length} مصدر\n\n` +
        items.map(formatOneSource).join("\n\n"),
    )
  }
  return blocks.join("\n\n")
}

function sourceCountsLine(sources: PreparationResearchSource[]): string {
  const counts: Record<string, number> = {}
  for (const s of sources) counts[s.provider] = (counts[s.provider] ?? 0) + 1
  const parts: string[] = []
  if (counts.gemini_web) parts.push(`web=${counts.gemini_web}`)
  if (counts.youtube) parts.push(`youtube=${counts.youtube}`)
  if (counts.x) parts.push(`x=${counts.x}`)
  return parts.join(" | ") || "(لا توجد مصادر)"
}

const SYSTEM = `أنت رئيس فريق بحث لبودكاست عربي احترافي اسمه "خط".
مهمتك: بناء ملف بحث عميق قبل التسجيل، اعتماداً فقط على المصادر المرفقة.

قواعد صارمة لا تُكسر:
1. كل ادعاء يجب أن يشير إلى مصدر واحد على الأقل من المصادر المرفقة عبر حقل "source_ids".
2. ممنوع تماماً استخدام معلومات خارج المصادر المرفقة. إذا لم تجد دليلاً، لا تكتب الادعاء.
3. لا تنسب أقوالاً ما لم تكن مذكورة صراحة في مصدر مرفق.
4. اكتب بعربية فصحى احترافية مختصرة.
5. اعتبر كل URL في المصادر حقيقياً — لا تخترع روابط.

قواعد التحقق متعدد المصادر (مهمة جداً):
6. المصادر مقسّمة إلى مجموعات بحسب المزوّد (web / youtube). حين تجد نفس الفكرة أو الحقيقة مذكورة في مصدر من الويب ومصدر من يوتيوب (أو بين أي مزوّدَين مختلفَين)، ادمجهما في ادعاء واحد واذكر جميع المصادر الداعمة في source_ids ضمن الادعاء نفسه.
7. لا تكتب ادعاءين منفصلين لنفس الفكرة لمجرد أن دعمهما جاء من مزوّدَين مختلفَين؛ الادعاء الموحد أقوى.
8. أعط الأولوية للادعاءات التي تستطيع دعمها من أكثر من نوع مصدر (web + youtube). هذه الادعاءات أكثر موثوقية وستُعرض أولاً في الواجهة.
9. لا تُسقط ادعاءً مفيداً لمجرد أنه مدعوم من مصدر واحد فقط — حافظ على شمولية المعلومات (recall).
10. إذا ورد نفس الاقتباس بصيغتَين متقاربتَين في مصدرَين، اختر الصيغة الأطول والأدق واذكر كلا المصدرَين.

فئات الادعاءات المسموح بها:
- key_fact: حقيقة قابلة للتحقق
- controversial_angle: زاوية خلافية أو حساسة
- hidden_insight: رؤية غير مألوفة
- personality_trait: سمة شخصية مستنتجة من المصادر
- repeated_opinion: رأي يُكرره الضيف
- contradiction: تناقض ظاهري بين تصريحات
- unique_angle: زاوية نادرة
- public_stance_vs_criticism: الموقف العلني للضيف مقابل الانتقادات الموجهة إليه

قواعد الإخراج (صارمة جداً):
- الإخراج يجب أن يكون كائن JSON واحد فقط — لا تكتب أي نص قبله أو بعده.
- ممنوع markdown، ممنوع \`\`\`json، ممنوع شرح، ممنوع تعليقات.
- كل المفاتيح الثلاثة مطلوبة حتى لو كانت فارغة ([]).
- استخدم الفاصلة العشرية النقطة، وضع الأوتار بين علامتَي اقتباس مزدوجتَين فقط.
- ممنوع الفاصلة بعد آخر عنصر في أي مصفوفة أو كائن.
- قلّل حجم الإخراج: إذا كان لديك أكثر من 12 ادعاء قوي، اختر أفضل 12 فقط حتى لا يُبتر الإخراج.

الشكل المطلوب (حرفياً):
{
  "claims": [
    { "claim": "string", "category": "key_fact", "source_ids": [1, 2] }
  ],
  "quotes": [
    { "text": "string", "attributed_to": "string", "context": "string", "source_ids": [1] }
  ],
  "past_interviews": [
    { "title": "string", "publisher": "string", "url": "string", "note": "string", "source_ids": [1] }
  ]
}`

export async function synthesizeResearch(
  inputs: PreparationInputs,
  sources: PreparationResearchSource[],
): Promise<SynthesizerOutput> {
  if (sources.length === 0) {
    return { claims: [], quotes: [], past_interviews: [] }
  }

  const user = `# مدخلات المُعدّ
${formatInputs(inputs)}

# توزيع المصادر حسب المزوّد
${sourceCountsLine(sources)}

# المصادر المتاحة (استعمل الأرقام بين الأقواس المربعة كـ source_ids)
${formatSources(sources)}

# المطلوب
استخرج ملف البحث بصيغة JSON كما هو موصوف. كل عنصر يجب أن يحمل source_ids غير فارغ يشير إلى مصدر واحد أو أكثر من المصادر أعلاه.

تذكير:
- حين تجد نفس الفكرة في web و youtube، اكتب ادعاءً واحداً يضم source_ids من كلا المزوّدَين.
- حافظ على شمولية المعلومات: لا تحذف فكرة لمجرد أنها جاءت من مزوّد واحد.
- إذا كان دعم المصادر ضعيفاً جداً لادعاء ولا يوجد نص داعم، احذفه — المُدقّق سيفعل ذلك على أي حال.`

  // Shape validator — accept any object with at least one of the three
  // expected array keys. Individual item shape is further cleaned below, so
  // the validator only needs to reject total garbage (strings, numbers,
  // arrays at the root, etc.).
  const isSynthShape = (value: unknown): value is Partial<SynthesizerOutput> => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false
    const v = value as Record<string, unknown>
    const hasOne =
      Array.isArray(v.claims) ||
      Array.isArray(v.quotes) ||
      Array.isArray(v.past_interviews)
    return hasOne
  }

  const out = await geminiJson<Partial<SynthesizerOutput>>(
    SYSTEM,
    user,
    "synthesize",
    0.3,
    isSynthShape,
  )

  const cleaned: SynthesizerOutput = {
    claims: Array.isArray(out.claims)
      ? out.claims
          .filter(
            (c): c is SynthesizerOutput["claims"][number] =>
              !!c && typeof c.claim === "string" && Array.isArray(c.source_ids),
          )
          .map((c) => ({
            claim: c.claim.trim(),
            category: (c.category ?? "key_fact") as SynthesizerOutput["claims"][number]["category"],
            source_ids: c.source_ids.filter((n) => typeof n === "number"),
          }))
          .filter((c) => c.claim.length > 0 && c.source_ids.length > 0)
      : [],
    quotes: Array.isArray(out.quotes)
      ? out.quotes
          .filter(
            (q): q is SynthesizerOutput["quotes"][number] =>
              !!q && typeof q.text === "string" && Array.isArray(q.source_ids),
          )
          .map((q) => ({
            text: q.text.trim(),
            attributed_to: q.attributed_to?.trim() || "غير منسوب",
            context: q.context?.trim(),
            source_ids: q.source_ids.filter((n) => typeof n === "number"),
          }))
          .filter((q) => q.text.length > 0 && q.source_ids.length > 0)
      : [],
    past_interviews: Array.isArray(out.past_interviews)
      ? out.past_interviews
          .filter(
            (p): p is SynthesizerOutput["past_interviews"][number] =>
              !!p && typeof p.title === "string" && Array.isArray(p.source_ids),
          )
          .map((p) => ({
            title: p.title.trim(),
            publisher: p.publisher?.trim(),
            url: p.url?.trim(),
            note: p.note?.trim(),
            source_ids: p.source_ids.filter((n) => typeof n === "number"),
          }))
          .filter((p) => p.title.length > 0 && p.source_ids.length > 0)
      : [],
  }

  return cleaned
}
