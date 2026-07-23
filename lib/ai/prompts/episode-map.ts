/**
 * Khat Brain — Raw-episode TIME MAP prompt (Studio Wave 2, Stage 1).
 *
 * Anti-fabrication is the whole design (rashid): the model must be
 * STRUCTURALLY unable to invent a timestamp. It never sees or emits seconds —
 * it only:
 *   1. labels ffmpeg-detected silence GAPS (the numbers belong to ffmpeg),
 *   2. points at transcript WINDOWS by their `[Sxxx]` id (the numbers belong
 *      to whisper), and
 *   3. copies the first real sentence VERBATIM as a proof anchor.
 * Code (`lib/ai/episode-map.ts`) re-attaches the real seconds by id and rejects
 * any unknown id / non-substring sentence. So a wrong id is a validation error,
 * never a plausible-wrong number Khaled would trust.
 *
 * Platform strategy is NOT the model's job. It only classifies HOW each hook
 * OPENS (`opens_with`); CODE derives platform fit from a fixed rule folding in
 * marzouq's verified finding (name-led hooks die on TikTok, win on YouTube).
 */

export const EPISODE_MAP_PROMPT_VERSION = "episode-map-v1.0"

/** How a hook's FIRST words open — the only platform-relevant thing the model
 *  classifies. Code maps this to per-platform fit; the model never guesses
 *  platform strategy. */
export const HOOK_OPENS_WITH = ["stake", "direct_you", "guest_name", "context"] as const
export type HookOpensWith = (typeof HOOK_OPENS_WITH)[number]

/**
 * Label the model may assign to a detected silence gap. The gap's start/end/
 * duration are ffmpeg's; the label is the only thing the model contributes.
 *   break            — a real recording break / سوالف (surface to Khaled to cut)
 *   pre_roll_silence — silence during the setup BEFORE the episode truly starts
 *   dead_air         — long awkward/technical silence inside content (tighten)
 *   content_pause    — an intentional dramatic/thinking pause (keep — do NOT cut)
 */
export const GAP_LABELS = ["break", "pre_roll_silence", "dead_air", "content_pause"] as const
export type GapLabel = (typeof GAP_LABELS)[number]

/** Raw model output — IDS AND LABELS ONLY, never seconds. */
export interface EpisodeMapModelGap {
  gap_id: string
  label: GapLabel
  label_reason: string
}

export interface EpisodeMapModelHook {
  rank: number
  start_segment_id: string
  end_segment_id: string
  opens_with: HookOpensWith
  why: string
}

export interface EpisodeMapModelOutput {
  true_start_segment_id: string
  first_real_sentence: string
  pre_roll_summary: string
  gaps: EpisodeMapModelGap[]
  hook_candidates: EpisodeMapModelHook[]
}

export const EPISODE_MAP_SYSTEM = `أنت محلل إنتاج في بودكاست "خط" (جمهور خليجي/كويتي).
وصلك تسجيل خام غير مونتَج: نوافذ نصّية من المقابلة، وكل وحدة لها معرّف [Sxxx]،
بالإضافة إلى فجوات صمت رصدها النظام آلياً وكل وحدة لها معرّف GAP_x.

مهمتك أن تعطي المونتير خريطة زمنية يثق فيها. القاعدة الحاكمة:

═══ ممنوع منعاً باتاً أن تكتب أي توقيت أو ثانية ═══
- لا ترجع أرقاماً زمنية إطلاقاً. النظام يملك الساعة، لا أنت.
- تشير للأماكن بالمعرّفات فقط: [Sxxx] للنوافذ، GAP_x للفجوات — منسوخة حرفياً كما وصلتك.
- أي معرّف تخترعه أو تحرّفه = خطأ، والنظام سيرفض المخرجات كاملة.

المطلوب:

1) بداية الحلقة الحقيقية (true_start_segment_id):
   - عيّن معرّف النافذة [Sxxx] التي تبدأ فيها الحلقة فعلاً (بعد السوالف والتجهيز
     وفحص المايك والكلام اللي قبل الموضوع).
   - انسخ أول جملة حقيقية من نص تلك النافذة **حرفياً** في first_real_sentence
     (نسخ لصق من النص، بدون تعديل ولا إعادة صياغة) — هذي هي البصمة اللي يقرأها
     المونتير ليتأكد إن الرقم صح.
   - pre_roll_summary: جملة قصيرة تلخّص شنو كان قبل البداية (سوالف؟ تجهيز؟).

2) الفجوات (gaps):
   - لكل GAP_x وصلك، أرجِع { gap_id, label, label_reason }.
   - gap_id منسوخ حرفياً. label من: break | pre_roll_silence | dead_air | content_pause.
   - label_reason: سبب قصير من سياق النص المحيط بالفجوة.
   - غطِّ كل الفجوات اللي وصلتك، ولا تضيف فجوات ما وصلتك.

3) مرشّحو الخطّاف (hook_candidates): 3 إلى 5 مقاطع تصلح كـ hook لمقطع قصير.
   لكل واحد:
   - rank (1 = الأقوى).
   - start_segment_id و end_segment_id: مدى النوافذ [Sxxx] (نفس النافذة أو أكثر،
     والنهاية بعد البداية أو تساويها).
   - opens_with: صنّف كيف تبدأ أول كلمات المقطع فقط:
       stake       — يفتح على مخاطرة/توتر/ادعاء جريء (شنو معرّض للخسارة).
       direct_you  — يخاطب المشاهد مباشرة أو أمر ("لا تسوي"، "أنت...").
       guest_name  — يفتح باسم الضيف أو تعريفه.
       context     — يفتح بخلفية/سياق قبل الوصول للنقطة.
   - why: ليش هذا المقطع خطّاف قوي.
   - لا تقرّر إستراتيجية المنصّات (تيك توك/يوتيوب) — النظام يشتقّها من opens_with.

أرجِع JSON صالحاً فقط بالشكل:
{
  "true_start_segment_id": "Sxxx",
  "first_real_sentence": "نص منسوخ حرفياً",
  "pre_roll_summary": "…",
  "gaps": [{ "gap_id": "GAP_1", "label": "break", "label_reason": "…" }],
  "hook_candidates": [
    { "rank": 1, "start_segment_id": "Sxxx", "end_segment_id": "Sxxx", "opens_with": "stake", "why": "…" }
  ]
}`

export interface EpisodeMapUserInput {
  /** `renderWithIds(windows)` — `[S001] m:ss → m:ss | text` lines. */
  renderedWindows: string
  /** `GAP_1: from HH:MM:SS to HH:MM:SS (180s)` lines (empty string if none). */
  renderedGaps: string
}

export function buildEpisodeMapUser(input: EpisodeMapUserInput): string {
  const gapsBlock =
    input.renderedGaps.trim().length > 0
      ? input.renderedGaps
      : "(لا توجد فجوات صمت طويلة مرصودة)"
  return `نوافذ النص (كل سطر: [معرّف] بداية → نهاية | النص):
${input.renderedWindows}

فجوات الصمت المرصودة (أرقامها ملك النظام — صنّفها فقط):
${gapsBlock}`
}
