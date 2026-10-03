import Link from "next/link"

import { requireAdmin } from "@/lib/api-utils"
import { notFound } from "next/navigation"
import { isPodcastUniverseEnabled } from "@/lib/podcast-universe/flag"
import { AdminPageHeader } from "@/app/admin/components/admin-page-header"
import { KitCard } from "@/app/admin/components/ui-kit"
import { extractionValidationFailures } from "@/lib/podcast-universe/queries"
import { formatDateCompact } from "@/lib/shared/formatters"

/**
 * EXTRACTION_VALIDATION_FAILED — read-only (M1 closeout addendum).
 * Episodes where every guest Luna named failed deterministic validation (the
 * evidence was not an exact substring, or the name was not inside it). They
 * stay rejected; this list exists so the gold set can sample them. If they
 * turn out to be mostly real guests, the fix is the extractor/evidence
 * contract — never a looser validator.
 */
export const dynamic = "force-dynamic"

export default async function ValidationFailuresPage() {
  await requireAdmin()
  if (!isPodcastUniverseEnabled()) notFound()
  const rows = await extractionValidationFailures()
  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="فشل التحقق من الاستخراج"
        description="حلقات رُفض كل ضيوفها لأن الدليل لم يكن منسوخاً حرفياً من العنوان أو الوصف. للعرض فقط — تبقى مرفوضة."
        actions={
          <Link href="/admin/podcast-universe/channels" className="text-[12px] text-muted-foreground hover:text-primary">
            ← القنوات
          </Link>
        }
      />
      <KitCard title={`EXTRACTION_VALIDATION_FAILED — ${rows.length}`} subtitle="سبب الرفض كما سجّله المتحقق.">
        {rows.length === 0 ? (
          <p className="text-muted-foreground">لا حلقات مرفوضة.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-[12.5px]">
              <thead className="text-[11.5px] text-muted-foreground">
                <tr>
                  <th className="py-2 pe-3 text-start font-medium">التاريخ</th>
                  <th className="py-2 pe-3 text-start font-medium">القناة / الحلقة</th>
                  <th className="py-2 text-start font-medium">سبب الرفض</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border/60 align-top">
                    <td className="py-2 pe-3">{formatDateCompact(r.published_at)}</td>
                    <td className="max-w-[26rem] py-2 pe-3">
                      <div className="text-muted-foreground">{r.channel_name}</div>
                      <a
                        className="text-primary hover:underline"
                        href={`https://www.youtube.com/watch?v=${encodeURIComponent(r.youtube_video_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {r.title}
                      </a>
                    </td>
                    <td className="py-2 text-[12px] text-muted-foreground" dir="ltr">
                      {r.guest_extraction_note}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </KitCard>
    </div>
  )
}
