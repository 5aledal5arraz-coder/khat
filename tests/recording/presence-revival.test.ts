/**
 * «N متصل الآن» must follow a participant who comes BACK online.
 *
 * A row can be marked offline while its tab is alive: the sweep catches a tab
 * the OS throttled past 90s, and because the row is keyed by (room, user) a
 * reload's late `keepalive` DELETE (or a second tab closing) marks the SAME
 * row offline after the live tab joined. The next heartbeat flipped
 * `is_online` back to true in the DB — silently — so every screen kept the
 * offline count (measured: 0 on screen for >30s while the DB had 2).
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api-utils", () => ({
  requireRole: vi.fn(async () => ({ error: null, user: { id: "u-1" } })),
  errorResponse: (m: string, s: number) => new Response(m, { status: s }),
  validationErrorResponse: (m: string) => new Response(m, { status: 422 }),
}))
vi.mock("@/lib/collaboration/rooms", () => ({
  joinRoom: vi.fn(),
  leaveRoom: vi.fn(),
  heartbeat: vi.fn(),
  sweepStaleParticipants: vi.fn(async () => []),
}))
vi.mock("@/lib/collaboration/broadcast", () => ({ broadcast: vi.fn() }))
vi.mock("@/lib/collaboration/room-roles", () => ({ resolveRoomRole: () => "host" }))
vi.mock("@/lib/admin/team-identity", () => ({ resolveMemberName: () => "x" }))

import { heartbeat } from "@/lib/collaboration/rooms"
import { broadcast } from "@/lib/collaboration/broadcast"
import { PATCH } from "@/app/api/admin/preparation/[id]/rooms/[roomId]/join/route"

const beat = () =>
  PATCH(
    new Request("http://localhost/x", {
      method: "PATCH",
      body: JSON.stringify({ participant_id: "p-1" }),
    }) as never,
    { params: Promise.resolve({ id: "prep-1", roomId: "room-A" }) },
  )

beforeEach(() => vi.clearAllMocks())

describe("heartbeat → presence", () => {
  it("broadcasts the participant when the heartbeat revived an offline row", async () => {
    const row = { id: "p-1", is_online: true, role: "host" }
    vi.mocked(heartbeat).mockResolvedValue(row as never)
    await beat()
    expect(broadcast).toHaveBeenCalledWith(
      "room-A",
      expect.objectContaining({ type: "participant_update", data: row }),
    )
  })

  it("stays quiet for an ordinary heartbeat (already online)", async () => {
    vi.mocked(heartbeat).mockResolvedValue(null)
    await beat()
    expect(broadcast).not.toHaveBeenCalled()
  })
})
