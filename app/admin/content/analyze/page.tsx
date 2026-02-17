import { getKnowledgeMap } from "@/lib/episode-knowledge"
import { AnalyzeClient } from "./analyze-client"

export default async function AnalyzeHomePage() {
  const existingMap = await getKnowledgeMap()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">تحليل الحلقات وبناء الصفحة الرئيسية</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تحليل جميع الحلقات بالذكاء الاصطناعي واستخراج المواضيع والعلاقات لملء الصفحة الرئيسية بمحتوى حقيقي
        </p>
      </div>

      <AnalyzeClient
        hasExistingMap={!!existingMap}
        lastAnalyzedAt={existingMap?.analyzed_at || null}
        episodeCount={existingMap ? Object.keys(existingMap.episodes).length : 0}
        topicCount={existingMap?.topic_taxonomy?.length || 0}
        season1Count={existingMap?.season_1_count || 0}
        season2Count={existingMap?.season_2_count || 0}
      />
    </div>
  )
}
