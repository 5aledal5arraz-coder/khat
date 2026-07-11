import { and, eq, gt } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminSessions } from "@/lib/db/schema/admin-auth"
import { getSiteSettings } from "@/lib/site-settings"
import { listAllPlatforms } from "@/lib/queries/official-platforms"
import { getEffectiveAiConfig } from "@/lib/ai-router/runtime-config"
import { getAiModelsDiagnostics } from "@/lib/ai-router/model-selection"
import { listModelBenchmarks, readBenchmarkThresholds } from "@/lib/ai-router/benchmark/store"
import { getDiagnostics } from "@/lib/ops/diagnostics"
import { getAdminAuthUser } from "@/lib/api-utils"
import { AdminPageHeader } from "../components/admin-page-header"
import { SettingsTabs } from "./settings-tabs"
import type { AccountInfo } from "./account-security-form"

export const dynamic = "force-dynamic"

export default async function SettingsAdminPage() {
  const user = await getAdminAuthUser()

  const [siteSettings, platforms, aiConfig, aiModels, aiBenchmarks, aiBenchmarkThresholds, diagnostics, sessionRows] = await Promise.all([
    getSiteSettings(),
    listAllPlatforms(),
    getEffectiveAiConfig(),
    getAiModelsDiagnostics(),
    listModelBenchmarks(6),
    readBenchmarkThresholds(),
    getDiagnostics(),
    user && db
      ? db
          .select({ id: adminSessions.id })
          .from(adminSessions)
          .where(and(eq(adminSessions.user_id, user.id), gt(adminSessions.expires_at, new Date())))
      : Promise.resolve([]),
  ])

  const account: AccountInfo = {
    email: user?.email ?? "—",
    role: user?.role ?? "VIEWER",
    lastLoginAt: user?.last_login_at ? new Date(user.last_login_at).toISOString() : null,
    activeSessions: sessionRows.length,
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="الإعدادات"
        description="مركز التحكم بالمنصة — كل إعداد هنا له أثر حقيقي على الموقع أو لوحة التحكم"
      />

      <SettingsTabs
        siteSettings={siteSettings}
        platforms={platforms}
        aiControls={aiConfig}
        aiModels={aiModels}
        aiBenchmarks={aiBenchmarks}
        aiBenchmarkThresholds={aiBenchmarkThresholds}
        account={account}
        diagnostics={diagnostics}
      />
    </div>
  )
}
