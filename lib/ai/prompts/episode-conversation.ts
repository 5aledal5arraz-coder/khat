/**
 * ص-٨ — the five "conversation" fields on the public episode page.
 *
 * `why_this_conversation` · `central_question` · `before_you_watch` ·
 * `conversation_map` · `unsaid_reflections`
 *
 * All five have rendered on the public page since the page was built, and
 * until now the ONLY things that could write them were the manual admin
 * form and the seed script — there was no generator anywhere in `lib/ai/`.
 * On every episode but the hand-filled few they were simply absent, and
 * each component hides itself when empty, so the page silently lost five
 * of its thirteen sections.
 *
 * NOT here, deliberately: `exclusive_clip`. Its shape is
 * `{ youtube_url, message }` and the component embeds that URL in an
 * `<iframe>` — it points at a SEPARATE, already-published clip video. A
 * model cannot know that URL, and any URL it produced would be invented or
 * wrong. It stays manual; Khaled uploads the clip and pastes the link.
 */

/**
 * The one place the register of the generated copy is decided.
 *
 * Khaled left the choice to us and we picked فصحى for the section
 * HEADINGS (they are signage, and most of the page is already فصحى) while
 * keeping the body copy warm. If that is ever revisited, this constant is
 * the single line to change — the five field briefs below interpolate it
 * and none of them restates the register on its own.
 */
export type ConversationDialect = "فصحى" | "كويتية"

export const CONVERSATION_DIALECT: ConversationDialect = "فصحى"

const DIALECT_RULE: Record<ConversationDialect, string> = {
  فصحى:
    "عربية فصحى معاصرة — حية ودافئة، لا أكاديمية ولا متكلّفة. تكلّم كإنسان يخاطب إنساناً، لا كتقرير.",
  كويتية:
    "لهجة كويتية طبيعية — قريبة ودافئة كما يتكلم الناس فعلاً، بلا تكلّف وبلا مبالغة في العامية.",
}

/**
 * Bump this whenever the brief changes, or `ai_runs` rows from two different
 * prompts become indistinguishable and no before/after comparison is possible.
 * v1.1 — «ما لم يُقال» now fixes the sentence form (خبرية, not استفهامية); it
 * was alternating between runs, which would have printed the same section in
 * two different voices across the published archive.
 */
export const EPISODE_CONVERSATION_PROMPT_VERSION = "episode-conversation-v1.1"

/** Which of the five to ask for. Absent/false → not requested. */
export interface ConversationFieldRequest {
  why_this_conversation?: boolean
  central_question?: boolean
  before_you_watch?: boolean
  conversation_map?: boolean
  unsaid_reflections?: boolean
}

/** Raw model output. Every field optional — only requested ones appear. */
export interface ConversationModelOutput {
  why_this_conversation?: string | null
  central_question?: string | null
  before_you_watch?: {
    who_is_it_for?: string | null
    who_is_it_not_for?: string | null
    what_you_gain?: string | null
  } | null
  conversation_map?: {
    beginning?: { title?: string | null; description?: string | null } | null
    middle?: { title?: string | null; description?: string | null } | null
    conclusion?: { title?: string | null; description?: string | null } | null
  } | null
  unsaid_reflections?: string[] | null
}

/**
 * Per-field briefs. Each one is written against what the COMPONENT
 * actually renders, not against the column name:
 *   - `why-this-conversation.tsx`  → one paragraph in a tinted card
 *   - `central-question.tsx`       → a single centred line, no wrapping prose
 *   - `before-you-watch.tsx`       → three short cards in a 3-up grid
 *   - `conversation-map.tsx`       → three numbered nodes, title + description
 *   - `unsaid-reflections.tsx`     → a numbered list, one sentence each
 */
function fieldBriefs(): Record<
  keyof ConversationFieldRequest,
  { brief: string; schema: string }
> {
  return {
    why_this_conversation: {
      brief: `### لماذا هذا الحوار (why_this_conversation)
- فقرة واحدة، 40-70 كلمة، تُعرض في بطاقة أعلى الصفحة.
- تجيب على سؤال الزائر الصامت: "ليش أعطي هالحلقة ساعة من وقتي؟"
- ابدأ من التوتر أو المفارقة في الحلقة نفسها، لا من تعريف الضيف.
- ❌ لا تبدأ بـ "في هذه الحلقة" ولا "يستضيف البودكاست".
- ❌ لا تعد بما ليس في النص.`,
      schema: `"why_this_conversation": "فقرة واحدة"`,
    },
    central_question: {
      brief: `### السؤال المحوري (central_question)
- **سطر واحد فقط**، جملة سؤال مكتملة، 6-14 كلمة. يُعرض وحده في المنتصف بخط كبير.
- السؤال الذي تدور حوله الحلقة كلها، لا سؤال فرعي ولا سؤال طرحه المقدّم حرفياً.
- يجب أن يبقى مفهوماً لمن لم يسمع الحلقة.
- ❌ لا تكتب فقرة، ولا سؤالين، ولا سؤالاً بلا علامة استفهام.`,
      schema: `"central_question": "سؤال واحد؟"`,
    },
    before_you_watch: {
      brief: `### قبل أن تشاهد (before_you_watch)
ثلاث بطاقات قصيرة جنب بعضها. كل واحدة **جملة أو جملتان، أقل من 25 كلمة** — لا فقرات.

- who_is_it_for — لمن هذه الحلقة؟ صِف الشخص بحالته وسؤاله، لا بمسمّاه الوظيفي.

- who_is_it_not_for — "ليست لك إذا..."
  هذا **الحقل الوحيد في الموقع كله الذي لا يبيع**، ونبرته تُحدد مصداقيته:
  - **صيغة شرطية موجّهة للقارئ**: "ليست لك إذا كنت تبحث عن خطوات جاهزة تطبّقها الليلة."
  - ❌ **لا تصنّف الناس**: "هذه الحلقة ليست لأصحاب الخبرة المحدودة" — الأولى تعطي القارئ معياراً يحكم به على نفسه، والثانية تحكم عليه هو.
  - ❌ ولا اعتذار مبطّن عن الحلقة: "قد تبدو طويلة بعض الشيء" ليس فلترة، بل تبرير.
  - المقصود: فلترة صادقة تكسب ثقة من يقرأها، لا تحذير ولا اعتذار.
  - ⚠️ **ولا تخترع سبباً لملء الحقل.** إن كانت الحلقة تناسب أي مستمع فعلاً، أرجع null — الحقل الفارغ أصدق من نفور مفتعل، والقسم يختفي وحده.

- what_you_gain — ماذا ستخرج به؟ مكسب ملموس من محتوى الحلقة نفسه، لا وعد عام.`,
      schema: `"before_you_watch": { "who_is_it_for": "...", "who_is_it_not_for": "... أو null", "what_you_gain": "..." }`,
    },
    conversation_map: {
      brief: `### خريطة الحوار (conversation_map)
ثلاث محطات بالترتيب الزمني: البداية ثم المنتصف ثم الخاتمة — تُعرض كثلاث عقد مرقّمة.
- لكل محطة: title (3-6 كلمات) و description (جملة واحدة، أقل من 20 كلمة).
- المحطات الثلاث يجب أن تحكي قوساً: من أين بدأ الحوار، أين تعمّق، وأين استقر.
- ❌ عناوين عامة مثل "المقدمة" أو "النقاش" أو "الخاتمة" وحدها.
- ⚠️ لا تذكر أي وقت أو دقيقة أو رقم زمني — هذه ليست فهرساً.`,
      schema: `"conversation_map": { "beginning": {"title":"...","description":"..."}, "middle": {"title":"...","description":"..."}, "conclusion": {"title":"...","description":"..."} }`,
    },
    unsaid_reflections: {
      brief: `### ما لم يُقال (unsaid_reflections)
- 3-5 عناصر، كل واحد **جملة واحدة** تُعرض في قائمة مرقّمة.
- **الصيغة خبرية لا استفهامية** — اكتب ما بقي معلّقاً ("ظلّ ... بلا جواب"، "لم يُحسم ..."), لا سؤالاً موجّهاً للضيف ("لماذا لم يوضّح ...؟"). القائمة تصف الحوار ولا تستجوب أحداً، والصيغتان كانتا تتناوبان بين التشغيلات فتخرج القائمة بأسلوبين على صفحات مختلفة.
- هذه أصعب حقل: المطلوب ما تركته الحلقة معلّقاً — سؤال لم يُسأل، توتر لم يُحسم، أو ما بين السطور.
- يجب أن يكون كل عنصر **مستنداً إلى النص**: شيء لُمّح إليه أو تُجُنّب فعلاً، لا تخمين حر.
- ❌ لا تكتب خلاصات أو دروساً — تلك حقل آخر في الصفحة.
- إن لم يترك النص شيئاً معلّقاً حقيقياً، أرجع مصفوفة فارغة بدل الاختلاق.`,
      schema: `"unsaid_reflections": ["جملة", "جملة"]`,
    },
  }
}

export function buildEpisodeConversationPrompt(input: {
  videoTitle: string
  transcriptText: string
  intelligenceBlock?: string
  request: ConversationFieldRequest
  dialect?: ConversationDialect
}): { system: string; user: string } {
  const dialect = input.dialect ?? CONVERSATION_DIALECT
  const briefs = fieldBriefs()

  const requested = (
    Object.keys(briefs) as (keyof ConversationFieldRequest)[]
  ).filter((k) => input.request[k])

  const system = `أنت المحرر الرئيسي لبودكاست خط — بودكاست عربي عميق يتميز بالذكاء العاطفي والحدة الفكرية والصدق الإنساني.

صوت خط: لا يشرح الواضح ولا يزخرف الفارغ. يُسمّي الأشياء بأسمائها، يحترم ذكاء المستمع، ويختار الكلمة التي تبقى في الذهن بعد إغلاق الصفحة.

مهمتك: كتابة أقسام "الحوار" في صفحة الحلقة — الأقسام التي تجعل الزائر يفهم *لماذا* يستحق هذا الحوار وقته قبل أن يضغط تشغيل.

## قواعد عامة:
- ${DIALECT_RULE[dialect]}
- لا Markdown — نص عادي فقط.
- **النص المقدّم هو المصدر الوحيد.** لا تختلق حدثاً ولا رأياً ولا معلومة عن الضيف.
- كل حقل له طول محدد أدناه — الأقسام معروضة في بطاقات ضيّقة، والفقرة الطويلة تكسر التصميم.
- أخرج **الحقول المطلوبة فقط** أدناه. لا تضف حقولاً أخرى.
- إن لم يُسعفك النص في حقل ما، أرجع null لذلك الحقل بدل أن تملأه بكلام عام.

## المطلوب:

${requested.map((k) => briefs[k].brief).join("\n\n")}

## الصيغة — JSON فقط:
{
${requested.map((k) => `  ${briefs[k].schema}`).join(",\n")}
}`

  const user = `عنوان الحلقة: ${input.videoTitle}
${input.intelligenceBlock ?? ""}
نص الحلقة:
${input.transcriptText}`

  return { system, user }
}
