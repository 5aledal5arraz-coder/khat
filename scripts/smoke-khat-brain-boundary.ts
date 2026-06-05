/**
 * Boundary smoke — Wave 3 + 4.
 *
 * Locks in the deletion of the legacy `app/admin/khat-map` route shell
 * (Wave 3) and the script-hygiene cleanup (Wave 4).
 *
 *   1. `app/admin/khat-map` (and `app/admin/khat-map/v2`) no longer
 *      exist on disk.
 *   2. No production file under `app/admin/**` imports anything from
 *      `app/admin/khat-map/v2/*` (allowed: `@/lib/khat-map/v2/*` engine
 *      library — kept intentionally per Wave 2/3 brief).
 *   3. `next.config.ts` declares server-side redirects so legacy URLs
 *      still resolve to the canonical Khat Brain destinations:
 *        - `/admin/khat-map`              → `/admin/khat-brain/seasons`
 *        - `/admin/khat-map/v2`           → `/admin/khat-brain/seasons/new`
 *        - `/admin/khat-map/v2/:seasonId` → `/admin/khat-brain/seasons/:seasonId`
 *   4. (Wave 4) No `package.json` script entry points at a script that
 *      no longer exists on disk.
 *   5. (Wave 4) No active smoke under `scripts/smoke-*.ts` imports any
 *      file from `scripts/_archive/**` (the archive is read-only history;
 *      live smokes must not depend on it).
 *   6. (Wave 4) The official Khat Brain season routes still own season
 *      creation + season workspace (no other admin route claims them).
 */

import { promises as fs } from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "..")
const FORBIDDEN_DIRS = [
  path.join(REPO_ROOT, "app/admin/khat-map"),
  path.join(REPO_ROOT, "app/admin/khat-map/v2"),
]
const SCAN_ROOT = path.join(REPO_ROOT, "app/admin")
const FORBIDDEN_PATTERNS = [
  /from ["']@\/app\/admin\/khat-map\/v2/,
  /from ["']\.{1,2}\/.*khat-map\/v2/,
  /import\(\s*["']@\/app\/admin\/khat-map\/v2/,
]
const REQUIRED_REDIRECTS: Array<{ source: string; destination: string }> = [
  {
    source: '/admin/khat-map"',
    destination: '/admin/khat-brain/seasons"',
  },
  {
    source: '/admin/khat-map/v2"',
    destination: '/admin/khat-brain/seasons/new"',
  },
  {
    source: '/admin/khat-map/v2/:seasonId"',
    destination: '/admin/khat-brain/seasons/:seasonId"',
  },
]

async function exists(p: string): Promise<boolean> {
  try {
    await fs.stat(p)
    return true
  } catch {
    return false
  }
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = []
  const entries = await fs.readdir(dir, { withFileTypes: true })
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...(await walk(full)))
    } else if (/\.(tsx?|mts|cts)$/.test(e.name)) {
      out.push(full)
    }
  }
  return out
}

async function main() {
  console.log("\n🔬 Boundary Smoke (Wave 3 + 4) — route shell deleted, scripts hygienic\n")

  let pass = 0
  let fail = 0

  // ── 1. Folder absence ──────────────────────────────────────────────
  for (const d of FORBIDDEN_DIRS) {
    if (await exists(d)) {
      fail++
      console.log(`❌ Forbidden directory still exists: ${path.relative(REPO_ROOT, d)}`)
    } else {
      pass++
      console.log(`✅ Absent: ${path.relative(REPO_ROOT, d)}`)
    }
  }

  // ── 2. No production imports ───────────────────────────────────────
  const files = await walk(SCAN_ROOT)
  let scanned = 0
  const offenders: Array<{ file: string; line: number; text: string }> = []
  for (const file of files) {
    const src = await fs.readFile(file, "utf8")
    const lines = src.split("\n")
    scanned++
    lines.forEach((line, i) => {
      if (FORBIDDEN_PATTERNS.some((p) => p.test(line))) {
        offenders.push({
          file: path.relative(REPO_ROOT, file),
          line: i + 1,
          text: line.trim(),
        })
      }
    })
  }
  if (offenders.length === 0) {
    pass++
    console.log(`✅ Scanned ${scanned} files under app/admin — 0 imports of khat-map/v2.`)
  } else {
    fail++
    console.log(`❌ ${offenders.length} forbidden import(s) under app/admin:`)
    for (const o of offenders) {
      console.log(`   ${o.file}:${o.line}  →  ${o.text}`)
    }
  }

  // ── 3. Redirect contract ───────────────────────────────────────────
  const cfg = await fs.readFile(path.join(REPO_ROOT, "next.config.ts"), "utf8")
  for (const r of REQUIRED_REDIRECTS) {
    const sourceOk = cfg.includes(`source: "${r.source}`)
    const destOk = cfg.includes(`destination: "${r.destination}`)
    if (sourceOk && destOk) {
      pass++
      console.log(`✅ Redirect: ${r.source.replace(/"$/, "")} → ${r.destination.replace(/"$/, "")}`)
    } else {
      fail++
      console.log(
        `❌ Missing redirect rule: source ${r.source} → destination ${r.destination} (sourceOk=${sourceOk}, destOk=${destOk})`,
      )
    }
  }

  // ── 4. (Wave 4) package.json scripts point at existing files ───────
  const pkg = JSON.parse(
    await fs.readFile(path.join(REPO_ROOT, "package.json"), "utf8"),
  ) as { scripts?: Record<string, string> }
  const danglingScripts: Array<{ name: string; cmd: string; missing: string }> = []
  for (const [name, cmd] of Object.entries(pkg.scripts ?? {})) {
    const match = cmd.match(/scripts\/[\w./-]+\.(ts|mjs|cjs|js|sh)/)
    if (!match) continue
    const target = path.join(REPO_ROOT, match[0])
    if (!(await exists(target))) {
      danglingScripts.push({ name, cmd, missing: match[0] })
    }
  }
  if (danglingScripts.length === 0) {
    pass++
    console.log(
      `✅ All ${Object.keys(pkg.scripts ?? {}).length} package.json scripts resolve to existing files.`,
    )
  } else {
    fail++
    console.log(`❌ ${danglingScripts.length} package.json script(s) point at missing files:`)
    for (const d of danglingScripts) {
      console.log(`   ${d.name}  →  ${d.missing}`)
    }
  }

  // ── 5. (Wave 4) No active smoke imports from scripts/_archive ──────
  const scriptsDir = path.join(REPO_ROOT, "scripts")
  const activeScripts = (await fs.readdir(scriptsDir, { withFileTypes: true }))
    .filter((e) => e.isFile() && /\.(tsx?|mjs|cjs|js)$/.test(e.name))
    .map((e) => path.join(scriptsDir, e.name))
  const archiveLeak: Array<{ file: string; line: number; text: string }> = []
  for (const file of activeScripts) {
    const src = await fs.readFile(file, "utf8")
    src.split("\n").forEach((line, i) => {
      if (/_archive\//.test(line) && /(import|require)/.test(line)) {
        archiveLeak.push({
          file: path.relative(REPO_ROOT, file),
          line: i + 1,
          text: line.trim(),
        })
      }
    })
  }
  if (archiveLeak.length === 0) {
    pass++
    console.log(`✅ Scanned ${activeScripts.length} active scripts — none import from scripts/_archive.`)
  } else {
    fail++
    console.log(`❌ ${archiveLeak.length} active script(s) import from scripts/_archive:`)
    for (const o of archiveLeak) {
      console.log(`   ${o.file}:${o.line}  →  ${o.text}`)
    }
  }

  // ── 6. (Wave 4) Khat Brain owns the season routes ─────────────────
  const seasonsHome = path.join(REPO_ROOT, "app/admin/khat-brain/seasons/page.tsx")
  const seasonsNew = path.join(REPO_ROOT, "app/admin/khat-brain/seasons/new/page.tsx")
  const seasonWorkspace = path.join(
    REPO_ROOT,
    "app/admin/khat-brain/seasons/[seasonId]/page.tsx",
  )
  for (const f of [seasonsHome, seasonsNew, seasonWorkspace]) {
    if (await exists(f)) {
      pass++
      console.log(`✅ Owned by khat-brain: ${path.relative(REPO_ROOT, f)}`)
    } else {
      fail++
      console.log(`❌ Missing canonical route: ${path.relative(REPO_ROOT, f)}`)
    }
  }

  console.log(`\n${fail === 0 ? "🎉" : "💥"} ${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error("Boundary smoke crashed:", err)
  process.exit(1)
})
