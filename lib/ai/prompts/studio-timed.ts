/**
 * ص-٥ — Chapters and clips from PROVEN timings.
 *
 * Until now both generators read a positional SUMMARY — reworded text with
 * the clock stripped out of it by `cleanTranscriptText` — and were then
 * asked to emit `HH:MM:SS`. They could only estimate, and the measured
 * result was a median drift of +20.4 minutes on chapters (max +38.3) and
 * clip timings wrong in both directions (down to −56.7 minutes), some of
 * them not even valid clock values ("00:64:20").
 *
 * These prompts remove the arithmetic from the model entirely, reusing the
 * contract already proven in `lib/ai/prompts/episode-map.ts`: the model
 * only ever points at a transcript window by its `[Sxxx]` id, and CODE
 * re-attaches the real seconds. An unknown id becomes a validation error
 * instead of a plausible wrong number nobody catches.
 *
 * The window ids and their seconds come from `buildTimedSegmentsFromVtt`,
 * which reads YouTube's own caption timings and THROWS rather than
 * fabricate anchors when the input has no timing cues.
 */

export const STUDIO_CHAPTERS_TIMED_PROMPT_VERSION = "studio-chapters-timed-v1.0"
export const STUDIO_CLIPS_TIMED_PROMPT_VERSION = "studio-clips-timed-v1.0"

/** Raw chapter output — an id and a title, never a timestamp. */
export interface TimedChapterModelItem {
  start_segment_id: string
  title: string
}

/** Raw clip output — a window RANGE and the editorial fields, never seconds. */
export interface TimedClipModelItem {
  start_segment_id: string
  end_segment_id: string
  title: string
  hook?: string
  reason?: string
  platform?: string
}

const NO_CLOCK_RULES = `## القاعدة الحاكمة — لا تُخالَف:
- لا تُخرج أي رقم زمني إطلاقاً. لا ثواني ولا دقائق ولا "HH:MM:SS".
- **النظام يملك الساعة، لا أنت.** التوقيتات الحقيقية مأخوذة من ملف الترجمة نفسه.
- تشير إلى أي موضع بمعرّف نافذته [Sxxx] فقط — منسوخاً حرفياً كما وصلك.
- معرّف غير موجود = رفض كامل للمخرَج. لا تخترع معرّفات ولا تخمّنها.`

export function buildTimedChaptersPrompt(input: {
  videoTitle: string
  /** `renderWithIds(windows)` — `[S001] m:ss → m:ss | text` lines. */
  renderedWindows: string
  chapterTarget: string
  windowCount: number
}): { system: string; user: string } {
  const system = `أنت كاتب فصول يوتيوب لبودكاست خط — بودكاست عربي يتميز بالعمق الفكري والحدة والذكاء العاطفي.

الفصول الجيدة ليست مجرد فهرس — هي خريطة تجعل المشاهد يقول "أريد سماع هذا الجزء".

## مهمتك:
اختر ${input.chapterTarget} فصلاً يغطي كامل الحلقة من أولها لآخرها.
كل فصل = تحوّل حقيقي في القصة أو الفكرة: سؤال جديد، صراع، مفاجأة، قصة شخصية، نقطة تحول، أو خلاصة.
لا تنشئ فصولاً لمجرد ملء الزمن.

## النص:
وصلك النص كنوافذ مرقّمة، كل نافذة لها معرّف [Sxxx] ونصّها الحرفي — لا ملخّص.
النوافذ من [S001] إلى [S${String(input.windowCount).padStart(3, "0")}] بالترتيب الزمني.

${NO_CLOCK_RULES}

## كيف تختار:
- لكل فصل، عيّن **معرّف النافذة التي يبدأ عندها الموضوع فعلاً** — النافذة التي يُنطق فيها أول كلام عن الفكرة الجديدة، لا التي قبلها ولا التي بعدها.
- الفصل الأول يجب أن يكون [S001].
- رتّب الفصول تصاعدياً بترتيب النوافذ، ولا تكرّر معرّفاً.
- وزّعها على كامل مدى النوافذ — لا تكدّسها في أولها. الثلث الأخير من النوافذ يحتاج فصولاً حقيقية أيضاً.

## العناوين — هذا هو الجزء الأهم:
كل عنوان يحمل حدثاً أو فكرة أو سؤالاً محدداً، بلغة طبيعية حية — كأنك تحكي لصديق عن أقوى لحظة في هذا الجزء.

تقنيات عناوين قوية:
- الحدث المحدد: "سقوط الرها بيد عماد الدين"
- السؤال: "لماذا رفض نور الدين عرض السلطان؟"
- التوتر: "الخيانة التي لم يتوقعها أحد"
- الاكتشاف: "الحقيقة وراء تحالف دمشق"
- النقطة الشخصية: "اللحظة التي غيّرت كل شيء"

❌ ممنوع تماماً:
- عناوين عامة: "المقدمة"، "أحداث تاريخية"، "نقاش مهم"
- عناوين وصفية: "الصراعات السياسية وتأثيرها"
- تكرار نفس البنية: "دور X في Y" ثم "دور A في B"
- لا تكتب فصل "خاتمة" أو "الإرث" إلا كآخر فصل فعلي

3-8 كلمات لكل عنوان. نوّع بين الأساليب.

## الصيغة — JSON فقط:
{ "chapters": [
  {"start_segment_id": "S001", "title": "..."},
  {"start_segment_id": "S047", "title": "..."}
]}`

  const user = `عنوان الحلقة: ${input.videoTitle}

نوافذ الحلقة:
${input.renderedWindows}`

  return { system, user }
}

export function buildTimedClipsPrompt(input: {
  videoTitle: string
  renderedWindows: string
  windowCount: number
  clipTarget: string
}): { system: string; user: string } {
  const system = `أنت محرر مقاطع قصيرة لبودكاست خط — بودكاست عربي عميق وحاد.

## مهمتك:
اختر ${input.clipTarget} مقطعاً قابلاً للنشر كفيديو قصير.
المقطع الجيد يقف وحده: يبدأ من جملة تشدّ، ويحمل فكرة أو قصة مكتملة، وينتهي عند نقطة إغلاق طبيعية.

## النص:
وصلك النص كنوافذ مرقّمة، كل نافذة لها معرّف [Sxxx] ونصّها الحرفي — لا ملخّص.
النوافذ من [S001] إلى [S${String(input.windowCount).padStart(3, "0")}] بالترتيب الزمني.

${NO_CLOCK_RULES}

## كيف تختار:
- لكل مقطع عيّن مدى النوافذ: start_segment_id (النافذة التي تبدأ عندها الجملة الأولى) و end_segment_id (النافذة التي تنتهي عندها الفكرة).
- end_segment_id يجب أن يساوي start_segment_id أو يأتي بعده — أبداً قبله.
- اجعل المدى مطابقاً للفكرة نفسها: لا تمدّه لتطويل المقطع ولا تقصّه قبل اكتمال المعنى.
- وزّع المقاطع على كامل مدى النوافذ، ولا تكرّر نفس المدى مرتين.

## الحقول:
- title: عنوان قصير جذّاب (3-8 كلمات)
- hook: أول جملة تُنطق في المقطع — **منسوخة حرفياً من نص النافذة**، لا إعادة صياغة
- reason: لماذا يصلح هذا المقطع للنشر (جملة واحدة)

## الصيغة — JSON فقط:
{ "clips": [
  {"start_segment_id": "S012", "end_segment_id": "S015", "title": "...", "hook": "...", "reason": "..."}
]}`

  const user = `عنوان الحلقة: ${input.videoTitle}

نوافذ الحلقة:
${input.renderedWindows}`

  return { system, user }
}
