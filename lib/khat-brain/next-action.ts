/**
 * UX-1 — Single source of truth for "what should the operator do next?"
 *
 * Maps an EIR phase (the canonical state) into a concrete action card
 * for the Command Center, the Episode Workspace, and any other surface
 * that asks "what's the call to action right now?".
 *
 * Add no business logic here. Pure mapping. The whole point is that
 * every UI component reads from the same table.
 */

import type { EpisodePhase } from "@/lib/db/schema/eir"

export type NextActionTone = "normal" | "warning" | "urgent"

export interface NextAction {
  /** Stable key for analytics + tests. */
  key: string
  /** EIR phase this action applies to. */
  phase: EpisodePhase
  /** Operator-facing label (Arabic). */
  label: string
  /** One-sentence description (Arabic). */
  description: string
  /** Where to send the operator. Phase X scaffolds use route templates. */
  href: (eirId: string) => string
  /**
   * Sort priority. Lower number = higher in the queue.
   * Roughly: stuck/urgent paths < everyday flow < terminal states.
   */
  priority: number
  /** Visual tone. `urgent` for blockers; `warning` for stuck phases. */
  tone: NextActionTone
}

/**
 * The complete table. Indexed by EIR phase. Every phase has exactly
 * one entry — no exceptions, no fall-throughs.
 *
 * `href` builders use the future Episode Workspace path
 * `/admin/khat-brain/episodes/[eirId]`. UX-1 surfaces don't render the
 * Episode Workspace yet; until UX-3 ships, the link still resolves to
 * the legacy per-domain page via existing redirects + the EIR detail
 * surface. Centralising the path here means UX-3 is a one-file change.
 */
export const NEXT_ACTION_BY_PHASE: Record<EpisodePhase, NextAction> = {
  idea: {
    key: "idea.pick_topic",
    phase: "idea",
    label: "اختيار موضوع",
    description: "هذه الحلقة لم تستقر على فكرة بعد — اقترح موضوعاً أو مرّرها عبر المولّد الهجين.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=topic`,
    priority: 30,
    tone: "normal",
  },
  guest_discovery: {
    key: "guest_discovery.find_guest",
    phase: "guest_discovery",
    label: "اختيار أو اكتشاف ضيف",
    description: "اربط هذه الحلقة بضيف معروف أو شغّل تشغيل اكتشاف.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=guest`,
    priority: 20,
    tone: "warning",
  },
  guest_assigned: {
    key: "guest_assigned.review_prep",
    phase: "guest_assigned",
    label: "مراجعة الإعداد",
    description: "الضيف معيّن — راجع الإعداد قبل الانتقال إلى الموافقة.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=preparation`,
    priority: 25,
    tone: "normal",
  },
  approved: {
    key: "approved.review_prep",
    phase: "approved",
    label: "مراجعة الإعداد",
    description: "تم اعتماد الحلقة — افتح إعداد V2 وراجع البنية والأسئلة.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=preparation`,
    priority: 25,
    tone: "normal",
  },
  researching: {
    key: "researching.review_prep",
    phase: "researching",
    label: "مراجعة الإعداد",
    description: "البحث جارٍ — افتح إعداد V2 لرؤية المخرجات الحالية أو لإعادة التوليد.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=preparation`,
    priority: 25,
    tone: "normal",
  },
  prepared: {
    key: "prepared.open_room",
    phase: "prepared",
    label: "فتح غرفة التصوير",
    description: "الإعداد جاهز — أنشئ غرفة تسجيل وحضّر الفريق.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=recording`,
    priority: 15,
    tone: "normal",
  },
  ready_to_record: {
    key: "ready_to_record.start",
    phase: "ready_to_record",
    label: "بدء التسجيل",
    description: "الغرفة قائمة — افتح Recording V2 وابدأ المؤقّت عند الجاهزية.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=recording`,
    priority: 10,
    tone: "urgent",
  },
  recording: {
    key: "recording.in_progress",
    phase: "recording",
    label: "التسجيل جارٍ",
    description: "الحلقة قيد التسجيل الآن — افتح غرفة التسجيل لإدارة المؤقّت والعلامات.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=recording`,
    priority: 5,
    tone: "urgent",
  },
  recorded: {
    key: "recorded.open_studio",
    phase: "recorded",
    label: "فتح الاستديو",
    description: "تم التسجيل — افتح الاستديو لتوليد النص والفصول والمقاطع.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=studio`,
    priority: 18,
    tone: "normal",
  },
  producing: {
    key: "producing.continue",
    phase: "producing",
    label: "متابعة إنتاج الحلقة",
    description: "الإنتاج جارٍ — أكمل توليد حزمة النشر أو راجع المخرجات.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=studio`,
    priority: 22,
    tone: "normal",
  },
  ready_to_publish: {
    key: "ready_to_publish.push",
    phase: "ready_to_publish",
    label: "نشر / دفع الحلقة",
    description: "حزمة الاستديو جاهزة — ادفع المحتوى إلى الحلقة وانشر.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=publish`,
    priority: 12,
    tone: "urgent",
  },
  published: {
    key: "published.review_performance",
    phase: "published",
    label: "مراجعة الأداء",
    description: "الحلقة منشورة — راقب الأداء وإشارات التعلّم.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=performance`,
    priority: 40,
    tone: "normal",
  },
  analyzing: {
    key: "analyzing.review_performance",
    phase: "analyzing",
    label: "مراجعة الأداء",
    description: "تحليل الأداء جارٍ — راجع لقطات المشاهدات والإشارات الحالية.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=performance`,
    priority: 40,
    tone: "normal",
  },
  learned: {
    key: "learned.review_lessons",
    phase: "learned",
    label: "مراجعة ما تعلّمه النظام",
    description: "النظام احتسب درس هذه الحلقة — تحقّق من تأثيره على الموسم القادم.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=performance`,
    priority: 60,
    tone: "normal",
  },
  archived: {
    key: "archived.read_only",
    phase: "archived",
    label: "مؤرشفة",
    description: "هذه الحلقة مؤرشفة — لا توجد إجراءات نشطة.",
    href: (id) => `/admin/khat-brain/episodes/${id}?tab=overview`,
    priority: 100,
    tone: "normal",
  },
}

/** Lookup. Always returns a value because the table is exhaustive. */
export function nextActionFor(phase: EpisodePhase): NextAction {
  return NEXT_ACTION_BY_PHASE[phase]
}

/**
 * Decorate a list of EIRs with their action card and sort by priority +
 * recency. The Command Center calls this; the Episode Workspace's
 * "Next action" widget will too.
 */
export interface EirNextAction<T extends { id: string; phase: EpisodePhase; updated_at: string }> {
  eir: T
  action: NextAction
  href: string
}

export function buildNextActionQueue<T extends { id: string; phase: EpisodePhase; updated_at: string }>(
  eirs: T[],
): Array<EirNextAction<T>> {
  return eirs
    .map((eir) => {
      const action = nextActionFor(eir.phase)
      return { eir, action, href: action.href(eir.id) }
    })
    .sort((a, b) => {
      // Primary: action priority (low number first).
      if (a.action.priority !== b.action.priority) {
        return a.action.priority - b.action.priority
      }
      // Secondary: most-recently-updated first (so today's work surfaces).
      return Date.parse(b.eir.updated_at) - Date.parse(a.eir.updated_at)
    })
}
