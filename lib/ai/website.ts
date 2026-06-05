import type { WebsiteQuoteItem, WebsiteResourceItem, WebsiteTimestampItem } from "@/types/database"
import { getClient, prepareTranscript, prepareTranscriptWithPositions } from "./client"
import { runAiTask } from "@/lib/ai-router"
import type { GlobalEpisodeIntelligence } from "./episode-intelligence"
import { formatIntelligenceContext } from "./episode-intelligence"

// ---------------------------------------------------------------------------
// Studio: Generate Website Package (summary, takeaways, quotes, etc.)
// ---------------------------------------------------------------------------
// Architecture: Two-call pipeline routed through the AI Router.
//   1. STRUCTURE_MODEL — timestamps (fast, positional)
//   2. EDITORIAL_MODEL — hero_summary, full_summary, takeaways, quotes,
//                         resources, guest — informed by Global Episode Intelligence
// Each call writes its own ai_runs row.
// ---------------------------------------------------------------------------

export interface WebsitePackageResult {
  hero_summary: string
  full_summary: string
  takeaways: string[]
  quotes: WebsiteQuoteItem[]
  resources: WebsiteResourceItem[]
  timestamps: WebsiteTimestampItem[]
  guest_name: string | null
  guest_bio: string | null
}

export async function generateWebsitePackage(
  transcript: string,
  videoTitle: string,
  durationSeconds: number | null,
  episodeIntelligence?: GlobalEpisodeIntelligence | null,
  eirContext?: { eirId?: string | null; subjectTable?: string | null; subjectId?: string | null }
): Promise<{ success: boolean; data?: WebsitePackageResult; raw?: Record<string, unknown>; error?: string; runId?: string }> {
  let openaiForPrep: ReturnType<typeof getClient>
  try {
    openaiForPrep = getClient()
  } catch {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    const durationMin = durationSeconds ? Math.round(durationSeconds / 60) : null
    const isLong = durationMin && durationMin >= 120
    const isMedium = durationMin && durationMin >= 60
    const timestampTarget = isLong ? "14-18" : isMedium ? "10-15" : "8-12"
    const quoteTarget = isLong ? "12-16" : isMedium ? "10-14" : "8-12"
    const takeawayTarget = isLong ? "8-12" : "5-10"

    // ── Phase 1: STRUCTURE_MODEL — timestamps ─────────────────────────
    const positionalText = await prepareTranscriptWithPositions(openaiForPrep, transcript, durationSeconds)

    const tsSystem = `أنت متخصص في استخراج الطوابع الزمنية من نصوص البودكاست.

## مهمتك:
أنتج ${timestampTarget} طابع زمني يغطي كامل الحلقة.

## القواعد:
- كل طابع = لحظة يريد القارئ القفز إليها: تحوّل في القصة، سؤال محوري، مفاجأة، صراع، أو بصيرة
- كل نقطة: time_seconds (بالثواني)، title (3-7 كلمات)، description (جملة واحدة أو null)
${durationMin ? `- المدة: ${durationMin} دقيقة = ${durationMin * 60} ثانية
- جميع القيم بين 0 و ${durationMin * 60}
- أول طابع = 0، آخر طابع بين ${Math.round((durationMin - 15) * 60)} و ${durationMin * 60}` : "- قدّر الأوقات من علامات الأجزاء الزمنية"}
- استخدم علامات [الجزء X/Y — من الدقيقة...] لتحديد الأوقات
- وزّع حسب كثافة الأحداث، لا بمسافات متساوية
- ✅ عناوين جيدة: "لحظة سقوط الرها"، "السؤال الذي أحرج الجميع"، "كيف بدأ كل شيء"
- ❌ عناوين سيئة: "أحداث تاريخية"، "نقاش مهم"، "محور ثالث"

⚠️ حساب time_seconds = الدقيقة × 60:
الدقيقة 15 = 900، الدقيقة 36 = 2160، الدقيقة 90 = 5400، الدقيقة 120 = 7200
${durationMin ? `الحد الأقصى: ${durationMin * 60}` : ""}

## JSON:
{ "timestamps": [{"time_seconds": 0, "title": "كيف بدأ كل شيء", "description": "..."}, ...] }`

    const tsUser = `عنوان الحلقة: ${videoTitle}
${durationMin ? `المدة الكاملة: ${durationMin} دقيقة (${durationMin * 60} ثانية) — لا يوجد محتوى بعد الثانية ${durationMin * 60}` : ""}

نص الحلقة:
${positionalText}`

    const tsResult = await runAiTask<{ timestamps: WebsiteTimestampItem[] }>({
      taskKind: "structural",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_website_packages",
      subjectId: eirContext?.subjectId ?? null,
      input: { videoTitle, durationSeconds, phase: "timestamps" },
      prompt: [
        { role: "system", content: tsSystem },
        { role: "user", content: tsUser },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.3 },
    })

    let timestamps: WebsiteTimestampItem[] = []
    if (tsResult.status === "succeeded" && tsResult.parsed) {
      timestamps = Array.isArray(tsResult.parsed.timestamps)
        ? tsResult.parsed.timestamps
            .filter((t) => typeof t.time_seconds === "number" && t.title)
            .filter((t) => !durationSeconds || t.time_seconds <= durationSeconds)
            .sort((a, b) => a.time_seconds - b.time_seconds)
        : []
    }

    // ── Phase 2: EDITORIAL_MODEL — content ────────────────────────────
    const editorialText = await prepareTranscript(openaiForPrep, transcript)
    const intelligenceBlock = episodeIntelligence ? `\n\n${formatIntelligenceContext(episodeIntelligence)}` : ""

    const edSystem = `أنت المحرر الرئيسي لبودكاست خط — بودكاست عربي عميق يتميز بالذكاء العاطفي والحدة الفكرية والصدق الإنساني.

صوت خط: لا يشرح الواضح ولا يزخرف الفارغ. يُسمّي الأشياء بأسمائها، يحترم ذكاء المستمع، ويختار الكلمة التي تبقى في الذهن بعد إغلاق الصفحة.

مهمتك: إعداد المحتوى التحريري لصفحة الحلقة — محتوى يجعل الزائر يضغط "استمع" قبل أن يُنهي القراءة.

${episodeIntelligence ? "⚠️ لديك فهم شامل مسبق للحلقة (أدناه). استخدمه كمرجع أساسي — لا تعالج النص من الصفر بل ابنِ على هذا الفهم." : ""}

## قواعد:
- عربية فصحى معاصرة — حية وطبيعية، لا أكاديمية ولا عامية
- لا Markdown — نص عادي فقط
- JSON فقط بالمخطط أدناه
- النص المقدم هو المصدر الوحيد — لا تختلق شيئاً

## المطلوب:

### 1. ملخص قصير (hero_summary)
- جملتان تشد القارئ فوراً — هذا أول ما يراه
- أقل من 200 حرف
- ❌ لا تبدأ بـ: "في هذه الحلقة"، "تتناول الحلقة"، "نتحدث عن"
- ✅ ابدأ بالتوتر أو السؤال أو المفارقة: "قبل صلاح الدين بعقود، كان هناك رجل..."

### 2. ملخص شامل (full_summary)
- 3-5 فقرات تروي قوس الحلقة كقصة — لها بداية وتصاعد وذروة
- لا تكتب قائمة مواضيع — اربط المحاور كأنك تحكي لصديق ذكي ما فاته
- اذكر اللحظات التي تُغيّر فهم القارئ أو تفاجئه
- اختم بالسؤال المفتوح أو البصيرة التي تبقى بعد الحلقة

### 3. أبرز الأفكار (takeaways)
- ${takeawayTarget} بصيرة يخرج بها المستمع
- كل واحدة جملة حادة — ليست ملخصاً بل اكتشاف
- ❌ لا تكتب: "استفد من التاريخ"، "تعلم أهمية..."، "اكتشف كيف..."
- ✅ اكتب الفكرة نفسها مباشرة: "القائد الذي لا يُصلح الداخل أولاً يخسر كل حرب خارجية"
- كل فكرة يجب أن تصلح كتغريدة مستقلة — مفهومة بدون سياق
- رتّبها من الأكثر حدة وإثارة إلى الأقل

### 4. اقتباسات (quotes)
- ${quoteTarget} اقتباس يستحق أن يُعلّق على حائط أو يُشارك كصورة
- كل اقتباس: text، theme (كلمة أو كلمتين)، speaker ("guest"/"host"/null)

اختبار الاقتباس الجيد — اسأل نفسك: "هل سأتوقف عن التمرير لو رأيت هذا؟"
- ✅ يصلح: جملة تتحدى فكرة شائعة، تكشف حقيقة مؤلمة، تلخص تجربة إنسانية بعمق، أو تُعيد تعريف مفهوم
- ❌ لا يصلح: جملة وصفية ("تحدثنا عن كذا")، حكمة مبتذلة ("الحياة صعبة")، جملة تحتاج سياقاً لتُفهم
- وزّع الاقتباسات على كامل الحلقة — لا تأخذها كلها من الربع الأول
${episodeIntelligence ? "- ⚠️ استخدم 'أقوى اللحظات' من الفهم الشامل كمرجع أساسي للاقتباسات" : ""}

### 5. المصادر (resources)
- كتب، شخصيات، أدوات مذكورة في النص فقط
- كل مصدر: title، url (أو "")، type ("كتاب"/"شخصية"/"أداة"/"مقال"/null)
- مصفوفة فارغة إذا لم تُذكر مصادر

### 6. الضيف (guest_name و guest_bio)
- الاسم الكامل للضيف (ليس المقدّم) — أو null
- guest_bio: جملة أو جملتان عنه — أو null

## JSON:
{
  "hero_summary": "...",
  "full_summary": "...",
  "takeaways": ["بصيرة حادة 1", ...],
  "quotes": [{"text": "...", "theme": "...", "speaker": "host"}, ...],
  "resources": [{"title": "...", "url": "", "type": "كتاب"}, ...],
  "guest_name": "string أو null",
  "guest_bio": "string أو null"
}`

    const edUser = `عنوان الحلقة: ${videoTitle}
${intelligenceBlock}
نص الحلقة:
${editorialText}`

    const edResult = await runAiTask<{
      hero_summary?: string
      full_summary?: string
      takeaways?: string[]
      quotes?: WebsiteQuoteItem[]
      resources?: WebsiteResourceItem[]
      guest_name?: string | null
      guest_bio?: string | null
    }>({
      taskKind: "editorial",
      eirId: eirContext?.eirId ?? null,
      subjectTable: eirContext?.subjectTable ?? "studio_website_packages",
      subjectId: eirContext?.subjectId ?? null,
      input: {
        videoTitle,
        durationSeconds,
        phase: "editorial",
        hasIntelligence: Boolean(episodeIntelligence),
      },
      prompt: [
        { role: "system", content: edSystem },
        { role: "user", content: edUser },
      ],
      expectJson: true,
      providerOptions: { temperature: 0.4 },
    })

    if (edResult.status !== "succeeded") {
      return {
        success: false,
        error: edResult.errorMessage || "حدث خطأ أثناء توليد حزمة الموقع",
        runId: edResult.runId,
      }
    }

    const parsed = edResult.parsed
    if (!parsed?.hero_summary || !parsed?.full_summary) {
      return { success: false, error: "استجابة OpenAI غير مكتملة", runId: edResult.runId }
    }

    return {
      success: true,
      runId: edResult.runId,
      data: {
        hero_summary: parsed.hero_summary,
        full_summary: parsed.full_summary,
        takeaways: Array.isArray(parsed.takeaways) ? parsed.takeaways : [],
        quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
        resources: Array.isArray(parsed.resources) ? parsed.resources : [],
        timestamps,
        guest_name:
          typeof parsed.guest_name === "string" &&
          parsed.guest_name.toLowerCase() !== "null" &&
          parsed.guest_name.trim()
            ? parsed.guest_name
            : null,
        guest_bio:
          typeof parsed.guest_bio === "string" &&
          parsed.guest_bio.toLowerCase() !== "null" &&
          parsed.guest_bio.trim()
            ? parsed.guest_bio
            : null,
      },
      raw: {
        structure_run_id: tsResult.runId,
        editorial_run_id: edResult.runId,
        structure_model: tsResult.modelName,
        editorial_model: edResult.modelName,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء توليد حزمة الموقع"
    return { success: false, error: msg }
  }
}
