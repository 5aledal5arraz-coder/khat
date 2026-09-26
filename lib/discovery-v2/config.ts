/**
 * v2 source availability — drives the page's honest "source health"
 * panel. Wikidata/Wikipedia/OpenAlex/GDELT/Google Books need no key and
 * are always on; YouTube + Listen Notes light up when their key is set.
 */

import { env } from "@/lib/env"
import { isInstagramConfigured } from "@/lib/instagram/client"
import { isGroundedEvidenceConfigured } from "@/lib/ai/grounded-evidence"
import { isDiscoveryGroundingEnabled } from "./grounded-verify"
import { isStoryGroundingEnabled, storyMaxCandidates } from "./story-evidence"
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
  const storyOn = isStoryGroundingEnabled()
  return [
    {
      // The approved story-first criterion runs on this — when it is off,
      // every candidate is "not checked" and the page must say so.
      id: "story_evidence",
      label: `فحص القصة الشخصية (Gemini + بحث Google، حتى ${storyMaxCandidates()} مرشّحاً للتشغيل)`,
      configured: storyOn,
      keyless: false,
      note: storyOn
        ? undefined
        : !isGroundedEvidenceConfigured()
          ? "GEMINI_API_KEY غير مضبوط — لن تُفحص القصص وسيبقى غير الموجودين في ويكي‌داتا في القائمة المختصرة"
          : "مطفأ عبر DISCOVERY_STORY_GROUNDING=off — لن تُفحص القصص",
    },
    { id: "wikidata", label: "ويكي‌داتا + ويكيبيديا (ثقة الهوية — ليست شرطاً)", configured: true, keyless: true },
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
    {
      id: "grounded",
      label: "تحقّق حيّ من الويب (Gemini + بحث Google) — للمرشّحين المتقدّمين",
      configured: isDiscoveryGroundingEnabled() && isGroundedEvidenceConfigured(),
      keyless: false,
      note:
        isDiscoveryGroundingEnabled() && isGroundedEvidenceConfigured()
          ? undefined
          : !isDiscoveryGroundingEnabled()
            ? "اختياري ومطفأ — فعّله عبر DISCOVERY_WEB_GROUNDED_ENABLED=true"
            : "GEMINI_API_KEY غير مضبوط",
    },
  ]
}
