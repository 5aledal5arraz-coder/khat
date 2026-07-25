/**
 * `/admin/teaser-questions` — the review page for audience questions on teasers.
 *
 * Why this page exists: `teaser_questions` was an orphan queue with no reader
 * on EITHER end — no admin screen read it, no public form wrote to it. This is
 * the reading end.
 *
 * Deliberately NOT in the sidebar. It has exactly two entrances, both from
 * where the work already is: the «الوارد» card on `/admin/ops` and the «راجع
 * الأسئلة (n)» link in the teaser tab of `/admin/home-content`. A queue that is
 * usually empty does not earn permanent navigation real estate; a counter that
 * lights up when it isn't empty does the same job honestly.
 *
 * Auth: reading is VIEWER (matches the read/write split in `lib/api-utils.ts`);
 * every mutation is gated at EDITOR inside `actions.ts`. Below EDITOR the
 * buttons are not rendered at all — offering a control that is guaranteed to
 * fail is worse than not offering it.
 */

import Link from "next/link"
import { MessageCircleQuestion, ArrowLeft } from "lucide-react"
import { checkPageRole, hasRole } from "@/lib/api-utils"
import {
  getTeaserQuestionGroups,
  parseQuestionFilter,
  countPendingTeaserQuestions,
  type TeaserQuestionFilter,
} from "@/lib/teaser"
import { arabicPluralNoun, formatArabicCount } from "@/lib/shared/formatters"
import { AdminPageHeader } from "../components/admin-page-header"
import { NoAccess } from "../ops/_components/no-access"
import { QuestionGroups } from "./questions-client"

export const dynamic = "force-dynamic"

const FILTER_LABEL: Record<TeaserQuestionFilter, string> = {
  pending: "قيد المراجعة",
  approved: "مقبولة",
  rejected: "مرفوضة",
  all: "الكل",
}

const FILTER_ORDER: TeaserQuestionFilter[] = ["pending", "approved", "rejected", "all"]

/** Empty-state copy per slice — never a blank page. */
const EMPTY_COPY: Record<TeaserQuestionFilter, string> = {
  pending: "ما فيه أسئلة قيد المراجعة",
  approved: "ما فيه أسئلة مقبولة",
  rejected: "ما فيه أسئلة مرفوضة",
  all: "ما وصلت أي أسئلة بعد",
}

export default async function TeaserQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const gate = await checkPageRole("VIEWER")
  if (!gate.ok) return <NoAccess roleLabelAr="مشاهد" />
  const canReview = hasRole(gate.user.role, "EDITOR")

  const params = await searchParams
  const filter = parseQuestionFilter(params.status)

  const [groups, pendingCount] = await Promise.all([
    getTeaserQuestionGroups(filter),
    countPendingTeaserQuestions(),
  ])

  const shown = groups.reduce((n, g) => n + g.questions.length, 0)

  return (
    <div className="space-y-6" dir="rtl" lang="ar">
      <AdminPageHeader
        title="أسئلة الجمهور"
        description="أسئلة وصلت من زوّار الموقع على تيزرات الحلقات القادمة"
        actions={
          // No `?tab=teaser` — the tabs there are uncontrolled (defaultValue),
          // so the param would be a link that silently does nothing.
          <Link
            href="/admin/home-content"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-[12.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            إدارة التيزرات
            <ArrowLeft className="h-3.5 w-3.5" />
          </Link>
        }
      />

      {/* Pending counter — the page's headline number. It is the GLOBAL pending
          count, not the count of the current slice, so switching to «مقبولة»
          never hides how much work is still waiting. */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/80 bg-card p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-700">
          <MessageCircleQuestion className="h-5 w-5" />
        </span>
        <div>
          <div
            className="text-[26px] font-semibold leading-none tabular-nums text-foreground"
            data-pending-total
          >
            {pendingCount ?? "—"}
          </div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {pendingCount === null
              ? "تعذّر قراءة العدّاد"
              : `${arabicPluralNoun(pendingCount, "سؤال")} قيد المراجعة`}
          </div>
        </div>
      </div>

      {/* Filter slices — plain links, so the URL is the state and
          `?status=pending` from the home page lands pre-filtered. */}
      <nav className="flex flex-wrap gap-2" aria-label="تصفية الأسئلة">
        {FILTER_ORDER.map((f) => {
          const active = f === filter
          return (
            <Link
              key={f}
              href={`/admin/teaser-questions?status=${f}`}
              data-filter={f}
              aria-current={active ? "page" : undefined}
              className={
                // min-h-11 = the 44px touch target the whole admin uses.
                "inline-flex min-h-11 items-center rounded-full border px-4 text-[12.5px] font-semibold transition-colors " +
                (active
                  ? "border-violet-500/40 bg-violet-500/10 text-violet-700"
                  : "border-border bg-card text-muted-foreground hover:text-foreground")
              }
            >
              {FILTER_LABEL[f]}
            </Link>
          )
        })}
      </nav>

      {groups.length === 0 ? (
        <div
          className="rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center"
          data-empty-state
        >
          <p className="text-[13.5px] font-semibold text-foreground">{EMPTY_COPY[filter]}</p>
          <p className="mx-auto mt-1.5 max-w-md text-[12px] text-muted-foreground">
            الأسئلة تصل من نموذج «اسأل الضيف» تحت التيزر النشط في الموقع العام.
          </p>
        </div>
      ) : (
        <>
          <p className="text-[12px] text-muted-foreground">
            {formatArabicCount(shown, "سؤال")} في {groups.length} تيزر
          </p>
          <QuestionGroups groups={groups} canReview={canReview} />
        </>
      )}
    </div>
  )
}
