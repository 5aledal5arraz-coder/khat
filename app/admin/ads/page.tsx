import { getAdSettings } from "@/lib/ads"
import { AdsForm } from "./ads-form"

export default async function AdsPage() {
  const settings = await getAdSettings()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">إدارة الإعلانات</h1>
        <p className="mt-1 text-muted-foreground">
          تحكم في الإعلانات والمحتوى المدعوم على الموقع
        </p>
      </div>

      <AdsForm initialSettings={settings} />
    </div>
  )
}
