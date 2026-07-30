/**
 * The marker rows behind the editor-facing exports (CSV + EDL).
 *
 * Extracted out of the route handler for ONE reason: this query contains a
 * cross-type join that no type-checker, unit test or production build can
 * validate — only a real Postgres can. Living here, the exact same statement the
 * route runs is reachable from `scripts/smoke-khat-brain-live-v2.ts`, which
 * executes it against the real database on every smoke run.
 *
 * (Formatting stays in `marker-export.ts`, which is contractually pure — no DB,
 * no I/O. This module is the DB half and nothing else.)
 */

import { and, asc, eq, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { adminUsers } from "@/lib/db/schema/admin-auth"
import { roomParticipants, roomSessionMarkers } from "@/lib/db/schema/collaboration"


/**
 * One take's markers, in camera order, with the author's authoritative identity.
 *
 * The author is read from `admin_users`, NOT from
 * `room_participants.display_name`: a participant row's name can be an email
 * local part (that is the in-panel fallback), so reading it here shipped staff
 * email addresses to the external editor.
 */
export async function loadExportMarkerRows(args: {
  roomId: string
  takeNumber: number
}) {
  return await db!
    .select({
      marker_type: roomSessionMarkers.marker_type,
      note: roomSessionMarkers.note,
      net_recording_ms: roomSessionMarkers.net_recording_ms,
      take_number: roomSessionMarkers.take_number,
      wall_time: roomSessionMarkers.wall_time,
      section_key: roomSessionMarkers.section_key,
      created_at: roomSessionMarkers.created_at,
      author_display_name: adminUsers.display_name,
      author_job_title: adminUsers.job_title,
    })
    .from(roomSessionMarkers)
    .leftJoin(roomParticipants, eq(roomParticipants.id, roomSessionMarkers.author_id))
    // LEFT JOIN on both hops: `room_participants.user_id` is nullable (the
    // schema allows non-admin invitees), so a missing admin row must yield the
    // anonymous placeholder rather than dropping the marker row.
    //
    // ⚠️ THE CAST IS REQUIRED, NOT COSMETIC. `admin_users.id` is `uuid` while
    // `room_participants.user_id` is `text`, and Postgres has no `uuid = text`
    // operator: a plain `eq()` here fails the entire query with SQLSTATE 42883
    // and the export returns 500 — invisible to tsc, to `next build` and to the
    // whole unit suite, because none of them execute SQL. Cast the uuid side,
    // never the text side: `text::uuid` throws on any non-uuid value and that
    // column is deliberately free text.
    .leftJoin(adminUsers, sql`${adminUsers.id}::text = ${roomParticipants.user_id}`)
    // ONE take per file. Without this the two takes' camera timecodes interleave.
    .where(
      and(
        eq(roomSessionMarkers.room_id, args.roomId),
        eq(roomSessionMarkers.take_number, args.takeNumber),
      ),
    )
    .orderBy(asc(roomSessionMarkers.net_recording_ms))
}

/**
 * The row shape, INFERRED from the query rather than hand-written.
 *
 * Declaring it by hand drifted immediately (`wall_time` is NOT NULL in the
 * schema, and a hand-typed `Date | null` broke the generic that `withCameraMs`
 * threads through to the EDL builder). Inference cannot drift.
 *
 * Feed `author_display_name` / `author_job_title` to `exportSafeMemberName()`,
 * never to `resolveMemberName()`: this data leaves the team, and the in-panel
 * resolver falls back to the email's local part.
 */
export type ExportMarkerRow = Awaited<ReturnType<typeof loadExportMarkerRows>>[number]
