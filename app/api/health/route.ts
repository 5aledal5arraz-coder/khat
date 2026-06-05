/**
 * A2 — Public health endpoint.
 *
 * GET /api/health
 *
 * Purpose: a single, stable URL that uptime monitors (DigitalOcean
 * Monitoring, Better Stack, curl-loops in cron, etc.) can poll to
 * determine whether Khat is alive and serving usefully.
 *
 * Contract:
 *   • No auth required. No request payload. Response is JSON.
 *   • HTTP 200 when the app can plausibly serve requests:
 *     - the Next.js process responded (proven by reaching this code),
 *     - the DB pool answered SELECT 1 inside a tight timeout.
 *   • HTTP 503 when the app cannot serve: DB unreachable or DB pool
 *     unconfigured. Worker silence does NOT trip 503 — the web tier
 *     can serve read-only traffic without the worker.
 *
 * Body shape (stable contract — change with care, monitors will pin):
 *   {
 *     "status": "ok" | "degraded" | "down",
 *     "ts":     "<ISO-8601>",
 *     "uptime_ms": <number>,
 *     "db":   { "ok": <bool>, "latency_ms": <number|null>, "error": <string|null> },
 *     "worker": {
 *       "ok": <bool>,
 *       "last_event_at": <ISO-8601|null>,
 *       "stale_after_min": <number>,
 *     }
 *   }
 *
 * Status interpretation:
 *   • "ok"       — db.ok && worker.ok
 *   • "degraded" — db.ok && !worker.ok (web serves; worker silent)
 *   • "down"     — !db.ok  (HTTP 503)
 *
 * Stream/cache discipline:
 *   • Cache-Control: no-store (monitors must see live state).
 *   • Content-Type: application/json.
 *   • Never echoes DATABASE_URL, secrets, or internal IDs.
 *
 * Performance: bounded by a 2-second DB statement_timeout on the
 * SELECT 1 probe + a single SELECT max(event_at) on system_events.
 * Total worst-case wall time: ~2.5s. Acceptable for a health probe.
 */

import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@/lib/db"

// ─── Tunables ────────────────────────────────────────────────────────

/** Worker is considered silent if no system_events row was written
 *  in the last N minutes. Calibrated against the sweeper's default
 *  30-minute cadence + a safety margin. */
const WORKER_STALE_MINUTES = 60

/** Hard timeout on the DB probe. If Postgres is slow enough to exceed
 *  this, treat it as down for health purposes. */
const DB_PROBE_TIMEOUT_MS = 2_000

// ─── Boot wall-clock (read once at module init) ──────────────────────
//
// Captures the moment this route module was first imported. Roughly
// equals the Next.js server start time; useful for "did we just
// restart?" debugging in the response body.
const BOOT_TS_MS = Date.now()

// ─── Probe helpers ────────────────────────────────────────────────────

async function probeDb(): Promise<{
  ok: boolean
  latency_ms: number | null
  error: string | null
}> {
  if (!db) {
    return { ok: false, latency_ms: null, error: "db not configured" }
  }
  const t0 = Date.now()
  try {
    // Race the probe against a hard timeout so a wedged pool can't
    // hold the response open.
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("db probe timeout")), DB_PROBE_TIMEOUT_MS),
      ),
    ])
    return { ok: true, latency_ms: Date.now() - t0, error: null }
  } catch (err) {
    return {
      ok: false,
      latency_ms: Date.now() - t0,
      // Never echo the underlying DB error string verbatim — it can
      // contain hostnames, ports, or user names that leak topology.
      // A short generic message is sufficient for monitor parsing.
      error: err instanceof Error && err.message === "db probe timeout"
        ? "timeout"
        : "unreachable",
    }
  }
}

async function probeWorker(): Promise<{
  ok: boolean
  last_event_at: string | null
  stale_after_min: number
}> {
  // No DB → no signal. Worker probe inherits db-down state.
  if (!db) {
    return {
      ok: false,
      last_event_at: null,
      stale_after_min: WORKER_STALE_MINUTES,
    }
  }
  try {
    // Most-recent system_events row from a worker-emitting source.
    // The query is bounded — single MAX aggregate, indexed column.
    const r = (await Promise.race([
      db.execute(sql`
        SELECT max(event_at) AS last_at
          FROM system_events
         WHERE source IN ('jobs', 'sweeper')
      `),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), DB_PROBE_TIMEOUT_MS),
      ),
    ])) as unknown as { rows: Array<{ last_at: Date | null }> }
    const lastAt = r.rows[0]?.last_at ?? null
    if (!lastAt) {
      return {
        ok: false,
        last_event_at: null,
        stale_after_min: WORKER_STALE_MINUTES,
      }
    }
    const ageMs = Date.now() - new Date(lastAt).getTime()
    const ok = ageMs <= WORKER_STALE_MINUTES * 60 * 1000
    return {
      ok,
      last_event_at: new Date(lastAt).toISOString(),
      stale_after_min: WORKER_STALE_MINUTES,
    }
  } catch {
    return {
      ok: false,
      last_event_at: null,
      stale_after_min: WORKER_STALE_MINUTES,
    }
  }
}

// ─── Handler ─────────────────────────────────────────────────────────

export async function GET() {
  // Fan out the two probes in parallel — neither depends on the other.
  const [dbProbe, workerProbe] = await Promise.all([probeDb(), probeWorker()])

  const status: "ok" | "degraded" | "down" = !dbProbe.ok
    ? "down"
    : workerProbe.ok
      ? "ok"
      : "degraded"

  const body = {
    status,
    ts: new Date().toISOString(),
    uptime_ms: Date.now() - BOOT_TS_MS,
    db: dbProbe,
    worker: workerProbe,
  }

  return NextResponse.json(body, {
    status: status === "down" ? 503 : 200,
    headers: {
      "Cache-Control": "no-store",
    },
  })
}
