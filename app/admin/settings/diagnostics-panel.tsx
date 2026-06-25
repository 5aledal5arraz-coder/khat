"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Activity, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Diagnostic, ProbeStatus } from "@/lib/ops/diagnostics"

const STATUS_STYLE: Record<ProbeStatus, { dot: string; text: string; icon: React.ElementType }> = {
  ok: { dot: "bg-emerald-500", text: "text-emerald-700", icon: CheckCircle2 },
  warn: { dot: "bg-amber-500", text: "text-amber-700", icon: AlertTriangle },
  down: { dot: "bg-rose-500", text: "text-rose-700", icon: XCircle },
}

export function DiagnosticsPanel({ diagnostics }: { diagnostics: Diagnostic[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
          <Activity className="h-5 w-5" />
          تشخيص النظام
        </CardTitle>
        <p className="text-[11.5px] text-muted-foreground">
          فحوصات حيّة للتكاملات والخدمات — حدّث الصفحة لإعادة الفحص
        </p>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {diagnostics.map((d) => {
            const s = STATUS_STYLE[d.status]
            const Icon = s.icon
            return (
              <li
                key={d.key}
                className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/10 p-3.5"
              >
                <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0">
                  <span className={cn("h-2.5 w-2.5 rounded-full", s.dot)} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-medium">{d.label}</span>
                    <Icon className={cn("h-3.5 w-3.5", s.text)} />
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                    {d.detail}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}
