/**
 * Khat Brain — Discovery Archetype prompt builder (consolidated).
 *
 * Extracted from lib/discovery/seed-archetypes.ts in Phase 0. The string
 * construction is byte-equivalent to the previous inline code. The
 * system prompt is the unchanged Arabic editorial brief; the user
 * block assembles the optional seed prompt + editorial context.
 */

export const DISCOVERY_ARCHETYPES_PROMPT_VERSION =
  "discovery-archetypes-v1.0"

const SYSTEM_PROMPT = `أنت محلل تحريري لبودكاست خط — بودكاست عربي عميق يبحث عن ضيوف لم يُكتشفوا بعد.

مهمتك: توليد أنماط بشرية (archetypes) — ليس أسماء، ولا حسابات اجتماعية، بل أنماط من القصص والتجارب الإنسانية.

## ما يميز ضيف خط:
- قصة تحوّل صادقة (لا يلمع شيئاً جاهزاً)
- خبرة هادئة عميقة (لا يصرخ بمؤهلاته)
- صراع داخلي حقيقي مع جمهور صغير
- صدق نادر في الكلام عن الفقد، المال، الهوية، النجاح، العائلة، الفشل، الإيمان
- تحوّل من نقطة إلى أخرى تستحق الحكاية

## القاعدة الذهبية:
- لا نبحث عن مشاهير
- لا نبحث عمّن لديه ملايين متابعين
- نبحث عمّن عاش تجربة تستحق أن تُحكى

## مخرجاتك:
أنتج N من النماذج البشرية المتنوعة. كل نموذج:
- id: مفتاح إنجليزي قصير (مثل: quiet_expert, transformation_story)
- name: اسم بالعربية (4-6 كلمات)
- description: وصف من جملتين عن نوع الإنسان الذي نبحث عنه
- target_signals: 3-5 إشارات نبحث عنها في الأدلة (مزيج عربي + إنجليزي)
- expected_traits: 2-4 صفات يجب أن يؤكدها التحقق

JSON فقط:
{ "archetypes": [{ "id": "...", "name": "...", "description": "...", "target_signals": [...], "expected_traits": [...] }] }`

export interface DiscoveryArchetypesPromptInput {
  count: number
  seedPrompt?: string | null
  editorialContext?: string
}

export interface BuiltDiscoveryArchetypesPrompt {
  system: string
  user: string
  version: string
}

export function buildDiscoveryArchetypesPrompt(
  input: DiscoveryArchetypesPromptInput,
): BuiltDiscoveryArchetypesPrompt {
  const user = [
    input.seedPrompt ? `## طلب المسؤول:\n${input.seedPrompt}` : null,
    input.editorialContext
      ? `## السياق التحريري:\n${input.editorialContext}`
      : null,
    `أنتج ${input.count} نماذج بشرية. JSON فقط.`,
  ]
    .filter(Boolean)
    .join("\n\n")

  return {
    system: SYSTEM_PROMPT,
    user,
    version: DISCOVERY_ARCHETYPES_PROMPT_VERSION,
  }
}
