/**
 * Guest knowledge synthesis (Studio redesign, Goal 2).
 *
 * Produces the PUBLIC-facing, editorial cross-episode knowledge that powers the
 * guest page — synthesized from a guest's accumulated signals (studio bio /
 * positions / quotes, story arcs, speaking style) plus the episodes they've
 * appeared on. Distinct from the raw per-episode signals: this is reader-ready.
 */

import { env } from "@/lib/env"
import { runAiTask } from "@/lib/ai-router"
import type { GuestPublicKnowledge } from "@/lib/db/schema/guest-identity"

export interface GuestKnowledgeInput {
  guestName: string
  /** Titles of the episodes this guest appeared on (newest first ideally). */
  episodeTitles: string[]
  /** Studio-detected bio from per-episode guest intelligence. */
  detectedBio?: string | null
  /** Key positions/stances the guest expressed. */
  keyPositions?: string[]
  /** Story arcs / topics / themes they speak about. */
  storyArcs?: { arcs?: string[]; topics?: string[]; events?: string[]; emotional_peaks?: string[] } | null
  /** Editorial speaking-style profile. */
  speakingStyle?: { tone?: string; pace?: string; notes?: string } | null
  /** Canonical quotes attributed to the guest. */
  quotes?: Array<{ text: string; theme?: string | null }>
  /** Existing public bio (display) as a grounding hint. */
  existingBio?: string | null
  eirContext?: { eirId?: string | null; subjectTable?: string | null; subjectId?: string | null }
}

interface GuestKnowledgeRaw {
  headline?: string
  bio?: string
  signature_topics?: string[]
  themes?: string[]
  notable_quotes?: Array<{ text?: string; context?: string }>
  arc?: string
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []
}

export async function generateGuestKnowledge(
  input: GuestKnowledgeInput,
): Promise<{ success: boolean; data?: GuestPublicKnowledge; raw?: Record<string, unknown>; error?: string; runId?: string }> {
  try {
    if (!env.OPENAI_API_KEY) {
      return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
    }

    const appearances = input.episodeTitles.length
    const sourceBlock: string[] = []
    sourceBlock.push(`## الضيف: ${input.guestName}`)
    sourceBlock.push(`عدد الظهورات في البودكاست: ${appearances}`)
    if (input.episodeTitles.length > 0) {
      sourceBlock.push(`### الحلقات التي ظهر فيها:\n${input.episodeTitles.map((t) => `- ${t}`).join("\n")}`)
    }
    if (input.existingBio) sourceBlock.push(`### نبذة حالية:\n${input.existingBio}`)
    if (input.detectedBio) sourceBlock.push(`### نبذة مستخلصة من الحلقات:\n${input.detectedBio}`)
    if (input.keyPositions && input.keyPositions.length > 0) {
      sourceBlock.push(`### مواقفه وآراؤه:\n${input.keyPositions.map((p) => `- ${p}`).join("\n")}`)
    }
    if (input.storyArcs) {
      const a = input.storyArcs
      if (a.topics?.length) sourceBlock.push(`### موضوعاته:\n${a.topics.map((t) => `- ${t}`).join("\n")}`)
      if (a.arcs?.length) sourceBlock.push(`### أقواسه السردية:\n${a.arcs.map((t) => `- ${t}`).join("\n")}`)
    }
    if (input.speakingStyle?.tone || input.speakingStyle?.notes) {
      sourceBlock.push(`### أسلوبه: ${[input.speakingStyle.tone, input.speakingStyle.notes].filter(Boolean).join(" — ")}`)
    }
    if (input.quotes && input.quotes.length > 0) {
      sourceBlock.push(`### اقتباسات منسوبة إليه:\n${input.quotes.slice(0, 20).map((q) => `- "${q.text}"`).join("\n")}`)
    }

    const systemPrompt = `أنت محرر معرفي لبودكاست خط. مهمتك: بناء صفحة معرفية عامة عن الضيف تُجمّع معرفته عبر كل ظهوراته في مكان واحد — صفحة ذات قيمة فريدة حتى لمن شاهد كل حلقاته.

⚠️ هذه ليست نسخة من وصف الحلقة — بل تركيب معرفي عن الشخص نفسه عبر الزمن.

## المطلوب (JSON):
- headline: سطر واحد يعرّف من هو الضيف (هويته الجوهرية، ليس مجرد مسمى وظيفي)
- bio: فقرة (3-5 جمل) تُركّب نبذة متماسكة عن الضيف عبر ظهوراته — من هو، ما الذي يميزه فكرياً/إنسانياً
- signature_topics: 3-6 موضوعات يُعرف بها أو يملك فيها سلطة معرفية
- themes: 2-5 محاور متكررة عبر ظهوراته
- notable_quotes: حتى 4 اقتباسات من الأقوى (نصها كما ورد) مع context مختصر لكل واحد (سطر)
- arc: إذا ظهر في أكثر من حلقة، صف تطوّره أو الخيط الذي يربط ظهوراته (جملتان)؛ وإلا اتركه فارغاً ""

## قواعد:
- استند فقط إلى المعطيات المرفقة — لا تختلق وقائع
- عربية فصحى معاصرة حية
- JSON فقط بالشكل:
{"headline":"...","bio":"...","signature_topics":["..."],"themes":["..."],"notable_quotes":[{"text":"...","context":"..."}],"arc":"..."}`

    const userPrompt = sourceBlock.join("\n\n")

    const result = await runAiTask<GuestKnowledgeRaw>({
      taskKind: "editorial",
      eirId: input.eirContext?.eirId ?? null,
      subjectTable: input.eirContext?.subjectTable ?? "guest_identity_profiles",
      subjectId: input.eirContext?.subjectId ?? null,
      input: { guestName: input.guestName, appearances, quotes: input.quotes?.length ?? 0 },
      prompt: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.5 },
    })

    if (result.status !== "succeeded") {
      return { success: false, error: result.errorMessage || "فشل توليد معرفة الضيف", runId: result.runId }
    }

    const parsed = result.parsed ?? {}
    if (!parsed.headline && !parsed.bio) {
      return { success: false, error: "استجابة غير مكتملة", runId: result.runId }
    }

    const data: GuestPublicKnowledge = {
      headline: parsed.headline || "",
      bio: parsed.bio || "",
      signature_topics: strArray(parsed.signature_topics),
      themes: strArray(parsed.themes),
      notable_quotes: Array.isArray(parsed.notable_quotes)
        ? parsed.notable_quotes
            .filter((q): q is { text: string; context?: string } => Boolean(q && typeof q.text === "string" && q.text.trim()))
            .map((q) => ({ text: q.text, context: q.context || undefined }))
            .slice(0, 4)
        : [],
      arc: typeof parsed.arc === "string" ? parsed.arc : "",
    }

    return {
      success: true,
      data,
      raw: { model: result.modelName, run_id: result.runId },
      runId: result.runId,
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "فشل توليد معرفة الضيف" }
  }
}
