/**
 * Deterministic room-role assignment from admin identity.
 *
 * No client self-selection — the server always decides:
 *
 *   OWNER  → host
 *   ADMIN  → director
 *   EDITOR → editor
 *   VIEWER → viewer
 *
 * On rejoin (existing participant record), the role is re-derived from the
 * current admin identity — always authoritative.
 *
 * This lives in a leaf module rather than inside the join route because the
 * recording page needs the SAME answer during its server render. The room role
 * used to be discovered only from the SSE participant list, so until that list
 * arrived `role` was `undefined` — and the shell's `!role || role === "host"`
 * fallback handed the HOST cockpit (with a live "ابدأ التسجيل" button) to every
 * director for as long as the snapshot took to land. The mapping is a pure
 * function of the admin role, so the page can resolve it up front and never
 * render a privileged view to a non-host.
 */

import type { AdminRole } from "@/lib/admin/auth"
import type { ParticipantRole } from "@/types/collaboration"

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
