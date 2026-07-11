/**
 * v2 source availability — drives the page's honest "source health"
 * panel. Wikidata/Wikipedia/OpenAlex/GDELT/Google Books need no key and
 * are always on; YouTube + Listen Notes light up when their key is set.
 */

import { env } from "@/lib/env"
import { isInstagramConfigured } from "@/lib/instagram/client"
export interface V2SourceStatus {
  id: string
  label: string
  configured: boolean
  keyless: boolean
  /** running against a sandbox/mock endpoint pending a real key */
  test?: boolean
  note?: string
}

export function v2Sources(): V2SourceStatus[] {
  return [
    { id: "wikidata", label: "ويكي‌داتا + ويكيبيديا (مرجع التحقّق)", configured: true, keyless: true },
    { id: "openalex", label: "OpenAlex (الحضور الأكاديمي)", configured: true, keyless: true },
    { id: "google_books", label: "Google Books (المؤلَّفات)", configured: true, keyless: true },
    { id: "gdelt", label: "GDELT (الحضور الإعلامي الحديث)", configured: true, keyless: true },
    {
      id: "youtube",
      label: "YouTube (قناة الشخص ولقاءاته)",
      configured: !!env.YOUTUBE_API_KEY,
      keyless: false,
      note: env.YOUTUBE_API_KEY ? undefined : "YOUTUBE_API_KEY غير مضبوط",
    },
    {
      id: "podcast",
      label: "Listen Notes (ظهوره ضيفاً في بودكاست)",
      configured: !!env.LISTEN_NOTES_API_KEY,
      keyless: false,
      test: !env.LISTEN_NOTES_API_KEY,
      note: env.LISTEN_NOTES_API_KEY
        ? undefined
        : "وضع تجريبي فعّال (بيانات وهمية) — أضف LISTEN_NOTES_API_KEY للبيانات الحقيقية",
    },
    {
      id: "x",
      label: "X (حضوره ونشاطه الحالي)",
      configured: !!env.X_BEARER_TOKEN,
      keyless: false,
      note: env.X_BEARER_TOKEN ? undefined : "X_BEARER_TOKEN غير مضبوط",
    },
    {
      id: "instagram",
      label: "Instagram (حضوره ونشاطه — Business Discovery الرسمي)",
      configured: isInstagramConfigured(),
      keyless: false,
      note: isInstagramConfigured()
        ? undefined
        : "IG_GRAPH_TOKEN و IG_BUSINESS_ACCOUNT_ID غير مضبوطين",
    },
  ]
}
