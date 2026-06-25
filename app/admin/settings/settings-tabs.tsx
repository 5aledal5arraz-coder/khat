"use client"

import { useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  Globe,
  Radio,
  ToggleLeft,
  Cpu,
  ShieldCheck,
  Activity,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SiteMetadataForm } from "./site-metadata-form"
import { SEOForm } from "./seo-form"
import { FeatureFlagsForm } from "./feature-flags-form"
import { AiControlsForm, type AiControlsInitial } from "./ai-controls-form"
import { AccountSecurityForm, type AccountInfo } from "./account-security-form"
import { DiagnosticsPanel } from "./diagnostics-panel"
import { OfficialPlatformsClient } from "../audio-platforms/audio-platforms-client"
import type { SiteSettingsConfig } from "@/types/site-settings"
import type { OfficialPlatformLink } from "@/lib/queries/official-platforms"
import type { Diagnostic } from "@/lib/ops/diagnostics"

type TabId = "identity" | "distribution" | "features" | "ai" | "security" | "diagnostics"

const tabs: { id: TabId; label: string; icon: React.ElementType; blurb: string }[] = [
  { id: "identity", label: "الهوية و SEO", icon: Globe, blurb: "اسم الموقع، الوصف، والكلمات المفتاحية" },
  { id: "distribution", label: "التوزيع والروابط", icon: Radio, blurb: "منصات الصوت وروابط التواصل" },
  { id: "features", label: "الميزات والتوافر", icon: ToggleLeft, blurb: "مفاتيح تشغيل وإيقاف للمزايا" },
  { id: "ai", label: "الذكاء الاصطناعي", icon: Cpu, blurb: "حدود الميزانية ووضع المعدل" },
  { id: "security", label: "الحساب والأمان", icon: ShieldCheck, blurb: "كلمة المرور والجلسات" },
  { id: "diagnostics", label: "تشخيص النظام", icon: Activity, blurb: "فحوصات حيّة للخدمات" },
]

interface SettingsTabsProps {
  siteSettings: SiteSettingsConfig
  platforms: OfficialPlatformLink[]
  aiControls: AiControlsInitial
  account: AccountInfo
  diagnostics: Diagnostic[]
}

const VALID_TABS = new Set<TabId>(tabs.map((t) => t.id))

export function SettingsTabs({
  siteSettings,
  platforms,
  aiControls,
  account,
  diagnostics,
}: SettingsTabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const requested = searchParams.get("tab") as TabId | null
  const [activeTab, setActiveTab] = useState<TabId>(
    requested && VALID_TABS.has(requested) ? requested : "identity",
  )

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", tab)
    router.replace(url.pathname + url.search, { scroll: false })
  }

  const active = tabs.find((t) => t.id === activeTab)

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Tab rail */}
      <div className="lg:w-60 shrink-0">
        {/* Mobile: horizontal scroll */}
        <div className="flex gap-1 overflow-x-auto lg:hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-all",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Desktop: vertical list with blurbs */}
        <div className="hidden lg:flex lg:flex-col lg:gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-start gap-3 rounded-xl px-3 py-2.5 text-start transition-all",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary border-e-2 border-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <tab.icon className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{tab.label}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-[10.5px] leading-snug",
                    activeTab === tab.id ? "text-primary/70" : "text-muted-foreground/70",
                  )}
                >
                  {tab.blurb}
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="min-w-0 flex-1 space-y-6">
        {active && (
          <div className="lg:hidden">
            <h2 className="text-[15px] font-semibold">{active.label}</h2>
            <p className="text-[12px] text-muted-foreground">{active.blurb}</p>
          </div>
        )}

        {activeTab === "identity" && (
          <>
            <SiteMetadataForm initial={siteSettings.metadata} />
            <SEOForm initial={siteSettings.seo} />
          </>
        )}

        {activeTab === "distribution" && (
          <OfficialPlatformsClient initialPlatforms={platforms} />
        )}

        {activeTab === "features" && <FeatureFlagsForm initial={siteSettings.featureFlags} />}

        {activeTab === "ai" && <AiControlsForm initial={aiControls} />}

        {activeTab === "security" && <AccountSecurityForm account={account} />}

        {activeTab === "diagnostics" && <DiagnosticsPanel diagnostics={diagnostics} />}
      </div>
    </div>
  )
}
