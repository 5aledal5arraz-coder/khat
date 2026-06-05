/**
 * Phase 2.0 — AI Router adoption progress surface.
 *
 *   npm run report:router-adoption
 *
 * Read-only static scan over `lib/` that counts:
 *   • total AI surfaces        — every file with at least one
 *                                `openai.chat.completions.create(`
 *                                OR `runAiTask(` call
 *   • migrated surfaces        — files with NO direct provider call
 *                                (every AI invocation routed)
 *   • partially-migrated       — files with BOTH routed and direct
 *                                calls
 *   • unmigrated surfaces      — files with direct provider calls only
 *   • migration percentage     — sites routed / total AI sites
 *   • exact remaining files    — by-file table with site counts
 *
 * Operates at TWO granularities — file-level AND call-site-level —
 * because partial migrations within a file (e.g. transcript.ts after
 * Batch 1) need to be visible to make the metric honest.
 *
 * Excludes:
 *   • lib/ai-router/router.ts                     (the Router itself)
 *   • lib/ai-router/providers/openai.ts           (provider adapter)
 *   • lib/ai/client.ts                            (legacy client wrapper)
 *   • lib/whisper.ts                              (audio transcription, not chat)
 *   • Any file under lib/ai-router/
 *
 * Exit code: 0 on success regardless of adoption level (this is a
 * reporting tool, not an enforcer). Writes a structured snapshot to
 * `evals/router-adoption.json` so future runs can diff against the
 * last reported state.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs"
import { join, relative, dirname } from "node:path"

const SCRIPT_VERSION = "report-router-adoption-v1.0"

// ─── Scan config ────────────────────────────────────────────────────

const SCAN_ROOT = "lib"
const SNAPSHOT_PATH = "evals/router-adoption.json"

const EXCLUDED_PATHS = new Set<string>([
  "lib/ai-router/router.ts",
  "lib/ai-router/types.ts",
  "lib/ai-router/registry.ts",
  "lib/ai-router/rate-limit.ts",
  "lib/ai-router/index.ts",
  "lib/ai-router/providers/openai.ts",
  "lib/ai-router/providers/gemini.ts",
  "lib/ai/client.ts",
])

// Whisper transcription (audio API), not chat-completions — not part
// of the editorial AI surface this report covers.
const EXCLUDED_PREFIXES: string[] = ["lib/ai-router/"]
const EXCLUDED_SUFFIXES: string[] = ["/whisper.ts"]

// Patterns
const DIRECT_CALL_RE = /openai(\s*\?\.|\s*\.)\s*chat\s*\.\s*completions\s*\.\s*create\s*\(/g
const NEW_OPENAI_RE = /new\s+OpenAI\s*\(/g
const ROUTED_CALL_RE = /\brunAiTask\s*</g

// ─── Walk ────────────────────────────────────────────────────────────

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) {
      walk(full, out)
    } else if (
      st.isFile() &&
      (full.endsWith(".ts") || full.endsWith(".tsx")) &&
      !full.endsWith(".d.ts")
    ) {
      out.push(full)
    }
  }
}

function isExcluded(relPath: string): boolean {
  if (EXCLUDED_PATHS.has(relPath)) return true
  for (const p of EXCLUDED_PREFIXES) if (relPath.startsWith(p)) return true
  for (const s of EXCLUDED_SUFFIXES) if (relPath.endsWith(s)) return true
  return false
}

function countMatches(text: string, re: RegExp): number {
  re.lastIndex = 0
  let n = 0
  while (re.exec(text) !== null) n++
  return n
}

interface FileRecord {
  path: string
  routed_sites: number
  direct_sites: number
  new_openai_sites: number
}

// ─── Main ────────────────────────────────────────────────────────────

function main() {
  const files: string[] = []
  walk(SCAN_ROOT, files)

  const records: FileRecord[] = []
  for (const f of files) {
    const rel = relative(process.cwd(), f).replace(/\\/g, "/")
    if (isExcluded(rel)) continue

    const text = readFileSync(f, "utf8")
    const routed = countMatches(text, ROUTED_CALL_RE)
    const direct = countMatches(text, DIRECT_CALL_RE)
    const newOpenai = countMatches(text, NEW_OPENAI_RE)

    if (routed + direct + newOpenai === 0) continue
    records.push({ path: rel, routed_sites: routed, direct_sites: direct, new_openai_sites: newOpenai })
  }

  // ─── Categorize ────────────────────────────────────────────────────
  const fullyMigrated = records.filter((r) => r.direct_sites === 0 && r.new_openai_sites === 0)
  const partiallyMigrated = records.filter(
    (r) =>
      (r.direct_sites > 0 || r.new_openai_sites > 0) && r.routed_sites > 0,
  )
  const unmigrated = records.filter(
    (r) => r.routed_sites === 0 && (r.direct_sites > 0 || r.new_openai_sites > 0),
  )

  // Site totals
  const totalRouted = records.reduce((s, r) => s + r.routed_sites, 0)
  const totalDirect = records.reduce((s, r) => s + r.direct_sites, 0)
  const totalSites = totalRouted + totalDirect
  const pct =
    totalSites === 0 ? "0.0" : ((100 * totalRouted) / totalSites).toFixed(1)

  // ─── Print ─────────────────────────────────────────────────────────
  console.log("")
  console.log(`[${SCRIPT_VERSION}] Khat Brain — AI Router adoption snapshot`)
  console.log(`Generated at: ${new Date().toISOString()}`)
  console.log("")
  console.log("Site-level totals (excludes Router internals + whisper.ts):")
  console.log(`  Routed sites (runAiTask):                     ${totalRouted}`)
  console.log(`  Direct sites (openai.chat.completions.create): ${totalDirect}`)
  console.log(`  Total AI sites:                                ${totalSites}`)
  console.log(`  Router adoption:                               ${pct}%`)
  console.log("")

  console.log("File-level totals:")
  console.log(`  Total AI surfaces (files with any AI call):  ${records.length}`)
  console.log(`  Fully migrated (Router-only):                ${fullyMigrated.length}`)
  console.log(`  Partially migrated (mixed):                  ${partiallyMigrated.length}`)
  console.log(`  Unmigrated (direct-only):                    ${unmigrated.length}`)
  console.log("")

  if (unmigrated.length > 0) {
    console.log("Unmigrated files (direct provider calls only):")
    console.log("  " + "─".repeat(76))
    console.log(`  ${pad("File", 56)} ${padLeft("direct", 8)} ${padLeft("new()", 6)}`)
    console.log("  " + "─".repeat(76))
    for (const r of unmigrated.sort((a, b) => b.direct_sites - a.direct_sites)) {
      console.log(
        `  ${pad(r.path, 56)} ${padLeft(String(r.direct_sites), 8)} ${padLeft(String(r.new_openai_sites), 6)}`,
      )
    }
    console.log("")
  }

  if (partiallyMigrated.length > 0) {
    console.log("Partially-migrated files (mixed routing — finish these):")
    console.log("  " + "─".repeat(82))
    console.log(`  ${pad("File", 56)} ${padLeft("routed", 8)} ${padLeft("direct", 8)} ${padLeft("new()", 6)}`)
    console.log("  " + "─".repeat(82))
    for (const r of partiallyMigrated.sort((a, b) => b.direct_sites - a.direct_sites)) {
      console.log(
        `  ${pad(r.path, 56)} ${padLeft(String(r.routed_sites), 8)} ${padLeft(String(r.direct_sites), 8)} ${padLeft(String(r.new_openai_sites), 6)}`,
      )
    }
    console.log("")
  }

  if (fullyMigrated.length > 0) {
    console.log(`Fully migrated files (${fullyMigrated.length}):`)
    for (const r of fullyMigrated.sort((a, b) => a.path.localeCompare(b.path))) {
      console.log(`  ✓ ${r.path}  (${r.routed_sites} routed)`)
    }
    console.log("")
  }

  // ─── Snapshot ──────────────────────────────────────────────────────
  try {
    mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true })
    const payload = {
      script: SCRIPT_VERSION,
      timestamp: new Date().toISOString(),
      site_totals: {
        routed: totalRouted,
        direct: totalDirect,
        total: totalSites,
        adoption_pct: Number(pct),
      },
      file_totals: {
        total: records.length,
        fully_migrated: fullyMigrated.length,
        partially_migrated: partiallyMigrated.length,
        unmigrated: unmigrated.length,
      },
      unmigrated: unmigrated.map((r) => r.path),
      partially_migrated: partiallyMigrated.map((r) => ({
        path: r.path,
        routed: r.routed_sites,
        direct: r.direct_sites,
      })),
      fully_migrated: fullyMigrated.map((r) => r.path),
    }
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(payload, null, 2) + "\n")
    console.log(`Snapshot written: ${SNAPSHOT_PATH}`)
  } catch (err) {
    console.warn(`(could not write snapshot: ${(err as Error).message})`)
  }

  console.log("")
  process.exit(0)
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length)
}
function padLeft(s: string, n: number): string {
  return s.length >= n ? s : " ".repeat(n - s.length) + s
}

main()
