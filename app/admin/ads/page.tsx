import { getEnhancedAdSettings } from "@/lib/ads"
import { AdsForm } from "./ads-form"

export default async function AdsPage() {
  const settings = await getEnhancedAdSettings()
  return <AdsForm initialSettings={settings} />
}
