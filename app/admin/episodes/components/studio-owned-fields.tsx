"use client"

import Link from "next/link"
import { ExternalLink, Lock } from "lucide-react"

import { GlowCard } from "@/app/admin/components/glow-card"
import type { EpisodeEnrichment } from "@/types/episodes"

/**
 * The five public fields this screen CANNOT edit — shown here anyway.
 *
 * The episode page renders eleven enrichment fields. Six are editable in the
 * tab beside this one; the other five (`hero_summary`, `full_summary`,
 * `takeaways`, `resources`, `timestamps`) have no manual editor anywhere in the
 * admin and arrive only through a Studio push.
 *
 * NOTHING SAID SO. Opening «إثراء الحلقة» showed six fields and no hint the
 * other five existed, so «لماذا لا يظهر الفهرس الزمني؟» had no answer on the
 * screen that owns the episode — the seam between the panel and the Studio was
 * real, defensible, and completely invisible.
 *
 * This does not move the seam. It states it: every field, its current value,
 * and where the value comes from. Read-only on purpose — a second write path
 * into the same rows is how `full_summary` ended up with two sources.
 */

interface StudioOwnedFieldsProps {
  enrichment: EpisodeEnrichment | null
  /** Set when the episode is linked to an EIR, which is where the Studio lives. */
  eirId: string | null
}

type FieldState = { label: string; hint: string; value: string | null; count?: number }

function describe(enrichment: EpisodeEnrichment | null): FieldState[] {
  const list = <T,>(v: T[] | undefined | null): T[] => (Array.isArray(v) ? v : [])

  return [
    {
      label: "الملخص القصير",
      hint: "سطران تحت العنوان في صفحة الحلقة، وهو نص بطاقة المشاركة أيضاً",
      value: enrichment?.hero_summary?.trim() || null,
    },
    {
      label: "الملخص الكامل",
      hint: "قسم «ملخص الحلقة». بدونه تعرض الصفحة وصف يوتيوب",
      value: enrichment?.full_summary?.trim() || null,
    },
    {
      label: "أهم الأفكار",
      hint: "قسم الأفكار الرئيسية",
      value: null,
      count: list(enrichment?.takeaways).length,
    },
    {
      label: "المصادر",
      hint: "قائمة الروابط أسفل الحلقة",
      value: null,
      count: list(enrichment?.resources).length,
    },
    {
      label: "الفهرس الزمني",
      hint: "«فهرس الحلقة» — الأوقات القابلة للنقر",
      value: null,
      count: list(enrichment?.timestamps).length,
    },
  ]
}

export function StudioOwnedFields({ enrichment, eirId }: StudioOwnedFieldsProps) {
  const fields = describe(enrichment)
  const filled = fields.filter((f) => (f.count !== undefined ? f.count > 0 : Boolean(f.value))).length

  return (
    <GlowCard color="muted">
      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Lock className="h-3.5 w-3.5" />
              حقول تأتي من الاستوديو
            </h3>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              هذه الخمسة تظهر في صفحة الحلقة لكن لا تُحرَّر من هنا — مصدرها الوحيد
              دفعة من الاستوديو. معروضة لتعرف حالتها دون أن تبحث عنها.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold tabular-nums">
            {filled} / {fields.length}
          </span>
        </div>

        <div className="space-y-2">
          {fields.map((f) => {
            const isEmpty = f.count !== undefined ? f.count === 0 : !f.value
            return (
              <div
                key={f.label}
                className="rounded-lg border border-border/40 bg-background/60 p-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs font-semibold">{f.label}</span>
                  <span
                    className={
                      isEmpty
                        ? "shrink-0 text-[11px] text-muted-foreground"
                        : "shrink-0 text-[11px] font-medium text-green-700"
                    }
                  >
                    {f.count !== undefined
                      ? f.count > 0
                        ? `${f.count} عنصر`
                        : "فارغ"
                      : isEmpty
                        ? "فارغ"
                        : "مكتوب"}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{f.hint}</p>
                {/* The value itself, trimmed — enough to recognise what is there
                    without turning this into a second editor. */}
                {f.value ? (
                  <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-foreground/80">
                    {f.value}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>

        {eirId ? (
          <Link
            href={`/admin/khat-brain/episodes/${eirId}?tab=publish`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary transition-all hover:gap-2"
          >
            افتح الاستوديو لهذه الحلقة
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : (
          // No EIR means no Studio session can exist for this episode yet, and
          // saying so is the point — a dead link would read as "the Studio is
          // broken" rather than "this episode never entered it".
          <p className="text-[11px] text-muted-foreground">
            هذه الحلقة غير مرتبطة بسجل في خط برين، فلا توجد جلسة استوديو لها بعد.
          </p>
        )}
      </div>
    </GlowCard>
  )
}
