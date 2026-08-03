import type { WebsiteQuoteItem, WebsiteResourceItem, WebsiteTimestampItem } from "@/types/database"
import { env } from "@/lib/env"
import { prepareTranscript, prepareTranscriptWithPositions } from "./client"
import { runAiTask } from "@/lib/ai-router"
import { normalizeDurationSeconds, stripChunkScaffold } from "@/lib/studio/utils"
import { mergeIntoWindows, renderWithIds, type TimedSegment } from "@/lib/studio/segments"
import {
  buildTimedTimestampsPrompt,
  WEBSITE_TIMESTAMPS_TIMED_PROMPT_VERSION,
  type TimedTimestampModelItem,
} from "./prompts/studio-timed"
import { buildWindowMap, resolveTimedTimestamps, assessWindowSpans } from "./studio-timed"
import type { GlobalEpisodeIntelligence } from "./episode-intelligence"
import { formatIntelligenceContext } from "./episode-intelligence"

/** Same window size the chapters/clips timed paths use. */
const TIMED_WINDOW_SECONDS = 20

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
  eirContext?: { eirId?: string | null; subjectTable?: string | null; subjectId?: string | null },
  /**
   * ص-٨ — real per-cue timings from the caption file. When supplied, the
   * index is built from window ids and CODE re-attaches the seconds, so a
   * row can no longer land 7-9 minutes from where the topic actually
   * starts. Omitted → the legacy estimate path, unchanged.
   */
  timedSegments?: TimedSegment[] | null,
): Promise<{ success: boolean; data?: WebsitePackageResult; raw?: Record<string, unknown>; error?: string; runId?: string }> {
  if (!env.OPENAI_API_KEY) {
    return { success: false, error: "OPENAI_API_KEY غير مُعدّ" }
  }

  try {
    // ص-٨ — normalise ONCE, at the entry. Everything below reads `duration`,
    // never the raw argument, so the prompt bound, the telemetry snapshot and
    // the output filter cannot disagree about what a 0 meant.
    const duration = normalizeDurationSeconds(durationSeconds)
    const durationMin = duration ? Math.round(duration / 60) : null
    const isLong = durationMin && durationMin >= 120
    const isMedium = durationMin && durationMin >= 60
    const timestampTarget = isLong ? "14-18" : isMedium ? "10-15" : "8-12"
    const quoteTarget = isLong ? "12-16" : isMedium ? "10-14" : "8-12"
    const takeawayTarget = isLong ? "8-12" : "5-10"

    // ── Phase 1: STRUCTURE_MODEL — timestamps ─────────────────────────
    // ص-٨ — the honest path first. It needs no positional prep call at
    // all, which is why it is also the cheaper one: the whole
    // `transcript_prep_positional` chunk-summary fan-out exists ONLY to
    // manufacture the time labels this branch does not need.
    const useTimed = Boolean(timedSegments && timedSegments.length > 0)

    let timestamps: WebsiteTimestampItem[] = []
    let tsRunId: string | undefined
    let tsModelName: string | undefined
    const tsMeta: Record<string, unknown> = { timing_source: useTimed ? "captions" : "estimated" }

    if (useTimed) {
      const windows = mergeIntoWindows(timedSegments!, TIMED_WINDOW_SECONDS)
      const built = buildTimedTimestampsPrompt({
        videoTitle,
        renderedWindows: renderWithIds(windows),
        timestampTarget,
        windowCount: windows.length,
      })

      const timedResult = await runAiTask<{ timestamps: TimedTimestampModelItem[] }>({
        taskKind: "structural",
        eirId: eirContext?.eirId ?? null,
        subjectTable: eirContext?.subjectTable ?? "studio_sessions",
        subjectId: eirContext?.subjectId ?? null,
        promptVersion: WEBSITE_TIMESTAMPS_TIMED_PROMPT_VERSION,
        input: {
          videoTitle,
          durationSeconds: duration,
          phase: "timestamps",
          timestampTarget,
          windowCount: windows.length,
          timingSource: "captions",
        },
        prompt: [
          { role: "system", content: built.system },
          { role: "user", content: built.user },
        ],
        expectJson: true,
        providerOptions: { temperature: 0.3 },
      })

      tsRunId = timedResult.runId
      tsModelName = timedResult.modelName

      if (timedResult.status === "succeeded" && Array.isArray(timedResult.parsed?.timestamps)) {
        // Throws on an unknown id — a wrong id is a validation error, never
        // a plausible wrong number that ships to the public page.
        timestamps = resolveTimedTimestamps(
          timedResult.parsed.timestamps,
          buildWindowMap(windows),
        ).map((t) => ({
          ...t,
          title: stripChunkScaffold(t.title),
          description: stripChunkScaffold(t.description),
        }))
          .filter((t) => t.title.trim().length > 0)
      }

      const spans = assessWindowSpans(windows)
      tsMeta.max_window_span_seconds = spans.maxSpanSeconds
      tsMeta.windows_over_limit = spans.overLimit
      if (!spans.withinClaim) {
        console.warn(
          `[website-timed] ${spans.overLimit} window(s) exceed the span claim ` +
            `(max ${spans.maxSpanSeconds}s) — index accuracy is bounded by the window`,
        )
      }
    } else {
      const legacy = await generateTimestampsEstimated({
        transcript,
        videoTitle,
        durationSeconds: duration,
        durationMin,
        timestampTarget,
        eirContext,
      })
      timestamps = legacy.timestamps
      tsRunId = legacy.runId
      tsModelName = legacy.modelName
    }

    // ── Phase 2: EDITORIAL_MODEL — content ────────────────────────────
    const editorialText = await prepareTranscript(null as never, transcript)
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
      subjectTable: eirContext?.subjectTable ?? "studio_sessions",
      subjectId: eirContext?.subjectId ?? null,
      input: {
        videoTitle,
        durationSeconds: duration,
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
        // ص-١٠ — the chunk scaffold is plumbing for the summarizer, not
        // prose. It reached a published website package verbatim.
        hero_summary: stripChunkScaffold(parsed.hero_summary),
        full_summary: stripChunkScaffold(parsed.full_summary),
        takeaways: Array.isArray(parsed.takeaways)
          ? parsed.takeaways.map((t) => stripChunkScaffold(String(t)))
          : [],
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
        structure_run_id: tsRunId,
        editorial_run_id: edResult.runId,
        structure_model: tsModelName,
        editorial_model: edResult.modelName,
        ...tsMeta,
      },
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : "حدث خطأ أثناء توليد حزمة الموقع"
    return { success: false, error: msg }
  }
}

/**
 * ص-٨ — the legacy index path, unchanged in behaviour and now clearly
 * fenced off as the fallback it is.
 *
 * It is reached only when the session has NO caption timings (a Whisper
 * transcription or a hand-pasted transcript). Every timestamp it produces
 * is the model's arithmetic over `prepareTranscriptWithPositions` labels
 * that were interpolated LINEARLY from character counts — measured on a
 * real 86-minute episode, that put the first half 7-9 minutes late.
 */
async function generateTimestampsEstimated(args: {
  transcript: string
  videoTitle: string
  /** Already through `normalizeDurationSeconds` — null means "unknown". */
  durationSeconds: number | null
  durationMin: number | null
  timestampTarget: string
  eirContext?: { eirId?: string | null; subjectTable?: string | null; subjectId?: string | null }
}): Promise<{ timestamps: WebsiteTimestampItem[]; runId?: string; modelName?: string }> {
  const { transcript, videoTitle, durationSeconds, durationMin, timestampTarget, eirContext } = args

  const positionalText = await prepareTranscriptWithPositions(null as never, transcript, durationSeconds)

  const tsSystem = `أنت متخصص في استخراج الطوابع الزمنية من نصوص البودكاست.

## مهمتك:
أنتج ${timestampTarget} طابع زمني يغطي كامل الحلقة.

## القواعد:
- كل طابع = لحظة يريد القارئ القفز إليها: تحوّل في القصة، سؤال محوري، مفاجأة، صراع، أو بصيرة
- كل نقطة: time_seconds (بالثواني)، title (3-7 كلمات)، description (جملة واحدة أو null)
${durationMin ? `- المدة: ${durationMin} دقيقة = ${durationMin * 60} ثانية
- جميع القيم بين 0 و ${durationMin * 60}
- أول طابع = 0، آخر طابع بين ${Math.round((durationMin - 15) * 60)} و ${durationMin * 60}` : "- قدّر الأوقات من علامات الأجزاء الزمنية"}
- استخدم علامات [الجزء X/Y — من الدقيقة...] لتحديد الأوقات فقط — **ولا تكتبها أبداً في أي نص تُخرجه**
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
    subjectTable: eirContext?.subjectTable ?? "studio_sessions",
    subjectId: eirContext?.subjectId ?? null,
    input: { videoTitle, durationSeconds, phase: "timestamps", timingSource: "estimated" },
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
          // ص-٨ — a null duration means "unknown, cannot check" — never
          // "check nothing", and never "reject everything". `0` never
          // reaches here as a bound: `normalizeDurationSeconds` at the
          // entry already turned it into null, because 0 is what
          // `app/api/admin/studio/route.ts` stores when the YouTube
          // ISO-8601 duration fails to parse. Rejecting every row against
          // a 0 bound would be worse than not checking at all — the same
          // rule `lib/studio/push-to-episode.ts` applies at the publish end.
          .filter((t) => durationSeconds == null || t.time_seconds <= durationSeconds)
          .sort((a, b) => a.time_seconds - b.time_seconds)
          // ص-١٠ — THIS is where the summarizer scaffold actually leaks.
          // The timestamp prompt is the one that tells the model to read
          // the `[الجزء X/Y — من الدقيقة…]` labels, so the model echoes
          // them straight into `description` (17 occurrences in the
          // captured live output) — and this is the field that lands in
          // episode_enrichments.timestamps and renders publicly. The
          // editorial fields are cleaned too, but they were never dirty.
          .map((t) => ({
            ...t,
            title: stripChunkScaffold(t.title),
            description: stripChunkScaffold(t.description ?? null),
          }))
          // Re-check AFTER cleaning. The `t.title` filter above ran on
          // the DIRTY value, so a title that was nothing but scaffold
          // passed it and came out "" — and an empty title renders as a
          // bare timestamp line, which makes YouTube reject the entire
          // chapter block, not just that row.
          .filter((t) => t.title.trim().length > 0)
      : []
  }

  return { timestamps, runId: tsResult.runId, modelName: tsResult.modelName }
}
