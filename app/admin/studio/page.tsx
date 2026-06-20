import Link from "next/link"
import { Brain } from "lucide-react"
import { getStudioSessions, getSessionAiStatuses } from "@/lib/studio"
import { getEpisodes } from "@/lib/queries/episodes"
import { db } from "@/lib/db"
import { episodeEnrichments } from "@/lib/db/schema/episodes"
import { StudioClient } from "./studio-client"

export const dynamic = "force-dynamic"

export default async function StudioPage() {
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
