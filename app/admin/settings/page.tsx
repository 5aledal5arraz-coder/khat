import { getThemeConfig } from "@/lib/theme"
import { getModerationConfig } from "@/lib/moderation-config"
import { getSiteSettings } from "@/lib/site-settings"
import { AdminPageHeader } from "../components/admin-page-header"
import { SettingsTabs } from "./settings-tabs"

export default async function SettingsAdminPage() {
  const hasYouTubeKey = !!process.env.YOUTUBE_API_KEY
  const hasDatabase = !!process.env.DATABASE_URL
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
        hasDatabase={hasDatabase}
        themeMode={themeConfig.mode}
        moderationEnabled={moderationConfig.aiEnabled}
        siteSettings={siteSettings}
      />
    </div>
  )
}
