import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Settings, Database, Youtube, Construction } from "lucide-react"
import { getThemeConfig } from "@/lib/theme"
import { getModerationConfig } from "@/lib/moderation-config"
import { ThemeSettingForm } from "./theme-setting-form"
import { ModerationSettingForm } from "./moderation-setting-form"

export default async function SettingsAdminPage() {
  const hasYouTubeKey = !!process.env.YOUTUBE_API_KEY
  const hasSupabase = !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")
  const [themeConfig, moderationConfig] = await Promise.all([
    getThemeConfig(),
    getModerationConfig(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">الإعدادات</h1>
        <p className="mt-1 text-muted-foreground">
          إعدادات الموقع والتكاملات
        </p>
      </div>

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

      {/* Theme */}
      <ThemeSettingForm initialMode={themeConfig.mode} />

      {/* AI Moderation */}
      <ModerationSettingForm initialEnabled={moderationConfig.aiEnabled} />

      {/* Coming Soon */}
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Construction className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <h3 className="mt-4 font-semibold">قريباً</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            إدارة التنقل، أعلام الميزات، وإعدادات SEO
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
