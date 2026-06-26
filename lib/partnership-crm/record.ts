/**
 * The 360° partner record — one call that hydrates everything the CRM knows
 * about a partner: the lead, AI evaluation, proposal, offer, and the full
 * relationship history (activities, notes, tasks, meetings, emails, contract,
 * campaigns).
 */

import {
  getSponsorshipLeadById,
  getSponsorshipAnalysis,
  getSponsorshipProposal,
} from "@/lib/admin/queries"
import { getOfferByLead } from "@/lib/partnership-offers"
import type { PartnerRecord, SponsorshipStatus } from "@/types/database"
import { getActivities } from "./activities"
import { getNotes } from "./notes"
import { getTasks } from "./tasks"
import { getMeetings } from "./meetings"
import { getEmails } from "./emails"
import { getContract } from "./contracts"
import { getCampaigns } from "./campaigns"

export async function getPartnerRecord(leadId: string): Promise<PartnerRecord | null> {
  const lead = await getSponsorshipLeadById(leadId)
  if (!lead) return null

  const [analysis, proposal, offer, activities, notes, tasks, meetings, emails, contract, campaigns] =
    await Promise.all([
      getSponsorshipAnalysis(leadId),
      getSponsorshipProposal(leadId),
      getOfferByLead(leadId),
      getActivities(leadId),
      getNotes(leadId),
      getTasks(leadId),
      getMeetings(leadId),
      getEmails(leadId),
      getContract(leadId),
      getCampaigns(leadId),
    ])

  return {
    lead,
    analysis,
    proposal,
    offer,
    activities,
    notes,
    tasks,
    meetings,
    emails,
    contract,
    campaigns,
  }
}

export interface NextBestAction {
  title: string
  detail: string
  /** Where to act: which CRM surface/tab to open. */
  cta?: string
  tone: "advance" | "info" | "warn" | "neutral"
}

/**
 * The single clearest next move for the operator. Open tasks win (they're
 * explicit commitments); otherwise we derive from the lifecycle stage and the
 * AI's recommended action.
 */
export function resolveNextBestAction(record: PartnerRecord): NextBestAction {
  const openTasks = record.tasks.filter((t) => t.status === "open")
  if (openTasks.length > 0) {
    const t = openTasks[0]
    const due = t.due_at ? new Date(t.due_at) : null
    const overdue = due ? due.getTime() < Date.now() : false
    return {
      title: t.title,
      detail: t.detail || (overdue ? "مهمة متأخرة — تستحق المتابعة الآن." : "مهمة مفتوحة بانتظارك."),
      cta: "tasks",
      tone: overdue ? "warn" : "advance",
    }
  }

  const stage = record.lead.status as SponsorshipStatus
  const a = record.analysis

  if (a?.status === "generating") {
    return { title: "التقييم قيد التشغيل", detail: "الذكاء الاصطناعي يحلّل الشركة الآن.", tone: "info" }
  }

  // No analysis yet → triage first.
  if (!a || a.status !== "ready") {
    return {
      title: "شغّل تقييم الذكاء الاصطناعي",
      detail: "احصل على بحث حيّ ودرجة توافق واستراتيجية قبل أي خطوة.",
      cta: "overview",
      tone: "advance",
    }
  }

  // Derive from the AI's recommended action + the stage.
  switch (stage) {
    case "new":
    case "reviewing":
      if (a.recommended_action === "advance")
        return { title: "جهّز العرض وأرسله", detail: a.action_rationale || "التوافق قوي — تقدّم بعرض.", cta: "proposal", tone: "advance" }
      if (a.recommended_action === "request_info")
        return { title: "اطلب معلومات إضافية", detail: a.action_rationale || "واعد لكن ينقصه وضوح — اطلب تفاصيل.", cta: "email", tone: "info" }
      if (a.recommended_action === "nurture")
        return { title: "أبقِ العلاقة دافئة", detail: a.action_rationale || "مناسب لكن ليس الآن — جدول متابعة لاحقة.", cta: "tasks", tone: "neutral" }
      if (a.recommended_action === "decline")
        return { title: "اعتذر بلطف", detail: a.action_rationale || "لا يناسب خط حاليًا.", cta: "email", tone: "warn" }
      return { title: "راجع التقييم وقرّر", detail: "اطّلع على ملخّص المدير ثم اتّخذ الخطوة.", cta: "overview", tone: "info" }
    case "proposal_sent":
      return { title: "تابع العرض المُرسَل", detail: "تواصل للتأكد من الاستلام وحدّد موعدًا للنقاش.", cta: "meetings", tone: "advance" }
    case "negotiation":
      return { title: "أدِر التفاوض نحو الإغلاق", detail: "استخدم تكتيكات التفاوض ونقاط الحوار لحسم الاتفاق.", cta: "overview", tone: "advance" }
    case "confirmed":
      return { title: "فعِّل العقد والحملة", detail: "وثّق العقد وأنشئ الحملة لبدء التنفيذ.", cta: "contract", tone: "advance" }
    case "active":
      return { title: "تابع تنفيذ الحملة", detail: "حدّث المخرجات وسجّل الأداء أولًا بأول.", cta: "campaign", tone: "advance" }
    case "renewal":
      return { title: "افتح فرصة التجديد", detail: "قدّم تقرير الأداء واقترح موسمًا جديدًا.", cta: "campaign", tone: "advance" }
    case "declined":
      return { title: "العلاقة مغلقة حاليًا", detail: "يمكنك إعادة التواصل مستقبلًا إن تغيّر السياق.", tone: "neutral" }
    default:
      return { title: "راجع الحالة", detail: "حدّد الخطوة التالية المناسبة.", tone: "info" }
  }
}
