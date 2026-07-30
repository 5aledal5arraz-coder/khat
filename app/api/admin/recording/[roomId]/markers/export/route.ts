/**
 * GET /api/admin/recording/[roomId]/markers/export?format=csv|edl
 *
 * Two complementary exports of a room's session markers. They are not
 * alternatives — together they lose nothing:
 *
 *   • csv (default) — the full record: BOTH clocks side by side, the take, the
 *     English type key, and the Arabic notes verbatim. UTF-8 + BOM so
 *     Excel/Numbers render Arabic; RFC-4180 quoted and formula-injection safe.
 *   • edl — a CMX3600 marker list for DaVinci Resolve: position, English marker
 *     type, colour. Resolve DROPS non-Latin text from EDL silently, so the
 *     Arabic deliberately does not go here; each EDL marker carries the CSV row
 *     index instead so the editor can look the detail up.
 *
 * Editor-facing timestamps are CAMERA time (`wall_time − room_takes.anchor_at +
 * camera_offset_ms`), never `net_recording_ms` — the camera keeps rolling through
 * a pause, so net time drifts further behind the camera file after every break.
 * Both columns appear in the CSV, explicitly labelled, so nobody has to guess.
 */

import { NextRequest, NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { requireRole, errorResponse } from "@/lib/api-utils"
import { db } from "@/lib/db"
import {
  roomTakes,
  collaborationRooms,
} from "@/lib/db/schema/collaboration"
import { exportSafeMemberName } from "@/lib/admin/team-identity"
import { loadExportMarkerRows } from "@/lib/recording-v2/export-query"
import {
  QUICK_MARKER_META,
  QUICK_MARKER_GROUPS,
} from "@/lib/recording-v2/marker-types"
import { withCameraMs } from "@/lib/recording-v2/camera-time"
import {
  buildResolveMarkerEdl,
  markerTypeLabelAr,
} from "@/lib/recording-v2/marker-export"

export const dynamic = "force-dynamic"

const GROUP_LABEL: Record<string, string> = Object.fromEntries(
  QUICK_MARKER_GROUPS.map((g) => [g.key, g.label]),
)

/**
 * Two timestamp columns, named so the difference is unmissable. The editor cuts
 * against the camera column; the team reads the net column to know how much
 * episode was actually recorded. Anyone who mixes them up gets timings that are
 * wrong by the total paused duration.
 */
const HEADERS = [
  "رقم العلامة",
  "التيك",
  "توقيت الكاميرا (للمونتاج)",
  "زمن التسجيل الصافي (للفريق)",
  "توقيت الكاميرا (ميلّي ثانية)",
  "الزمن الصافي (ميلّي ثانية)",
  "النوع",
  "الرمز",
  "المجموعة",
  "الملاحظة",
  "القسم",
  "أضيفت بواسطة",
  "التاريخ",
]

/** Shown in the camera-time columns when the take has no anchor to measure from. */
const NO_CAMERA_TIME = "— لا مرساة"

/**
 * Filename-safe fragment of the room id. `roomId` is a route path segment, so it
 * is request-controlled: a value carrying `"`, CR or LF would break out of the
 * quoted `Content-Disposition` value and let a caller inject response headers.
 * Reduced to an alphanumeric slug BEFORE it ever touches a header.
 */
function safeIdSlug(roomId: string): string {
  const slug = roomId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 8)
  return slug || "room"
}

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
  req: NextRequest,
  { params }: { params: Promise<{ roomId: string }> },
) {
  const auth = await requireRole("VIEWER")
  if (auth.error) return auth.error

  const { roomId } = await params

  // Strict allowlist by COMPARISON, not extraction: the request value is never
  // carried forward, only used to pick between two literals. `format` below is
  // therefore provably one of two known strings, which matters because it
  // decides the filename that goes into a response header — interpolating an
  // unvalidated param there is a CRLF/header-splitting hole.
  // Case-normalised: `?format=EDL` silently served a CSV before.
  const format: "csv" | "edl" =
    req.nextUrl.searchParams.get("format")?.trim().toLowerCase() === "edl"
      ? "edl"
      : "csv"

  // A NUL byte in a text param makes Postgres raise 22021 (invalid byte sequence)
  // rather than simply not matching, which surfaced as an unhandled 500. It can
  // never be part of a real id, so reject it as a plain 404 before querying.
  if (roomId.includes("\u0000")) return errorResponse("الغرفة غير موجودة", 404)

  const [room] = await db!
    .select({
      id: collaborationRooms.id,
      name: collaborationRooms.name,
      take_number: collaborationRooms.take_number,
    })
    .from(collaborationRooms)
    .where(eq(collaborationRooms.id, roomId))
    .limit(1)
  if (!room) return errorResponse("الغرفة غير موجودة", 404)

  /**
   * WHICH TAKE. Defaults to the room's CURRENT take — never "all takes".
   *
   * Camera time restarts from zero at every take's own anchor, so markers from
   * two takes interleave into timecodes that all look plausible. Importing that
   * EDL onto take 2's footage silently scatters half of a scrapped take's flags
   * across the edit. The CSV survived it (it has a take column); the EDL cannot.
   *
   * `?take=N` exports an older take deliberately. Parsed strictly: a
   * non-positive or non-numeric value falls back to the current take rather than
   * widening the query.
   */
  const takeParam = Number(req.nextUrl.searchParams.get("take"))
  const takeNumber =
    Number.isInteger(takeParam) && takeParam > 0 ? takeParam : room.take_number

  // The query lives in lib/recording-v2/export-query.ts so the smoke can run
  // the SAME statement against a real Postgres — it contains a uuid/text cast
  // that no type-checker or unit test can validate.
  const rawRows = await loadExportMarkerRows({ roomId, takeNumber })

  const takes = await db!
    .select({
      take_number: roomTakes.take_number,
      anchor_at: roomTakes.anchor_at,
      camera_offset_ms: roomTakes.camera_offset_ms,
    })
    .from(roomTakes)
    .where(and(eq(roomTakes.room_id, roomId), eq(roomTakes.take_number, takeNumber)))

  // Camera time is DERIVED here, never stored — that is what lets a mis-measured
  // `camera_offset_ms` be corrected later and every export re-derive correctly.
  const withCamera = withCameraMs(rawRows, takes)
  // Editors read a cut list in timeline order, so sort by the clock they will
  // actually be looking at. Unanchored rows (camera_ms null) sink to the end
  // rather than being dropped — the CSV still has to account for them.
  const rows = [...withCamera]
    .map((m, i) => ({ ...m, index: i + 1 }))
    .sort((a, b) => {
      if (a.camera_ms == null && b.camera_ms == null) return a.index - b.index
      if (a.camera_ms == null) return 1
      if (b.camera_ms == null) return -1
      return a.camera_ms - b.camera_ms
    })
    // Re-index AFTER sorting so «رقم العلامة» matches the exported order and the
    // EDL's `|M:quote 7` points at CSV row 7.
    .map((m, i) => ({ ...m, index: i + 1 }))

  if (format === "edl") {
    const { edl, written, skipped } = buildResolveMarkerEdl({
      title: `KHAT ${safeIdSlug(roomId)} take ${takeNumber}`,
      markers: rows,
    })
    return new NextResponse(edl, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=us-ascii",
        "Content-Disposition": `attachment; filename="khat-markers-${safeIdSlug(roomId)}-take${takeNumber}.edl"`,
        // Surfaced so the caller can tell the editor the EDL is not the whole
        // story when some markers had no derivable position.
        "X-Khat-Markers-Take": String(takeNumber),
        "X-Khat-Markers-Written": String(written),
        "X-Khat-Markers-Skipped": String(skipped.length),
        "Cache-Control": "no-store",
      },
    })
  }

  const lines = [HEADERS.join(",")]
  for (const m of rows) {
    const isEnergy = m.marker_type === "energy_change"
    const isInsight = m.marker_type === "insight_used"
    // marker_type may be a quick type, a system type (energy_change /
    // insight_used), or a legacy value — so the lookup is genuinely
    // possibly-undefined.
    const meta = QUICK_MARKER_META[m.marker_type as keyof typeof QUICK_MARKER_META] as
      | (typeof QUICK_MARKER_META)[keyof typeof QUICK_MARKER_META]
      | undefined
    const typeLabel = markerTypeLabelAr(m.marker_type)
    const groupLabel = isEnergy
      ? "الطاقة"
      : isInsight
        ? "إسناد"
        : meta
          ? GROUP_LABEL[meta.group] ?? meta.group
          : "—"
    const cells = [
      m.index,
      m.take_number,
      m.camera_ms == null ? NO_CAMERA_TIME : formatTimestamp(m.camera_ms),
      formatTimestamp(m.net_recording_ms),
      m.camera_ms == null ? "" : m.camera_ms,
      m.net_recording_ms,
      typeLabel,
      m.marker_type,
      groupLabel,
      isEnergy ? `المستوى ${m.note ?? ""}` : (m.note ?? ""),
      m.section_key ?? "",
      exportSafeMemberName({
        display_name: m.author_display_name,
        job_title: m.author_job_title,
      }),
      m.created_at instanceof Date ? m.created_at.toISOString() : (m.created_at ?? ""),
    ]
    lines.push(cells.map(csvCell).join(","))
  }

  // ﻿ BOM → Excel/Numbers detect UTF-8 and render Arabic correctly.
  const csv = "﻿" + lines.join("\r\n") + "\r\n"

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      // roomId comes from the route path and is interpolated only after being
      // sliced to 8 chars; `format` is one of two literals. No request-controlled
      // string reaches this header unvalidated.
      "Content-Disposition": `attachment; filename="khat-markers-${safeIdSlug(roomId)}-take${takeNumber}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
