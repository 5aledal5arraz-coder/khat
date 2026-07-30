/**
 * Which recording-room SCREEN a member gets.
 *
 * The answer comes from his صفحة (`admin_users.job_title`) when he has one, and
 * falls back to deriving it from his permission level when he doesn't:
 *
 *   job_title present  →  jobTitleToRoomRole()   (authoritative)
 *   job_title absent   →  adminRoleToRoomRole()  (legacy fallback)
 *
 * The fallback is what it always was — OWNER→host, ADMIN→director,
 * EDITOR→editor, VIEWER→viewer — so every account that predates the
 * `job_title` column keeps behaving exactly as before.
 *
 * WHY the job_title branch exists: deriving the room role from the permission
 * role forced "the director's account must be exactly ADMIN", which meant the
 * OWNER could never be the host. A permission level and a job in the studio are
 * two different facts. Splitting them lets Khaled be OWNER *and* the مقدم,
 * while the مخرج works from a limited account.
 *
 * ⚠️ ARCHITECTURAL BOUNDARY — the room role is a VIEW selector, not a
 * permission. Both gates read `admin_users.role` and nothing else:
 * `requireActionRole` (lib/api-utils.ts) for the server actions, and
 * `requireRoomRole` (lib/collaboration/permissions.ts) for the room API routes.
 * If either consumed the room role, flipping a descriptive dropdown on
 * /admin/team would hand out the "ابدأ التسجيل" button — `requireRoomRole` DID
 * read `room_participants.role`, which this function feeds, and an EDITOR given
 * the صفحة "مخرج" gained marker deletion until that was cut. Keep the two
 * apart: `job_title` → screen + label, `role` → what you may do. See
 * lib/admin/team-identity.ts and tests/room-role-authorization.test.ts.
 *
 * On rejoin (existing participant record) the role is re-derived from the
 * current admin identity — always authoritative, never client-supplied.
 *
 * This lives in a leaf module rather than inside the join route because the
 * recording page needs the SAME answer during its server render. The room role
 * used to be discovered only from the SSE participant list, so until that list
 * arrived `role` was `undefined` — and the shell's `!role || role === "host"`
 * fallback handed the HOST cockpit (with a live "ابدأ التسجيل" button) to every
 * director for as long as the snapshot took to land. Both inputs are known at
 * request time, so the page can resolve it up front and never render a
 * privileged view to a non-host.
 */

import type { AdminRole } from "@/lib/admin/auth"
import { isJobTitle, type JobTitle } from "@/lib/admin/team-identity"
import type { ParticipantRole } from "@/types/collaboration"

/**
 * Legacy derivation — the room role a member gets when he has no صفحة yet.
 * Kept exported because it IS the documented fallback, not dead code.
 */
export function adminRoleToRoomRole(adminRole: AdminRole): ParticipantRole {
  switch (adminRole) {
    case "OWNER":
      return "host"
    case "ADMIN":
      return "director"
    case "EDITOR":
      return "editor"
    case "VIEWER":
      return "viewer"
  }
}

/**
 * A صفحة projected onto the five room screens (`ParticipantRole`).
 *
 * The catalog has seven titles; the room has five screens. `sound` and
 * `producer` fall to `viewer` — the neutral follow-along — because the room has
 * no bespoke surface for them yet, and the honest answer is "no special
 * screen". They are deliberately NOT mapped to `photographer`: that screen is
 * literally camera copy (دليل التصوير / لقطات أولوية / ثبات الكاميرا), so a
 * مهندس صوت would be shown framing instructions that are not his job.
 *
 * They are not mislabelled either: the label people see comes from
 * `jobTitleLabel(job_title)` ("مهندس صوت"), never from this room role. Widening
 * `ParticipantRole` would mean altering the `chk_room_participants_role` CHECK
 * constraint in scripts/post-schema.sql — a production schema change that buys
 * nothing until those screens actually exist.
 */
export function jobTitleToRoomRole(jobTitle: JobTitle): ParticipantRole {
  switch (jobTitle) {
    case "host":
      return "host"
    case "director":
      return "director"
    case "photographer":
      return "photographer"
    case "editor":
      return "editor"
    case "sound":
    case "producer":
    case "viewer":
      return "viewer"
  }
}

/**
 * The single entry point every caller should use: صفحة first, permission role
 * as fallback. An unrecognised stored value (hand-edited row, a صفحة removed
 * from the catalog) is treated as absent and falls back — never as an error and
 * never as a more privileged screen.
 */
export function resolveRoomRole(input: {
  jobTitle?: string | null
  adminRole: AdminRole
}): ParticipantRole {
  if (isJobTitle(input.jobTitle)) return jobTitleToRoomRole(input.jobTitle)
  return adminRoleToRoomRole(input.adminRole)
}
