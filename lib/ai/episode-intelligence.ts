// Phase 2.0 Batch 1 — getClient + EDITORIAL_MODEL no longer needed.
// prepareTranscript routes internally via runAiTask.
import { env } from "@/lib/env"
import { prepareTranscript } from "./client"
import { runAiTask } from "@/lib/ai-router"

/** Phase 2.0 Batch 1 — fallback actor id for legacy call sites. */
const LEGACY_ACTOR = "system:legacy-callsite"

// ---------------------------------------------------------------------------
// Global Episode Intelligence — full-episode understanding layer
// ---------------------------------------------------------------------------
// This module produces a structured, deduplicated understanding of the entire
// episode from the merged transcript. All editorial generators (quotes, ideas,
// summaries, deep analysis) consume this intelligence rather than working
// directly from chunk summaries, ensuring coherence and preventing duplication.
// ---------------------------------------------------------------------------

export interface GlobalEpisodeIntelligence {
  /** Narrative arc from beginning to conclusion */
  narrative_arc: {
    beginning: string
    development: string
    key_insight: string
    conclusion: string
  }
  /** Moments where the conversation shifts direction */
  turning_points: string[]
  /** Strongest verbatim or near-verbatim moments for quote extraction */
  strongest_moments: string[]
  /** Deduplicated, ranked core ideas across the full episode */
  core_ideas: string[]
  /** Major themes identified */
  themes: string[]
  /** Moments of emotional intensity */
  emotional_peaks: string[]
  /** Brief guest description if detected, null for monologues */
  guest_profile: string | null
  /** Single paragraph capturing the soul of the episode */
  episode_essence: string

  // ── Growth & production signals (P0 deepening) ─────────────────────────
  // These power the downstream Growth-package + Knowledge-hub generators so
  // they SYNTHESIZE from one shared understanding instead of re-reading the
  // transcript. All are best-effort: an empty array is a valid value.

  /** Debate-sparking / attention-grabbing / controversial moments — fuel for
   *  hooks, titles, and the episode's "most-discussed" angle. */
  controversy_moments: string[]
  /** Where attention is most likely to dip (long tangents, slow setup, dense
   *  passages) — feeds audience-retention recommendations. */
  retention_risk_points: string[]
  /** Natural conversational breaks safe for an ad/sponsor read (described by
   *  topic boundary, not raw timestamp) — feeds ad/sponsor timing. */
  sponsor_safe_windows: string[]
  /** Self-contained moments that would stand alone as a short clip — feeds
   *  clip generation + viability scoring. */
  clip_seed_moments: string[]
  /** Canonical topic tags for taxonomy / SEO / related-episode linking. */
  topic_tags: string[]
  /** Topics this guest is authoritative on / known for across their work —
   *  feeds the cross-episode guest knowledge page. */
  guest_signature_topics: string[]
}

/**
 * Generate a global understanding of the full episode.
 *
 * This is the mandatory intermediate step between transcript preparation
 * and editorial content generation. It reads the entire episode as one
 * conversation and produces a structured intelligence document that all
 * editorial generators consume.
 *
 * Uses EDITORIAL_MODEL for deep reasoning.
 */
export async function generateGlobalEpisodeIntelligence(
  transcript: string,
  videoTitle: string,
  eirContext?: { eirId?: string | null; subjectTable?: string | null; subjectId?: string | null; actorId?: string | null }
): Promise<{ success: true; data: GlobalEpisodeIntelligence; raw?: Record<string, unknown>; runId?: string } | { success: false; error: string; runId?: string }> {
  try {
    if (!env.OPENAI_API_KEY) {
      return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
    }
    const preparedText = await prepareTranscript(null as never, transcript)

    const systemPrompt = `أنت المحلل الأدبي الرئيسي لبودكاست خط — بودكاست عربي عميق يتميز بالذكاء العاطفي والحدة الفكرية والصدق الإنساني.

مهمتك: قراءة نص الحلقة كاملاً كمحادثة واحدة متصلة، واستخراج فهم شامل ومُوحّد يُستخدم لاحقاً في توليد كل المحتوى التحريري.

⚠️ هذا ليس ملخصاً — هذا فهم عميق للحلقة كعمل فكري متكامل.

## المطلوب:

### 1. القوس السردي (narrative_arc)
- beginning: كيف تفتح الحلقة؟ ما السؤال أو التوتر الأولي؟
- development: كيف تتطور المحاور؟ ما التحولات في التفكير؟
- key_insight: ما اللحظة التي يتغير فيها فهم المستمع؟ الذروة الفكرية أو العاطفية
- conclusion: كيف تُختتم الحلقة؟ ما الذي يبقى في ذهن المستمع؟

### 2. نقاط التحول (turning_points)
- 4-8 لحظات يتغير فيها اتجاه المحادثة
- كل نقطة: وصف مختصر (جملة واحدة) + موقعها التقريبي في الحلقة

### 3. أقوى اللحظات (strongest_moments)
- 10-15 لحظة تستحق أن تُستخرج كاقتباسات أو أفكار مشاركة
- اكتب كل لحظة كجملة أو جملتين كما قيلت (أو قريباً مما قيل)
- وزّعها على كامل الحلقة — لا تأخذها كلها من الربع الأول
- كل لحظة يجب أن تمر باختبار: "هل سأتوقف عن التمرير لو رأيت هذا؟"

### 4. الأفكار الجوهرية (core_ideas)
- 8-12 فكرة مُرتبة من الأقوى إلى الأقل
- كل فكرة مُكتملة المعنى بدون سياق — تصلح كتغريدة
- ⚠️ لا تكرار: إذا وردت فكرة في أكثر من جزء، اكتبها مرة واحدة بأقوى صياغة
- ❌ ممنوع: "أهمية التاريخ"، "قيمة العمل"، "تحدث الضيف عن..."
- ✅ مسموح: "القائد الذي لا يُصلح الداخل أولاً يخسر كل حرب خارجية"

### 5. المحاور الكبرى (themes)
- 3-6 محاور تربط الحلقة ببعضها
- كل محور: اسم مختصر (2-4 كلمات) — ليس وصفاً بل عنواناً

### 6. الذرى العاطفية (emotional_peaks)
- 3-6 لحظات ارتفعت فيها الشحنة العاطفية
- لكل واحدة: ما الشعور (دهشة، ألم، فخر، غضب، إلهام) + وصف مختصر

### 7. الضيف (guest_profile)
- جملتان عن الضيف بناءً على ما ذُكر في الحلقة فقط
- null إذا لم يكن هناك ضيف (حلقة مونولوج)

### 8. جوهر الحلقة (episode_essence)
- فقرة واحدة (3-4 جمل) تلتقط روح الحلقة
- ليست ملخصاً — بل الشعور والفكرة التي تبقى بعد الاستماع
- اكتبها كأنك تحكي لصديق ذكي لماذا يجب أن يستمع لهذه الحلقة

### 9. اللحظات المثيرة للجدل (controversy_moments)
- 3-6 لحظات جريئة أو مثيرة للنقاش أو تكسر المتوقع — وقود للعناوين والخطافات وزاوية "الأكثر إثارة للحديث"
- كل واحدة جملة واحدة واضحة بذاتها — تصلح أن تكون عنوان نقاش
- [] إذا لم توجد لحظات حادة فعلاً — لا تختلق جدلاً

### 10. نقاط خطر فقدان الانتباه (retention_risk_points)
- 3-6 مواضع قد يتراجع فيها انتباه المستمع (استطرادات طويلة، مقدمة بطيئة، مقاطع كثيفة)
- كل واحدة: وصف الموضع + لماذا قد يتسرب الانتباه

### 11. نوافذ آمنة للإعلان/الراعي (sponsor_safe_windows)
- 2-5 فواصل طبيعية في المحادثة مناسبة لقراءة إعلانية دون قطع لحظة مهمة
- صِف كل نافذة بحدود الموضوع (مثل: "بعد إنهاء الحديث عن X وقبل الانتقال إلى Y")، لا بالتوقيت الخام

### 12. بذور المقاطع القصيرة (clip_seed_moments)
- 5-10 لحظات مكتملة بذاتها تصلح كمقطع قصير مستقل (Reel/Short)
- كل واحدة: الفكرة/الجملة المحورية التي تجعل المقطع يعمل وحده

### 13. وسوم الموضوعات (topic_tags)
- 4-8 وسوم موضوعية قصيرة (1-3 كلمات لكل وسم) تصلح للتصنيف والسيو والربط بين الحلقات
- استخدم مصطلحات قابلة لإعادة الاستخدام عبر حلقات أخرى (مثل: "الذكاء الاصطناعي"، "ريادة الأعمال")

### 14. الموضوعات المميزة للضيف (guest_signature_topics)
- 2-5 موضوعات يُعرف بها الضيف أو يملك فيها سلطة معرفية بناءً على ما ظهر في الحلقة
- [] إذا لم يكن هناك ضيف

## قواعد:
- عربية فصحى معاصرة — حية وطبيعية
- JSON فقط
- النص المقدم هو المصدر الوحيد — لا تختلق
- اقرأ الحلقة كوحدة واحدة — لا تعالج كل جزء على حدة

{
  "narrative_arc": {
    "beginning": "...",
    "development": "...",
    "key_insight": "...",
    "conclusion": "..."
  },
  "turning_points": ["..."],
  "strongest_moments": ["..."],
  "core_ideas": ["..."],
  "themes": ["..."],
  "emotional_peaks": ["..."],
  "guest_profile": "..." أو null,
  "episode_essence": "...",
  "controversy_moments": ["..."],
  "retention_risk_points": ["..."],
  "sponsor_safe_windows": ["..."],
  "clip_seed_moments": ["..."],
  "topic_tags": ["..."],
  "guest_signature_topics": ["..."]
}`

    const userPrompt = `عنوان الحلقة: ${videoTitle}

نص الحلقة الكاملة:
${preparedText}`

    const result = await runAiTask<Partial<GlobalEpisodeIntelligence> & { narrative_arc?: GlobalEpisodeIntelligence["narrative_arc"]; episode_essence?: string }>({
      taskKind: "editorial",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_sessions",
      subjectId: eirContext?.subjectId ?? null,
      actorId: eirContext?.actorId ?? LEGACY_ACTOR,
      input: { videoTitle, transcriptChars: preparedText.length },
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.3 },
    })

    if (result.status !== "succeeded") {
      return {
        success: false,
        error: result.errorMessage || "حدث خطأ أثناء تحليل الحلقة",
        runId: result.runId,
      }
    }

    const parsed = result.parsed
    if (!parsed?.narrative_arc || !parsed?.episode_essence) {
      return { success: false, error: "استجابة OpenAI غير مكتملة", runId: result.runId }
    }

    const strArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []

    const data: GlobalEpisodeIntelligence = {
      narrative_arc: {
        beginning: parsed.narrative_arc.beginning || "",
        development: parsed.narrative_arc.development || "",
        key_insight: parsed.narrative_arc.key_insight || "",
        conclusion: parsed.narrative_arc.conclusion || "",
      },
      turning_points: strArray(parsed.turning_points),
      strongest_moments: strArray(parsed.strongest_moments),
      core_ideas: strArray(parsed.core_ideas),
      themes: strArray(parsed.themes),
      emotional_peaks: strArray(parsed.emotional_peaks),
      guest_profile: typeof parsed.guest_profile === "string" && parsed.guest_profile.toLowerCase() !== "null" ? parsed.guest_profile : null,
      episode_essence: parsed.episode_essence || "",
      controversy_moments: strArray(parsed.controversy_moments),
      retention_risk_points: strArray(parsed.retention_risk_points),
      sponsor_safe_windows: strArray(parsed.sponsor_safe_windows),
      clip_seed_moments: strArray(parsed.clip_seed_moments),
      topic_tags: strArray(parsed.topic_tags),
      guest_signature_topics: strArray(parsed.guest_signature_topics),
    }

    return {
      success: true,
      data,
      raw: {
        model: result.modelName,
        usage: { prompt_tokens: result.tokensIn, completion_tokens: result.tokensOut },
        run_id: result.runId,
      },
      runId: result.runId,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء تحليل الحلقة"
    return { success: false, error: msg }
  }
}

/**
 * Format the global intelligence into a concise context block
 * that can be injected into editorial prompts.
 */
export function formatIntelligenceContext(intel: GlobalEpisodeIntelligence): string {
  const sections: string[] = []

  sections.push(`## فهم الحلقة الشامل (مُولّد مسبقاً — استخدمه كمرجع أساسي):`)

  sections.push(`### جوهر الحلقة:\n${intel.episode_essence}`)

  sections.push(`### القوس السردي:
- البداية: ${intel.narrative_arc.beginning}
- التطور: ${intel.narrative_arc.development}
- البصيرة المحورية: ${intel.narrative_arc.key_insight}
- الخاتمة: ${intel.narrative_arc.conclusion}`)

  if (intel.themes.length > 0) {
    sections.push(`### المحاور الكبرى:\n${intel.themes.map(t => `- ${t}`).join("\n")}`)
  }

  if (intel.core_ideas.length > 0) {
    sections.push(`### الأفكار الجوهرية (مُرتبة ومُكررات محذوفة):\n${intel.core_ideas.map((idea, i) => `${i + 1}. ${idea}`).join("\n")}`)
  }

  if (intel.strongest_moments.length > 0) {
    sections.push(`### أقوى اللحظات للاقتباس:\n${intel.strongest_moments.map(m => `- "${m}"`).join("\n")}`)
  }

  if (intel.emotional_peaks.length > 0) {
    sections.push(`### الذرى العاطفية:\n${intel.emotional_peaks.map(p => `- ${p}`).join("\n")}`)
  }

  if (intel.turning_points.length > 0) {
    sections.push(`### نقاط التحول:\n${intel.turning_points.map(tp => `- ${tp}`).join("\n")}`)
  }

  if (intel.guest_profile) {
    sections.push(`### الضيف:\n${intel.guest_profile}`)
  }

  if (intel.guest_signature_topics.length > 0) {
    sections.push(`### الموضوعات المميزة للضيف:\n${intel.guest_signature_topics.map(t => `- ${t}`).join("\n")}`)
  }

  if (intel.controversy_moments.length > 0) {
    sections.push(`### اللحظات المثيرة للجدل:\n${intel.controversy_moments.map(m => `- ${m}`).join("\n")}`)
  }

  if (intel.clip_seed_moments.length > 0) {
    sections.push(`### بذور المقاطع القصيرة:\n${intel.clip_seed_moments.map(m => `- ${m}`).join("\n")}`)
  }

  if (intel.retention_risk_points.length > 0) {
    sections.push(`### نقاط خطر فقدان الانتباه:\n${intel.retention_risk_points.map(p => `- ${p}`).join("\n")}`)
  }

  if (intel.sponsor_safe_windows.length > 0) {
    sections.push(`### نوافذ آمنة للإعلان:\n${intel.sponsor_safe_windows.map(w => `- ${w}`).join("\n")}`)
  }

  if (intel.topic_tags.length > 0) {
    sections.push(`### وسوم الموضوعات:\n${intel.topic_tags.map(t => `#${t}`).join(" ")}`)
  }

  return sections.join("\n\n")
}
