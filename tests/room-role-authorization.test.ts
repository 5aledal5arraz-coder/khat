/**
 * `requireRoomRole()` — the room's REAL authorization gate.
 *
 * This is the guard that stands in front of `delete_marker`, `end_room`,
 * `change_phase` and `edit_host_notes`. It used to read
 * `room_participants.role`, and once that column became a projection of
 * `admin_users.job_title` (the member's صفحة), a DESCRIPTIVE field edited from
 * /admin/team could promote an account: an EDITOR given the صفحة "مخرج" jumped
 * from rank 2 to rank 4 and gained marker deletion.
 *
 * So every test here drives the two inputs APART — the participant row says one
 * thing, `admin_users.role` says another — and asserts the answer follows
 * `admin_users.role` every single time.
 *
 * (tests/team-identity.test.ts covers the OTHER half: which screen a صفحة
 * selects. Its `requireActionRole` cases cannot catch this class of bug —
 * `requireActionRole` never reads a participant row at all.)
 */

import { describe, it, expect, beforeEach, vi } from "vitest"

import { mockDb, mockSelectResult, resetMock } from "./db-mock"

vi.mock("@/lib/db", () => ({ db: mockDb, pool: {}, USE_DB: true }))

import { hasRoomRole, requireRoomRole, ROOM_ACTION_ROLES } from "@/lib/collaboration/permissions"

/**
 * Queue the two selects `requireRoomRole` performs, in order:
 *   1. the participant row (membership + the id markers are attributed to)
 *   2. the admin row (the ONLY source of the enforced rank)
 *
 * `participantRole` is what the room row claims — i.e. what the صفحة projection
 * wrote. It must never decide the outcome.
 */
function arrange(opts: {
  participantRole: string | null
  adminRole: string | null
  participantId?: string
}) {
  resetMock()
  if (opts.participantRole === null) {
    mockSelectResult([]) // not a participant
  } else {
    mockSelectResult([
      { id: opts.participantId ?? "participant-1", role: opts.participantRole },
    ])
  }
  if (opts.adminRole === null) {
    mockSelectResult([]) // no admin record
  } else {
    mockSelectResult([{ role: opts.adminRole }])
  }
}

const ROOM = "room-1"
const USER = "user-1"

describe("hasRoomRole() rank ladder", () => {
  it("ranks host > director > photographer > editor > viewer", () => {
    expect(hasRoomRole("host", "director")).toBe(true)
    expect(hasRoomRole("director", "director")).toBe(true)
    expect(hasRoomRole("editor", "director")).toBe(false)
    expect(hasRoomRole("viewer", "editor")).toBe(false)
  })
})

describe("requireRoomRole() ignores room_participants.role", () => {
  beforeEach(() => resetMock())

  it("🔴 denies delete_marker to an EDITOR whose participant row says director", async () => {
    // Exactly the escalation: job_title='director' on a limited account, so the
    // projection stamped `director` (rank 4) on the row. The enforced rank must
    // still come from admin_users.role = EDITOR (rank 2).
    arrange({ participantRole: "director", adminRole: "EDITOR" })
    const r = await requireRoomRole(ROOM, USER, ROOM_ACTION_ROLES.delete_marker)
    expect(r.error).toBe("ليس لديك صلاحية لهذا الإجراء في الغرفة")
  })

  it("🔴 denies change_phase / end_room to an EDITOR whose participant row says host", async () => {
    for (const action of [
      ROOM_ACTION_ROLES.change_phase,
      ROOM_ACTION_ROLES.end_room,
      ROOM_ACTION_ROLES.edit_host_notes,
      ROOM_ACTION_ROLES.mark_note_seen,
    ]) {
      arrange({ participantRole: "host", adminRole: "EDITOR" })
      const r = await requireRoomRole(ROOM, USER, action)
      expect(r.error, `action requiring ${action} must stay denied`).not.toBeNull()
    }
  })

  it("🔴 denies the director-only card + note actions to an EDITOR stamped host", async () => {
    for (const action of [
      ROOM_ACTION_ROLES.pin_card,
      ROOM_ACTION_ROLES.mark_card_used,
      ROOM_ACTION_ROLES.mark_card_skipped,
      ROOM_ACTION_ROLES.resolve_note,
      ROOM_ACTION_ROLES.add_marker,
    ]) {
      arrange({ participantRole: "host", adminRole: "EDITOR" })
      const r = await requireRoomRole(ROOM, USER, action)
      expect(r.error, `action requiring ${action} must stay denied`).not.toBeNull()
    }
  })

  it("denies a VIEWER stamped host — the lowest permission role, the highest صفحة", async () => {
    // `add_note` is deliberately open at `viewer` rank, so it proves nothing
    // here; use the gated actions.
    for (const action of [ROOM_ACTION_ROLES.delete_marker, ROOM_ACTION_ROLES.change_phase]) {
      arrange({ participantRole: "host", adminRole: "VIEWER" })
      const r = await requireRoomRole(ROOM, USER, action)
      expect(r.error, `action requiring ${action} must stay denied`).not.toBeNull()
    }
  })

  it("keeps add_note open at viewer rank — the fix must not over-tighten", async () => {
    arrange({ participantRole: "viewer", adminRole: "VIEWER" })
    const r = await requireRoomRole(ROOM, USER, ROOM_ACTION_ROLES.add_note)
    expect(r.error).toBeNull()
  })

  it("does NOT take permissions away either: an OWNER stamped viewer still passes host actions", async () => {
    // The inverse leak. A stale or downgraded participant row must not lock the
    // OWNER out of his own room, or the gate would still depend on the column.
    arrange({ participantRole: "viewer", adminRole: "OWNER" })
    const r = await requireRoomRole(ROOM, USER, ROOM_ACTION_ROLES.change_phase)
    expect(r.error).toBeNull()
    expect("participant" in r && r.participant.role).toBe("host")
  })

  it("an ADMIN stamped viewer still passes director actions", async () => {
    arrange({ participantRole: "viewer", adminRole: "ADMIN" })
    const r = await requireRoomRole(ROOM, USER, ROOM_ACTION_ROLES.delete_marker)
    expect(r.error).toBeNull()
  })

  it("still returns the participant id callers attribute markers/notes to", async () => {
    arrange({ participantRole: "viewer", adminRole: "OWNER", participantId: "p-42" })
    const r = await requireRoomRole(ROOM, USER, ROOM_ACTION_ROLES.add_note)
    expect("participant" in r && r.participant.id).toBe("p-42")
  })

  it("still requires room MEMBERSHIP — an OWNER who never joined is refused", async () => {
    arrange({ participantRole: null, adminRole: "OWNER" })
    const r = await requireRoomRole(ROOM, USER, ROOM_ACTION_ROLES.add_note)
    expect(r.error).toBe("لست مشاركاً في هذه الغرفة")
  })

  it("fails closed when there is no admin record for the user", async () => {
    arrange({ participantRole: "host", adminRole: null })
    const r = await requireRoomRole(ROOM, USER, ROOM_ACTION_ROLES.add_note)
    expect(r.error).not.toBeNull()
  })
})
