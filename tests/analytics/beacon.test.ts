/**
 * The beacon's per-navigation decision (lib/analytics/beacon.ts), behaviour
 * not source. Pins the StrictMode guard (`previous === here` → send nothing):
 * a source-string assertion let a mutation of that line survive, this does not.
 */
import { describe, it, expect } from "vitest"
import { beaconDecision, type BeaconInput } from "@/lib/analytics/beacon"

const ORIGIN = "https://khatpodcast.com"
const base = (over: Partial<BeaconInput> = {}): BeaconInput => ({
  pathname: "/episodes/abc",
  previous: null,
  origin: ORIGIN,
  documentReferrer: "https://www.google.com/search?q=x",
  privacySignal: false,
  ...over,
})

describe("beaconDecision", () => {
  it("first view: sends the entry referrer without its query", () => {
    expect(beaconDecision(base())).toEqual({
      here: `${ORIGIN}/episodes/abc`,
      payload: { path: "/episodes/abc", referrer: "https://www.google.com/search" },
    })
  })

  it("StrictMode re-run of the same page sends NOTHING (the from === here guard)", () => {
    const first = beaconDecision(base())
    const again = beaconDecision(base({ previous: first.here }))
    expect(first.payload).not.toBeNull()
    expect(again.payload).toBeNull()
    expect(again.here).toBe(first.here)
  })

  it("a soft navigation sends once, with our own previous page as referrer", () => {
    const out = beaconDecision(base({ pathname: "/guests", previous: `${ORIGIN}/episodes/abc` }))
    expect(out.payload).toEqual({ path: "/guests", referrer: `${ORIGIN}/episodes/abc` })
  })

  it("never sends for private paths, but still advances `here`", () => {
    const out = beaconDecision(base({ pathname: "/prepare/secret-token" }))
    expect(out.payload).toBeNull()
    expect(out.here).toBe(`${ORIGIN}/prepare/secret-token`)
  })

  it("never sends under DNT / GPC", () => {
    expect(beaconDecision(base({ privacySignal: true })).payload).toBeNull()
  })

  it("an unparseable referrer becomes empty (direct), not raw text", () => {
    expect(beaconDecision(base({ documentReferrer: "not a url" })).payload?.referrer).toBe("")
  })
})
