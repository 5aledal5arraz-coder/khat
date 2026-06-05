/**
 * Arabic operator copy for the Trusted Sources surface.
 *
 * Forbidden anywhere on this surface: internal DB column names,
 * ingestion verbs, `pipeline`, `scheduler`, `npm run`, `ai_runs`.
 * Smoke for Phase 3 enforces this.
 */

import type { TrustedSourceType } from "@/lib/db/schema/editorial-intelligence"
import type {
  SourceFilterKey,
  SourceSortKey,
} from "@/lib/market-intelligence/sources-types"

export const SOURCE_TYPE_LABEL: Record<TrustedSourceType, string> = {
  youtube: "قناة يوتيوب",
  podcast: "بودكاست",
  website: "موقع",
  rss: "تغذية RSS",
  creator: "صانع محتوى",
  journalist: "صحفي",
  thinker: "مفكّر",
}

export const FILTER_LABEL: Record<SourceFilterKey, string> = {
  all: "الكل",
  active: "نشطة",
  inactive: "متوقّفة",
  archived: "مؤرشفة",
  high_trust: "ثقة عالية",
  high_alignment: "انسجام عالٍ",
}

export const SORT_LABEL: Record<SourceSortKey, string> = {
  newest: "الأحدث",
  trust_desc: "الأعلى ثقة",
  alignment_desc: "الأعلى انسجاماً",
  linked_desc: "الأكثر إشارات",
}

export const SOURCE_TYPE_REQUIRES_URL: Record<TrustedSourceType, boolean> = {
  youtube: true,
  podcast: true,
  website: true,
  rss: true,
  creator: false,
  journalist: false,
  thinker: false,
}

export const PAGE_COPY = {
  title: "المصادر الموثوقة",
  subtitle:
    "اختر المصادر التي ترى أنّها تستحق ثقة خط التحريرية. كلّما رفعت درجة الثقة أو الانسجام، زاد تأثير إشاراتها على التوليد.",
  backToBrain: "العودة إلى مركز القيادة",
  addSource: "إضافة مصدر",
  newSource: "مصدر جديد",
  editSource: "تعديل المصدر",
  saveSource: "حفظ",
  cancel: "إلغاء",
  empty: "لا توجد مصادر بعد. اضغط «إضافة مصدر» لبدء بناء قائمة المصادر الموثوقة.",
  emptyForFilter: "لا توجد مصادر مطابقة لهذه التصفية.",
  searchPlaceholder: "ابحث في الاسم أو المعرّف…",
  filters: {
    label: "تصفية",
    type: "النوع",
    language: "اللغة",
    geography: "الجغرافيا",
    allTypes: "كل الأنواع",
    allLanguages: "كل اللغات",
    allGeographies: "كل المناطق",
  },
  sort: { label: "ترتيب" },
  form: {
    displayName: "اسم المصدر",
    identifier: "المعرّف / الرابط",
    type: "النوع",
    language: "اللغة",
    geography: "الجغرافيا",
    trustScore: "درجة الثقة",
    alignmentScore: "درجة الانسجام التحريري",
    active: "نشط",
    notes: "ملاحظات",
    languagePlaceholder: "مثال: ar / en",
    geographyPlaceholder: "مثال: السعودية، الكويت، عالمي…",
    notesPlaceholder: "ملاحظات تحريرية اختيارية",
    rangeHint: "بين 0 و 1",
    urlHint: "يجب أن يبدأ بـ http أو https",
  },
  stats: {
    linked: "عدد الإشارات",
    meanScore: "متوسط تقييم النظام",
    approvalRatio: "نسبة الاعتماد",
    latestActivity: "آخر نشاط",
    statusActive: "نشط",
    statusInactive: "متوقّف",
    statusArchived: "مؤرشف",
    latestSignals: "أحدث الإشارات المرتبطة",
    noLinkedSignals: "لا توجد إشارات مرتبطة بعد.",
  },
  actions: {
    deactivate: "إيقاف",
    activate: "تفعيل",
    archive: "أرشفة",
    restore: "استعادة",
    edit: "تعديل",
    notes: "ملاحظات",
    saveNotes: "حفظ الملاحظات",
  },
}

export const SOURCE_LANGUAGES_HINT = ["ar", "en", "fr"]

/** Arabic relative time. */
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
