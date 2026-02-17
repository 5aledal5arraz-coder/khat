"use client"

import {
  ArrowUpFromLine, BarChart3, Rocket,
} from "lucide-react"
import { useStudioSession } from "./studio-context"
import { AccordionSection } from "./accordion-section"
import { TabExport } from "./tab-export"
import { TabAnalyzer } from "./tab-analyzer"

export function StagePublish() {
  const { websitePkgStatus, analyzerStatus } = useStudioSession()

  const exportStatus = websitePkgStatus === "ready" ? "ready" as const : "idle" as const
  const statuses = [exportStatus, analyzerStatus]
  const readyCount = statuses.filter(s => s === "ready").length

  return (
    <div className="rounded-xl border-s-4 border-s-green-500 border border-border bg-card/50 p-3 space-y-2">
      <div className="flex items-center gap-2.5 px-1">
        <Rocket className="h-5 w-5 text-green-500" />
        <h2 className="font-semibold">النشر والتحليل</h2>
        <span className="text-xs text-muted-foreground">{readyCount}/2 جاهز</span>
      </div>

      <AccordionSection
        icon={ArrowUpFromLine}
        iconColor="text-green-500"
        title="التصدير"
        status={exportStatus}
        defaultOpen={exportStatus === "ready"}
      >
        <TabExport />
      </AccordionSection>

      <AccordionSection
        icon={BarChart3}
        iconColor="text-indigo-500"
        title="تحليل الأداء"
        status={analyzerStatus}
        defaultOpen={analyzerStatus === "ready"}
      >
        <TabAnalyzer />
      </AccordionSection>
    </div>
  )
}
