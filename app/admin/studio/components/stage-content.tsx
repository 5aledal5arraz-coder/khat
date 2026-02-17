"use client"

import {
  Sparkles, Globe, ListOrdered, Scissors, Package,
} from "lucide-react"
import { useStudioSession } from "./studio-context"
import { AccordionSection } from "./accordion-section"
import { TabYoutubePack } from "./tab-youtube-pack"
import { TabSitePack } from "./tab-site-pack"
import { TabTimestamps } from "./tab-timestamps"
import { TabClips } from "./tab-clips"

export function StageContent() {
  const { aiStatus, websitePkgStatus, chaptersStatus, clipsStatus } = useStudioSession()

  const statuses = [aiStatus, websitePkgStatus, chaptersStatus, clipsStatus]
  const readyCount = statuses.filter(s => s === "ready").length

  return (
    <div className="rounded-xl border-s-4 border-s-amber-500 border border-border bg-card/50 p-3 space-y-2">
      <div className="flex items-center gap-2.5 px-1">
        <Package className="h-5 w-5 text-amber-500" />
        <h2 className="font-semibold">المحتوى</h2>
        <span className="text-xs text-muted-foreground">{readyCount}/4 جاهز</span>
      </div>

      <AccordionSection
        icon={Sparkles}
        iconColor="text-amber-500"
        title="حزمة يوتيوب"
        status={aiStatus}
        defaultOpen={aiStatus === "ready"}
      >
        <TabYoutubePack />
      </AccordionSection>

      <AccordionSection
        icon={Globe}
        iconColor="text-emerald-500"
        title="حزمة الموقع"
        status={websitePkgStatus}
        defaultOpen={websitePkgStatus === "ready"}
      >
        <TabSitePack />
      </AccordionSection>

      <AccordionSection
        icon={ListOrdered}
        iconColor="text-blue-500"
        title="الطوابع الزمنية"
        status={chaptersStatus}
        defaultOpen={chaptersStatus === "ready"}
      >
        <TabTimestamps />
      </AccordionSection>

      <AccordionSection
        icon={Scissors}
        iconColor="text-pink-500"
        title="المقاطع القصيرة"
        status={clipsStatus}
        defaultOpen={clipsStatus === "ready"}
      >
        <TabClips />
      </AccordionSection>
    </div>
  )
}
