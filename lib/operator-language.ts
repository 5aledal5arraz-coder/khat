/**
 * Operator Language Layer.
 *
 * Single source of truth for translating engineering-layer
 * identifiers (job types, queue statuses, run states, service names)
 * into operator-facing Arabic copy. Imported anywhere the UI would
 * otherwise leak `npm run X`, `discovery.search_archetype`, raw
 * enum values like `searching`, etc.
 *
 * Rules of the layer:
 *   1. **Never** expose npm/cron/script names to operators. Use
 *      `serviceLabel(serviceId)` instead.
 *   2. **Never** render raw enum strings (`pending`, `running`,
 *      `succeeded`, etc.). Use `runStatusLabel`, `jobStatusLabel`,
 *      `prepStatusLabel`, etc.
 *   3. **Never** render an internal job type (`discovery.verify_candidate`).
 *      Use `jobTypeLabel(jobType)`.
 *   4. New leaks discovered in the UI should be added here, not
 *      patched inline.
 */

// ─── Discovery run state machine ─────────────────────────────────

const RUN_STATUS_LABEL: Record<string, string> = {
  pending: "في الانتظار",
  seeding: "جاري توليد الأنماط",
  searching: "جاري البحث عن مرشحين",
  verifying: "جاري التحقق من المرشحين",
  ranking: "جاري الترتيب التحريري",
  completed: "اكتمل",
  failed: "فشل",
  cancelled: "أُلغي",
}
export function runStatusLabel(s: string): string {
  return RUN_STATUS_LABEL[s] ?? "حالة غير معروفة"
}

// ─── Generic background-job state machine ────────────────────────

const JOB_STATUS_LABEL: Record<string, string> = {
  pending: "في الانتظار",
  running: "قيد التنفيذ",
  succeeded: "اكتمل",
  failed: "فشل",
  dead: "متوقّف",
  cancelled: "أُلغي",
}
export function jobStatusLabel(s: string): string {
  return JOB_STATUS_LABEL[s] ?? "حالة غير معروفة"
}

// ─── Job-type → operator-friendly description ────────────────────

const JOB_TYPE_LABEL: Record<string, string> = {
  // Guest discovery (v2 engine)
  "discovery_v2.run": "اكتشاف الضيوف",
  // Market intelligence
  "market.collect": "جمع إشارات السوق",
  "market.extract": "استخراج كيانات السوق",
  "market.cluster": "تجميع موضوعات السوق",
  // Original thinking
  "original_thinking.generate": "توليد التفكير الأصيل",
  // YouTube performance
  "youtube.performance.refresh": "تحديث أداء YouTube",
  // Editorial regeneration
  "preparation.regenerate_v2": "إعادة توليد الإعداد",
  // Demo / placeholder
  "demo.echo": "اختبار النظام",
}
export function jobTypeLabel(t: string): string {
  if (JOB_TYPE_LABEL[t]) return JOB_TYPE_LABEL[t]
  // Best-effort fallback: drop namespace prefix and humanize the rest.
  // Never returns the raw identifier — keeps the operator experience clean.
  const last = t.split(".").pop() ?? t
  const humanized = last.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  return `خدمة خلفية (${humanized})`
}

// ─── Service / sub-system labels ─────────────────────────────────
// Used when the UI needs to talk about a back-end service that is
// turned off / not yet collecting / waiting on an operator. Replaces
// any `npm run X` / `market:X` / `backfill:X` literals.

const SERVICE_LABEL: Record<string, string> = {
  market_signals: "خدمة إشارات السوق",
  market_extraction: "خدمة استخراج كيانات السوق",
  market_clustering: "خدمة تجميع موضوعات السوق",
  background_worker: "عامل المهام الخلفي",
  identity_backfill: "خدمة إعادة بناء ملفّات الهوية",
  youtube_performance: "خدمة تحديث أداء YouTube",
  discovery_pipeline: "خط أنابيب اكتشاف الضيوف",
}
export function serviceLabel(id: keyof typeof SERVICE_LABEL): string {
  return SERVICE_LABEL[id]
}

// ─── Preparation / episode workflow statuses ─────────────────────

const PREP_STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  reviewed: "مُراجَع",
  approved: "معتمد",
  archived: "مؤرشف",
}
export function prepStatusLabel(s: string): string {
  return PREP_STATUS_LABEL[s] ?? s
}

const EPISODE_STATUS_LABEL: Record<string, string> = {
  draft: "مسودة",
  in_review: "قيد المراجعة",
  ready: "جاهزة",
  scheduled: "مجدولة",
  published: "منشورة",
  archived: "مؤرشفة",
}
export function episodeStatusLabel(s: string): string {
  return EPISODE_STATUS_LABEL[s] ?? s
}

// ─── Operator instructions when a service is offline ─────────────
// The UI should NEVER say "run `npm run X`". Instead surface the
// service name + a clear operator action.

export interface ServiceOfflineHint {
  /** One-line Arabic explanation of what's offline. */
  title: string
  /** Optional one-line operator action (no command-line). */
  action: string
}

const SERVICE_OFFLINE_HINT: Record<string, ServiceOfflineHint> = {
  background_worker: {
    title: "عامل المهام الخلفي متوقّف",
    action:
      "تواصل مع مسؤول النظام لإعادة تشغيل خدمة المهام الخلفية حتى تُكمل العمليات قيد الانتظار.",
  },
  market_signals: {
    title: "بيانات إشارات السوق غير متوفّرة حالياً",
    action:
      "يمكن المتابعة بدون إشارات السوق، لكن ستتقلّص الزوايا التحريرية المتاحة في توليد المواسم.",
  },
  identity_backfill: {
    title: "ملفّات هوية الضيف لم تُبنَ بعد",
    action:
      "رقّ مرشّحاً من سطح الاكتشاف لإنشاء ملف هوية، أو انتظر دورة إعادة البناء التالية.",
  },
  original_thinking_bank: {
    title: "بنك المواضيع الأصيلة فارغ حالياً",
    action:
      'أنشئ مواضيع أوليّة من سطح "التفكير الأصيل" قبل توليد مرشّحات هجينة.',
  },
  hybrid_pipeline: {
    title: "خطّ توليد المواضيع الهجينة معطّل",
    action:
      "تواصل مع مسؤول النظام لتفعيل خدمة المولّد الهجين قبل المتابعة.",
  },
}
export function serviceOfflineHint(id: string): ServiceOfflineHint | null {
  return SERVICE_OFFLINE_HINT[id] ?? null
}

// ─── Generation pipeline failure reasons ─────────────────────────
// Generators (hybrid topics, original thinking, prep v2, etc.) all
// return an internal `reason` string when they can't produce
// output. We translate those once here so every consuming UI shows
// the same operator-friendly explanation. Never leak internal
// reasons (e.g. `no_inputs`, `feature_disabled`, `ai_failure`) or
// internal table names (`ai_runs`).

const GENERATION_REASON_LABEL: Record<string, string> = {
  // Hybrid topics
  feature_disabled:
    "خدمة المولّد الهجين معطّلة حالياً. تواصل مع مسؤول النظام لتفعيلها.",
  no_inputs:
    "لا توجد حالياً إشارات سوق أو مواضيع أصلية كافية لبناء مرشّحات هجينة. فعّل خدمات الاستكشاف أو أنشئ مواضيع أوليّة من «التفكير الأصيل» ثم أعد المحاولة.",
  analysis_pending:
    "جاري تحليل إشارات السوق… سنعرض المرشحات عند اكتمال التحليل.",
  // Original thinking
  bank_full:
    "بنك المواضيع ممتلئ مؤقّتاً. راجع المواضيع الحالية أو احذف القديمة قبل التوليد.",
  // Common AI failures (don't leak ai_runs / model names / error classes)
  ai_failure:
    "تعذّر إكمال التوليد. حاول مجدّداً بعد دقائق، وإن استمرّ الخلل تواصل مع مسؤول النظام.",
  validation_failure:
    "تعذّر إكمال التوليد بسبب نتائج غير مكتملة. حاول مجدّداً.",
  unknown:
    "تعذّر إكمال التوليد. حاول مجدّداً بعد دقائق.",
}
export function generationReasonLabel(reason: string | null | undefined): string {
  if (!reason) return GENERATION_REASON_LABEL.unknown
  return GENERATION_REASON_LABEL[reason] ?? GENERATION_REASON_LABEL.unknown
}

// ─── Data-source labels (transcript / chapters / clips loaders) ─
// The editorial loaders return a `source` identifier so debugging UIs
// can show where the doc came from. Operators should NEVER see the
// raw DB table name. This map translates internal names to operator
// language.

const SOURCE_LABEL: Record<string, string> = {
  studio_analysis_records: "السجلّ التحريري الموحَّد",
  studio_transcripts: "نصّ الاستوديو القديم",
  empty: "لا يوجد سجلّ بعد",
}
export function sourceLabel(s: string): string {
  return SOURCE_LABEL[s] ?? "مصدر غير معروف"
}

// ─── Diagnostic phrases used in toasts / banners ─────────────────
// Centralised so we never write `راجع ai_runs` or similar internal
// hints in operator copy.
export const DIAGNOSTIC_PHRASES = {
  generic_generation_failure:
    "تعذّر إكمال التوليد. حاول مجدّداً بعد دقائق.",
  contact_admin: "إن استمرّ الخلل تواصل مع مسؤول النظام.",
} as const
