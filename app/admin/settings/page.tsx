import { getThemeConfig } from "@/lib/theme"
import { getSiteSettings } from "@/lib/site-settings"
import { listAllPlatforms } from "@/lib/queries/official-platforms"
import { AdminPageHeader } from "../components/admin-page-header"
import { SettingsTabs } from "./settings-tabs"

export const dynamic = "force-dynamic"

export default async function SettingsAdminPage() {
  const hasYouTubeKey = !!process.env.YOUTUBE_API_KEY
  const hasDatabase = !!process.env.DATABASE_URL
  const [themeConfig, siteSettings, platforms] = await Promise.all([
    getThemeConfig(),
    getSiteSettings(),
    listAllPlatforms(),
  ])

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="الإعدادات"
        description="إعدادات الموقع والتكاملات والروابط"
      />

      <SettingsTabs
        hasYouTubeKey={hasYouTubeKey}
        hasDatabase={hasDatabase}
        themeMode={themeConfig.mode}
        siteSettings={siteSettings}
        platforms={platforms}
      />
    </div>
  )
}
