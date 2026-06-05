/**
 * Editorial Intelligence — operator-surface audit.
 *
 * Scans every operator-visible client/page file in the editorial
 * intelligence surface and asserts:
 *   • No internal job names, table names, or implementation words
 *   • No English JSX text in market intelligence UI (translations only)
 *   • No قُبل/رُفض verbs used to narrate AI auto-filter (those are
 *     reserved for human wizard clicks)
 *
 * Server-action files (.ts under _components that import "use server")
 * are excluded — they reference job names legitimately and don't ship
 * to the browser.
 */

import { promises as fs } from "node:fs"
import path from "node:path"

const REPO_ROOT = path.resolve(__dirname, "..")
const failures: string[] = []

function stripComments(src: string): string {
  const jsxBlock = new RegExp("\\{\\s*\\/\\*[\\s\\S]*?\\*\\/\\s*\\}", "g")
  const block = new RegExp("\\/\\*[\\s\\S]*?\\*\\/", "g")
  const line = new RegExp("(^|[^:])\\/\\/[^\\n]*", "g")
  return src.replace(jsxBlock, "").replace(block, "").replace(line, "$1")
}

function stripImports(src: string): string {
  return src.replace(/^import.+$/gm, "")
}

/** Strings forbidden in operator-visible files (post comment+import
 *  strip). These are job names + operational verbs + tells the
 *  operator UI must never expose. Column/table names that legitimately
 *  appear as TS property accesses (e.g. `signal.score_components`,
 *  `signal.review_status`) are NOT in this list — they're data, not
 *  user-visible text. */
const FORBIDDEN_INTERNAL = [
  "market.collect",
  "market.extract",
  "market.cluster_signals",
  "market.score_signals",
  "market.scheduler",
  "market.taste_decay",
  "raw_signals",
  "raw_signals_fallback",
  "ingestion",
  "pipeline",
  "ai_runs",
]
/** Same as above but checked only as quoted/JSX-text occurrences. A
 *  bare property access like `signal.score_components` is fine; a
 *  string literal `"score_components"` or JSX text "score_components"
 *  is a leak. */
const FORBIDDEN_AS_LITERAL = [
  "score_components",
  "market_topic_signals",
  "market_topic_clusters",
  "editorial_taste_weights",
  "market_signal_review_events",
  "market_trusted_sources",
  "scheduler",
]

/** Operator-visible client / page files. Server actions excluded —
 *  they import job names but only their RETURN VALUES reach the UI. */
const OPERATOR_FILES = [
  // Phase 2 — review queue
  "app/admin/khat-brain/market/signals/page.tsx",
  "app/admin/khat-brain/market/signals/_components/copy.ts",
  "app/admin/khat-brain/market/signals/_components/signals-client.tsx",
  // Phase 3 — trusted sources
  "app/admin/khat-brain/market/sources/page.tsx",
  "app/admin/khat-brain/market/sources/_components/copy.ts",
  "app/admin/khat-brain/market/sources/_components/sources-client.tsx",
  // Phase 4 — manual signal form
  "app/admin/khat-brain/market/signals/_components/manual-signal-form.tsx",
  // Phase 5 — score badge + explanation + refresh button
  "app/admin/khat-brain/market/signals/_components/score-explanation.ts",
  "app/admin/khat-brain/market/signals/_components/refresh-scoring-button.tsx",
  // Phase 6 — hybrid path badges
  "app/admin/khat-brain/seasons/[seasonId]/_components/hybrid-button.tsx",
  // Sidebar (operator nav)
  "app/admin/components/admin-sidebar.tsx",
]

function check(cond: unknown, msg: string): void {
  if (cond) {
    console.log(`  ✅ ${msg}`)
  } else {
    console.log(`  ❌ ${msg}`)
    failures.push(msg)
  }
}

async function main() {
  console.log("\n🔬 OPERATOR-SURFACE AUDIT — editorial intelligence\n")

  for (const f of OPERATOR_FILES) {
    const exists = await fs
      .access(path.join(REPO_ROOT, f))
      .then(() => true)
      .catch(() => false)
    if (!exists) {
      check(false, `file missing: ${f}`)
      continue
    }
    const raw = await fs.readFile(path.join(REPO_ROOT, f), "utf8")
    const code = stripImports(stripComments(raw))

    // 1. Always-banned internal terms.
    for (const banned of FORBIDDEN_INTERNAL) {
      if (code.includes(banned)) {
        check(false, `${f} leaks internal term "${banned}"`)
      }
    }
    // 1b. Banned only as quoted/JSX-text — not as TS property accesses.
    for (const banned of FORBIDDEN_AS_LITERAL) {
      // Match the banned string when it's NOT preceded by a `.` (which
      // would be a property access on a typed row object).
      const re = new RegExp(`(?<![.\\w])${banned.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`, "g")
      const hits = code.match(re) ?? []
      // Allow inside double/single quotes when the surrounding context
      // is clearly a SQL fragment in a server-side file… but operator
      // files don't write SQL, so any literal hit is a leak.
      if (hits.length > 0) {
        check(false, `${f} surfaces "${banned}" as a literal/text (not just a TS field)`)
      }
    }

    // 2. قُبل / رُفض narrating AI auto-filter
    if (code.includes("قُبل") || code.includes("رُفض")) {
      check(false, `${f} uses قُبل/رُفض — reserved for human wizard clicks`)
    }

    // 3. English JSX text (informal heuristic: ASCII Latin words inside JSX>
    //    text nodes that aren't React identifiers, CSS classes, or imports).
    //    We scan for lines that contain Arabic AND English words at JSX
    //    text positions. Simple rule: if a line contains an Arabic letter
    //    and ALSO an English word ≥ 4 chars not inside a className/data-/
    //    href/title, flag it.
    const arabicRange = /[\u0600-\u06FF]/
    const lines = code.split("\n")
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!arabicRange.test(line)) continue
      // Skip lines that are purely className or attribute soup.
      const cleaned = line
        .replace(/className=\{[^}]*\}/g, "")
        .replace(/className="[^"]*"/g, "")
        .replace(/data-[\w-]+(?:=\{[^}]*\}|="[^"]*")?/g, "")
        .replace(/href=\{[^}]*\}/g, "")
        .replace(/href="[^"]*"/g, "")
        .replace(/title=\{[^}]*\}/g, "")
        .replace(/aria-[\w-]+="[^"]*"/g, "")
        .replace(/[A-Z][A-Z_0-9]+/g, "") // SCREAMING_SNAKE constants
      // Look for ≥4-char ASCII-only words that aren't React identifiers.
      const englishWords = cleaned.match(/\b[A-Za-z]{4,}\b/g) ?? []
      const significant = englishWords.filter(
        (w) =>
          ![
            "true",
            "false",
            "null",
            "undefined",
            "const",
            "type",
            "import",
            "from",
            "export",
            "return",
            "props",
            "children",
            "default",
            "Boolean",
            "Number",
            "String",
            "Array",
            "Object",
            "Date",
            "Promise",
            "void",
            "async",
            "await",
            "function",
            "this",
            "self",
            "args",
            "rest",
            "key",
            "ref",
            "div",
            "span",
            "label",
            "input",
            "button",
            "form",
            "textarea",
            "select",
            "option",
            "table",
            "thead",
            "tbody",
            "th",
            "td",
            "tr",
            "ul",
            "ol",
            "li",
            "img",
            "Link",
            "ArrowLeft",
            "ChevronDown",
            "RefreshCw",
            "Sparkles",
            "Plus",
            "Bookmark",
            "Activity",
            "Inbox",
            "Tag",
            "Trash",
            "Edit",
            "Check",
            "rounded",
            "border",
            "bg",
            "text",
            "flex",
            "grid",
            "items",
            "justify",
            "between",
            "center",
            "start",
            "end",
            "mb",
            "mt",
            "px",
            "py",
            "ms",
            "me",
          ].includes(w),
      )
      if (significant.length > 0) {
        // We have to be very lenient here — most legit English chunks
        // are inside JSX expressions or attribute values. Only flag if
        // the word appears inside what looks like JSX text content:
        // i.e., between `>` and `<` on the SAME line.
        const jsxText = /(?<=>)([^<{]*?)(?=<)/g
        let m: RegExpExecArray | null
        let leak: string | null = null
        while ((m = jsxText.exec(line)) !== null) {
          const segment = m[1]
          if (!arabicRange.test(segment)) continue
          const inJsx = segment.match(/\b[A-Za-z]{4,}\b/g) ?? []
          const trouble = inJsx.find((w) => significant.includes(w))
          if (trouble) {
            leak = trouble
            break
          }
        }
        if (leak) {
          check(false, `${f}:${i + 1} JSX text mixes Arabic with English "${leak}"`)
        }
      }
    }
  }

  if (failures.length === 0) {
    console.log(`\n🎉 Operator surface audit clean (${OPERATOR_FILES.length} files scanned).`)
  } else {
    console.log(`\n💥 ${failures.length} surface issue(s).`)
  }
  process.exit(failures.length === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error("audit crashed:", err)
  process.exit(1)
})
