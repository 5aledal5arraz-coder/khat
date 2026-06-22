/**
 * GET /api/admin/recording/[roomId]/markers/export
 *
 * Streams every session marker for a recording room as a CSV — timestamp,
 * type (Arabic + raw key), group, note, section, author, and created-at — for
 * editors to mine in post-production once the session has ended.
 *
 * UTF-8 with a BOM so Excel/Numbers render the Arabic correctly; fields are
 * RFC-4180 quoted/escaped. Returned as an attachment download.
 */

import { NextRequest, NextResponse } from "next/server"
import { eq, asc } from "drizzle-orm"
import { requireRole, errorResponse } from "@/lib/api-utils"
import { db } from "@/lib/db"
import {
  roomSessionMarkers,
  roomParticipants,
  collaborationRooms,
} from "@/lib/db/schema/collaboration"
import {
  QUICK_MARKER_META,
  QUICK_MARKER_GROUPS,
} from "@/lib/recording-v2/marker-types"

export const dynamic = "force-dynamic"

const GROUP_LABEL: Record<string, string> = Object.fromEntries(
  QUICK_MARKER_GROUPS.map((g) => [g.key, g.label]),
)

const HEADERS = [
  "الطابع الزمني",
  "الميلّي ثانية",
  "النوع",
  "الرمز",
  "المجموعة",
  "الملاحظة",
  "القسم",
  "أضيفت بواسطة",
  "التاريخ",
]

function pad(n: number): string {
  return n.toString().padStart(2, "0")
}

/** ms → HH:MM:SS.cc (centiseconds) — the editor-facing timestamp. */
function formatTimestamp(ms: number): string {
  const total = Math.max(0, ms)
  const s = Math.floor(total / 1000)
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}.${pad(
    Math.floor((total % 1000) / 10),
  )}`
}

/**
 * RFC-4180 cell. Also neutralizes spreadsheet formula injection: a value
 * starting with = + - @ (or tab/CR) is prefixed with a single quote so Excel/
 * Sheets treat it as text rather than executing it.
 */
function csvCell(value: unknown): string {
  let s = value == null ? "" : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const auth = await requireRole("VIEWER")
  if (auth.error) return auth.error

  const { roomId } = await params

  const [room] = await db!
    .select({ id: collaborationRooms.id, name: collaborationRooms.name })
    .from(collaborationRooms)
    .where(eq(collaborationRooms.id, roomId))
    .limit(1)
  if (!room) return errorResponse("الغرفة غير موجودة", 404)

  const rows = await db!
    .select({
      marker_type: roomSessionMarkers.marker_type,
      note: roomSessionMarkers.note,
      recording_ms: roomSessionMarkers.recording_ms,
      section_key: roomSessionMarkers.section_key,
      created_at: roomSessionMarkers.created_at,
      author_name: roomParticipants.display_name,
    })
    .from(roomSessionMarkers)
    .leftJoin(roomParticipants, eq(roomParticipants.id, roomSessionMarkers.author_id))
    .where(eq(roomSessionMarkers.room_id, roomId))
    .orderBy(asc(roomSessionMarkers.recording_ms))

  const lines = [HEADERS.join(",")]
  for (const m of rows) {
    const isEnergy = m.marker_type === "energy_change"
    // marker_type may be a quick type, a system type (energy_change), or a
    // legacy value — so the lookup is genuinely possibly-undefined.
    const meta = QUICK_MARKER_META[m.marker_type as keyof typeof QUICK_MARKER_META] as
      | (typeof QUICK_MARKER_META)[keyof typeof QUICK_MARKER_META]
      | undefined
    const cells = [
      formatTimestamp(m.recording_ms),
      m.recording_ms,
      isEnergy ? "تغيّر الطاقة" : (meta?.label ?? m.marker_type),
      m.marker_type,
      isEnergy ? "الطاقة" : meta ? GROUP_LABEL[meta.group] ?? meta.group : "—",
      isEnergy ? `المستوى ${m.note ?? ""}` : (m.note ?? ""),
      m.section_key ?? "",
      m.author_name ?? "",
      m.created_at instanceof Date ? m.created_at.toISOString() : (m.created_at ?? ""),
    ]
    lines.push(cells.map(csvCell).join(","))
  }

  // ﻿ BOM → Excel/Numbers detect UTF-8 and render Arabic correctly.
  const csv = "﻿" + lines.join("\r\n") + "\r\n"
  const filename = `khat-markers-${roomId.slice(0, 8)}.csv`

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
