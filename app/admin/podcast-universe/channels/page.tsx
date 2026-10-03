import Link from "next/link"
import { Radio, Database, Gauge, Wallet } from "lucide-react"

import { requireAdmin } from "@/lib/api-utils"
import { notFound } from "next/navigation"
import { isPodcastUniverseEnabled } from "@/lib/podcast-universe/flag"
import { AdminPageHeader } from "@/app/admin/components/admin-page-header"
import { KitCard, StatCard } from "@/app/admin/components/ui-kit"
import { hostCandidates, HOST_CANDIDATE_SHARE, listChannelsForAdmin, listExtractionRuns } from "@/lib/podcast-universe/queries"
import { quotaUsageToday } from "@/lib/podcast-universe/quota"
import { extractionCoverage, totalExtractionSpendUsd } from "@/lib/podcast-universe/extraction/run"
import {
  M1_EXTRACT_BUDGET_USD,
  PU_DAILY_READ_UNITS_CAP,
  PU_DAILY_SEARCH_CALLS_CAP,
} from "@/lib/podcast-universe/constants"
import { formatDateCompact } from "@/lib/shared/formatters"
import { ChannelsTable, ExtractionPanel, HostCandidates, type ChannelView } from "./channels-client"
import { RUN_STATUS_LABEL } from "../labels"

/**
 * Podcast Universe — channel registry (docs/podcast-universe-plan-v1.md §B14).
 * No delete button in v1: a channel is paused or re-typed, never removed.
 */
export const dynamic = "force-dynamic"

export default async function PodcastChannelsPage() {
  await requireAdmin()
  if (!isPodcastUniverseEnabled()) notFound()
  const [channels, quota, coverage, runs, spent, hosts] = await Promise.all([
    listChannelsForAdmin(),
    quotaUsageToday(),
    extractionCoverage(),
    listExtractionRuns(5),
    totalExtractionSpendUsd(),
    hostCandidates(),
  ])

  const view: ChannelView[] = channels.map((c) => ({
    ...c,
    last_crawled_at: c.last_crawled_at ? new Date(c.last_crawled_at).toISOString() : null,
    last_successful_crawl_at: c.last_successful_crawl_at ? new Date(c.last_successful_crawl_at).toISOString() : null,
    reported_video_count: c.reported_video_count == null ? null : Number(c.reported_video_count),
  }))
  const indexed = channels.reduce((s, c) => s + c.indexed, 0)
  const pending = coverage.pending ?? 0

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="عالم البودكاست — القنوات"
        description="سجل القنوات التي نفهرس حلقاتها لنعرف من ظهر أين. الإيقاف بديل الحذف."
        actions={
          <Link href="/admin/podcast-universe/validation-failures" className="text-[12px] font-medium text-primary hover:underline">
            فشل التحقق من الاستخراج ←
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="القنوات في السجل" value={channels.length} icon={Radio} />
        <StatCard label="حلقات مفهرسة" value={indexed.toLocaleString("en-US")} icon={Database} />
        <StatCard
          label="حصة يوتيوب اليوم (وحدات قراءة)"
          value={`${quota.read} / ${PU_DAILY_READ_UNITS_CAP}`}
          hint={`بحث: ${quota.search} / ${PU_DAILY_SEARCH_CALLS_CAP} — وحدات، لا دولارات`}
          icon={Gauge}
          tone={quota.read >= PU_DAILY_READ_UNITS_CAP ? "danger" : "default"}
        />
        <StatCard
          label="تكلفة استخراج الضيوف — الإجمالي"
          value={`$${spent.toFixed(4)}`}
          hint={`السقف الكلي لاستخراج M1: $${M1_EXTRACT_BUDGET_USD.toFixed(2)} (كل التشغيلات معاً)`}
          icon={Wallet}
        />
      </div>

      <KitCard title="القنوات" subtitle="التحقق ← الزحف الأولي ← المزامنة الأسبوعية. الأزرار تضيف مهمة للطابور (يلزم تشغيل npm run worker).">
        <ChannelsTable channels={view} />
      </KitCard>

      <KitCard
        title="HOST_CANDIDATE_REVIEW — مرشحون ليكونوا مقدّمين"
        subtitle={`اسم ظهر «ضيفاً» في أكثر من ${Math.round(HOST_CANDIDATE_SHARE * 100)}٪ من حلقات قناة. اقتراح فقط — لا يُستبعد أحد حتى يُضاف يدوياً لقائمة المقدمين.`}
      >
        <HostCandidates rows={hosts} />
      </KitCard>

      <KitCard
        title="استخراج الضيوف (Luna)"
        subtitle="فقط قنوات «مقابلات أساسية» × حلقات ٢٠ دقيقة فأكثر. كل ضيف يجب أن يكون اسمه منسوخاً حرفياً من العنوان أو الوصف."
      >
        <div className="mb-4 flex flex-wrap gap-2 text-[12px]">
          {(["pending", "running", "succeeded", "no_guest", "failed"] as const).map((k) => (
            <span key={k} className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
              {{ pending: "بانتظار", running: "قيد الاستخراج", succeeded: "وُجد ضيف", no_guest: "بلا ضيف", failed: "فشل بسبب مكتوب" }[k]}:{" "}
              <b className="tabular-nums text-foreground">{coverage[k] ?? 0}</b>
            </span>
          ))}
        </div>
        <ExtractionPanel pending={pending} maxBudget={M1_EXTRACT_BUDGET_USD} spent={spent} />
        {runs.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="text-muted-foreground">
                <tr className="text-start">
                  <th className="py-1.5 text-start font-medium">التاريخ</th>
                  <th className="py-1.5 text-start font-medium">الحالة</th>
                  <th className="py-1.5 text-start font-medium">الدفعات</th>
                  <th className="py-1.5 text-start font-medium">مصروف التشغيل / السقف الكلي</th>
                  <th className="py-1.5 text-start font-medium">رفض التحقق</th>
                  <th className="py-1.5 text-start font-medium">ملاحظة</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-t border-border/60">
                    <td className="py-1.5">{formatDateCompact(r.created_at)}</td>
                    <td className="py-1.5">{RUN_STATUS_LABEL[r.status] ?? r.status}</td>
                    <td className="py-1.5 tabular-nums">{r.batches_done ?? 0}</td>
                    <td className="py-1.5 tabular-nums" dir="ltr">
                      ${Number(r.ai_cost_usd).toFixed(4)} / ${Number(r.budget_limit_usd ?? 0).toFixed(2)}
                    </td>
                    <td className="py-1.5 tabular-nums">{r.validation_issues ?? 0}</td>
                    <td className="max-w-[28rem] truncate py-1.5 text-muted-foreground" title={r.error_summary ?? ""}>
                      {r.error_summary ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </KitCard>
    </div>
  )
}
