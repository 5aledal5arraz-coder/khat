import { getThemeConfig } from "@/lib/theme"
import { getModerationConfig } from "@/lib/moderation-config"
import { getSiteSettings } from "@/lib/site-settings"
import { AdminPageHeader } from "../components/admin-page-header"
import { SettingsTabs } from "./settings-tabs"

export default async function SettingsAdminPage() {
  const hasYouTubeKey = !!process.env.YOUTUBE_API_KEY
  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  const [themeConfig, moderationConfig, siteSettings] = await Promise.all([
    getThemeConfig(),
    getModerationConfig(),
    getSiteSettings(),
  ])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="الإعدادات"
        description="إعدادات الموقع والتكاملات"
      />

      <SettingsTabs
        hasYouTubeKey={hasYouTubeKey}
        hasSupabase={hasSupabase}
        themeMode={themeConfig.mode}
        moderationEnabled={moderationConfig.aiEnabled}
        siteSettings={siteSettings}
      />
    </div>
  )
}
