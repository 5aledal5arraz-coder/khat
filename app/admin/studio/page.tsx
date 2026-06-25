import Link from "next/link"
import { Brain, Power } from "lucide-react"
import { getStudioSessions, getSessionAiStatuses } from "@/lib/studio"
import { getEpisodes } from "@/lib/queries/episodes"
import { db } from "@/lib/db"
import { episodeEnrichments } from "@/lib/db/schema/episodes"
import { getSiteSettings } from "@/lib/site-settings"
import { StudioClient } from "./studio-client"

export const dynamic = "force-dynamic"

export default async function StudioPage() {
  // Feature gate: when an admin disables the studio, skip the heavy data
  // load and show a disabled notice instead of the workspace.
  const settings = await getSiteSettings().catch(() => null)
  if (settings && settings.featureFlags.studioEnabled === false) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">الاستوديو</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            إدارة الحلقات وتوليد المحتوى بالذكاء الاصطناعي
          </p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Power className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold tracking-tight">الاستوديو معطّل حالياً</h2>
          <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-muted-foreground">
            تم إيقاف أدوات الاستوديو من الإعدادات. يمكن إعادة تفعيلها من{" "}
            <Link href="/admin/settings?tab=features" className="text-primary hover:underline">
              الإعدادات ← الميزات
            </Link>
            .
          </p>
        </div>
      </div>
    )
  }

  const [sessions, episodes, enrichedRows, aiStatuses] = await Promise.all([
    getStudioSessions(),
    getEpisodes({ includeHidden: true }),
    db
      ? db.select({ episodeId: episodeEnrichments.episode_id }).from(episodeEnrichments)
      : Promise.resolve([]),
    getSessionAiStatuses(),
  ])

  const enrichedEpisodeIds = enrichedRows.map((r) => r.episodeId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">الاستوديو</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          إدارة الحلقات وتوليد المحتوى بالذكاء الاصطناعي
        </p>
      </div>

      {/* Phase B.2 — discoverability banner. Each studio session is
          reachable from its episode's workspace; high-frequency edits
          (title / hero / takeaways / quotes / timestamps) live in the
          workspace tab. The full studio surface stays for transcript /
          chapter / clip editing. */}
      <div
        className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3 text-[12px]"
        data-studio-discoverability-banner
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-violet-700">
            <Brain className="h-3 w-3" />
            كل جلسة مرتبطة بحلقة لها مساحة عمل موحّدة — التعديل السريع للحقول
            الأساسية متاح هناك.
          </span>
          <Link
            href="/admin/khat-brain/episodes"
            className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-[11px] font-medium text-violet-700 hover:bg-violet-500/20"
          >
            فتح قائمة الحلقات
          </Link>
        </div>
      </div>

      <StudioClient
        initialSessions={sessions}
        episodes={episodes}
        enrichedEpisodeIds={enrichedEpisodeIds}
        aiStatuses={aiStatuses}
      />
    </div>
  )
}
