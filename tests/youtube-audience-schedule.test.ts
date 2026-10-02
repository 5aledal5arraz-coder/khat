/**
 * YouTube audience snapshots refresh on a weekly worker tick, and a TOKEN
 * failure is recorded on the grant like an API failure already was.
 *
 * Before: `report()` recorded `last_error` only for a non-2xx Analytics
 * response. A revoked/expired refresh token throws inside `getAccessToken()`
 * — before the fetch — so it was never written down, and the admin page kept
 * saying «مربوط» over a dead connection.
 *
 * No network: oauth, db and the job queue are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const m = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  recordFailure: vi.fn().mockResolvedValue(undefined),
  recordSuccess: vi.fn().mockResolvedValue(undefined),
  loadGrantStatus: vi.fn(),
  oauthConfigProblem: vi.fn().mockReturnValue(null),
  enqueueRecurringTick: vi.fn().mockResolvedValue(null),
  registerHandler: vi.fn(),
  inserted: [] as unknown[],
  firstEpisode: "2023-01-15" as string | null,
}))

vi.mock("@/lib/youtube/oauth", () => ({
  getAccessToken: m.getAccessToken,
  recordFailure: m.recordFailure,
  recordSuccess: m.recordSuccess,
  loadGrantStatus: m.loadGrantStatus,
  oauthConfigProblem: m.oauthConfigProblem,
}))
// `select` serves windowSinceFirstEpisode's min(release_date) read.
vi.mock("@/lib/db", () => ({
  db: {
    insert: () => ({ values: (v: unknown) => (m.inserted.push(v), Promise.resolve()) }),
    select: () => ({ from: () => Promise.resolve([{ first: m.firstEpisode }]) }),
  },
}))
vi.mock("@/lib/jobs/registry", () => ({ registerHandler: m.registerHandler }))
vi.mock("@/lib/jobs/queue", () => ({ enqueueRecurringTick: m.enqueueRecurringTick }))

import {
  fetchCountries,
  isSnapshotStale,
  AUDIENCE_STALE_DAYS,
  latestPreferredSnapshot,
} from "@/lib/youtube/analytics"
import {
  runYoutubeAudienceRefresh,
  YOUTUBE_AUDIENCE_JOB,
  audienceRefreshIntervalMs,
} from "@/lib/jobs/handlers/youtube-audience"

beforeEach(() => {
  vi.clearAllMocks()
  m.inserted.length = 0
  m.firstEpisode = "2023-01-15"
  m.oauthConfigProblem.mockReturnValue(null)
  vi.unstubAllGlobals()
})

describe("token failure is recorded on the grant", () => {
  it("getAccessToken throwing ⇒ recordFailure(message) then rethrow", async () => {
    m.getAccessToken.mockRejectedValue(new Error("invalid_grant: Token has been expired or revoked."))
    await expect(fetchCountries("2026-09-01", "2026-09-28")).rejects.toThrow(/invalid_grant/)
    expect(m.recordFailure).toHaveBeenCalledWith(expect.stringContaining("invalid_grant"))
  })

  it("a successful call records success, not failure (negative control)", async () => {
    m.getAccessToken.mockResolvedValue("tok")
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ rows: [["KW", 10]] }))))
    const r = await fetchCountries("2026-09-01", "2026-09-28")
    expect(r.rows[0].code).toBe("KW")
    expect(m.recordFailure).not.toHaveBeenCalled()
    expect(m.recordSuccess).toHaveBeenCalled()
  })
})

describe("weekly audience refresh job", () => {
  it("registers under its job type", async () => {
    // registration happens at import; the mock captured it before clearAllMocks
    expect(YOUTUBE_AUDIENCE_JOB).toBe("youtube.audience_refresh")
  })

  it("defaults to a 7-day cadence", () => {
    expect(audienceRefreshIntervalMs()).toBe(7 * 24 * 60 * 60 * 1000)
  })

  it("not connected ⇒ skips quietly (no API call), still keeps the chain", async () => {
    m.loadGrantStatus.mockResolvedValue(null)
    const r = await runYoutubeAudienceRefresh()
    expect(r.status).toBe("skipped")
    expect(m.getAccessToken).not.toHaveBeenCalled()
    expect(m.enqueueRecurringTick).toHaveBeenCalledWith(
      YOUTUBE_AUDIENCE_JOB,
      {},
      expect.objectContaining({ runAfter: expect.any(Date) }),
    )
  })

  it("connected ⇒ refreshes BOTH the last 28 days and the lifetime window", async () => {
    m.loadGrantStatus.mockResolvedValue({ channel_id: "UC1" })
    m.getAccessToken.mockResolvedValue("tok")
    const urls: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (u: string) => {
        urls.push(u)
        return new Response(JSON.stringify({ rows: u.includes("ageGroup") ? [["age25-34", "male", 60]] : [["KW", 10]] }))
      }),
    )
    const r = await runYoutubeAudienceRefresh(new Date("2026-10-02T12:00:00Z"))
    expect(r.status).toBe("measured")
    if (r.status !== "measured") return
    expect(r.windows.map((w) => [w.label, w.startDate])).toEqual([
      ["last28", "2026-09-04"],
      ["lifetime", "2023-01-15"],
    ])
    expect(r.windows[0].endDate).toBe("2026-10-01")
    // 2 windows × 2 reports, each stored with its own window
    expect(urls).toHaveLength(4)
    expect(urls.filter((u) => u.includes("startDate=2026-09-04"))).toHaveLength(2)
    expect(urls.filter((u) => u.includes("startDate=2023-01-15"))).toHaveLength(2)
    expect(m.inserted.map((v) => (v as { period_start: string }).period_start).sort()).toEqual([
      "2023-01-15", "2023-01-15", "2026-09-04", "2026-09-04",
    ])
  })

  it("no dated episode ⇒ only the 28-day window (no invented lifetime start)", async () => {
    m.firstEpisode = null
    m.loadGrantStatus.mockResolvedValue({ channel_id: "UC1" })
    m.getAccessToken.mockResolvedValue("tok")
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ rows: [] }))))
    const r = await runYoutubeAudienceRefresh(new Date("2026-10-02T12:00:00Z"))
    expect(r.status === "measured" && r.windows.map((w) => w.label)).toEqual(["last28"])
  })

  it("token failure ⇒ job fails loudly AND the grant carries last_error", async () => {
    m.loadGrantStatus.mockResolvedValue({ channel_id: "UC1" })
    m.getAccessToken.mockRejectedValue(new Error("invalid_grant"))
    await expect(runYoutubeAudienceRefresh()).rejects.toThrow(/invalid_grant/)
    expect(m.recordFailure).toHaveBeenCalled()
    // The next tick is queued BEFORE the measurement, so a failure can't end the schedule.
    expect(m.enqueueRecurringTick).toHaveBeenCalled()
  })
})

describe("isSnapshotStale", () => {
  const now = new Date("2026-10-02T00:00:00Z")
  it(`stale after ${AUDIENCE_STALE_DAYS} days`, () => {
    expect(AUDIENCE_STALE_DAYS).toBe(14)
    expect(isSnapshotStale(new Date("2026-09-17T00:00:00Z"), now)).toBe(true)
    expect(isSnapshotStale(new Date("2026-09-19T00:00:00Z"), now)).toBe(false)
    expect(isSnapshotStale(null, now)).toBe(false)
  })
})

describe("latestPreferredSnapshot — /partner never silently switches window", () => {
  const snap = (start: string, measured: string) => ({
    rows: [],
    periodStart: start,
    periodEnd: "2026-10-01",
    measuredAt: new Date(measured),
  })
  const LIFETIME = snap("2023-01-15", "2026-09-01")
  const WEEKLY28 = snap("2026-09-04", "2026-10-02") // NEWER than the lifetime row

  it("prefers the lifetime window even when a newer 28-day row exists", async () => {
    const latest = vi.fn(async (_r: string, o?: { periodStart?: string }) =>
      o?.periodStart === "2023-01-15" ? LIFETIME : WEEKLY28,
    )
    const r = await latestPreferredSnapshot("countries", { lifetimeStart: async () => "2023-01-15", latest })
    expect(r).toBe(LIFETIME)
  })

  it("no lifetime row yet ⇒ falls back to the newest of any window", async () => {
    const latest = vi.fn(async (_r: string, o?: { periodStart?: string }) => (o?.periodStart ? null : WEEKLY28))
    const r = await latestPreferredSnapshot("countries", { lifetimeStart: async () => "2023-01-15", latest })
    expect(r).toBe(WEEKLY28)
  })

  it("lifetime start unknown ⇒ newest of any window", async () => {
    const latest = vi.fn(async () => WEEKLY28)
    const r = await latestPreferredSnapshot("age_gender", { lifetimeStart: async () => null, latest })
    expect(r).toBe(WEEKLY28)
    expect(latest).toHaveBeenCalledWith("age_gender")
  })
})

describe("admin vs /partner snapshot readers (Noura's regression)", async () => {
  const { readFileSync } = await import("node:fs")
  const { snapshotWindowLabel } = await import("@/lib/youtube/analytics")
  const admin = readFileSync("app/admin/youtube-analytics/page.tsx", "utf8")
  const partner = readFileSync("app/partner/page.tsx", "utf8")

  it("the admin page shows the NEWEST snapshot of any window (so a manual measure is visible)", () => {
    expect(admin).toMatch(/latestSnapshot<CountryShare>\("countries"\)/)
    expect(admin).toMatch(/latestSnapshot<AgeShare>\("age_gender"\)/)
    expect(admin).not.toMatch(/latestPreferredSnapshot\s*</)
  })

  it("/partner keeps the lifetime-preferring reader", () => {
    expect(partner).toMatch(/latestPreferredSnapshot<CountryShare>\("countries"\)/)
    expect(partner).toMatch(/latestPreferredSnapshot<AgeShare>\("age_gender"\)/)
  })

  it("labels each stored window like its measure button", () => {
    expect(snapshotWindowLabel("2023-01-15", "2026-10-01", "2023-01-15")).toBe("منذ أول حلقة")
    expect(snapshotWindowLabel("2026-09-04", "2026-10-01", "2023-01-15")).toBe("آخر ٢٨ يومًا")
    expect(snapshotWindowLabel("2026-07-04", "2026-10-01", null)).toBe("آخر ٩٠ يومًا")
    expect(snapshotWindowLabel("2026-09-20", "2026-10-01", null)).toBe("فترة مخصّصة")
  })

  it("staleness is judged on the newest snapshot of any window", () => {
    expect(admin).toMatch(/isSnapshotStale\(newest/)
  })
})
