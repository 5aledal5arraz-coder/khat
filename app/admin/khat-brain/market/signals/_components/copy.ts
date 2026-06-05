/**
 * Arabic operator copy for the Market Signals review queue.
 *
 * Single map so the UI never inlines internal terms. Keys mirror the
 * closed-vocab constants in `lib/db/schema/editorial-intelligence.ts`;
 * values are operator-facing Arabic strings.
 *
 * Forbidden anywhere in this folder: `market.collect`, `extract`,
 * `cluster`, `ingestion`, `pipeline`, `scheduler`, `npm run`,
 * `ai_runs`. The smoke for Phase 2 enforces this.
 */

import type {
  SignalReviewStatus,
  SignalEditorialTag,
  TrustedSourceType,
} from "@/lib/db/schema/editorial-intelligence"
import type { ReviewTab } from "@/lib/market-intelligence/review-queries"

export const REVIEW_TAB_LABEL: Record<
  ReviewTab,
  { label: string; help: string }
> = {
  new: {
    label: "إشارات جديدة",
    help: "تنتظر مراجعتك. لم يُتَّخذ بشأنها قرار بعد.",
  },
  strong: {
    label: "إشارات قوية",
    help: "اعتمدتَها للاستخدام في التوليد والتجميع.",
  },
  weak: {
    label: "إشارات ضعيفة",
    help: "وسمتَها بضعيفة أو سطحية — تُستبعد من تأثير قوي.",
  },
  rejected: {
    label: "إشارات مرفوضة",
    help: "رفضتَها يدوياً — لن تُستخدم في التوليد.",
  },
  archived: {
    label: "إشارات مؤرشفة",
    help: "مؤرشفة من قائمة المراجعة — يمكن استعادتها.",
  },
  manual: {
    label: "إشارات يدوية",
    help: "إشارات أنشأها فريق التحرير يدوياً.",
  },
}

export const STATUS_LABEL: Record<
  SignalReviewStatus,
  { label: string; tone: "muted" | "ok" | "warn" | "danger" }
> = {
  new: { label: "جديدة", tone: "muted" },
  approved: { label: "معتمدة", tone: "ok" },
  rejected: { label: "مرفوضة", tone: "danger" },
  archived: { label: "مؤرشفة", tone: "warn" },
}

export const TAG_LABEL: Record<SignalEditorialTag, string> = {
  strong: "قوية",
  weak: "ضعيفة",
  timeless: "خالدة",
  repetitive: "مكرَّرة",
  emotional: "عاطفية",
  controversial: "إشكالية",
  deep: "عميقة",
  surface_level: "سطحية",
  off_identity: "خارج هويتنا",
}

export const SOURCE_LABEL: Record<string, string> = {
  // Adapter sources (existing market_topic_signals.source values)
  youtube: "يوتيوب",
  podcast_apple: "آبل بودكاست",
  // Curated source types (Phase 3 will surface these too)
  podcast: "بودكاست",
  website: "موقع إلكتروني",
  rss: "تغذية RSS",
  creator: "صانع محتوى",
  journalist: "صحفي",
  thinker: "مفكّر",
}

export function sourceLabelFor(s: string): string {
  return SOURCE_LABEL[s] ?? s
}

export function trustedSourceTypeLabel(t: TrustedSourceType): string {
  return SOURCE_LABEL[t] ?? t
}

/** Operator-language for relative time. */
export function relativeArabic(iso: string | null): string {
  if (!iso) return "—"
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return "—"
  const delta = Date.now() - t
  if (delta < 0) return "الآن"
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (delta < minute) return "قبل لحظات"
  if (delta < hour) return `قبل ${Math.floor(delta / minute)} دقيقة`
  if (delta < day) return `قبل ${Math.floor(delta / hour)} ساعة`
  if (delta < 30 * day) return `قبل ${Math.floor(delta / day)} يوم`
  if (delta < 365 * day) return `قبل ${Math.floor(delta / (30 * day))} شهر`
  return `قبل ${Math.floor(delta / (365 * day))} سنة`
}

export const MANUAL_KIND_LABEL: Record<string, string> = {
  observation: "ملاحظة",
  quote: "اقتباس",
  social_tension: "توتر اجتماعي",
  cultural_shift: "تحوّل ثقافي",
  emotional_phenomenon: "ظاهرة عاطفية",
  conversation_pattern: "نمط حواري",
  philosophical_contradiction: "تناقض فلسفي",
  audience_pain_point: "نقطة ألم للجمهور",
  other: "أخرى",
}

export const MANUAL_FORM_COPY = {
  panelTitle: "إضافة إشارة يدوية",
  toggleOpen: "إضافة إشارة يدوية",
  toggleClose: "إخفاء النموذج",
  intro:
    "أضف ملاحظة تحريرية، اقتباساً، توتراً اجتماعياً، أو أي إشارة تظهر من قراءتك للسوق. تُعتمد تلقائياً كقرار تحريري بشري.",
  fields: {
    title: "العنوان",
    summary: "الملاحظة / الوصف",
    kind: "نوع الإشارة",
    sourceLink: "رابط المصدر (اختياري)",
    trustedSource: "مصدر موثوق (اختياري)",
    language: "اللغة",
    geography: "الجغرافيا (اختياري)",
    theme: "الموضوع / العدسة (اختياري)",
    emotion: "الانفعال السائد (اختياري)",
    controversy: "درجة الإثارة",
    tags: "الوسوم",
    notes: "ملاحظات تحريرية",
    rangeHint: "بين 0 و 1",
    titlePlaceholder: "عنوان مختصر يعبّر عن جوهر الإشارة",
    summaryPlaceholder: "اكتب الملاحظة بلغة المحرّر — جملة أو فقرة قصيرة",
    notesPlaceholder: "ملاحظات داخلية اختيارية",
    languagePlaceholder: "مثال: ar / en",
    geographyPlaceholder: "مثال: السعودية، الكويت، عالمي…",
    themePlaceholder: "مثال: identity_fragments، fear_of_being_seen…",
    emotionPlaceholder: "مثال: خوف، فخر، خجل، غضب…",
    sourceLinkPlaceholder: "https://…",
    trustedSourcePlaceholder: "— بدون —",
  },
  buttons: {
    save: "حفظ الإشارة",
    cancel: "إلغاء",
  },
  hints: {
    autoApproved: "ستُسجَّل هذه الإشارة بحالة «معتمدة» مباشرة لأنّها قرار محرّر.",
  },
  errors: {
    title_required: "العنوان مطلوب.",
    summary_required: "الملاحظة / الوصف مطلوب.",
    invalid_url: "الرابط غير صالح. استخدم http أو https.",
    invalid_kind: "نوع الإشارة غير معتمد.",
    invalid_range: "قيمة الإثارة يجب أن تكون بين 0 و 1.",
    invalid_tag: "أحد الوسوم خارج المفردات المعتمدة.",
    duplicate_signal: "هذه الإشارة مسجَّلة من قبل.",
    trusted_source_not_found: "المصدر الموثوق المختار غير موجود.",
    actor_required: "يلزم تسجيل دخول مشغّل.",
    db_unavailable: "قاعدة البيانات غير متاحة.",
  },
  success: "تمّ حفظ الإشارة وتسجيلها في سجلّ القرارات التحريرية.",
}

export const PAGE_COPY = {
  title: "إشارات السوق",
  subtitle:
    "هذه القائمة هي ذاكرة خط التحريرية. كل اعتماد أو رفض يُعلّم النظام ما يهمّك، وكل وسم يصقل التوليد القادم.",
  emptyTab: "لا توجد إشارات في هذا التصنيف حالياً.",
  noSignalsTotal:
    "لم تصل أي إشارات بعد. سيتم تحديث إشارات السوق تلقائياً عند توفّرها.",
  selectionPrefix: "محدَّد:",
  selectAll: "تحديد الكل",
  clearSelection: "إلغاء التحديد",
  bulkApprove: "اعتماد المحدَّد",
  bulkReject: "رفض المحدَّد",
  bulkArchive: "أرشفة المحدَّد",
  bulkTag: "إضافة وسم للمحدَّد",
  perCard: {
    approve: "اعتماد",
    reject: "رفض",
    archive: "أرشفة",
    restore: "استعادة",
    addNote: "إضافة ملاحظة",
    saveNote: "حفظ الملاحظة",
    cancel: "إلغاء",
    tag: "وسم",
    untag: "إزالة الوسم",
    addTag: "أضف وسماً",
    sourceLabel: "المصدر",
    themeLabel: "الموضوع",
    emotionLabel: "الانفعال",
    controversyLabel: "الإثارة",
    viewsLabel: "المشاهدات",
    scoreLabel: "تقييم النظام",
    collectedLabel: "وصلت",
    reviewedLabel: "روجِعت",
    notesLabel: "ملاحظات تحريرية",
    statusLabel: "الحالة",
    tagsLabel: "الوسوم",
  },
  pagination: {
    prev: "السابق",
    next: "التالي",
    page: "صفحة",
    of: "من",
  },
}
