"use client"

import {
  Sparkles, Globe, ListOrdered, Scissors, Package, UserCircle,
  Brain, UserSearch,
} from "lucide-react"
import { useContent, useChapters, useClips, useWebsitePkg, useGuest, useDeepAnalysis, useGuestIntelligence } from "../contexts"
import { AccordionSection } from "./accordion-section"
import { SectionErrorBoundary } from "./section-error-boundary"
import { TabYoutubePack } from "./tab-youtube-pack"
import { TabSitePack } from "./tab-site-pack"
import { TabTimestamps } from "./tab-timestamps"
import { TabClips } from "./tab-clips"
import { TabGuestPack } from "./tab-guest-pack"
import { TabDeepAnalysis } from "./tab-deep-analysis"
import { TabGuestIntelligence } from "./tab-guest-intelligence"

export function StageContent() {
  const { aiStatus } = useContent()
  const { chaptersStatus } = useChapters()
  const { clipsStatus } = useClips()
  const { websitePkgStatus } = useWebsitePkg()
  const { guestPackageStatus } = useGuest()
  const { deepAnalysisStatus } = useDeepAnalysis()
  const { guestIntelligenceStatus } = useGuestIntelligence()

  const statuses = [aiStatus, websitePkgStatus, guestPackageStatus, chaptersStatus, clipsStatus, deepAnalysisStatus, guestIntelligenceStatus]
  const readyCount = statuses.filter(s => s === "ready").length

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 px-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-950/40">
          <Package className="h-4 w-4 text-amber-700 dark:text-amber-400" />
        </div>
        <div>
          <h2 className="text-[13px] font-semibold">المحتوى</h2>
          <span className="text-[11px] text-muted-foreground">{readyCount}/{statuses.length} مكتمل</span>
        </div>
      </div>

      <div className="space-y-2">
        <AccordionSection
          icon={Sparkles}
          iconColor="text-amber-700"
          title="حزمة يوتيوب"
          status={aiStatus}
          defaultOpen={aiStatus === "ready"}
        >
          <SectionErrorBoundary sectionName="حزمة يوتيوب">
            <TabYoutubePack />
          </SectionErrorBoundary>
        </AccordionSection>

        <AccordionSection
          icon={Globe}
          iconColor="text-emerald-700"
          title="حزمة الموقع"
          status={websitePkgStatus}
          defaultOpen={websitePkgStatus === "ready"}
        >
          <SectionErrorBoundary sectionName="حزمة الموقع">
            <TabSitePack />
          </SectionErrorBoundary>
        </AccordionSection>

        <AccordionSection
          icon={UserCircle}
          iconColor="text-purple-700"
          title="حزمة الضيف"
          status={guestPackageStatus}
          defaultOpen={guestPackageStatus === "ready"}
        >
          <SectionErrorBoundary sectionName="حزمة الضيف">
            <TabGuestPack />
          </SectionErrorBoundary>
        </AccordionSection>

        <AccordionSection
          icon={ListOrdered}
          iconColor="text-blue-700"
          title="الطوابع الزمنية"
          status={chaptersStatus}
          defaultOpen={chaptersStatus === "ready"}
        >
          <SectionErrorBoundary sectionName="الطوابع الزمنية">
            <TabTimestamps />
          </SectionErrorBoundary>
        </AccordionSection>

        <AccordionSection
          icon={Scissors}
          iconColor="text-pink-700"
          title="المقاطع القصيرة"
          status={clipsStatus}
          defaultOpen={clipsStatus === "ready"}
        >
          <SectionErrorBoundary sectionName="المقاطع القصيرة">
            <TabClips />
          </SectionErrorBoundary>
        </AccordionSection>

        <AccordionSection
          icon={Brain}
          iconColor="text-indigo-700"
          title="التحليل العميق"
          status={deepAnalysisStatus}
          defaultOpen={deepAnalysisStatus === "ready"}
        >
          <SectionErrorBoundary sectionName="التحليل العميق">
            <TabDeepAnalysis />
          </SectionErrorBoundary>
        </AccordionSection>

        <AccordionSection
          icon={UserSearch}
          iconColor="text-teal-700"
          title="ذكاء الضيف"
          status={guestIntelligenceStatus}
          defaultOpen={guestIntelligenceStatus === "ready"}
        >
          <SectionErrorBoundary sectionName="ذكاء الضيف">
            <TabGuestIntelligence />
          </SectionErrorBoundary>
        </AccordionSection>
      </div>
    </div>
  )
}
