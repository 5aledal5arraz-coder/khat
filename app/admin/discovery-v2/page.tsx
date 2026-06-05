/**
 * Guest Discovery v2 — index. Setup + honest source health + recent runs.
 * Parallel to the legacy /admin/discovery (which keeps working).
 */

import Link from "next/link"
import { CheckCircle2, AlertTriangle, Compass, ArrowRight } from "lucide-react"
import { listDiscoveryRuns } from "@/lib/discovery"
import { runStatusLabel } from "@/lib/operator-language"
import { formatDateTime } from "@/lib/shared/formatters"
import { v2Sources } from "@/lib/discovery-v2/config"
import { StartV2Form } from "./start-form"

export const dynamic = "force-dynamic"

export default async function DiscoveryV2Page() {
  const allRuns = await listDiscoveryRuns({ limit: 60 }).catch(() => [])
  const runs = allRuns.filter(
    (r) => (r.source_config as { engine?: string } | null)?.engine === "v2",
  )
  const sources = v2Sources()

  return (
    <div className="mx-auto max-w-4xl space-y-5 p-4 pb-16" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-200">
            <Compass className="h-3 w-3" /> اكتشاف الضيوف — v2
          </div>
          <h1 className="text-2xl font-bold">اكتشاف مرجعيّ موثوق</h1>
          <p className="max-w-2xl text-[12.5px] leading-relaxed text-muted-foreground">
            نبدأ بأشخاص حقيقيين، نتحقّق من كلّ اسم عبر ويكي‌داتا/ويكيبيديا، ثمّ نُثري الملف بإشارات مستقلّة
            (أكاديمية، إعلامية، ظهور في بودكاست) ونرتّب وفق الشهرة والملاءمة وقابلية الاستضافة.
          </p>
        </div>
        <Link href="/admin/discovery" className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground">
          ← النسخة القديمة
        </Link>
      </div>

      <StartV2Form />

      {/* Source health */}
      <div className="rounded-2xl border border-border/30 bg-card/40 p-3">
        <div className="mb-2 text-[11px] font-semibold text-muted-foreground">مصادر التحقّق والإثراء</div>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {sources.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 text-[11.5px]">
              <span className="text-foreground/85">{s.label}</span>
              {s.configured ? (
                <span className="inline-flex items-center gap-1 text-emerald-300/90"><CheckCircle2 className="h-3 w-3" /> فعّال{s.keyless ? " (بلا مفتاح)" : ""}</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-amber-300/80" title={s.note}><AlertTriangle className="h-3 w-3" /> غير مضبوط</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent runs */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-muted-foreground">آخر التشغيلات</h2>
        {runs.length === 0 ? (
          <div className="rounded-xl border border-border/30 bg-card/40 p-4 text-center text-[12px] text-muted-foreground">لا توجد تشغيلات v2 بعد. ابدأ تشغيلاً جديداً أعلاه.</div>
        ) : (
          <div className="divide-y divide-border/30 rounded-xl border border-border/30 bg-card/40">
            {runs.map((r) => {
              const stats = (r.source_config as { v2_stats?: { accepted?: number; shortlist?: number; resolved?: number } } | null)?.v2_stats
              return (
                <Link key={r.id} href={`/admin/discovery-v2/${r.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted/20">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-foreground">{r.seed_prompt ?? "—"}</div>
                    <div className="text-[10.5px] text-muted-foreground">
                      {runStatusLabel(r.status)} · {formatDateTime(r.created_at)}
                      {stats ? ` · ${stats.accepted ?? 0} مرشّح قويّ · ${stats.shortlist ?? 0} مختصرة` : ""}
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
