/**
 * Diagnostic — YouTube Data API + Google CSE.
 *
 * READ-ONLY. Hits each API once with the env-supplied credentials and
 * reports:
 *   • exact request URL + headers (key/cx redacted)
 *   • HTTP status
 *   • full Google error envelope (status, reason, message)
 *   • a root-cause classification (api-disabled / referrer-restriction /
 *     ip-restriction / invalid-key / quota / billing / wrong-cx /
 *     wrong-endpoint / other)
 *
 * No env vars are set. No DB writes. No fixes.
 *
 *   npx tsx scripts/diag-google-apis.ts
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
  return `${s.slice(0, 4)}…${s.slice(-4)} (${s.length} chars)`
}

interface ErrorEnvelope {
  status: number
  body: string
  parsed: {
    code?: number
    message?: string
    status?: string
    reasons: string[]
    details: Array<Record<string, unknown>>
  } | null
}

async function probe(url: string, headers?: Record<string, string>): Promise<ErrorEnvelope> {
  const res = await fetch(url, { headers })
  const body = await res.text()
  let parsed: ErrorEnvelope["parsed"] = null
  try {
    const json = JSON.parse(body) as {
      error?: {
        code?: number
        message?: string
        status?: string
        errors?: Array<{ reason?: string; message?: string; domain?: string }>
        details?: Array<Record<string, unknown>>
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
        details: json.error.details ?? [],
      }
    }
  } catch {
    parsed = null
  }
  return { status: res.status, body, parsed }
}

type RootCause =
  | "ok"
  | "api_disabled"
  | "referrer_restriction"
  | "ip_restriction"
  | "invalid_key"
  | "quota_exceeded"
  | "billing_required"
  | "wrong_cx"
  | "wrong_endpoint"
  | "unknown"

function classify(e: ErrorEnvelope): { cause: RootCause; explain: string } {
  if (e.status >= 200 && e.status < 300) return { cause: "ok", explain: "request succeeded" }

  const reasons = (e.parsed?.reasons ?? []).join(" | ")
  const message = (e.parsed?.message ?? "").toLowerCase()
  const status = (e.parsed?.status ?? "").toLowerCase()

  // 1. API disabled — most common 403 cause.
  if (
    reasons.includes("SERVICE_DISABLED") ||
    message.includes("has not been used in project") ||
    message.includes("is disabled") ||
    message.includes("api has not been enabled")
  ) {
    return {
      cause: "api_disabled",
      explain:
        "Google Cloud Console → APIs & Services → Enabled APIs → enable the API listed in the error message",
    }
  }

  // 2. Referrer restriction.
  if (
    reasons.includes("ipRefererBlocked") ||
    reasons.includes("API_KEY_HTTP_REFERRER_BLOCKED") ||
    message.includes("referer") ||
    message.includes("referrer")
  ) {
    return {
      cause: "referrer_restriction",
      explain:
        "Console → APIs & Services → Credentials → edit the key → Application restrictions → set to 'None' (or add this server's referrer)",
    }
  }

  // 3. IP restriction.
  if (
    reasons.includes("ipBlocked") ||
    reasons.includes("API_KEY_IP_ADDRESS_BLOCKED") ||
    message.includes("ip address") ||
    message.includes("not allowed to make this api call")
  ) {
    return {
      cause: "ip_restriction",
      explain:
        "Console → Credentials → edit the key → Application restrictions → IP addresses → add the calling IP, or set to 'None'",
    }
  }

  // 4. Invalid / expired key.
  if (
    reasons.includes("API_KEY_INVALID") ||
    reasons.includes("badRequest") && message.includes("api key") ||
    message.includes("api key not valid") ||
    message.includes("invalid api key") ||
    status === "unauthenticated"
  ) {
    return {
      cause: "invalid_key",
      explain:
        "Console → Credentials → either rotate / replace the key, or check the env value matches the key string exactly",
    }
  }

  // 5. Quota.
  if (
    reasons.includes("rateLimitExceeded") ||
    reasons.includes("quotaExceeded") ||
    reasons.includes("RESOURCE_EXHAUSTED") ||
    status === "resource_exhausted" ||
    message.includes("quota")
  ) {
    return {
      cause: "quota_exceeded",
      explain:
        "Console → APIs & Services → Quotas — increase the daily-quota allotment for this API, or wait for reset (resets at PT midnight)",
    }
  }

  // 6. Billing.
  if (
    reasons.includes("billingNotEnabled") ||
    message.includes("billing") ||
    message.includes("billing account")
  ) {
    return {
      cause: "billing_required",
      explain:
        "Console → Billing — link a billing account to the project (CSE requires this; YouTube Data API does NOT)",
    }
  }

  // 7. Wrong CX (CSE-only).
  if (reasons.includes("invalid") && message.includes("cx")) {
    return {
      cause: "wrong_cx",
      explain:
        "Programmable Search Engine console (programmablesearchengine.google.com) → copy the search engine ID into GOOGLE_CSE_CX",
    }
  }
  if (e.status === 400 && message.includes("custom search engine")) {
    return {
      cause: "wrong_cx",
      explain:
        "Programmable Search Engine console → verify the cx exists + the engine isn't deleted",
    }
  }

  // 8. Wrong endpoint / wrong API.
  if (e.status === 404) {
    return {
      cause: "wrong_endpoint",
      explain: "the URL path is wrong for this API; verify the code didn't swap APIs",
    }
  }

  return { cause: "unknown", explain: "see raw error body below" }
}

function pad(s: string, n: number): string {
  return (s + " ".repeat(n)).slice(0, n)
}

async function main() {
  console.log("\n🔍 GOOGLE API DIAGNOSTIC — read-only\n")

  // ─── ENV state ──────────────────────────────────────────────────
  console.log("ENV (masked)")
  const ytKey = process.env.YOUTUBE_API_KEY
  const ytKey2 = process.env.YOUTUBE_API_KEY2
  const cseKey = process.env.GOOGLE_CSE_KEY
  const cseCx = process.env.GOOGLE_CSE_CX
  const braveKey = process.env.BRAVE_SEARCH_KEY
  const webProvider =
    process.env.WEB_SEARCH_PROVIDER === "google_cse" ? "google_cse" : "brave"
  console.log(`  WEB_SEARCH_PROVIDER : ${webProvider}${process.env.WEB_SEARCH_PROVIDER ? "" : " (default)"}`)
  console.log(`  YOUTUBE_API_KEY     : ${mask(ytKey)}`)
  console.log(`  YOUTUBE_API_KEY2    : ${mask(ytKey2)}`)
  console.log(`  BRAVE_SEARCH_KEY    : ${mask(braveKey)}`)
  console.log(`  GOOGLE_CSE_KEY      : ${mask(cseKey)}    (legacy / rollback)`)
  console.log(`  GOOGLE_CSE_CX       : ${mask(cseCx)}    (legacy / rollback)`)
  console.log("")

  // ─── 1. YouTube Data API — minimal real call ────────────────────
  console.log("─".repeat(72))
  console.log("1. YOUTUBE DATA API — search.list (matches lib/discovery/search-agents.ts)")
  console.log("─".repeat(72))
  if (!ytKey) {
    console.log("  ❌ YOUTUBE_API_KEY not set in env. Skipping live probe.")
  } else {
    const url = new URL("https://www.googleapis.com/youtube/v3/search")
    url.searchParams.set("part", "snippet")
    url.searchParams.set("q", "خط بودكاست")
    url.searchParams.set("type", "video")
    url.searchParams.set("maxResults", "1")
    console.log(`  URL : ${url.toString().replace(ytKey, "<KEY>")}`)
    console.log(`  HDR : X-goog-api-key: <YOUTUBE_API_KEY>   (Auth via header, NOT querystring)`)
    const e = await probe(url.toString(), { "X-goog-api-key": ytKey })
    console.log(`  HTTP: ${e.status}`)
    if (e.parsed) {
      console.log(`  google.error.code    : ${e.parsed.code ?? "—"}`)
      console.log(`  google.error.status  : ${e.parsed.status ?? "—"}`)
      console.log(`  google.error.message : ${e.parsed.message ?? "—"}`)
      console.log(`  google.error.reasons : ${e.parsed.reasons.join(", ") || "—"}`)
    } else if (e.status < 300) {
      console.log(`  ✅ 200 OK — sample item received`)
    }
    const { cause, explain } = classify(e)
    console.log(`  CAUSE: ${cause}`)
    console.log(`  WHAT TO CHANGE: ${explain}`)
    if (e.parsed === null && e.status >= 400) {
      console.log(`  raw body (first 400 chars): ${e.body.slice(0, 400)}`)
    }
  }
  console.log("")

  // ─── 1b. YouTube Data API — secondary key probe ─────────────────
  if (ytKey2 && ytKey2 !== ytKey) {
    console.log("─".repeat(72))
    console.log("1b. YOUTUBE_API_KEY2 — secondary fallback key (used by preparation/research)")
    console.log("─".repeat(72))
    const url = new URL("https://www.googleapis.com/youtube/v3/search")
    url.searchParams.set("part", "snippet")
    url.searchParams.set("q", "test")
    url.searchParams.set("type", "video")
    url.searchParams.set("maxResults", "1")
    const e = await probe(url.toString(), { "X-goog-api-key": ytKey2 })
    console.log(`  HTTP: ${e.status}`)
    if (e.parsed) {
      console.log(`  google.error.message : ${e.parsed.message ?? "—"}`)
      console.log(`  google.error.reasons : ${e.parsed.reasons.join(", ") || "—"}`)
    } else if (e.status < 300) {
      console.log(`  ✅ 200 OK`)
    }
    const { cause, explain } = classify(e)
    console.log(`  CAUSE: ${cause}`)
    console.log(`  WHAT TO CHANGE: ${explain}`)
    console.log("")
  }

  // ─── 1c. Brave Search — minimal real call ───────────────────────
  console.log("─".repeat(72))
  console.log(`2. WEB SEARCH — active provider: ${webProvider}`)
  console.log("─".repeat(72))
  console.log("")
  console.log("2a. BRAVE SEARCH API — web/search (primary path when WEB_SEARCH_PROVIDER is unset or 'brave')")
  if (!braveKey) {
    console.log("  ⚠ BRAVE_SEARCH_KEY not set — Brave path will return configured:false")
    console.log("  WHAT TO CHANGE: brave.com/search/api → create a subscription → copy the token into BRAVE_SEARCH_KEY")
  } else {
    const url = new URL("https://api.search.brave.com/res/v1/web/search")
    url.searchParams.set("q", "خط بودكاست")
    url.searchParams.set("count", "1")
    console.log(`  URL : ${url.toString()}`)
    console.log(`  HDR : X-Subscription-Token: <BRAVE_SEARCH_KEY>`)
    const e = await probe(url.toString(), {
      Accept: "application/json",
      "X-Subscription-Token": braveKey,
    })
    console.log(`  HTTP: ${e.status}`)
    if (e.status < 300) {
      console.log(`  ✅ 200 OK — sample item received`)
    } else {
      console.log(`  raw body (first 400 chars): ${e.body.slice(0, 400)}`)
      if (e.status === 401 || e.status === 403) {
        console.log(`  CAUSE: invalid or revoked BRAVE_SEARCH_KEY`)
        console.log(`  WHAT TO CHANGE: rotate the key in the Brave Search API dashboard`)
      } else if (e.status === 429) {
        console.log(`  CAUSE: Brave rate-limit exceeded`)
        console.log(`  WHAT TO CHANGE: upgrade plan or wait for the quota window`)
      }
    }
  }
  console.log("")

  // ─── 2. Google CSE — minimal real call (LEGACY / ROLLBACK) ──────
  console.log("─".repeat(72))
  console.log("2b. GOOGLE CUSTOM SEARCH API — customsearch/v1  (legacy / rollback path; active when WEB_SEARCH_PROVIDER=google_cse)")
  console.log("─".repeat(72))
  if (!cseKey || !cseCx) {
    console.log(
      `  ⚠ Required envs missing → ${[
        !cseKey && "GOOGLE_CSE_KEY",
        !cseCx && "GOOGLE_CSE_CX",
      ]
        .filter(Boolean)
        .join(" + ")}`,
    )
    if (cseKey && !cseCx) {
      console.log("  CAUSE: missing GOOGLE_CSE_CX (search engine ID) in env")
      console.log(
        "  WHAT TO CHANGE: programmablesearchengine.google.com → create or open your engine → 'Search engine ID' → copy into GOOGLE_CSE_CX in .env.local",
      )
    }
    if (!cseKey) {
      console.log("  CAUSE: missing GOOGLE_CSE_KEY (API key) in env")
      console.log(
        "  WHAT TO CHANGE: Console → APIs & Services → Credentials → create API key → restrict to 'Custom Search API' → copy into GOOGLE_CSE_KEY",
      )
    }
  } else {
    const url = new URL("https://www.googleapis.com/customsearch/v1")
    url.searchParams.set("key", cseKey)
    url.searchParams.set("cx", cseCx)
    url.searchParams.set("q", "خط بودكاست")
    url.searchParams.set("num", "1")
    console.log(
      `  URL : ${url
        .toString()
        .replace(cseKey, "<CSE_KEY>")
        .replace(cseCx, "<CSE_CX>")}`,
    )
    console.log(`  HDR : (auth via key= querystring param, not a header)`)
    const e = await probe(url.toString())
    console.log(`  HTTP: ${e.status}`)
    if (e.parsed) {
      console.log(`  google.error.code    : ${e.parsed.code ?? "—"}`)
      console.log(`  google.error.status  : ${e.parsed.status ?? "—"}`)
      console.log(`  google.error.message : ${e.parsed.message ?? "—"}`)
      console.log(`  google.error.reasons : ${e.parsed.reasons.join(", ") || "—"}`)
    } else if (e.status < 300) {
      console.log(`  ✅ 200 OK — sample item received`)
    }
    const { cause, explain } = classify(e)
    console.log(`  CAUSE: ${cause}`)
    console.log(`  WHAT TO CHANGE: ${explain}`)
    if (e.parsed === null && e.status >= 400) {
      console.log(`  raw body (first 400 chars): ${e.body.slice(0, 400)}`)
    }
  }
  console.log("")

  // ─── 3. Feature dependency map ──────────────────────────────────
  console.log("─".repeat(72))
  console.log("3. FEATURE DEPENDENCY MAP")
  console.log("─".repeat(72))
  console.log(
    [
      [
        "Khat Brain feature",
        "Calls",
        "Env required",
        "Fallback?",
      ],
      ["─".repeat(38), "─".repeat(14), "─".repeat(60), "─".repeat(48)],
      [
        "Guest Discovery — YouTube search",
        "search.list",
        "YOUTUBE_API_KEY",
        "no — returns configured:false, candidates=[]",
      ],
      [
        "Guest Discovery — web search (default)",
        "Brave web/search",
        "BRAVE_SEARCH_KEY",
        "no — returns configured:false, candidates=[]",
      ],
      [
        "Guest Discovery — web search (rollback)",
        "customsearch/v1",
        "GOOGLE_CSE_KEY + GOOGLE_CSE_CX (+ WEB_SEARCH_PROVIDER=google_cse)",
        "no — returns configured:false, candidates=[]",
      ],
      [
        "Market Intelligence — YouTube collection",
        "search.list + videos.list",
        "YOUTUBE_API_KEY",
        "no — returns configured:false",
      ],
      [
        "Guest Preparation — YouTube research",
        "search.list (preparation pipeline)",
        "YOUTUBE_API_KEY2 || YOUTUBE_API_KEY",
        "no — surfaces error to operator",
      ],
      [
        "Public episodes feed",
        "channels/playlistItems",
        "YOUTUBE_API_KEY (when no DB)",
        "yes — falls back to DATABASE_URL",
      ],
      [
        "Hybrid generation",
        "(none directly)",
        "—",
        "yes — uses clusters from existing signals; no live YouTube call",
      ],
    ]
      .map((row) =>
        row.map((c, i) => pad(c, [38, 14, 60, 48][i] ?? 10)).join("  "),
      )
      .join("\n"),
  )
  console.log("")

  // ─── 4. Pass/fail summary ───────────────────────────────────────
  console.log("─".repeat(72))
  console.log("4. CURRENT STATE OF DISCOVERY")
  console.log("─".repeat(72))
  // Re-probe in summary form for the bottom-line readout.
  let ytOk = false
  let braveOk = false
  let cseOk = false
  if (ytKey) {
    const url = new URL("https://www.googleapis.com/youtube/v3/search")
    url.searchParams.set("part", "snippet")
    url.searchParams.set("q", "ping")
    url.searchParams.set("type", "video")
    url.searchParams.set("maxResults", "1")
    const e = await probe(url.toString(), { "X-goog-api-key": ytKey })
    ytOk = e.status < 300
  }
  if (braveKey) {
    const url = new URL("https://api.search.brave.com/res/v1/web/search")
    url.searchParams.set("q", "ping")
    url.searchParams.set("count", "1")
    const e = await probe(url.toString(), {
      Accept: "application/json",
      "X-Subscription-Token": braveKey,
    })
    braveOk = e.status < 300
  }
  if (cseKey && cseCx) {
    const url = new URL("https://www.googleapis.com/customsearch/v1")
    url.searchParams.set("key", cseKey)
    url.searchParams.set("cx", cseCx)
    url.searchParams.set("q", "ping")
    url.searchParams.set("num", "1")
    const e = await probe(url.toString())
    cseOk = e.status < 300
  }
  const webActiveOk = webProvider === "google_cse" ? cseOk : braveOk
  console.log(`  YouTube Data API           : ${ytOk ? "✅ working" : "❌ failing"}`)
  console.log(`  Brave Search (default)     : ${braveOk ? "✅ working" : "❌ failing or unconfigured"}`)
  console.log(`  Google CSE (rollback)      : ${cseOk ? "✅ working" : "❌ failing or unconfigured"}`)
  console.log(`  Active web-search provider : ${webProvider} → ${webActiveOk ? "✅" : "❌"}`)
  console.log("")
  console.log("  Effect on Guest Discovery RIGHT NOW:")
  if (!ytOk && !webActiveOk) {
    console.log("    → Discovery returns 0 candidates from both adapters.")
    console.log("    → discovery.search_archetype completes with empty results.")
    console.log("    → Operators see 'لم نعثر على مرشحين' (no candidates) for every archetype.")
  } else if (!ytOk && webActiveOk) {
    console.log(`    → YouTube path dead; ${webProvider} web path produces results but evidence_urls`)
    console.log("      are web pages, not channel signals. Quality drops noticeably.")
  } else if (ytOk && !webActiveOk) {
    console.log(`    → ${webProvider} web path dead; YouTube path provides channel candidates.`)
    console.log("      Discovery still works at degraded breadth.")
  } else {
    console.log("    → Both adapters functional; full discovery breadth available.")
  }
  console.log("")
  console.log("  Effect on Market Intelligence:")
  if (!ytOk) {
    console.log("    → market.collect cannot ingest new YouTube signals.")
    console.log("    → Existing signals (currently 295) remain queryable; extraction +")
    console.log("      clustering + scoring run against them unchanged.")
    console.log("    → Hybrid generation continues to work via the cluster path.")
  } else {
    console.log("    → market.collect can ingest new YouTube signals.")
  }
  console.log("")
  console.log("  Effect on Hybrid generation:")
  console.log("    → Independent of Google APIs at call-time. Reads only DB tables.")
  console.log("    → Will keep producing candidates as long as clusters exist.")
  console.log("")

  try {
    const { closeDb } = await import("../lib/db")
    await closeDb()
  } catch {}
  process.exit(0)
}

main().catch((err) => {
  console.error("diag crashed:", err)
  process.exit(1)
})
