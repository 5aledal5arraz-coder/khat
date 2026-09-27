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

const ICS_MAX_OCTETS = 75
const encoder = new TextEncoder()

/**
 * RFC 5545 §3.1 line folding: no content line may exceed 75 OCTETS; longer
 * ones continue on the next line after CRLF + one space. Octets, not
 * characters — every Arabic letter is 2 bytes in UTF-8, so the summary alone
 * passes the limit. Splits only between code points, never inside a UTF-8
 * sequence (a split multibyte char renders as mojibake in Outlook/Google).
 */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= ICS_MAX_OCTETS) return line
  const out: string[] = []
  let cur = ""
  let curBytes = 0
  // The first line holds 75 octets; each continuation spends one on its leading space.
  let limit = ICS_MAX_OCTETS
  for (const ch of line) {
    const b = encoder.encode(ch).length
    if (curBytes + b > limit) {
      out.push(cur)
      cur = ""
      curBytes = 0
      limit = ICS_MAX_OCTETS - 1
    }
    cur += ch
    curBytes += b
  }
  out.push(cur)
  return out.join("\r\n ")
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
  return lines.map(foldIcsLine).join("\r\n") + "\r\n"
}
