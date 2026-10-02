/**
 * `khat_vid` is retired (Yousef, 2026-10-02): the proxy no longer MINTS the
 * 1-year anonymous-id cookie, and a browser still carrying one is told to drop
 * it (empty value, Max-Age=0). Nothing in the live tree reads it.
 */
import fs from "fs"
import path from "path"
import { describe, it, expect, vi } from "vitest"
import { NextRequest } from "next/server"

vi.mock("@/lib/site-settings", () => ({ getMaintenanceFlag: vi.fn(async () => false) }))

import { proxy } from "@/proxy"

const cookieHeader = (res: Response) => res.headers.get("set-cookie") ?? ""

describe("khat_vid retired", () => {
  it("a first-time visitor gets no khat_vid cookie", async () => {
    const res = await proxy(new NextRequest("http://localhost/episodes"))
    expect(cookieHeader(res)).not.toContain("khat_vid")
  })

  it("a browser carrying the old cookie is told to expire it", async () => {
    const res = await proxy(
      new NextRequest("http://localhost/episodes", { headers: { cookie: "khat_vid=old-uuid" } }),
    )
    const sc = cookieHeader(res)
    expect(sc).toMatch(/khat_vid=;/)
    expect(sc).toMatch(/Max-Age=0/i)
  })

  it("nothing in app/, lib/ or components/ reads khat_vid", () => {
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p)
        else if (/\.(ts|tsx)$/.test(e.name) && fs.readFileSync(p, "utf8").includes("khat_vid")) hits.push(p)
      }
    }
    for (const d of ["app", "lib", "components"]) walk(path.join(process.cwd(), d))
    expect(hits).toEqual([])
  })
})
