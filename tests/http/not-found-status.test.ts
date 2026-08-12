/**
 * The site used to answer a missing episode/guest/topic/category with HTTP 200
 * and a «الصفحة غير موجودة» body — a soft 404. A crawler reads that as "this
 * URL exists and is fine", so every mistyped or retired link stayed in the
 * index as a real page.
 *
 * ROOT CAUSE (measured on a production build, not inferred): Next only sets the
 * 404 status when `notFound()` escapes to the top-level render. A `loading.tsx`
 * is a Suspense boundary; while `app/loading.tsx` existed it wrapped EVERY
 * route, so the shell was flushed — status already committed as 200 — before
 * any page function ran. The boundary then caught `notFound()` and streamed the
 * not-found UI into an already-successful response. The fix scoped each
 * `loading.tsx` into a route group so it can only wrap its own page.
 *
 * WHY THIS TEST ASSERTS `res.status` AND NOTHING ELSE: the body was never the
 * problem. The not-found UI rendered correctly the whole time — that is exactly
 * what made this invisible. Asserting on text would have passed before the fix.
 *
 * WHY IT NEEDS A PRODUCTION BUILD: `next dev` and `next build` do not agree
 * here, and the behaviour under test only exists in the served response. There
 * is deliberately NO skip-when-unbuilt path: a test that goes quiet when its
 * subject is missing is the "guard that goes blind" failure this repo keeps
 * paying for. Run `npm run build` first; otherwise this file fails and says so.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import net from "node:net"
import path from "node:path"
import { Client } from "pg"

const ROOT = path.resolve(__dirname, "..", "..")
const BOOT_TIMEOUT_MS = 60_000

let server: ChildProcess | null = null
let base = ""

/** A real, currently-published slug per entity — the 200 side of the guard. */
const real: { episode?: string; guest?: string; topic?: string; category?: string } = {}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once("error", reject)
    srv.listen(0, "127.0.0.1", () => {
      const port = (srv.address() as net.AddressInfo).port
      srv.close(() => resolve(port))
    })
  })
}

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const envFile = path.join(ROOT, ".env.local")
  if (!existsSync(envFile)) return ""
  const line = readFileSync(envFile, "utf8")
    .split("\n")
    .find((l) => l.startsWith("DATABASE_URL="))
  return line ? line.slice("DATABASE_URL=".length).replace(/^["']|["']$/g, "").trim() : ""
}

async function loadRealSlugs() {
  const url = databaseUrl()
  if (!url) return
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    const pick = async (sql: string) => (await client.query(sql)).rows[0]?.slug as string | undefined
    // `ORDER BY` on every one of these: without it Postgres may hand back a
    // different row each run, and a test that picks its own subject at random
    // fails on a schedule nobody can reproduce.
    //
    // The episode query also excludes tombstoned and hidden rows, because
    // `getEpisodeBySlug` (lib/queries/episodes.ts) blocks both and answers 404
    // for them — correctly. Selecting one here would fail the 200 assertion and
    // point the blame at the not-found fix, which would be innocent. Noura
    // caught this while the local DB happens to have none of either.
    real.episode = await pick(`
      select slug from episodes
      where slug is not null
        and id not in (select episode_id from deleted_episodes)
        and id not in (select episode_id from hidden_episodes)
      order by id limit 1`)
    real.guest = await pick(
      "select slug from guests where slug is not null order by id limit 1",
    )
    real.topic = await pick(
      "select slug from topics where slug is not null order by id limit 1",
    )
    real.category = await pick(
      "select slug from episode_categories where slug is not null order by id limit 1",
    )
  } finally {
    await client.end()
  }
}

beforeAll(async () => {
  if (!existsSync(path.join(ROOT, ".next", "BUILD_ID"))) {
    throw new Error(
      "No production build found (.next/BUILD_ID). This test measures the HTTP status " +
        "of a served response, which only `next start` produces. Run `npm run build` first.",
    )
  }

  await loadRealSlugs()

  const port = await freePort()
  base = `http://127.0.0.1:${port}`
  server = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, NODE_ENV: "production" },
  })

  const deadline = Date.now() + BOOT_TIMEOUT_MS
  for (;;) {
    if (Date.now() > deadline) throw new Error("`next start` did not become reachable in time")
    try {
      await fetch(`${base}/`, { method: "HEAD" })
      break
    } catch {
      await new Promise((r) => setTimeout(r, 500))
    }
  }
}, BOOT_TIMEOUT_MS + 30_000)

afterAll(() => {
  server?.kill("SIGTERM")
})

/** Status only. Never `res.text()` — the body was always right. */
async function status(pathname: string): Promise<number> {
  const res = await fetch(`${base}${pathname}`, { redirect: "manual" })
  return res.status
}

describe("a URL that resolves to nothing answers 404, not a soft 404", () => {
  it.each([
    ["/episodes/zzz-no-such-episode"],
    ["/guests/zzz-no-such-guest"],
    ["/topics/zzz-no-such-topic"],
    ["/categories/zzz-no-such-category"],
    // The control: a path matching no route at all was ALWAYS 404. It is the
    // contrast that located the bug — keep it, so a regression that breaks
    // everything is distinguishable from one that breaks only notFound().
    ["/zzz-no-such-route-at-all"],
  ])("%s → 404", async (pathname) => {
    expect(await status(pathname)).toBe(404)
  }, 30_000)
})

describe("pages that DO exist still answer 200", () => {
  it("listing pages", async () => {
    expect(await status("/")).toBe(200)
    expect(await status("/episodes")).toBe(200)
    expect(await status("/guests")).toBe(200)
  }, 30_000)

  it("a real episode, guest, topic and category", async () => {
    // Asserted, not skipped: with no rows this test has nothing to protect and
    // must say so rather than pass quietly.
    expect(real.episode, "no episode rows in the local DB").toBeTruthy()
    expect(real.guest, "no guest rows in the local DB").toBeTruthy()
    expect(real.topic, "no topic rows in the local DB").toBeTruthy()
    expect(real.category, "no episode_categories rows in the local DB").toBeTruthy()

    expect(await status(`/episodes/${encodeURIComponent(real.episode!)}`)).toBe(200)
    expect(await status(`/guests/${encodeURIComponent(real.guest!)}`)).toBe(200)
    expect(await status(`/topics/${encodeURIComponent(real.topic!)}`)).toBe(200)
    expect(await status(`/categories/${encodeURIComponent(real.category!)}`)).toBe(200)
  }, 30_000)
})
