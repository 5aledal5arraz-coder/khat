/**
 * "What worked" card — the performance-learning half of planning intelligence,
 * surfaced right next to the market-signals card so the operator plans a season
 * with BOTH the outward signal (what the world is saying) and the inward memory
 * (what our own episodes taught us) in view. Data from buildWorkedReport().
 */

import Link from "next/link"
import { TrendingUp, TrendingDown, Lightbulb, BarChart3, ArrowLeft } from "lucide-react"
import type { WorkedReport } from "@/lib/khat-brain/performance-learning"

function fmtScore(n: number): string {
  return n.toFixed(2)
}

function DomainRow({
  item,
  tone,
}: {
  item: WorkedReport["strong_topic_domains"][number]
  tone: "up" | "down"
}) {
  const Icon = tone === "up" ? TrendingUp : TrendingDown
  const color = tone === "up" ? "text-emerald-600" : "text-rose-600"
  return (
    <li className="flex items-center justify-between gap-2 text-[12px]">
      <span className="flex min-w-0 items-center gap-1.5 text-foreground/90">
        <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
        <span className="truncate">{item.key}</span>
      </span>
      <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground" dir="ltr">
        {fmtScore(item.mean_score)} · n={item.sample_size}
      </span>
    </li>
  )
}

export function WhatWorkedCard({ worked }: { worked: WorkedReport }) {
  const strong = worked.strong_topic_domains.slice(0, 3)
  const weak = worked.weak_topic_domains.slice(0, 2)
  const recs = worked.recommendations.slice(0, 2)
  const hasData = strong.length > 0 || weak.length > 0 || recs.length > 0

  return (
    <div className="mt-4 rounded-2xl border border-border/40 bg-card/30 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <BarChart3 className="h-3.5 w-3.5" />
          </span>
          ما الذي نجح
        </h3>
        <Link
          href="/admin/khat-brain"
          className="inline-flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground"
        >
          التفاصيل <ArrowLeft className="h-3 w-3" />
        </Link>
      </div>

      {!hasData ? (
        <p className="rounded-xl border border-dashed border-border/40 px-3 py-4 text-center text-[11.5px] text-muted-foreground">
          تظهر الدروس بعد نشر بضع حلقات وقياس أدائها — ثم يأخذها مولّد المواضيع بعين الاعتبار تلقائيًا.
        </p>
      ) : (
        <div className="space-y-3">
          {strong.length > 0 && (
            <div>
              <p className="mb-1 text-[10.5px] font-medium text-emerald-600">مجالات قوية — زِد منها</p>
              <ul className="space-y-1">
                {strong.map((d) => (
                  <DomainRow key={`s-${d.key}`} item={d} tone="up" />
                ))}
              </ul>
            </div>
          )}
          {weak.length > 0 && (
            <div>
              <p className="mb-1 text-[10.5px] font-medium text-rose-600">مجالات ضعيفة — غيّر الزاوية</p>
              <ul className="space-y-1">
                {weak.map((d) => (
                  <DomainRow key={`w-${d.key}`} item={d} tone="down" />
                ))}
              </ul>
            </div>
          )}
          {recs.length > 0 && (
            <div className="border-t border-border/30 pt-2.5">
              <ul className="space-y-1.5">
                {recs.map((r, i) => (
                  <li key={i} className="flex gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                    <Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
