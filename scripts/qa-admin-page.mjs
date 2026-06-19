#!/usr/bin/env node
/**
 * Admin Page QA Audit — automated static checks.
 *
 * Usage:
 *   node scripts/qa-admin-page.mjs <page-name>
 *   node scripts/qa-admin-page.mjs guests
 *   node scripts/qa-admin-page.mjs all
 *
 * Exits 0 on pass, 1 on errors (warnings do not fail the run).
 *
 * This is a heuristic static analyzer, not a type checker. It catches the
 * common classes of bugs that an LLM-assisted build is likely to miss:
 *
 *   - Admin API routes that forgot requireAdminAPI()
 *   - Server actions that forgot requireAdmin()
 *   - Empty catch {} blocks (silent failures)
 *   - fetch() calls that don't check res.ok
 *   - alert() / confirm() / window.location.reload()
 *   - Missing revalidatePath / invalidate after mutations
 *   - Next.js 16 params usage bugs
 *
 * Companion doc: scripts/ADMIN_QA_CHECKLIST.md
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, relative, resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

/* ──────────────────────────  Setup ─────────────────────────── */

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, "..")

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
}

const NO_COLOR = process.env.NO_COLOR || !process.stdout.isTTY
const col = (code, str) => (NO_COLOR ? str : `${code}${str}${C.reset}`)

/* ──────────────────────────  Args ──────────────────────────── */

const arg = process.argv[2]
if (!arg) {
  console.error(col(C.red, "error: missing page name"))
  console.error("")
  console.error("usage: node scripts/qa-admin-page.mjs <page-name>")
  console.error("       node scripts/qa-admin-page.mjs all")
  console.error("")
  console.error("available pages:")
  for (const p of listAdminPages()) console.error("  " + p)
  process.exit(2)
}

/* ──────────────────────────  File discovery ────────────────── */

function listAdminPages() {
  const adminDir = join(ROOT, "app/admin")
  if (!existsSync(adminDir)) return []
  return readdirSync(adminDir)
    .filter((name) => {
      const full = join(adminDir, name)
      return statSync(full).isDirectory() && !name.startsWith("_")
    })
    .sort()
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) walk(full, out)
    else if (/\.(tsx?|mjs|cjs)$/.test(entry)) out.push(full)
  }
  return out
}

function discoverPageFiles(page) {
  const ui = walk(join(ROOT, "app/admin", page))
  const api = walk(join(ROOT, "app/api/admin", page))
  return { ui, api, all: [...ui, ...api] }
}

/* ──────────────────────────  File helpers ──────────────────── */

function read(file) {
  return readFileSync(file, "utf-8")
}

function isClientComponent(src) {
  return /^\s*["']use client["']/m.test(src.split("\n").slice(0, 3).join("\n"))
}

function isServerFile(src) {
  return /^\s*["']use server["']/m.test(src.split("\n").slice(0, 3).join("\n"))
}

function isApiRoute(file) {
  return file.endsWith("/route.ts") || file.endsWith("/route.tsx")
}

function stripComments(src) {
  // Remove /* block comments */ and // line comments while preserving newlines
  // and character positions, so line numbers in `clean` still match the source.
  // Walks the source once, respecting string/template/regex boundaries to avoid
  // stripping comment-like content inside strings (e.g. "https://...").
  let out = ""
  let i = 0
  const n = src.length
  let inStr = null // '"' | "'" | '`'
  while (i < n) {
    const c = src[i]
    const next = src[i + 1]
    if (inStr) {
      out += c
      if (c === "\\" && i + 1 < n) {
        out += next
        i += 2
        continue
      }
      if (c === inStr) inStr = null
      i++
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      inStr = c
      out += c
      i++
      continue
    }
    if (c === "/" && next === "*") {
      // block comment — replace with spaces, preserve newlines
      const end = src.indexOf("*/", i + 2)
      const stop = end === -1 ? n : end + 2
      for (let k = i; k < stop; k++) {
        out += src[k] === "\n" ? "\n" : " "
      }
      i = stop
      continue
    }
    if (c === "/" && next === "/") {
      // line comment — replace with spaces until newline
      let k = i
      while (k < n && src[k] !== "\n") {
        out += " "
        k++
      }
      i = k
      continue
    }
    out += c
    i++
  }
  return out
}

function lineOf(src, index) {
  return src.slice(0, index).split("\n").length
}

/* ──────────────────────────  Reporter ──────────────────────── */

class Report {
  constructor(page) {
    this.page = page
    this.issues = [] // {sev, code, file, line, msg}
  }
  add(sev, code, file, line, msg) {
    this.issues.push({ sev, code, file: relative(ROOT, file), line, msg })
  }
  error(code, file, line, msg) {
    this.add("error", code, file, line, msg)
  }
  warn(code, file, line, msg) {
    this.add("warn", code, file, line, msg)
  }
  counts() {
    return {
      errors: this.issues.filter((i) => i.sev === "error").length,
      warnings: this.issues.filter((i) => i.sev === "warn").length,
    }
  }
  print() {
    const { errors, warnings } = this.counts()
    const title = `  QA Audit — ${this.page}  `
    console.log("")
    console.log(col(C.bold + C.cyan, "━".repeat(title.length)))
    console.log(col(C.bold + C.cyan, title))
    console.log(col(C.bold + C.cyan, "━".repeat(title.length)))

    if (this.issues.length === 0) {
      console.log("")
      console.log("  " + col(C.green, "✓ All automated checks passed."))
      console.log("")
      return
    }

    // Group by file
    const byFile = new Map()
    for (const issue of this.issues) {
      if (!byFile.has(issue.file)) byFile.set(issue.file, [])
      byFile.get(issue.file).push(issue)
    }

    console.log("")
    for (const [file, issues] of byFile) {
      console.log("  " + col(C.bold, file))
      issues.sort((a, b) => (a.line || 0) - (b.line || 0))
      for (const i of issues) {
        const tag =
          i.sev === "error"
            ? col(C.red, "error")
            : col(C.yellow, " warn")
        const loc = i.line ? col(C.gray, `:${i.line}`) : ""
        const code = col(C.dim, `[${i.code}]`)
        console.log(`    ${tag}${loc}  ${code} ${i.msg}`)
      }
      console.log("")
    }

    const e = errors > 0 ? col(C.red, `${errors} error${errors === 1 ? "" : "s"}`) : col(C.green, "0 errors")
    const w = warnings > 0 ? col(C.yellow, `${warnings} warning${warnings === 1 ? "" : "s"}`) : col(C.green, "0 warnings")
    console.log(`  ${e}, ${w}`)
    console.log("")
  }
}

/* ──────────────────────────  Checks ────────────────────────── */

/**
 * Each check is a function (file, src, report, context) => void.
 * `context` has: { page, isClient, isServer, isApi, clean (src without comments) }
 */

const CHECKS = []

function check(name, fn) {
  CHECKS.push({ name, fn })
}

/* 1. API routes must call requireAdminAPI() */

check("auth/api-requires-admin", ({ file, clean, isApi, report }) => {
  if (!isApi) return
  // Find HTTP handler exports (GET/POST/PUT/PATCH/DELETE/OPTIONS)
  const handlerRe = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS)\b/g
  let m
  while ((m = handlerRe.exec(clean))) {
    const method = m[1]
    const openIdx = findFunctionBodyBrace(clean, m.index + m[0].length)
    if (openIdx === -1) continue
    const body = extractBlock(clean, openIdx)
    if (body === null) continue
    // Accept requireAdminAPI() or requireRole('ROLE') — both authenticate the caller
    if (!/requireAdminAPI\s*\(/.test(body) && !/requireRole\s*\(/.test(body)) {
      report.error(
        "auth/api-requires-admin",
        file,
        lineOf(clean, m.index),
        `${method} handler is missing requireAdminAPI() / requireRole() — admin routes must authenticate before handling the request`,
      )
    }
  }
})

/* 2. Server actions must call requireAdmin() */

check("auth/action-requires-admin", ({ file, clean, isServer, report }) => {
  if (!isServer) return
  // Find every exported async function and check it contains requireAdmin(
  const fnRe = /export\s+async\s+function\s+(\w+)\s*\(/g
  let m
  while ((m = fnRe.exec(clean))) {
    const name = m[1]
    const nameEnd = m.index + "export async function ".length + name.length
    const openIdx = findFunctionBodyBrace(clean, nameEnd)
    if (openIdx === -1) continue
    const body = extractBlock(clean, openIdx)
    if (body === null) continue
    if (!/requireAdmin\s*\(/.test(body) && !/requireAdminAPI\s*\(/.test(body) && !/requireRole\s*\(/.test(body)) {
      // Downgrade to warning for functions that look like read-only getters
      const isGetter = /^get[A-Z]/.test(name)
      const msg = `server action '${name}' is missing requireAdmin() — unauthenticated callers can invoke this action`
      if (isGetter) report.warn("auth/action-requires-admin", file, lineOf(clean, m.index), msg)
      else report.error("auth/action-requires-admin", file, lineOf(clean, m.index), msg)
    }
  }
})

/* 3. No empty catch blocks */

check("silent/empty-catch", ({ file, src, isClient, report }) => {
  // Match catch blocks whose body is empty or comment-only
  const re = /catch\s*(?:\([^)]*\))?\s*\{([\s\S]*?)\}/g
  let m
  while ((m = re.exec(src))) {
    const body = m[1]
    const commentFree = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "").trim()
    if (commentFree !== "") continue
    const rawBody = body.trim()
    const hasComment = rawBody.length > 0
    // Client-side empty catches almost always indicate a UX bug (lost error
    // feedback). Server-side empty catches are sometimes intentional for
    // cleanup paths (e.g. file-not-found on unlink), but we still want the
    // author to acknowledge with an explanatory comment.
    if (isClient) {
      report.error(
        "silent/empty-catch",
        file,
        lineOf(src, m.index),
        `empty catch block in client component swallows errors silently — surface the error to the UI or log it`,
      )
    } else if (!hasComment) {
      report.error(
        "silent/empty-catch",
        file,
        lineOf(src, m.index),
        `empty catch block without explanation — at minimum add a comment stating why the error is being ignored, or log it`,
      )
    } else {
      report.warn(
        "silent/empty-catch",
        file,
        lineOf(src, m.index),
        `empty catch block (has comment) — consider adding a console.debug so the ignored error is observable during development`,
      )
    }
  }
})

/* 4. fetch() without res.ok check */

check("silent/unchecked-fetch", ({ file, clean, isClient, report }) => {
  if (!isClient) return
  // Find each 'await fetch(' and look for a .ok check within the next ~40 lines
  // in the same block.
  const re = /await\s+fetch\s*\(/g
  let m
  while ((m = re.exec(clean))) {
    const start = m.index
    const window = clean.slice(start, start + 1500)
    // Heuristic: must contain either res.ok, response.ok, result.ok,
    // .ok (on a named variable), or throw, or a try-catch that wraps it.
    const hasOkCheck =
      /\b\w+\.ok\b/.test(window) ||
      /throw\s+/.test(window) ||
      /response\.status/.test(window) ||
      /catch\s*\(/.test(window.slice(0, 800))
    if (!hasOkCheck) {
      report.error(
        "silent/unchecked-fetch",
        file,
        lineOf(clean, start),
        `fetch() call is not followed by a res.ok / response.ok check — network errors and 4xx/5xx will silently fail`,
      )
    }
  }
})

/* 5. No alert() / confirm() in client components */

check("ux/no-alert", ({ file, clean, isClient, report }) => {
  if (!isClient) return
  const patterns = [
    { re: /\balert\s*\(/g, name: "alert()" },
    { re: /\bconfirm\s*\(/g, name: "confirm()" },
    { re: /\bprompt\s*\(/g, name: "prompt()" },
  ]
  for (const { re, name } of patterns) {
    let m
    while ((m = re.exec(clean))) {
      report.error(
        "ux/no-alert",
        file,
        lineOf(clean, m.index),
        `${name} blocks the UI thread and breaks RTL / a11y — use in-app toast or a confirmation dialog`,
      )
    }
  }
})

/* 6. No window.location.reload / window.location.href in client components */

check("ux/no-location-mutation", ({ file, clean, isClient, report }) => {
  if (!isClient) return
  let m
  const reloadRe = /window\.location\.reload\s*\(/g
  while ((m = reloadRe.exec(clean))) {
    report.error(
      "ux/no-location-mutation",
      file,
      lineOf(clean, m.index),
      `window.location.reload() does a full page reload — use router.refresh() from next/navigation instead`,
    )
  }
  const hrefRe = /window\.location\.href\s*=/g
  while ((m = hrefRe.exec(clean))) {
    report.error(
      "ux/no-location-mutation",
      file,
      lineOf(clean, m.index),
      `window.location.href = ... causes a full page reload — use router.push() for in-app navigation`,
    )
  }
})

/* 7. Next.js 16 params must be destructured, not comment-consumed */

check("next/params-destructured", ({ file, src, isApi, report }) => {
  if (!isApi) return
  const re = /await\s+params\s*\/\/\s*consume/gi
  let m
  while ((m = re.exec(src))) {
    report.error(
      "next/params-destructured",
      file,
      lineOf(src, m.index),
      `'await params' without destructuring is a code smell — destructure the params you need (const { id } = await params)`,
    )
  }
})

/* 8. Mutating routes / actions should invalidate caches */

check("persistence/mutation-revalidates", ({ file, clean, isApi, isServer, report }) => {
  if (!(isApi || isServer)) return
  // Find mutation methods only
  const mutationRe = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/g
  let m
  while ((m = mutationRe.exec(clean))) {
    const method = m[1]
    const openIdx = findFunctionBodyBrace(clean, m.index + m[0].length)
    if (openIdx === -1) continue
    const body = extractBlock(clean, openIdx)
    if (body === null) continue
    const hasRevalidate = /revalidatePath\s*\(|revalidateTag\s*\(|invalidate\s*\(|invalidateEpisodeCache\s*\(|revalidateStudio\s*\(/.test(body)
    if (!hasRevalidate) {
      report.warn(
        "persistence/mutation-revalidates",
        file,
        lineOf(clean, m.index),
        `${method} handler does not call revalidatePath / invalidate — cached UI may show stale data after this mutation`,
      )
    }
  }

  if (isServer) {
    // Heuristic for server actions: any exported async function that contains
    // .insert( / .update( / .delete( from drizzle and does not revalidate.
    const fnRe = /export\s+async\s+function\s+(\w+)\s*\(/g
    let fm
    while ((fm = fnRe.exec(clean))) {
      const name = fm[1]
      const nameEnd = fm.index + "export async function ".length + name.length
      const openIdx = findFunctionBodyBrace(clean, nameEnd)
      if (openIdx === -1) continue
      const body = extractBlock(clean, openIdx)
      if (body === null) continue
      const looksMutating = /\.(insert|update|delete)\s*\(/.test(body)
      if (!looksMutating) continue
      const hasRevalidate = /revalidatePath\s*\(|revalidateTag\s*\(|invalidate\s*\(|invalidateEpisodeCache\s*\(|revalidateStudio\s*\(/.test(body)
      if (!hasRevalidate) {
        report.warn(
          "persistence/mutation-revalidates",
          file,
          lineOf(clean, fm.index),
          `server action '${name}' looks like it mutates data but does not revalidate caches — public pages may show stale content`,
        )
      }
    }
  }
})

/* 9. No console.log in admin code */

check("hygiene/no-console-log", ({ file, clean, report }) => {
  const re = /console\.log\s*\(/g
  let m
  while ((m = re.exec(clean))) {
    report.warn(
      "hygiene/no-console-log",
      file,
      lineOf(clean, m.index),
      `console.log leaks into production — use console.info or console.error deliberately, or remove before merging`,
    )
  }
})

/* 10. No 'any' types */

check("types/no-any", ({ file, clean, report }) => {
  const re = /:\s*any\b(?!\w)/g
  let m
  while ((m = re.exec(clean))) {
    // Skip common acceptable cases: catch (e: any), Record<string, any>
    const before = clean.slice(Math.max(0, m.index - 40), m.index)
    if (/catch\s*\(\s*\w+\s*$/.test(before)) continue
    if (/Record<[^>]*$/.test(before)) continue
    report.warn(
      "types/no-any",
      file,
      lineOf(clean, m.index),
      `'any' type annotation — prefer a specific type or 'unknown' with a narrower check`,
    )
  }
})

/* 11. No @ts-ignore / @ts-expect-error without justification */

check("types/no-ts-ignore", ({ file, src, report }) => {
  const re = /@ts-(ignore|expect-error)\b([^\n]*)/g
  let m
  while ((m = re.exec(src))) {
    const justification = m[2].trim()
    if (!justification) {
      report.warn(
        "types/no-ts-ignore",
        file,
        lineOf(src, m.index),
        `@ts-${m[1]} without justification — add an inline comment explaining why`,
      )
    }
  }
})

/* 12. Raw SQL string interpolation */

check("security/no-sql-interpolation", ({ file, clean, report }) => {
  // Only flag templates that look like real SQL statements.
  // Requires: a SQL verb at the start of the template (after optional whitespace)
  // AND a companion keyword (FROM / INTO / SET / VALUES / WHERE) somewhere in the body
  // AND an interpolation ${...}. This avoids false positives from log strings or
  // className templates that happen to contain words like "select-none" or "UPDATE".
  const re = /`(\s*)(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WITH)\b([^`]*)`/gi
  let m
  while ((m = re.exec(clean))) {
    const body = m[3] || ""
    if (!body.includes("${")) continue
    if (!/\b(FROM|INTO|SET|VALUES|WHERE|JOIN)\b/i.test(body)) continue
    // Allow drizzle's sql`` template (which is safe) — check for preceding 'sql'
    const before = clean.slice(Math.max(0, m.index - 10), m.index)
    if (/\bsql\s*$/.test(before)) continue
    report.error(
      "security/no-sql-interpolation",
      file,
      lineOf(clean, m.index),
      `raw SQL template with interpolation — use drizzle query builder or sql\`\` with parameterized placeholders`,
    )
  }
})

/* 13. No .env key references outside of env-loading code */

check("security/no-hardcoded-secrets", ({ file, src, report }) => {
  // Look for strings that look like API keys
  const patterns = [
    { re: /sk-[A-Za-z0-9]{20,}/g, kind: "OpenAI API key" },
    { re: /re_[A-Za-z0-9]{20,}/g, kind: "Resend API key" },
    { re: /AIza[0-9A-Za-z_-]{30,}/g, kind: "Google API key" },
  ]
  for (const { re, kind } of patterns) {
    let m
    while ((m = re.exec(src))) {
      report.error(
        "security/no-hardcoded-secrets",
        file,
        lineOf(src, m.index),
        `possible hardcoded ${kind} — move to .env and read via process.env`,
      )
    }
  }
})

/* ──────────────────────────  Helpers ───────────────────────── */

/**
 * Find the start of a function body given the position of `function NAME`.
 * Walks past the parameter list (balancing parens) and any optional return
 * type annotation, returning the index of the function's opening `{`.
 *
 * Handles complex return types like:
 *   - Promise<{ success: boolean }>
 *   - Array<Record<string, { x: T }>>
 *   - Generator types and nested generics
 *
 * Returns -1 if not found.
 */
function findFunctionBodyBrace(src, fnNameEndIdx) {
  let i = fnNameEndIdx
  // Find the opening '(' of the parameter list
  while (i < src.length && src[i] !== "(") {
    if (!/[\s<>,A-Za-z0-9_]/.test(src[i])) return -1
    i++
  }
  if (src[i] !== "(") return -1

  // Balance the parameter parens
  let depth = 0
  let inString = null
  for (; i < src.length; i++) {
    const c = src[i]
    if (inString) {
      if (c === "\\") { i++; continue }
      if (c === inString) inString = null
      continue
    }
    if (c === '"' || c === "'" || c === "`") { inString = c; continue }
    if (c === "(") depth++
    else if (c === ")") {
      depth--
      if (depth === 0) { i++; break }
    }
  }

  // Now look for the function body '{'. Track generic, paren, and type-literal
  // brace depth. A `{` at all-zero depth is either the function body or the
  // start of a type literal in the return type.
  let gDepth = 0
  let pDepth = 0
  let tDepth = 0 // type literal brace depth
  inString = null
  for (; i < src.length; i++) {
    const c = src[i]
    if (inString) {
      if (c === "\\") { i++; continue }
      if (c === inString) inString = null
      continue
    }
    if (c === '"' || c === "'" || c === "`") { inString = c; continue }
    if (c === "<") gDepth++
    else if (c === ">") { if (gDepth > 0) gDepth-- }
    else if (c === "(") pDepth++
    else if (c === ")") { if (pDepth > 0) pDepth-- }
    else if (c === "{") {
      if (gDepth > 0 || pDepth > 0 || tDepth > 0) {
        if (tDepth > 0) tDepth++
        continue
      }
      // At top-level {. Decide if it's a type literal or the function body.
      const rest = src.slice(i + 1, i + 120).trimStart()
      const looksLikeTypeLiteral =
        /^[\w$]+\s*[?:]/.test(rest) ||
        /^readonly\s/.test(rest) ||
        /^\[[\w$]+/.test(rest) ||
        /^\}/.test(rest)
      if (looksLikeTypeLiteral) {
        tDepth = 1
        continue
      }
      return i
    } else if (c === "}") {
      if (tDepth > 0) tDepth--
    }
  }
  return -1
}

/**
 * Given source code and the index of an opening '{', return the substring
 * of the matching block (excluding the outer braces), or null if unbalanced.
 */
function extractBlock(src, openIdx) {
  if (src[openIdx] !== "{") return null
  let depth = 0
  let inString = null // '"' | "'" | "`"
  let inLineComment = false
  let inBlockComment = false
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i]
    const next = src[i + 1]
    if (inLineComment) {
      if (c === "\n") inLineComment = false
      continue
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false
        i++
      }
      continue
    }
    if (inString) {
      if (c === "\\") {
        i++
        continue
      }
      if (c === inString) inString = null
      continue
    }
    if (c === "/" && next === "/") {
      inLineComment = true
      i++
      continue
    }
    if (c === "/" && next === "*") {
      inBlockComment = true
      i++
      continue
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c
      continue
    }
    if (c === "{") depth++
    else if (c === "}") {
      depth--
      if (depth === 0) return src.slice(openIdx + 1, i)
    }
  }
  return null
}

/* ──────────────────────────  Runner ────────────────────────── */

function auditPage(page) {
  const report = new Report(page)
  const { all } = discoverPageFiles(page)

  if (all.length === 0) {
    console.log("")
    console.log(col(C.yellow, `  no files found for admin page '${page}'`))
    console.log(col(C.gray, `  searched: app/admin/${page}/**, app/api/admin/${page}/**`))
    console.log("")
    return report
  }

  for (const file of all) {
    const src = read(file)
    const clean = stripComments(src)
    const ctx = {
      file,
      src,
      clean,
      isClient: isClientComponent(src),
      isServer: isServerFile(src),
      isApi: isApiRoute(file),
      page,
      report,
    }
    for (const { fn } of CHECKS) {
      try {
        fn(ctx)
      } catch (err) {
        console.error(
          col(C.red, `internal error in check for ${relative(ROOT, file)}:`),
          err,
        )
      }
    }
  }

  // Summary of what was audited
  console.log("")
  console.log(col(C.dim, `  Audited ${all.length} file(s) under:`))
  console.log(col(C.dim, `    app/admin/${page}`))
  console.log(col(C.dim, `    app/api/admin/${page}`))

  report.print()
  return report
}

/* ──────────────────────────  Main ──────────────────────────── */

const pages = arg === "all" ? listAdminPages() : [arg]
const summaries = []
let totalErrors = 0
let totalWarnings = 0

for (const page of pages) {
  const report = auditPage(page)
  const { errors, warnings } = report.counts()
  summaries.push({ page, errors, warnings, files: discoverPageFiles(page).all.length })
  totalErrors += errors
  totalWarnings += warnings
}

if (pages.length > 1) {
  console.log("")
  console.log(col(C.bold + C.cyan, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"))
  console.log(col(C.bold + C.cyan, "  Summary"))
  console.log(col(C.bold + C.cyan, "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"))
  console.log("")
  const padPage = Math.max(...summaries.map((s) => s.page.length), 6)
  console.log(
    "  " +
      col(C.dim, "page".padEnd(padPage)) +
      "  " +
      col(C.dim, "files") +
      "  " +
      col(C.dim, "errors") +
      "  " +
      col(C.dim, "warnings"),
  )
  for (const s of summaries) {
    const errCol = s.errors > 0 ? C.red : C.green
    const warnCol = s.warnings > 0 ? C.yellow : C.green
    console.log(
      "  " +
        s.page.padEnd(padPage) +
        "  " +
        String(s.files).padStart(5) +
        "  " +
        col(errCol, String(s.errors).padStart(6)) +
        "  " +
        col(warnCol, String(s.warnings).padStart(8)),
    )
  }
  console.log("")
  const eColor = totalErrors > 0 ? C.red : C.green
  const wColor = totalWarnings > 0 ? C.yellow : C.green
  console.log(
    `  total: ${col(eColor, totalErrors + " error" + (totalErrors === 1 ? "" : "s"))}, ${col(wColor, totalWarnings + " warning" + (totalWarnings === 1 ? "" : "s"))}`,
  )
  console.log("")
}

process.exit(totalErrors > 0 ? 1 : 0)
