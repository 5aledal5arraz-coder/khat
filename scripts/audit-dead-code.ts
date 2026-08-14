/**
 * Inventory of what is dead or disconnected: files nothing imports, exports
 * nothing calls, and public routes nothing links to.
 *
 * REPORTS, NEVER DELETES. This codebase has already been burned once by the
 * opposite assumption: `timestamps`, `resources` and `episodes.summary` were
 * declared dead schema because nothing wrote to them — and they ARE read, as a
 * live fallback. A thing with no writer is not a thing with no reader, and a
 * file with no static import may still be reached by a route convention, a
 * dynamic `import()`, or a script.
 *
 * So every finding here is a QUESTION, and the script says which ones it
 * already knows the answer to.
 *
 *   npx tsx scripts/audit-dead-code.ts
 */

import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative, extname } from "node:path"

const ROOT = process.cwd()
const SKIP = new Set([
  "node_modules", ".next", ".git", "outputs", "scratchpad", "public",
  "drizzle", "data", ".claude", "khat-backups", "evals",
])

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (SKIP.has(e) || e.startsWith(".")) continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if ([".ts", ".tsx"].includes(extname(e))) out.push(p)
  }
  return out
}

/**
 * Next.js reaches these by convention, not by import. Treating them as
 * unreferenced would bury the real findings under a hundred false ones.
 */
const CONVENTION = /(^|\/)(page|layout|route|loading|error|not-found|global-error|template|default|sitemap|manifest|opengraph-image|icon|apple-icon|middleware|instrumentation|proxy)\.tsx?$/

const isTest = (f: string) => /\/tests?\//.test(f) || /\.test\.tsx?$/.test(f)
const isScript = (f: string) => /\/scripts\//.test(f)

function main() {
  const files = walk(ROOT)
  const rel = (f: string) => relative(ROOT, f)
  const src = new Map(files.map((f) => [f, readFileSync(f, "utf8")]))

  // ─── 1. files nothing imports ────────────────────────────────────────────
  // Resolve EVERY specifier to a repo-relative path. The first version only
  // collected the raw strings, so `import "./handlers/demo"` in registered.ts
  // never matched `lib/jobs/handlers/demo.ts` and all nine job handlers were
  // reported dead — while CLAUDE.md documents that exact side-effect import.
  const importedPaths = new Set<string>()
  const addSpec = (fromFile: string, spec: string) => {
    if (spec.startsWith("@/")) { importedPaths.add(spec.slice(2)); return }
    if (spec.startsWith(".")) {
      const dir = relative(ROOT, join(fromFile, ".."))
      const parts = (dir + "/" + spec).split("/")
      const stack: string[] = []
      for (const seg of parts) {
        if (seg === "." || seg === "") continue
        if (seg === "..") stack.pop()
        else stack.push(seg)
      }
      importedPaths.add(stack.join("/"))
      return
    }
    importedPaths.add(spec)
  }
  for (const [f, text] of src) {
    for (const m of text.matchAll(/from\s+["']([^"']+)["']/g)) addSpec(f, m[1])
    for (const m of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) addSpec(f, m[1])
    for (const m of text.matchAll(/^import\s+["']([^"']+)["']/gm)) addSpec(f, m[1])
  }
  const orphanFiles: string[] = []
  for (const f of files) {
    const r = rel(f)
    if (CONVENTION.test(r) || isTest(f) || isScript(f)) continue
    const noExt = r.replace(/\.tsx?$/, "")
    const hit =
      importedPaths.has(noExt) ||
      importedPaths.has(noExt.replace(/\/index$/, "")) ||
      importedPaths.has(noExt + "/index")
    if (!hit) orphanFiles.push(r)
  }

  // ─── 2. exports nothing else mentions ────────────────────────────────────
  const orphanExports: { file: string; name: string }[] = []
  for (const [f, text] of src) {
    if (isTest(f) || isScript(f)) continue
    const r = rel(f)
    for (const m of text.matchAll(/^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm)) {
      const name = m[1]
      // `default` exports and React components reached by convention are noise.
      if (CONVENTION.test(r) && /^(default|Page|Layout|GET|POST|PUT|PATCH|DELETE)$/.test(name)) continue
      // Usage inside the declaring file counts. `ARCHIVE_MONO` is consumed by
      // the registry two lines below its own declaration; calling that dead
      // would be the audit inventing work.
      const own = text.split(new RegExp(`\\b${name}\\b`)).length - 1
      if (own > 1) continue
      let seen = 0
      for (const [g, t] of src) {
        if (g === f) continue
        if (new RegExp(`\\b${name}\\b`).test(t)) { seen++; break }
      }
      if (!seen) orphanExports.push({ file: r, name })
    }
  }

  // ─── 3. public routes nothing links to ───────────────────────────────────
  const routes: string[] = []
  for (const f of files) {
    const r = rel(f)
    if (!/^app\/.*\/page\.tsx$/.test(r) && r !== "app/page.tsx") continue
    if (r.startsWith("app/admin/")) continue
    const route =
      "/" + r.replace(/^app\//, "").replace(/\/page\.tsx$/, "").replace(/\(.*?\)\//g, "")
    routes.push(route === "/" ? "/" : route.replace(/\/$/, ""))
  }
  const allText = [...src.values()].join("\n")
  const unlinked = routes.filter((rt) => {
    // Route GROUPS — `(home)`, `(list)` — are not URL segments at all; a path
    // still carrying parentheses is my own derivation leaking, not a route.
    if (rt === "/" || /\[/.test(rt) || /[()]/.test(rt)) return false
    // A link is written three ways in this codebase: `href="/x"` in JSX,
    // `href: "/x"` in a nav config array, and `push("/x")`. Matching only the
    // first reported every nav-config route as unlinked.
    const esc = rt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    return !new RegExp(`href[=:]\\s*["'\`]${esc}(["'\`/?#])|push\\(\\s*["'\`]${esc}["'\`]`).test(allText)
  })

  const show = (title: string, rows: string[], note?: string) => {
    console.log(`\n${title}  (${rows.length})`)
    if (note) console.log(`  ${note}`)
    console.log("─".repeat(74))
    if (!rows.length) { console.log("  none"); return }
    for (const r of rows.slice(0, 40)) console.log("  " + r)
    if (rows.length > 40) console.log(`  … and ${rows.length - 40} more`)
  }

  console.log(`scanned ${files.length} .ts/.tsx files`)
  show("FILES no other file imports", orphanFiles,
    "a route convention or a dynamic import can still reach these — verify before touching")
  show("EXPORTS whose name appears in no other file", orphanExports.map((o) => `${o.file}  →  ${o.name}`),
    "same caveat: a string-keyed registry or a re-export can hide a real caller")
  show("PUBLIC ROUTES nothing links to", unlinked,
    "may still be reachable by a typed URL, a redirect, or an email link")
}

main()
