import Link from "next/link"

import { requireAdmin } from "@/lib/api-utils"
import { notFound } from "next/navigation"
import { isPodcastUniverseEnabled } from "@/lib/podcast-universe/flag"
import { AdminPageHeader } from "@/app/admin/components/admin-page-header"
import { KitCard } from "@/app/admin/components/ui-kit"
import { nationalityReviewQueue, positiveIntParam, REVIEW_PAGE_SIZE } from "@/lib/podcast-universe/queries"
import { kuwaitContextLabel } from "@/lib/podcast-universe/kuwait-context"
import { formatDateCompact } from "@/lib/shared/formatters"
import { cn } from "@/lib/utils"
import { EVIDENCE_LABEL, TONE_BADGE } from "../../labels"
import { ReviewButtons } from "./review-buttons"

/**
 * «مراجعة الجنسية» — M1 closeout addendum (docs/podcast-universe-plan-v1.md).
 *
 * WHO is here: nationality UNKNOWN, not yet decided by a human, and at least
 * one appearance on a Kuwaiti CORE podcast. The Kuwait context is only why a
 * person is SHOWN — it never sets a nationality. Only an editor's «كويتي»
 * does (verified, method manual_editorial), and every click is audited.
 */
export const dynamic = "force-dynamic"

export default async function NationalityReviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requireAdmin()
  if (!isPodcastUniverseEnabled()) notFound()
  const sp = await searchParams
  const level = sp.level === "strong" ? "strong" : ""
  const page = positiveIntParam(sp.page) ?? 1
  const { rows, total } = await nationalityReviewQueue({ level, page })
  const pages = Math.max(1, Math.ceil(total / REVIEW_PAGE_SIZE))
  const href = (p: number, l = level) => `?${new URLSearchParams({ ...(l ? { level: l } : {}), page: String(p) }).toString()}`

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="مراجعة الجنسية"
        description="أشخاص ظهروا في بودكاست كويتي وجنسيتهم غير متحققة. الظهور في قناة كويتية ليس دليل جنسية — القرار للمحرر."
        actions={
          <Link href="/admin/podcast-universe/guests" className="text-[12px] text-muted-foreground hover:text-primary">
            ← سجل الضيوف
          </Link>
        }
      />

      <KitCard
        title={`في الانتظار: ${total.toLocaleString("en-US")}`}
        subtitle="الترتيب: عدد القنوات الكويتية، ثم عدد الظهورات فيها، ثم آخر ظهور. «غير متأكد» يُسجَّل ولا يغيّر شيئاً."
        action={
          <div className="flex gap-2 text-[12px]">
            <Link href={href(1, "")} className={cn("rounded-md px-2 py-1", !level ? "bg-primary/12 text-primary" : "text-muted-foreground")}>
              كل السياق
            </Link>
            <Link href={href(1, "strong")} className={cn("rounded-md px-2 py-1", level ? "bg-primary/12 text-primary" : "text-muted-foreground")}>
              السياق القوي فقط
            </Link>
          </div>
        }
      >
        {rows.length === 0 ? (
          <p className="text-muted-foreground">لا أحد في الانتظار.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-[12.5px]">
              <thead className="text-[11.5px] text-muted-foreground">
                <tr>
                  <th className="py-2 pe-3 text-start font-medium">الشخص</th>
                  <th className="py-2 pe-3 text-start font-medium">ظهورات كويتية</th>
                  <th className="py-2 pe-3 text-start font-medium">القنوات الكويتية</th>
                  <th className="py-2 pe-3 text-start font-medium">آخر ظهور</th>
                  <th className="py-2 pe-3 text-start font-medium">عناوين الحلقات</th>
                  <th className="py-2 pe-3 text-start font-medium">ربط خط</th>
                  <th className="py-2 pe-3 text-start font-medium">الجنسية</th>
                  <th className="py-2 text-start font-medium">القرار</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const level = r.kw_apps >= 2 ? "strong" : "weak"
                  return (
                    <tr key={r.id} className="border-t border-border/60 align-top">
                      <td className="max-w-[14rem] py-2 pe-3">
                        <Link href={`/admin/podcast-universe/guests/${r.id}`} className="font-semibold text-foreground hover:text-primary">
                          {r.canonical_name}
                        </Link>
                        {r.aliases ? <div className="text-[11px] text-muted-foreground">{r.aliases}</div> : null}
                        <span className={cn("mt-1 inline-block rounded-md px-1.5 py-0.5 text-[11px] font-medium", TONE_BADGE[level === "strong" ? "purple" : "default"])}>
                          {kuwaitContextLabel(level, false)}
                        </span>
                      </td>
                      <td className="py-2 pe-3 tabular-nums">{r.kw_apps}</td>
                      <td className="max-w-[10rem] py-2 pe-3">
                        <span className="tabular-nums">{r.kw_channels}</span>
                        <div className="text-[11px] text-muted-foreground">{r.kw_channel_names}</div>
                      </td>
                      <td className="py-2 pe-3">{r.latest_appearance ? formatDateCompact(r.latest_appearance) : "—"}</td>
                      <td className="max-w-[20rem] py-2 pe-3">
                        <ul className="space-y-0.5">
                          {(r.kw_titles ?? []).map((t, i) => (
                            <li key={i} className="truncate" title={t}>
                              {t}
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="py-2 pe-3">{r.khat_guest_id ? "ضيف خط" : r.khat_guest_candidate_id ? "مرشح" : "—"}</td>
                      <td className="py-2 pe-3">
                        {EVIDENCE_LABEL[r.nationality_status]}
                        {r.unsure_count > 0 ? <div className="text-[11px] text-amber-700">غير متأكد ×{r.unsure_count}</div> : null}
                      </td>
                      <td className="py-2">
                        <ReviewButtons personId={r.id} name={r.canonical_name} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 ? (
          <nav className="mt-4 flex items-center gap-3 text-[12px]" aria-label="الصفحات">
            {page > 1 ? <Link href={href(page - 1)} className="text-primary">السابق</Link> : null}
            <span className="tabular-nums text-muted-foreground">
              {page} / {pages}
            </span>
            {page < pages ? <Link href={href(page + 1)} className="text-primary">التالي</Link> : null}
          </nav>
        ) : null}
      </KitCard>
    </div>
  )
}
