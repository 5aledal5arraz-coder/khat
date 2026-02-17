"use client"

import { useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Youtube, Database, Settings, Palette, Search, Shield, ToggleLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { ThemeSettingForm } from "./theme-setting-form"
import { ModerationSettingForm } from "./moderation-setting-form"
import { SiteMetadataForm } from "./site-metadata-form"
import { SocialLinksForm } from "./social-links-form"
import { SEOForm } from "./seo-form"
import { FeatureFlagsForm } from "./feature-flags-form"
import type { ThemeMode } from "@/types/theme"
import type { SiteSettingsConfig } from "@/types/site-settings"

type TabId = "general" | "appearance" | "seo" | "moderation" | "features"

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "عام", icon: Settings },
  { id: "appearance", label: "المظهر", icon: Palette },
  { id: "seo", label: "SEO", icon: Search },
  { id: "moderation", label: "الإشراف", icon: Shield },
  { id: "features", label: "الميزات", icon: ToggleLeft },
]

interface SettingsTabsProps {
  hasYouTubeKey: boolean
  hasSupabase: boolean
  themeMode: ThemeMode
  moderationEnabled: boolean
  siteSettings: SiteSettingsConfig
}

export function SettingsTabs({
  hasYouTubeKey,
  hasSupabase,
  themeMode,
  moderationEnabled,
  siteSettings,
}: SettingsTabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const defaultTab = (searchParams.get("tab") as TabId) || "general"
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab)

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    url.searchParams.set("tab", tab)
    router.replace(url.pathname + url.search, { scroll: false })
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* Tab List - vertical on desktop, horizontal scroll on mobile */}
      <div className="lg:w-48 shrink-0">
        {/* Mobile: horizontal scrollable */}
        <div className="flex gap-1 overflow-x-auto lg:hidden">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Desktop: vertical list */}
        <div className="hidden lg:flex lg:flex-col lg:gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all text-start",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary border-e-2 border-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <tab.icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-w-0 flex-1 space-y-6">
        {activeTab === "general" && (
          <>
            {/* Connection Status */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Youtube className="h-5 w-5" />
                      YouTube API
                    </CardTitle>
                    <Badge variant={hasYouTubeKey ? "default" : "secondary"}>
                      {hasYouTubeKey ? "متصل" : "غير متصل"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {hasYouTubeKey
                      ? "يتم جلب الحلقات من قناة YouTube"
                      : "أضف YOUTUBE_API_KEY لجلب الحلقات تلقائياً"}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Database className="h-5 w-5" />
                      Supabase
                    </CardTitle>
                    <Badge variant={hasSupabase ? "default" : "secondary"}>
                      {hasSupabase ? "متصل" : "غير متصل"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    {hasSupabase
                      ? "قاعدة البيانات متصلة وتعمل"
                      : "يتم استخدام بيانات تجريبية"}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Site Metadata */}
            <SiteMetadataForm initial={siteSettings.metadata} />

            {/* Social Links */}
            <SocialLinksForm initial={siteSettings.socialLinks} />
          </>
        )}

        {activeTab === "appearance" && (
          <ThemeSettingForm initialMode={themeMode} />
        )}

        {activeTab === "seo" && (
          <SEOForm initial={siteSettings.seo} />
        )}

        {activeTab === "moderation" && (
          <ModerationSettingForm initialEnabled={moderationEnabled} />
        )}

        {activeTab === "features" && (
          <FeatureFlagsForm initial={siteSettings.featureFlags} />
        )}
      </div>
    </div>
  )
}
