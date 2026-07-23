/**
 * Sync `config/analytics.json` → the `platform_analytics` table.
 *
 *   npm run sync:analytics            # dry-run (default) — prints the diff, writes nothing
 *   npm run sync:analytics -- --apply # actually writes
 *
 * WHY THIS EXISTS
 * ---------------
 * `getAnalyticsConfig()` (lib/admin/analytics.ts) reads `platform_analytics`
 * FIRST and only falls back to the JSON file when the table is empty. So
 * editing `config/analytics.json` by hand has zero effect on the admin panel
 * or the media kit while the table has rows. This script closes that gap by
 * pushing the JSON (the human-maintained source of truth) into the table.
 *
 * SAFETY
 * ------
 * - Dry-run is the DEFAULT. Only `--apply` writes.
 * - UPSERT only. No DELETE, no TRUNCATE, no schema changes.
 * - Idempotent: rows that already match are skipped entirely (zero writes),
 *   so a second run reports "no changes".
 * - Hostname-guarded like every other P1+ script: refuses managed-DB
 *   hostnames unless SMOKE_ALLOW_REMOTE=1.
 * - `verified_at` / `source` in the JSON are provenance-only. The table has
 *   no columns for them, so they are deliberately ignored — this script does
 *   NOT alter the schema.
 *
 * Exit codes:
 *   0 — completed (dry-run or applied)
 *   2 — guard refused, bad input, or DB error
 */

import { Client } from "pg"
import { readFileSync } from "node:fs"
import path from "node:path"
import type { AnalyticsConfig, PlatformStats } from "../types/media-kit"

const SCRIPT_VERSION = "sync-analytics-config-v1.0"

// Must match PLATFORMS in lib/admin/analytics.ts — anything else in the JSON
// is ignored rather than written, so a typo can't create a junk row.
const PLATFORMS = ["youtube", "x", "tiktok", "instagram"] as const

const STAT_FIELDS = ["followers", "posts", "engagement", "url"] as const

// ─── Minimal env loader (repo doesn't depend on dotenv) ───────────────
// Deliberately loads ONLY DATABASE_URL. `.env.local` also contains
// LIVE_DATABASE_URL (production); this script must never see it.

function loadDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  try {
    const envPath = path.resolve(__dirname, "..", ".env.local")
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.*)$/)
      if (!m) continue
      let v = m[1].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1)
      }
      return v
    }
  } catch {
    // .env.local missing — rely on shell env.
  }
  return undefined
}

// ─── Hostname guard (mirrors prior P1+ scripts) ───────────────────────

const PRODUCTION_HOSTNAME_PATTERNS: RegExp[] = [
  /\.ondigitalocean\.com/i,
  /\.rds\.amazonaws\.com/i,
  /\.supabase\.co/i,
  /\.neon\.tech/i,
  /\.railway\.app/i,
  /\.heroku\.com/i,
  /\.azure\.com/i,
]

function isLocalConnection(s: string): { ok: boolean; reason?: string; host?: string } {
  try {
    const url = new URL(s.replace(/^postgres(ql)?:\/\//, "http://"))
    const host = url.hostname.toLowerCase()
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return { ok: true, host }
    for (const pat of PRODUCTION_HOSTNAME_PATTERNS) {
      if (pat.test(host)) return { ok: false, host, reason: `hostname ${host} matches production pattern ${pat}.` }
    }
    return { ok: false, host, reason: `hostname ${host} is not localhost.` }
  } catch (err) {
    return { ok: false, reason: `could not parse DATABASE_URL: ${(err as Error).message}` }
  }
}

// ─── Reading + validating the JSON ────────────────────────────────────

type DbRow = { platform: string; followers: number | null; posts: number | null; engagement: string | null; url: string | null }

function readAnalyticsJson(): AnalyticsConfig {
  const file = path.resolve(__dirname, "..", "config", "analytics.json")
  const raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>
  const out = {} as AnalyticsConfig

  for (const platform of PLATFORMS) {
    const entry = raw[platform] as Record<string, unknown> | undefined
    if (!entry || typeof entry !== "object") {
      throw new Error(`config/analytics.json is missing the "${platform}" object`)
    }
    // Provenance keys (verified_at, source) are intentionally dropped here —
    // the table has no columns for them.
    const followers = entry.followers
    const posts = entry.posts
    const engagement = entry.engagement
    const url = entry.url
    if (!Number.isInteger(followers)) throw new Error(`${platform}.followers must be an integer, got ${JSON.stringify(followers)}`)
    if (!Number.isInteger(posts)) throw new Error(`${platform}.posts must be an integer, got ${JSON.stringify(posts)}`)
    if (typeof engagement !== "string") throw new Error(`${platform}.engagement must be a string, got ${JSON.stringify(engagement)}`)
    if (typeof url !== "string") throw new Error(`${platform}.url must be a string, got ${JSON.stringify(url)}`)
    out[platform] = { followers, posts, engagement, url } as PlatformStats
  }

  const ignored = Object.keys(raw).filter((k) => !(PLATFORMS as readonly string[]).includes(k))
  if (ignored.length) {
    console.log(`  ⚠ ignoring unknown platform key(s) in analytics.json: ${ignored.join(", ")}`)
  }
  return out
}

// ─── Diff rendering ───────────────────────────────────────────────────

function show(v: unknown): string {
  if (v === null || v === undefined) return "(null)"
  if (v === "") return '""'
  return String(v)
}

function currentOf(row: DbRow | undefined): PlatformStats | null {
  if (!row) return null
  // Mirrors getAnalyticsConfig()'s null-coalescing so the diff shows what the
  // app would actually read, not the raw nullable column.
  return {
    followers: row.followers ?? 0,
    posts: row.posts ?? 0,
    engagement: row.engagement ?? "0%",
    url: row.url ?? "",
  }
}

// ─── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const apply = args.includes("--apply")
  const dryRun = !apply // --dry-run is accepted and is also the default

  console.log(`[${SCRIPT_VERSION}] mode: ${apply ? "APPLY (will write)" : "DRY-RUN (no writes)"}`)

  const databaseUrl = loadDatabaseUrl()
  if (!databaseUrl) {
    console.error(`[${SCRIPT_VERSION}] DATABASE_URL is not set — refusing`)
    process.exit(2)
  }

  if (process.env.SMOKE_ALLOW_REMOTE !== "1") {
    const guard = isLocalConnection(databaseUrl)
    if (!guard.ok) {
      console.error(`[${SCRIPT_VERSION}] REFUSED: ${guard.reason} Set SMOKE_ALLOW_REMOTE=1 to override.`)
      process.exit(2)
    }
    console.log(`[${SCRIPT_VERSION}] target host: ${guard.host} (local — guard passed)`)
  } else {
    console.log(`[${SCRIPT_VERSION}] SMOKE_ALLOW_REMOTE=1 — hostname guard bypassed`)
  }

  let desired: AnalyticsConfig
  try {
    desired = readAnalyticsJson()
  } catch (err) {
    console.error(`[${SCRIPT_VERSION}] REFUSED: ${(err as Error).message}`)
    process.exit(2)
  }

  const c = new Client({ connectionString: databaseUrl })
  await c.connect()
  try {
    console.log(`[${SCRIPT_VERSION}] database: ${(await c.query("SELECT current_database() AS d")).rows[0].d}`)

    const existing = await c.query<DbRow>(
      `SELECT platform, followers, posts, engagement, url
         FROM platform_analytics
        WHERE platform = ANY($1)`,
      [PLATFORMS as readonly string[]],
    )
    const byPlatform = new Map(existing.rows.map((r) => [r.platform, r]))

    let inserts = 0
    let updates = 0
    let unchanged = 0

    for (const platform of PLATFORMS) {
      const next = desired[platform]
      const current = currentOf(byPlatform.get(platform))
      const changed = STAT_FIELDS.filter((f) => !current || current[f] !== next[f])

      console.log("")
      if (!current) {
        console.log(`→ ${platform}  [INSERT — no row in table]`)
        for (const f of STAT_FIELDS) console.log(`    ${f.padEnd(11)}: (missing) → ${show(next[f])}`)
        inserts++
      } else if (changed.length === 0) {
        console.log(`→ ${platform}  [unchanged]`)
        unchanged++
        continue
      } else {
        console.log(`→ ${platform}  [UPDATE — ${changed.length} field(s)]`)
        for (const f of STAT_FIELDS) {
          const mark = changed.includes(f) ? "  *" : "   "
          if (changed.includes(f)) {
            console.log(`  ${mark} ${f.padEnd(11)}: ${show(current[f])} → ${show(next[f])}`)
          } else {
            console.log(`  ${mark} ${f.padEnd(11)}: ${show(current[f])} (same)`)
          }
        }
        updates++
      }

      if (apply) {
        // UPSERT only. `updated_at` is refreshed so the operator can tell when
        // a row last actually moved.
        await c.query(
          `INSERT INTO platform_analytics (platform, followers, posts, engagement, url, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW())
           ON CONFLICT (platform) DO UPDATE SET
             followers  = EXCLUDED.followers,
             posts      = EXCLUDED.posts,
             engagement = EXCLUDED.engagement,
             url        = EXCLUDED.url,
             updated_at = NOW()`,
          [platform, next.followers, next.posts, next.engagement, next.url],
        )
      }
    }

    console.log("")
    console.log(`── summary ${"─".repeat(46)}`)
    console.log(`  inserts   : ${inserts}`)
    console.log(`  updates   : ${updates}`)
    console.log(`  unchanged : ${unchanged}`)
    console.log(`  provenance: verified_at / source skipped — no columns in platform_analytics`)
    if (dryRun) {
      console.log("")
      console.log(`  DRY-RUN — nothing was written. Re-run with: npm run sync:analytics -- --apply`)
    } else {
      console.log("")
      console.log(`  ✅ applied to platform_analytics`)
    }
  } finally {
    await c.end()
  }
}

main().catch((err) => {
  console.error(`[${SCRIPT_VERSION}] Fatal error:`, err)
  process.exit(2)
})
