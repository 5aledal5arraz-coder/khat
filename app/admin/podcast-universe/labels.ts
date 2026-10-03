/**
 * Arabic labels for the Podcast Universe screens. One place so a status never
 * reads two ways. Views are «التعرّض», never popularity or quality (D11).
 */
import type { KitTone } from "@/app/admin/components/ui-kit"

export const REGISTRY_TYPE_LABEL: Record<string, string> = {
  core_interview: "مقابلات أساسية",
  context_coverage: "تغطية سياقية",
  candidate: "مرشّحة",
  rejected: "مرفوضة",
  dormant: "خاملة",
}

export const VERIFY_LABEL: Record<string, string> = {
  pending: "بانتظار التحقق",
  verified: "متحقَّق منها",
  rejected: "مرفوضة",
}

export const CRAWL_LABEL: Record<string, string> = {
  never: "لم تُزحف",
  running: "قيد الزحف",
  complete: "مكتمل",
  partial: "جزئي",
  failed: "فشل",
}

export const RUN_STATUS_LABEL: Record<string, string> = {
  queued: "في الطابور",
  running: "قيد التشغيل",
  succeeded: "نجح",
  partial: "جزئي",
  failed: "فشل",
  budget_stopped: "توقف عند السقف",
}

export const EVIDENCE_LABEL: Record<string, string> = {
  verified: "مؤكَّد",
  probable: "محتمل",
  unknown: "غير معروف",
  conflicted: "متعارض",
}

export const EVIDENCE_TONE: Record<string, KitTone> = {
  verified: "success",
  probable: "warning",
  unknown: "default",
  conflicted: "danger",
}

export const IDENTITY_LABEL: Record<string, string> = {
  verified: "هوية مؤكَّدة",
  probable: "هوية محتملة",
  unverified: "غير متحقَّق",
  conflicted: "متعارضة",
}

export const GENDER_LABEL: Record<string, string> = {
  male: "ذكر",
  female: "أنثى",
  unknown: "غير معروف",
}

export const BASIS_LABEL: Record<string, string> = {
  none: "لا دليل",
  episode_metadata: "من بيانات الحلقة",
  khat_candidate: "من مرشح خط (غير موثَّق)",
  khat_guest: "من سجل خط",
  manual: "قرار يدوي",
}

export const APPEARANCE_STATUS_LABEL: Record<string, string> = {
  extracted: "مستخرج",
  verified: "مؤكَّد",
  review: "يحتاج مراجعة",
  rejected: "مفصول",
  superseded: "استُبدل بإعادة الاستخراج",
}

export const COUNTRY_LABEL: Record<string, string> = {
  KW: "الكويت",
  SA: "السعودية",
  AE: "الإمارات",
  BH: "البحرين",
  QA: "قطر",
  OM: "عُمان",
  EG: "مصر",
  JO: "الأردن",
  LB: "لبنان",
  IQ: "العراق",
  SY: "سوريا",
  YE: "اليمن",
  PS: "فلسطين",
  SD: "السودان",
  MA: "المغرب",
}

export function countryLabel(code: string | null | undefined): string {
  if (!code) return "—"
  return COUNTRY_LABEL[code] ?? code
}

/** Decision 12 wording — the registry can never prove universal absence. */
export const NO_APPEARANCE_TEXT = "لم نجد ظهوراً مفهرساً في البودكاستات"

export const TONE_BADGE: Record<KitTone, string> = {
  default: "bg-muted text-muted-foreground",
  gold: "bg-primary/12 text-primary",
  purple: "bg-accent/12 text-accent",
  success: "bg-emerald-500/12 text-emerald-700",
  warning: "bg-amber-500/12 text-amber-700",
  danger: "bg-destructive/12 text-destructive",
}
