/**
 * PODCAST_UNIVERSE_ENABLED (plan §6 step 4–5): OFF unless exactly "true".
 * Off → nav hidden, pages notFound(), actions refuse, podcast.* handlers
 * complete as a logged no-op, the weekly scheduler does not bootstrap, and
 * the CLI refuses everything but `status`.
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

const h = vi.hoisted(() => ({ runCrawl: vi.fn(), enqueue: vi.fn() }))
vi.mock("@/lib/podcast-universe/crawl", () => ({ runCrawl: h.runCrawl, markCrawlFailed: vi.fn(), verifyChannel: vi.fn() }))
vi.mock("@/lib/podcast-universe/jobs", () => ({
  startInitialCrawl: vi.fn(),
  startIncrementalCrawl: vi.fn(),
  enqueueChannelVerify: vi.fn(),
  weeklySyncChannelIds: vi.fn(async () => []),
}))
vi.mock("@/lib/jobs/queue", () => ({ enqueueRecurringTick: h.enqueue, enqueueJob: h.enqueue }))
vi.mock("@/lib/db", () => ({ db: { execute: vi.fn(async () => ({ rows: [] })) } }))

import { isPodcastUniverseEnabled } from "@/lib/podcast-universe/flag"
import { getHandler } from "@/lib/jobs/registry"
import "@/lib/jobs/handlers/podcast-universe"
import { ensurePodcastWeeklySyncSchedule } from "@/lib/jobs/scheduler-bootstrap"
import { isNavItemVisible } from "@/app/admin/components/admin-sidebar"

const ROOT = path.resolve(__dirname, "../..")
const ORIGINAL = process.env.PODCAST_UNIVERSE_ENABLED
afterEach(() => {
  process.env.PODCAST_UNIVERSE_ENABLED = ORIGINAL
  vi.clearAllMocks()
})
const ctx = { jobId: "j1", jobType: "x", attempt: 1, maxAttempts: 3, workerId: "w", reportProgress: async () => {} }

describe("PODCAST_UNIVERSE_ENABLED", () => {
  it("is ON only for exactly \"true\" — unset, \"1\", \"TRUE\" are all off", () => {
    for (const v of [undefined, "", "1", "TRUE", "yes", "false"]) {
      if (v === undefined) delete process.env.PODCAST_UNIVERSE_ENABLED
      else process.env.PODCAST_UNIVERSE_ENABLED = v
      expect(isPodcastUniverseEnabled(), String(v)).toBe(false)
    }
    process.env.PODCAST_UNIVERSE_ENABLED = "true"
    expect(isPodcastUniverseEnabled()).toBe(true)
  })

  it("off: every podcast.* handler completes as a no-op (no throw, no work)", async () => {
    delete process.env.PODCAST_UNIVERSE_ENABLED
    for (const t of [
      "podcast.channel.verify",
      "podcast.channel.initial_crawl",
      "podcast.channel.incremental_crawl",
      "podcast.episode.guest_extract",
      "podcast.person.resolve",
      "podcast.weekly_sync",
    ]) {
      await expect(getHandler(t)!({ runId: "r", channelId: "c" }, ctx), t).resolves.toMatchObject({ status: "disabled" })
    }
    expect(h.runCrawl).not.toHaveBeenCalled()
    expect(h.enqueue).not.toHaveBeenCalled() // the weekly chain does not re-arm
  })

  it("on: the handler does its work", async () => {
    process.env.PODCAST_UNIVERSE_ENABLED = "true"
    h.runCrawl.mockResolvedValueOnce({ status: "succeeded", pages: 1, inserted: 0, updated: 0 })
    await getHandler("podcast.channel.initial_crawl")!({ runId: "r", channelId: "c" }, ctx)
    expect(h.runCrawl).toHaveBeenCalledTimes(1)
  })

  it("off: the weekly scheduler does not bootstrap", async () => {
    delete process.env.PODCAST_UNIVERSE_ENABLED
    await expect(ensurePodcastWeeklySyncSchedule()).resolves.toEqual({ status: "disabled", jobId: null })
    expect(h.enqueue).not.toHaveBeenCalled()
  })

  it("off: the sidebar hides every /admin/podcast-universe entry, nothing else", () => {
    expect(isNavItemVisible("/admin/podcast-universe/guests", "OWNER", false)).toBe(false)
    expect(isNavItemVisible("/admin/podcast-universe/channels", "OWNER", true)).toBe(true)
    expect(isNavItemVisible("/admin/guests", "EDITOR", false)).toBe(true)
  })

  it("every Podcast Universe page calls notFound() when off", () => {
    for (const p of [
      "channels/page.tsx",
      "guests/page.tsx",
      "guests/[personId]/page.tsx",
      "guests/review/page.tsx",
      "validation-failures/page.tsx",
    ]) {
      const src = readFileSync(path.join(ROOT, "app/admin/podcast-universe", p), "utf8")
      expect(src, p).toMatch(/if \(!isPodcastUniverseEnabled\(\)\) notFound\(\)/)
    }
  })

  it("every server action refuses first when off", () => {
    const src = readFileSync(path.join(ROOT, "app/admin/podcast-universe/actions.ts"), "utf8")
    const fns = src.split(/\nexport async function /).slice(1)
    expect(fns.length).toBeGreaterThan(10)
    for (const f of fns) {
      const body = f.slice(f.indexOf("{") + 1).trimStart()
      expect(body.startsWith("if (!isPodcastUniverseEnabled()) return DISABLED"), f.slice(0, 40)).toBe(true)
    }
  })

  it("the CLI refuses everything but status when off", () => {
    const src = readFileSync(path.join(ROOT, "scripts/podcast-universe.ts"), "utf8")
    expect(src).toMatch(/if \(cmd !== "status" && !isPodcastUniverseEnabled\(\)\) \{\s*throw new Error/)
  })
})

describe("curated program hosts live in code (prod seed = channels + hosts)", () => {
  it("lists exactly the verified hosts, program-scoped", async () => {
    const { M1_PROGRAM_HOSTS } = await import("@/lib/podcast-universe/seed")
    expect(M1_PROGRAM_HOSTS.map((e) => [e.channel, e.program, [...e.hosts]])).toEqual([
      ["@thmanyahPodcasts", "بودكاست آدم", ["محمد الحاجي"]],
      ["@thmanyahPodcasts", "بودكاست جادي", ["محمد آل جابر", "هادي فقيهي"]],
      ["@thmanyahPodcasts", "بودكاست أرباح", ["أنس الراجحي", "سعيد عبدالجبار"]],
      ["@Alphacast.Official", "شنو الكوميديا", ["بدر صالح", "مؤمن أفندي"]],
      ["@Alphacast.Official", "شنو الكومديا", ["بدر صالح", "مؤمن أفندي"]],
    ])
  })
  it("the seed command applies them in the same run, and skips hosts already listed (no-op re-run)", () => {
    const cli = readFileSync(path.join(ROOT, "scripts/podcast-universe.ts"), "utf8")
    expect(cli).toMatch(/console\.table\(await seedRegistry\(\)\)\s*const \{ seedProgramHosts \}[^\n]*\n\s*console\.table\(await seedProgramHosts\(\)\)/)
    const seed = readFileSync(path.join(ROOT, "lib/podcast-universe/seed.ts"), "utf8")
    expect(seed).toMatch(/if \(listed\) \{\s*out\.push\(\{[^}]*status: "exists" \}\)\s*continue/)
  })
})
