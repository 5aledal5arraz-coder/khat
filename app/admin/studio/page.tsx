import { getStudioSessions } from "@/lib/studio"
import { StudioClient } from "./studio-client"

export const dynamic = "force-dynamic"

export default async function StudioPage() {
  const sessions = await getStudioSessions()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">الاستوديو</h1>
        <p className="mt-1 text-muted-foreground">
          أدخل رابط حلقة يوتيوب لجلب بيانات الفيديو وبدء التحليل
        </p>
      </div>
      <StudioClient initialSessions={sessions} />
    </div>
  )
}
