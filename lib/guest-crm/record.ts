/**
 * The 360° guest casting record — one call that hydrates everything the CRM
 * knows about an applicant: the application, AI casting read (with live
 * research), episode concept, response drafts, prep form, and the relationship
 * history (activities, notes, tasks on the shared polymorphic CRM core).
 */

import {
  getGuestApplicationById,
  getGuestAnalysis,
  getGuestConcept,
  getGuestResponses,
} from "@/lib/admin/queries"
import { getPrepFormByApplicationId } from "@/lib/guest-prep"
import { getActivities, getNotes, getTasks } from "@/lib/crm"
import { getEirForApplication } from "./production-bridge"
import type { GuestRecord, GuestApplicationStatus } from "@/types/database"

export async function getGuestRecord(applicationId: string): Promise<GuestRecord | null> {
  const application = await getGuestApplicationById(applicationId)
  if (!application) return null

  const [analysis, concept, responses, prepForm, eir, activities, notes, tasks] = await Promise.all([
    getGuestAnalysis(applicationId),
    getGuestConcept(applicationId),
    getGuestResponses(applicationId),
    getPrepFormByApplicationId(applicationId),
    getEirForApplication(applicationId),
    getActivities("guest", applicationId),
    getNotes("guest", applicationId),
    getTasks("guest", applicationId),
  ])

  return { application, analysis, concept, responses, prepForm, eir, activities, notes, tasks }
}

export interface GuestNextBestAction {
  title: string
  detail: string
  cta?: string
  tone: "advance" | "info" | "warn" | "neutral"
}

/**
 * The single clearest next move for the operator. Open tasks win; otherwise we
 * derive from the casting stage + the AI recommendation.
 */
export function resolveGuestNextBestAction(record: GuestRecord): GuestNextBestAction {
  const open = record.tasks.filter((t) => t.status === "open")
  if (open.length > 0) {
    const t = open[0]
    const overdue = t.due_at ? new Date(t.due_at).getTime() < Date.now() : false
    return {
      title: t.title,
      detail: t.detail || (overdue ? "مهمة متأخرة — تستحق المتابعة الآن." : "مهمة مفتوحة بانتظارك."),
      cta: "tasks",
      tone: overdue ? "warn" : "advance",
    }
  }

  const a = record.analysis
  const stage = record.application.status as GuestApplicationStatus

  if (a?.status === "generating") {
    return { title: "التقييم قيد التشغيل", detail: "الذكاء الاصطناعي يقرأ القصة ويبحث عن المتقدم الآن.", tone: "info" }
  }
  if (!a || a.status !== "ready") {
    return {
      title: "شغّل تقييم الترشيح",
      detail: "احصل على بحث حيّ عن المتقدم وقراءة تحريرية قبل أي قرار.",
      cta: "brief",
      tone: "advance",
    }
  }

  switch (stage) {
    case "new":
    case "under_review":
      if (a.recommendation === "strong_accept" || a.recommendation === "accept")
        return { title: "ادعُه ضيفًا وابدأ التحضير", detail: a.fit_summary || "قصة قوية تناسب خط — تقدّم بالدعوة.", cta: "concept", tone: "advance" }
      if (a.recommendation === "consider_later")
        return { title: "أبقِ القصة دافئة", detail: a.fit_summary || "واعدة لكن ليس الآن — جدول متابعة لاحقة.", cta: "tasks", tone: "neutral" }
      return { title: "اعتذر بلطف", detail: a.fit_summary || "لا تناسب خط حاليًا — ردّ كريم يحفظ العلاقة.", cta: "conversation", tone: "warn" }
    case "accepted":
      if (!record.concept) return { title: "جهّز تصور الحلقة", detail: "ولّد عنوانًا وأسئلة وزاوية تحريرية قبل التسجيل.", cta: "concept", tone: "advance" }
      if (!record.prepForm) return { title: "أرسل استبيان التحضير", detail: "أنشئ رابط التحضير وشاركه مع الضيف لجدولة التسجيل.", cta: "prep", tone: "advance" }
      if (record.prepForm.status === "pending") return { title: "بانتظار تعبئة الاستبيان", detail: "ذكّر الضيف بإكمال استبيان التحضير.", cta: "prep", tone: "info" }
      return { title: "حدّد موعد التسجيل", detail: "اكتملت بيانات التحضير — رتّب موعدًا في الاستوديو.", cta: "prep", tone: "advance" }
    case "consider_later":
      return { title: "متابعة دافئة", detail: "تواصل حين يحين الوقت المناسب لهذه القصة.", cta: "conversation", tone: "neutral" }
    case "rejected":
      return { title: "الترشيح مغلق", detail: "يمكنك إعادة التواصل مستقبلًا إن تغيّر السياق.", tone: "neutral" }
    default:
      return { title: "راجع الحالة", detail: "حدّد الخطوة التالية المناسبة.", tone: "info" }
  }
}
