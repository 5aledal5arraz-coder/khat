"use client"

import {
  ArrowUpFromLine, BarChart3, Rocket,
} from "lucide-react"
import { useWebsitePkg, useAnalyzer } from "../contexts"
import { AccordionSection } from "./accordion-section"
import { TabExport } from "./tab-export"
import { TabAnalyzer } from "./tab-analyzer"

export function StagePublish() {
  const { websitePkgStatus } = useWebsitePkg()
  const { analyzerStatus } = useAnalyzer()

  const exportStatus = websitePkgStatus === "ready" ? "ready" as const : "idle" as const
  const statuses = [exportStatus, analyzerStatus]
  const readyCount = statuses.filter(s => s === "ready").length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-950/40">
          <Rocket className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
        </div>
        <div>
          <h2 className="text-[13px] font-semibold">النشر والتحليل</h2>
          <span className="text-[11px] text-muted-foreground">{readyCount}/2 مكتمل</span>
        </div>
      </div>

      <div className="space-y-2">
        <AccordionSection
          icon={ArrowUpFromLine}
          iconColor="text-green-700"
          title="التصدير"
          status={exportStatus}
          defaultOpen={exportStatus === "ready"}
        >
          <TabExport />
        </AccordionSection>

        <AccordionSection
          icon={BarChart3}
          iconColor="text-indigo-700"
          title="تحليل الأداء"
          status={analyzerStatus}
          defaultOpen={analyzerStatus === "ready"}
        >
          <TabAnalyzer />
        </AccordionSection>
      </div>
    </div>
  )
}
