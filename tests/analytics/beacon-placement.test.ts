/**
 * The collector is mounted in the PUBLIC chrome only. Source assertions (the
 * repo has no DOM test environment): the root layout renders <VisitBeacon />
 * inside the non-bare branch, after the `isBareRoute ?` split, and neither the
 * admin nor the prep layouts import it. The beacon itself re-checks the
 * shared allowlist, so a soft navigation into a private route is not sent.
 */
import fs from "fs"
import path from "path"
import { describe, it, expect } from "vitest"

const read = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8")
const ROOT = read("app", "layout.tsx")
const BEACON = read("components", "layout", "visit-beacon.tsx")
const DECISION = read("lib", "analytics", "beacon.ts")

describe("visit beacon placement", () => {
  it("renders once, in the public branch of the root layout", () => {
    const body = ROOT.slice(ROOT.indexOf("export default async function"))
    const split = body.indexOf("{isBareRoute ? (")
    const publicBranch = body.indexOf(") : (", split)
    const at = body.indexOf("<VisitBeacon />")
    expect(split).toBeGreaterThan(0)
    expect(at).toBeGreaterThan(publicBranch)
    expect(body.indexOf("<VisitBeacon />", at + 1)).toBe(-1)
  })

  it("is not imported by the admin or prep layouts", () => {
    expect(read("app", "admin", "layout.tsx")).not.toContain("VisitBeacon")
    expect(read("app", "prepare", "layout.tsx")).not.toContain("VisitBeacon")
  })

  it("re-checks the shared allowlist and the privacy signals client-side, and stores nothing", () => {
    expect(BEACON).toContain("beaconDecision")
    expect(DECISION).toContain("isTrackablePath")
    expect(BEACON).toContain("doNotTrack")
    expect(BEACON).toContain("globalPrivacyControl")
    expect(BEACON).not.toMatch(/localStorage|sessionStorage|document\.cookie/)
  })
})
