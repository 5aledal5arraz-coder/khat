"use client"

/**
 * Recording share strip — surfaces the room access URL right above the
 * embedded LiveV2 client so the operator never has to wonder how to
 * send the room to a co-host.
 *
 * The displayed URL is the relative admin path; the **copied** URL is
 * absolute (built from `window.location.origin` at click time) so the
 * operator can paste it into chat / mail directly.
 */

import { useState } from "react"
import Link from "next/link"
import { Copy, Check, Maximize2, Radio } from "lucide-react"

export function RecordingShareStrip({
  roomId,
  roomName,
  createdAt,
  createdByEmail,
}: {
  roomId: string
  roomName: string
  /** ISO timestamp from collaboration_rooms.created_at */
  createdAt?: string | null
  /** Admin email of the operator who created the room. */
  createdByEmail?: string | null
}) {
  const [copied, setCopied] = useState(false)
  const path = `/admin/recording/${roomId}/v2`

  const onCopy = async () => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : ""
    const absolute = origin + path
    try {
      await navigator.clipboard.writeText(absolute)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/40 bg-card/30 p-3 text-[11.5px]">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Radio className="h-3 w-3 text-violet-200" />
        غرفة:
        <span className="text-foreground" dir="ltr">
          {roomName}
        </span>
      </span>

      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <code
          className="min-w-0 flex-1 truncate rounded-lg border border-border/40 bg-background/40 px-2 py-1 text-[10.5px] text-muted-foreground/85"
          dir="ltr"
          data-room-share-url={path}
          title={path}
        >
          {path}
        </code>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-background/40 px-2 py-1 text-[10.5px] text-muted-foreground hover:text-foreground"
          aria-label="نسخ رابط الغرفة"
          data-room-copy-button
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-emerald-400" /> تم النسخ
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" /> نسخ
            </>
          )}
        </button>
      </div>

      <Link
        href={path}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-200 hover:bg-violet-500/20"
      >
        <Maximize2 className="h-3 w-3" />
        فتح بملء الشاشة
      </Link>

      {(createdAt || createdByEmail) && (
        <div
          className="basis-full text-[10.5px] text-muted-foreground/70"
          dir="ltr"
          data-room-trust-strip
        >
          created
          {createdAt && (
            <> {new Date(createdAt).toLocaleString("en-GB", { hour12: false })}</>
          )}
          {createdByEmail && <> · by {createdByEmail}</>}
        </div>
      )}
    </div>
  )
}
