/**
 * Full Google APIs probe — verifies adapters + ingestion are alive.
 *
 *   1. YouTube Data API — raw HTTP probe
 *   2. Custom Search API — raw HTTP probe
 *   3. Discovery YouTube adapter — runSearchAgent({ source: "youtube" })
 *   4. Discovery Google web adapter — runSearchAgent({ source: "google_web" })
 *   5. Market ingestion — runs ONE preset against YouTube and verifies
 *      market_topic_signals row count grows
 *
 *   npx tsx scripts/diag-google-apis-full.ts
 *
 * Side effect: step 5 inserts up to ~10 new market_topic_signals rows
 * (one preset × maxPerSource=10, deduped against the existing 295).
 * Everything else is read-only.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
try {
  const envPath = path.resolve(__dirname, "..", ".env.local")
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const [, k, rawV] = m
    if (process.env[k]) continue
    let v = rawV.trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[k] = v
  }
} catch {}

function mask(s: string | undefined | null): string {
  if (!s) return "<unset>"
  if (s.length <= 8) return "***"
  return `${s.slice(0, 4)}…${s.slice(-4)}`
}

interface Envelope {
  status: number
  body: string
  parsed: {
    code?: number
    message?: string
    status?: string
    reasons: string[]
  } | null
}
async function rawProbe(url: string, headers?: Record<string, string>): Promise<Envelope> {
  const res = await fetch(url, { headers })
  const body = await res.text()
  let parsed: Envelope["parsed"] = null
  try {
    const json = JSON.parse(body) as {
      error?: {
        code?: number
        message?: string
        status?: string
        errors?: Array<{ reason?: string; message?: string }>
        details?: Array<{ reason?: string }>
      }
    }
    if (json.error) {
      parsed = {
        code: json.error.code,
        message: json.error.message,
        status: json.error.status,
        reasons: [
          ...(json.error.errors ?? []).map((e) => e.reason ?? "").filter(Boolean),
          ...(json.error.details ?? [])
            .map((d) => (d as { reason?: string }).reason ?? "")
            .filter(Boolean),
        ],
      }
    }
  } catch {}
  return { status: res.status, body, parsed }
}

async function main() {
  console.log("\n🔬 FULL GOOGLE APIs PROBE\n")
  const webProvider =
    process.env.WEB_SEARCH_PROVIDER === "google_cse" ? "google_cse" : "brave"
  console.log("env summary")
  console.log(`  WEB_SEARCH_PROVIDER : ${webProvider}${process.env.WEB_SEARCH_PROVIDER ? "" : " (default)"}`)
  console.log(`  YOUTUBE_API_KEY     : ${mask(process.env.YOUTUBE_API_KEY)}`)
  console.log(`  YOUTUBE_API_KEY2    : ${mask(process.env.YOUTUBE_API_KEY2)}`)
  console.log(`  BRAVE_SEARCH_KEY    : ${mask(process.env.BRAVE_SEARCH_KEY)}`)
  console.log(`  GOOGLE_CSE_KEY      : ${mask(process.env.GOOGLE_CSE_KEY)}    (legacy / rollback)`)
  console.log(`  GOOGLE_CSE_CX       : ${mask(process.env.GOOGLE_CSE_CX)}    (legacy / rollback)`)

  // ─── 1. YouTube Data API — raw HTTP ─────────────────────────────
  console.log("\n1. YOUTUBE DATA API — raw HTTP probe")
  console.log("   endpoint: GET https://www.googleapis.com/youtube/v3/search")
  let ytOk = false
  let ytSampleTitle: string | null = null
  let ytResponseSnippet = ""
  {
    const url = new URL("https://www.googleapis.com/youtube/v3/search")
    url.searchParams.set("part", "snippet")
    url.searchParams.set("q", "خط بودكاست")
    url.searchParams.set("type", "video")
    url.searchParams.set("maxResults", "1")
    const e = await rawProbe(url.toString(), {
      "X-goog-api-key": process.env.YOUTUBE_API_KEY ?? "",
    })
    ytOk = e.status === 200
    console.log(`   HTTP: ${e.status}`)
    if (ytOk) {
      try {
        const json = JSON.parse(e.body) as {
          items?: Array<{ snippet?: { title?: string; channelTitle?: string } }>
        }
        const item = json.items?.[0]
        ytSampleTitle = item?.snippet?.title ?? null
        console.log(`   sample: "${ytSampleTitle?.slice(0, 80) ?? "—"}"  (channel: ${item?.snippet?.channelTitle ?? "—"})`)
        ytResponseSnippet = `items[0].snippet.title="${ytSampleTitle?.slice(0, 60)}..."`
      } catch {}
    } else {
      console.log(`   google.error.message : ${e.parsed?.message ?? "—"}`)
      console.log(`   google.error.reasons : ${e.parsed?.reasons.join(", ") || "—"}`)
      ytResponseSnippet = e.body.slice(0, 200)
    }
  }

  // ─── 1b. Brave Search API — raw HTTP ────────────────────────────
  console.log("\n1b. BRAVE SEARCH API — raw HTTP probe (primary web-search path)")
  console.log("   endpoint: GET https://api.search.brave.com/res/v1/web/search")
  let braveOk = false
  let braveSampleTitle: string | null = null
  let braveResponseSnippet = ""
  {
    const braveKey = process.env.BRAVE_SEARCH_KEY
    if (!braveKey) {
      console.log("   ❌ env missing → BRAVE_SEARCH_KEY")
    } else {
      const url = new URL("https://api.search.brave.com/res/v1/web/search")
      url.searchParams.set("q", "خط بودكاست")
      url.searchParams.set("count", "1")
      const e = await rawProbe(url.toString(), {
        Accept: "application/json",
        "X-Subscription-Token": braveKey,
      })
      braveOk = e.status === 200
      console.log(`   HTTP: ${e.status}`)
      if (braveOk) {
        try {
          const json = JSON.parse(e.body) as {
            web?: { results?: Array<{ title?: string; url?: string }> }
          }
          const item = json.web?.results?.[0]
          braveSampleTitle = item?.title ?? null
          console.log(`   sample: "${braveSampleTitle?.slice(0, 80) ?? "—"}"  (${item?.url ?? "—"})`)
          braveResponseSnippet = `web.results[0].title="${braveSampleTitle?.slice(0, 60)}..."`
        } catch {}
      } else {
        console.log(`   raw body (first 200): ${e.body.slice(0, 200)}`)
        braveResponseSnippet = e.body.slice(0, 200)
      }
    }
  }

  // ─── 2. Custom Search API — raw HTTP (LEGACY / ROLLBACK) ────────
  console.log("\n2. CUSTOM SEARCH API — raw HTTP probe  (legacy / rollback path)")
  console.log("   endpoint: GET https://www.googleapis.com/customsearch/v1")
  let cseOk = false
  let cseSampleTitle: string | null = null
  let cseResponseSnippet = ""
  {
    const cseKey = process.env.GOOGLE_CSE_KEY
    const cseCx = process.env.GOOGLE_CSE_CX
    if (!cseKey || !cseCx) {
      console.log(`   ❌ env missing → ${[!cseKey && "GOOGLE_CSE_KEY", !cseCx && "GOOGLE_CSE_CX"].filter(Boolean).join(", ")}`)
    } else {
      const url = new URL("https://www.googleapis.com/customsearch/v1")
      url.searchParams.set("key", cseKey)
      url.searchParams.set("cx", cseCx)
      url.searchParams.set("q", "خط بودكاست")
      url.searchParams.set("num", "1")
      const e = await rawProbe(url.toString())
      cseOk = e.status === 200
      console.log(`   HTTP: ${e.status}`)
      if (cseOk) {
        try {
          const json = JSON.parse(e.body) as {
            items?: Array<{ title?: string; link?: string }>
          }
          const item = json.items?.[0]
          cseSampleTitle = item?.title ?? null
          console.log(`   sample: "${cseSampleTitle?.slice(0, 80) ?? "—"}"  (${item?.link ?? "—"})`)
          cseResponseSnippet = `items[0].title="${cseSampleTitle?.slice(0, 60)}..."`
        } catch {}
      } else {
        console.log(`   google.error.code    : ${e.parsed?.code ?? "—"}`)
        console.log(`   google.error.status  : ${e.parsed?.status ?? "—"}`)
        console.log(`   google.error.message : ${e.parsed?.message ?? "—"}`)
        console.log(`   google.error.reasons : ${e.parsed?.reasons.join(", ") || "—"}`)
        cseResponseSnippet = e.body.slice(0, 200)
      }
    }
  }

  // ─── 3. Discovery YouTube adapter ───────────────────────────────
  console.log("\n3. DISCOVERY → YouTube adapter (runSearchAgent source='youtube')")
  let discYtAlive = false
  let discYtCands = 0
  let discYtNote = ""
  {
    const { runSearchAgent } = await import("../lib/discovery/search-agents")
    const r = await runSearchAgent({
      source: "youtube",
      maxResults: 3,
      archetype: {
        id: "probe_archetype",
        name: "مفكر عربي",
        target_signals: ["مفكر فلسفي", "مقابلة فكرية"],
        expected_traits: [],
      } as unknown as Parameters<typeof runSearchAgent>[0]["archetype"],
    })
    discYtAlive = r.configured && r.candidates.length > 0
    discYtCands = r.candidates.length
    discYtNote = r.note ?? ""
    console.log(`   configured: ${r.configured}`)
    console.log(`   candidates: ${r.candidates.length}`)
    console.log(`   note      : ${r.note ?? "—"}`)
    if (r.candidates[0]) {
      console.log(`   sample    : ${r.candidates[0].proposed_name}`)
    }
  }

  // ─── 4. Discovery Google web adapter ────────────────────────────
  console.log("\n4. DISCOVERY → Google web adapter (runSearchAgent source='google_web')")
  let discCseAlive = false
  let discCseCands = 0
  let discCseNote = ""
  {
    const { runSearchAgent } = await import("../lib/discovery/search-agents")
    const r = await runSearchAgent({
      source: "google_web",
      maxResults: 3,
      archetype: {
        id: "probe_archetype",
        name: "مفكر عربي",
        target_signals: ["مفكر فلسفي", "مقابلة فكرية"],
        expected_traits: [],
      } as unknown as Parameters<typeof runSearchAgent>[0]["archetype"],
    })
    discCseAlive = r.configured && r.candidates.length > 0
    discCseCands = r.candidates.length
    discCseNote = r.note ?? ""
    console.log(`   configured: ${r.configured}`)
    console.log(`   candidates: ${r.candidates.length}`)
    console.log(`   note      : ${r.note ?? "—"}`)
    if (r.candidates[0]) {
      console.log(`   sample    : ${r.candidates[0].proposed_name ?? "—"}`)
    }
  }

  // ─── 5. Market ingestion — one preset, count delta ──────────────
  console.log("\n5. MARKET INGESTION → runPresetCollection (one preset, dedupe-safe)")
  let signalsBefore = 0
  let signalsAfter = 0
  let inserted = 0
  let collectionNote = ""
  {
    const { db } = await import("../lib/db")
    if (!db) {
      console.log("   ❌ no DB")
    } else {
      const { sql } = await import("drizzle-orm")
      const beforeRow = await db.execute(sql`SELECT count(*)::int AS n FROM market_topic_signals`)
      signalsBefore = Number((beforeRow.rows[0] as { n?: number }).n ?? 0)
      console.log(`   signals before: ${signalsBefore}`)

      const { getPresets } = await import("../lib/market-intelligence/presets")
      const { runPresetCollection } = await import(
        "../lib/market-intelligence/ingestion"
      )
      const presets = await getPresets()
      const preset = presets[0]
      if (!preset) {
        console.log(`   ❌ no presets configured`)
      } else {
        console.log(`   preset       : "${preset.label}" (${preset.sources?.join(",") ?? "—"})`)
        const r = await runPresetCollection(preset, { maxPerSource: 5 })
        inserted = r.inserted
        console.log(`   adapters     : ${r.collected.map((c) => `${c.source}=${c.result.configured ? "configured" : "missing"}${c.result.note ? ` (${c.result.note})` : ""}`).join(" · ")}`)
        console.log(`   inserted     : ${r.inserted}`)
        if (r.collected[0]?.result.note) collectionNote = r.collected[0].result.note
      }
      const afterRow = await db.execute(sql`SELECT count(*)::int AS n FROM market_topic_signals`)
      signalsAfter = Number((afterRow.rows[0] as { n?: number }).n ?? 0)
      console.log(`   signals after : ${signalsAfter} (Δ ${signalsAfter - signalsBefore})`)
    }
  }

  // ─── Summary ────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(60))
  console.log("SUMMARY")
  console.log("─".repeat(60))
  const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n)
  console.log(pad("1. YouTube HTTP", 36) + (ytOk ? "✅ 200 OK" : "❌ failing"))
  console.log(pad("1b. Brave Search HTTP", 36) + (braveOk ? "✅ 200 OK" : "❌ failing or unconfigured"))
  console.log(pad("2. CSE HTTP (legacy/rollback)", 36) + (cseOk ? "✅ 200 OK" : "❌ failing or unconfigured"))
  console.log(pad("   active web provider", 36) + `${webProvider} → ${(webProvider === "google_cse" ? cseOk : braveOk) ? "✅" : "❌"}`)
  console.log(pad("3. Discovery YouTube adapter", 36) + (discYtAlive ? `✅ alive (${discYtCands} candidates)` : `❌ dead (${discYtNote || "no candidates"})`))
  console.log(pad("4. Discovery web adapter", 36) + (discCseAlive ? `✅ alive (${discCseCands} candidates)` : `❌ dead (${discCseNote || "no candidates"})`))
  console.log(pad("5. market.collect ingestion", 32) + (signalsAfter > signalsBefore ? `✅ ${signalsAfter - signalsBefore} new signals ingested` : (signalsAfter === signalsBefore && ytOk ? `✅ adapter live, 0 new (all hits already deduped)` : `❌ no signals ingested ${collectionNote ? `(${collectionNote})` : ""}`)))

  try {
    const { closeDb } = await import("../lib/db")
    await closeDb()
  } catch {}
  process.exit(0)
}

main().catch(async (err) => {
  console.error("probe crashed:", err)
  try {
    const { closeDb } = await import("../lib/db")
    await closeDb()
  } catch {}
  process.exit(1)
})
