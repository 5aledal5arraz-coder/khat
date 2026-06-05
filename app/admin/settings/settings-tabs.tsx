"use client"

import { useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Youtube, Database, Settings, Palette, Search, ToggleLeft, KeyRound, Loader2, Check, X, Link2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { ThemeSettingForm } from "./theme-setting-form"
import { SiteMetadataForm } from "./site-metadata-form"
import { SocialLinksForm } from "./social-links-form"
import { SEOForm } from "./seo-form"
import { FeatureFlagsForm } from "./feature-flags-form"
import { OfficialPlatformsClient } from "../audio-platforms/audio-platforms-client"
import type { ThemeMode } from "@/types/theme"
import type { SiteSettingsConfig } from "@/types/site-settings"
import type { OfficialPlatformLink } from "@/lib/queries/official-platforms"

type TabId = "general" | "appearance" | "platforms" | "seo" | "features" | "account"

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: "general", label: "عام", icon: Settings },
  { id: "appearance", label: "المظهر", icon: Palette },
  { id: "platforms", label: "روابط المنصات", icon: Link2 },
  { id: "seo", label: "SEO", icon: Search },
  { id: "features", label: "الميزات", icon: ToggleLeft },
  { id: "account", label: "الحساب", icon: KeyRound },
]

const PASSWORD_REQUIREMENTS = [
  { label: "٨ أحرف على الأقل", test: (p: string) => p.length >= 8 },
  { label: "حرف كبير واحد على الأقل (A-Z)", test: (p: string) => /[A-Z]/.test(p) },
  { label: "حرف صغير واحد على الأقل (a-z)", test: (p: string) => /[a-z]/.test(p) },
  { label: "رقم واحد على الأقل (0-9)", test: (p: string) => /[0-9]/.test(p) },
  { label: "رمز خاص واحد على الأقل", test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p) },
]

interface SettingsTabsProps {
  hasYouTubeKey: boolean
  hasDatabase: boolean
  themeMode: ThemeMode
  siteSettings: SiteSettingsConfig
  platforms: OfficialPlatformLink[]
}

export function SettingsTabs({
  hasYouTubeKey,
  hasDatabase,
  themeMode,
  siteSettings,
  platforms,
}: SettingsTabsProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const defaultTab = (searchParams.get("tab") as TabId) || "general"
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab)

  // Account tab state
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pwLoading, setPwLoading] = useState(false)
  const [pwMessage, setPwMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const allPwPassed = PASSWORD_REQUIREMENTS.every((r) => r.test(newPassword))
  const pwMatch = newPassword === confirmPassword && confirmPassword.length > 0
  const canSubmitPw = allPwPassed && pwMatch && !pwLoading

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmitPw) return
    setPwLoading(true)
    setPwMessage(null)
    try {
      const res = await fetch("/api/admin/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPwMessage({ type: "error", text: data.error || "فشل تغيير كلمة المرور" })
        return
      }
      setPwMessage({ type: "success", text: "تم تغيير كلمة المرور بنجاح" })
      setNewPassword("")
      setConfirmPassword("")
    } catch {
      setPwMessage({ type: "error", text: "حدث خطأ غير متوقع" })
    } finally {
      setPwLoading(false)
    }
  }

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
                "flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-all duration-200",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
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
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-200 text-start",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary border-e-2 border-primary"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
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
                  <p className="text-[13px] text-muted-foreground/60">
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
                      قاعدة البيانات
                    </CardTitle>
                    <Badge variant={hasDatabase ? "default" : "secondary"}>
                      {hasDatabase ? "متصل" : "غير متصل"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-[13px] text-muted-foreground/60">
                    {hasDatabase
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

        {activeTab === "platforms" && (
          <OfficialPlatformsClient initialPlatforms={platforms} />
        )}

        {activeTab === "seo" && (
          <SEOForm initial={siteSettings.seo} />
        )}

        {activeTab === "features" && (
          <FeatureFlagsForm initial={siteSettings.featureFlags} />
        )}

        {activeTab === "account" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-[15px]">تغيير كلمة المرور</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                <div>
                  <label className="mb-1.5 block text-[13px] font-medium">كلمة المرور الجديدة</label>
                  <Input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={pwLoading}
                    dir="ltr"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[13px] font-medium">تأكيد كلمة المرور</label>
                  <Input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={pwLoading}
                    dir="ltr"
                  />
                  {confirmPassword.length > 0 && !pwMatch && (
                    <p className="mt-1 text-xs text-red-400">كلمتا المرور غير متطابقتين</p>
                  )}
                </div>

                {/* Requirements checklist */}
                <div className="rounded-lg border border-border/30 bg-muted/20 p-3 space-y-1.5">
                  <p className="text-[11px] font-medium text-muted-foreground/60 mb-2">متطلبات كلمة المرور:</p>
                  {PASSWORD_REQUIREMENTS.map((req) => {
                    const passed = req.test(newPassword)
                    return (
                      <div key={req.label} className="flex items-center gap-2 text-xs">
                        {newPassword.length > 0 ? (
                          passed ? (
                            <Check className="h-3.5 w-3.5 text-green-400" />
                          ) : (
                            <X className="h-3.5 w-3.5 text-red-400" />
                          )
                        ) : (
                          <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />
                        )}
                        <span className={newPassword.length > 0 ? (passed ? "text-green-400" : "text-red-400") : "text-muted-foreground"}>
                          {req.label}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {pwMessage && (
                  <div className={`rounded-md p-3 text-center text-sm ${
                    pwMessage.type === "success"
                      ? "bg-green-500/10 text-green-500"
                      : "bg-destructive/10 text-destructive"
                  }`}>
                    {pwMessage.text}
                  </div>
                )}

                <Button type="submit" disabled={!canSubmitPw}>
                  {pwLoading && <Loader2 className="h-4 w-4 animate-spin me-2" />}
                  تغيير كلمة المرور
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
