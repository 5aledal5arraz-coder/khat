import type { GuestCandidateStatus, GuestCandidatePriority } from "@/types/database"

export interface StatusMeta {
  label: string
  /** Tailwind classes for badge background + text */
  badgeClass: string
  /** Order index for sorting */
  order: number
}

export const STATUS_META: Record<GuestCandidateStatus, StatusMeta> = {
  new:               { label: "جديد",         badgeClass: "bg-slate-500/12 text-slate-700 dark:text-slate-300", order: 0 },
  researching:       { label: "قيد البحث",    badgeClass: "bg-blue-500/12 text-blue-700 dark:text-blue-400", order: 1 },
  analyzed:          { label: "تم التحليل",   badgeClass: "bg-violet-500/12 text-violet-700 dark:text-violet-400", order: 2 },
  shortlisted:       { label: "ضمن القائمة",  badgeClass: "bg-amber-500/12 text-amber-700 dark:text-amber-400", order: 3 },
  contacted:         { label: "تم التواصل",   badgeClass: "bg-sky-500/12 text-sky-700 dark:text-sky-400", order: 4 },
  waiting_response:  { label: "بانتظار الرد", badgeClass: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-400", order: 5 },
  accepted:          { label: "وافق",         badgeClass: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400", order: 6 },
  declined:          { label: "اعتذر",        badgeClass: "bg-zinc-500/12 text-zinc-700 dark:text-zinc-400", order: 7 },
  prep_sent:         { label: "أرسل التحضير", badgeClass: "bg-indigo-500/12 text-indigo-700 dark:text-indigo-400", order: 8 },
  prep_in_progress:  { label: "يعبئ التحضير", badgeClass: "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-400", order: 9 },
  prep_completed:    { label: "أكمل التحضير", badgeClass: "bg-green-500/12 text-green-700 dark:text-green-400", order: 10 },
  archived:          { label: "مؤرشف",        badgeClass: "bg-stone-500/12 text-stone-600 dark:text-stone-400", order: 11 },
  rejected:          { label: "مرفوض",        badgeClass: "bg-red-500/12 text-red-700 dark:text-red-400", order: 12 },
}

export const STATUS_OPTIONS: GuestCandidateStatus[] = [
  "new", "researching", "analyzed", "shortlisted", "contacted",
  "waiting_response", "accepted", "declined", "prep_sent",
  "prep_in_progress", "prep_completed", "rejected",
]

export const PRIORITY_META: Record<GuestCandidatePriority, { label: string; badgeClass: string }> = {
  high:   { label: "عالية",  badgeClass: "bg-rose-500/12 text-rose-700 dark:text-rose-400" },
  medium: { label: "متوسطة", badgeClass: "bg-amber-500/12 text-amber-700 dark:text-amber-400" },
  low:    { label: "منخفضة", badgeClass: "bg-slate-500/12 text-slate-600 dark:text-slate-400" },
}

export const CATEGORY_OPTIONS = [
  { value: "business",   label: "أعمال" },
  { value: "media",      label: "إعلام" },
  { value: "philosophy", label: "فلسفة وفكر" },
  { value: "sports",     label: "رياضة" },
  { value: "tech",       label: "تقنية" },
  { value: "art",        label: "فن وأدب" },
  { value: "science",    label: "علوم" },
  { value: "religion",   label: "دين" },
  { value: "politics",   label: "سياسة" },
  { value: "other",      label: "أخرى" },
]
