/**
 * «أضف للتقويم» — a single-event .ics for the guest's recording.
 *
 * The summary is fixed and generic on purpose: it lands in the guest's
 * calendar (and whatever syncs it), so it names the podcast, never the episode.
 */

const RECORDING_BLOCK_MS = 3 * 60 * 60 * 1000

function icsStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
}

/** RFC 5545 text escaping. */
function icsText(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1")
}

export function buildRecordingIcs(params: {
  uid: string
  start: Date
  address: string | null
  mapUrl: string | null
  now?: Date
}): string {
  const end = new Date(params.start.getTime() + RECORDING_BLOCK_MS)
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Khat Podcast//Guest Link//AR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${params.uid}@khatpodcast.com`,
    `DTSTAMP:${icsStamp(params.now ?? new Date())}`,
    `DTSTART:${icsStamp(params.start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText("تصوير حلقة — بودكاست خط")}`,
    ...(params.address ? [`LOCATION:${icsText(params.address)}`] : []),
    ...(params.mapUrl ? [`URL:${params.mapUrl}`] : []),
    `DESCRIPTION:${icsText("نتشرف بحضورك. نرجو الحضور قبل الموعد بنص ساعة.")}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  return lines.join("\r\n") + "\r\n"
}
