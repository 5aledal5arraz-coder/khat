/**
 * Marker deletion is scoped to the room in the URL.
 *
 * The route authorized the caller for room A (`requireRoomRole` against the
 * URL's room) and then deleted `body.marker_id` with no room condition — so
 * any marker in any room could be removed by id. `deleteMarker` now takes the
 * room and reports whether it removed anything; a foreign id is a 404 and is
 * never broadcast as deleted.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

vi.mock("@/lib/api-utils", () => ({
  requireRole: vi.fn(async () => ({ error: null, user: { id: "u-1" } })),
  errorResponse: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
}))
vi.mock("@/lib/collaboration/permissions", () => ({
  requireRoomRole: vi.fn(async () => ({ error: null, participant: { id: "p-1", role: "director" } })),
  ROOM_ACTION_ROLES: { add_marker: "director", delete_marker: "director" },
}))
vi.mock("@/lib/collaboration/rooms", () => ({
  createMarker: vi.fn(),
  deleteMarker: vi.fn(),
  getMarkersByRoom: vi.fn(),
}))
vi.mock("@/lib/collaboration/broadcast", () => ({ broadcast: vi.fn() }))

import { deleteMarker } from "@/lib/collaboration/rooms"
import { broadcast } from "@/lib/collaboration/broadcast"
import { DELETE } from "@/app/api/admin/preparation/[id]/rooms/[roomId]/markers/route"

const call = (markerId: string) =>
  DELETE(
    new Request("http://localhost/x", {
      method: "DELETE",
      body: JSON.stringify({ marker_id: markerId }),
    }) as never,
    { params: Promise.resolve({ id: "prep-1", roomId: "room-A" }) },
  )

beforeEach(() => vi.clearAllMocks())

describe("DELETE /markers — room-scoped", () => {
  it("passes the URL's room to deleteMarker", async () => {
    vi.mocked(deleteMarker).mockResolvedValue(true)
    const res = await call("m-1")
    expect(res.status).toBe(200)
    expect(deleteMarker).toHaveBeenCalledWith("room-A", "m-1")
    expect(broadcast).toHaveBeenCalledWith("room-A", expect.objectContaining({ type: "marker_deleted" }))
  })

  it("a marker from ANOTHER room deletes nothing: 404, no broadcast", async () => {
    vi.mocked(deleteMarker).mockResolvedValue(false)
    const res = await call("m-from-room-B")
    expect(res.status).toBe(404)
    expect(broadcast).not.toHaveBeenCalled()
  })

  it("deleteMarker's WHERE carries the room condition", () => {
    // The mock above cannot see SQL; pin the condition at the source.
    const src = readFileSync(resolve(__dirname, "../../lib/collaboration/rooms.ts"), "utf8")
    const fn = src.slice(src.indexOf("export async function deleteMarker"))
    expect(fn.slice(0, 400)).toMatch(/eq\(roomSessionMarkers\.room_id, roomId\)/)
  })
})
