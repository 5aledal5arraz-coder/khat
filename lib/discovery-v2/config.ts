/**
 * v2 source availability — drives the page's honest "source health"
 * panel. Wikidata/Wikipedia/OpenAlex/GDELT/Google Books need no key and
 * are always on; YouTube + Listen Notes light up when their key is set.
 */

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
      configured: !!process.env.YOUTUBE_API_KEY,
      keyless: false,
      note: process.env.YOUTUBE_API_KEY ? undefined : "YOUTUBE_API_KEY غير مضبوط",
    },
    {
      id: "podcast",
      label: "Listen Notes (ظهوره ضيفاً في بودكاست)",
      configured: !!process.env.LISTEN_NOTES_API_KEY,
      keyless: false,
      test: !process.env.LISTEN_NOTES_API_KEY,
      note: process.env.LISTEN_NOTES_API_KEY
        ? undefined
        : "وضع تجريبي فعّال (بيانات وهمية) — أضف LISTEN_NOTES_API_KEY للبيانات الحقيقية",
    },
  ]
}
