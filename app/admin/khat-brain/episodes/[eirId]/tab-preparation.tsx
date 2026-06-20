/**
 * UX-3b → UX-5 — Preparation tab.
 *
 *   - prep_v2 present       → inline editor + read-only deep view.
 *   - prep row but no v2    → warning card + workspace-native
 *                              "إعادة توليد الإعداد" button (no CLI).
 *   - no prep at all        → empty state + link to season workspace.
 *
 * UX-5.1 added inline editing for the high-traffic prep_v2 fields
 * (thesis, axes, questions, sensitive zones, host/director guidance).
 * UX-5.4 replaced the CLI regen hint with `regeneratePrepV2Action`.
 */

import Link from "next/link"
import { Sparkles, AlertTriangle, ExternalLink, Radio, Brain, RefreshCw, Clock } from "lucide-react"
import { PrepV2View } from "@/app/admin/preparation/[id]/prep-v2-view"
import type { WorkspacePrepSummary, WorkspaceRoomSummary } from "@/lib/khat-brain/workspace-tabs"
import { formatDateTime } from "@/lib/shared/formatters"
import { prepStatusLabel } from "@/lib/operator-language"
import { regeneratePrepV2Action } from "./job-actions"
import { JobActionButton } from "./job-action-button"
import { PrepV2InlineEditor } from "./prep-inline-editor"
import { PrepInputsEditor } from "./prep-inputs-editor"
import { AssignGuestForm } from "./assign-guest-form"

export function PreparationTab({
  prep,
  room,
  eirId,
  seasonId,
  guestOptions,
  currentGuestId,
}: {
  prep: WorkspacePrepSummary | null
  room: WorkspaceRoomSummary | null
  eirId: string
  seasonId: string | null
  guestOptions: { id: string; name: string }[]
  currentGuestId: string | null
}) {
  // No prep linked yet.
  if (!prep) {
    return (
      <div className="space-y-4">
        {!currentGuestId && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
            <div className="mb-1 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-rose-700">
              <AlertTriangle className="h-3 w-3" /> الإعداد محجوب — لا يوجد ضيف
            </div>
            <p className="mb-3 text-[12px] leading-relaxed text-foreground/85">
              لا يمكن توليد الإعداد قبل ربط ضيف بالحلقة. اختر ضيفاً
              لتمكين تحويل الحلقة إلى مرحلة الإعداد.
            </p>
            <AssignGuestForm
              eirId={eirId}
              guests={guestOptions}
              currentGuestId={currentGuestId}
            />
          </div>
        )}
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center">
          <Brain className="mx-auto h-6 w-6 text-amber-700" />
          <h3 className="mt-2 text-[13px] font-semibold">لا يوجد سجلّ إعداد</h3>
          <p className="mx-auto mt-1 max-w-md text-[12px] leading-relaxed text-foreground/85">
            يتم إنشاء الإعداد تلقائياً عند تحويل المرشّح إلى حلقة. إن لم
            يُولَّد بعد، افتح مساحة عمل الموسم وأكمل القبول.
          </p>
          {seasonId && (
            <Link
              href={`/admin/khat-brain/seasons/${seasonId}`}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-700 hover:bg-violet-500/20"
            >
              فتح مساحة الموسم <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Action row */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/40 bg-card/30 p-3">
        <div className="text-[11.5px] text-muted-foreground">
          سجل الإعداد:{" "}
          <span className="text-foreground" dir="ltr">
            {prep.title}
          </span>{" "}
          <span className="text-muted-foreground">
            ({prepStatusLabel(prep.status)})
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={
              room
                ? `/admin/khat-brain/episodes/${eirId}?tab=recording`
                : `/admin/khat-brain/episodes/${eirId}?tab=recording`
            }
            className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11.5px] font-medium text-violet-700 hover:bg-violet-500/20"
          >
            <Radio className="h-3 w-3" />
            {room ? "فتح غرفة التسجيل" : "إنشاء غرفة تسجيل"}
          </Link>
          <Link
            href={`/admin/preparation/${prep.id}?legacy=1`}
            className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-muted-foreground"
            data-legacy-link
          >
            <ExternalLink className="h-2.5 w-2.5" /> فتح الصفحة المتقدمة
          </Link>
        </div>
      </div>

      {/* UX-7 Phase B — workspace-native prep inputs editor.
          Always visible (the operator should be able to fix title /
          guest / questions even when prep_v2 isn't generated yet). */}
      <PrepInputsEditor
        preparationId={prep.id}
        eirId={eirId}
        initial={{
          title: prep.title,
          guest_name: prep.guest_name,
          short_description: prep.short_description,
          episode_goal: prep.episode_goal,
          key_questions: prep.key_questions,
        }}
      />

      {/* prep_v2 missing → clear warning + workspace-native regen button */}
      {!prep.prep_v2 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700">
            <AlertTriangle className="h-3 w-3" /> الإعداد العميق غير مُولَّد
          </div>
          <p className="mb-3 text-[12px] leading-relaxed text-foreground/85">
            هذا الإعداد ليس لديه بنية Prep V2 (التحضير العميق ٤-تمريرات).
            اضغط الزر أدناه لتوليده — العملية تستغرق دقيقتين تقريباً.
          </p>
          <JobActionButton
            label="إعادة توليد الإعداد"
            pendingLabel="جارٍ التوليد…"
            icon={<RefreshCw className="h-3 w-3" />}
            successTitle="تم تحديث الإعداد"
            action={regeneratePrepV2Action.bind(null, eirId)}
            size="md"
          />
        </div>
      )}

      {/* prep_v2 present — show regen button + inline editor + deep view */}
      {prep.prep_v2 && (
        <>
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/40 bg-card/30 p-3 text-[11.5px]"
            data-prep-action-row
          >
            <div className="flex flex-col gap-0.5">
              <span className="text-muted-foreground">
                <Sparkles className="me-1 inline h-3 w-3 text-violet-700" />
                يمكنك تعديل الحقول أدناه مباشرة، أو إعادة توليد الإعداد
                بالكامل.
              </span>
              <span
                className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground"
                dir="ltr"
                data-prep-last-action
              >
                <Clock className="h-2.5 w-2.5" />
                last update {formatDateTime(prep.updated_at)}
              </span>
            </div>
            <JobActionButton
              label="إعادة توليد الإعداد"
              pendingLabel="جارٍ التوليد…"
              icon={<RefreshCw className="h-3 w-3" />}
              successTitle="تم تحديث الإعداد"
              action={regeneratePrepV2Action.bind(null, eirId)}
            />
          </div>
          <PrepV2InlineEditor prepId={prep.id} payload={prep.prep_v2} />
          <PrepV2View payload={prep.prep_v2} />
        </>
      )}
    </div>
  )
}
