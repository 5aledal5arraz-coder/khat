/**
 * Guard: every Resend send must carry `replyTo`.
 *
 * Without it the reply address falls back to the FROM header —
 * `noreply@khatpodcast.com`, a box that receives nothing. A guest who replied
 * to their own confirmation was writing into a void: no delivery, no bounce
 * either of them would notice. Seven of eleven sends in lib/email/send.ts were
 * silent that way, including both confirmations and all three of Khaled's
 * new-submission notifications.
 *
 * This scans the SOURCE rather than mocking Resend, because the failure mode is
 * a NEW send site added later — a behavioural test only covers the sends
 * somebody remembered to write a test for, which is how the first seven shipped.
 */
import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const ROOTS = ["lib", "app"]
const SKIP = new Set(["node_modules", ".next", ".git"])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Comments quote the calls they describe, and this scan would read the quote as
 * a call site. Blank them out while KEEPING line offsets, so the failure
 * message still points at a real line number.
 */
function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, (m) => m.replace(/[^\n]/g, " "))
}

/**
 * Text of the message literal passed to each send in `src`.
 *
 * TWO markers, because the sends in lib/email/send.ts no longer call the SDK
 * directly — they go through the `sendOrThrow` chokepoint that checks Resend's
 * `error` (a refusal RESOLVES, it does not reject). When that refactor landed
 * this scan saw 13 sites drop to 6 and went quiet without failing: every
 * payload it used to police had moved behind the new call shape. Scanning both
 * keeps it looking at the same twelve messages.
 */
function sendCallArgs(src: string): { index: number; body: string }[] {
  const calls: { index: number; body: string }[] = []
  for (const marker of ["emails.send(", "sendOrThrow("]) {
    let from = 0
    for (;;) {
      const at = src.indexOf(marker, from)
      if (at === -1) break
      from = at + marker.length
      let depth = 0
      let i = from
      for (; i < src.length; i++) {
        const ch = src[i]
        if (ch === "(" || ch === "{" || ch === "[") depth++
        else if (ch === ")" || ch === "}" || ch === "]") {
          depth--
          if (depth === 0) break
        }
      }
      calls.push({ index: at, body: src.slice(from, i + 1) })
    }
  }
  // Only sites that build a message literal. `sendOrThrow`'s own body forwards
  // an already-built `payload` variable, so it has no `from:` and is exempt —
  // the literal it forwards is checked at each of the twelve call sites.
  return calls.filter((c) => /\bfrom:/.test(c.body))
}

/**
 * The second half of the same lesson: a send that a public route fires and
 * forgets is a send that can vanish.
 *
 * Four routes did it — guest application, sponsor application, contribute, and
 * the prep questionnaire (that one with a bare `.catch(() => {})`, not even a
 * log line). The first sweep caught two of the four, which is exactly why this
 * is a rule a test enforces rather than a habit.
 *
 * Admin routes are exempt on purpose: an operator pressing «إرسال» is watching
 * the response, so a synchronous send there reports its own failure.
 */
describe("public API routes queue their mail instead of firing it", () => {
  function walkApi(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walkApi(full, out)
      else if (/route\.tsx?$/.test(entry)) out.push(full)
    }
    return out
  }

  it("no route outside app/api/admin imports @/lib/email/send", () => {
    const routes = walkApi(join("app", "api")).filter(
      (f) => !f.startsWith(join("app", "api", "admin")),
    )
    // Guard the guard: if the walk finds nothing, the assertion below is empty.
    expect(routes.length).toBeGreaterThan(5)

    const offenders = routes.filter((f) => readFileSync(f, "utf8").includes("@/lib/email/send"))
    expect(
      offenders,
      `these public routes send mail inline instead of enqueuing: ${offenders.join(", ")}`,
    ).toEqual([])
  })
})

describe("every Resend send carries replyTo", () => {
  const files = ROOTS.flatMap((r) => walk(r)).filter(
    (f) => sendCallArgs(blankComments(readFileSync(f, "utf8"))).length > 0,
  )

  it("finds the known send sites (the scan itself is not blind)", () => {
    // If this drops to zero the guard below passes vacuously — which is exactly
    // how a guard goes quiet without failing.
    expect(files.length).toBeGreaterThanOrEqual(3)
    const total = files.reduce(
      (n, f) => n + sendCallArgs(blankComments(readFileSync(f, "utf8"))).length,
      0,
    )
    // Twelve in lib/email/send.ts, plus the campaign sender and the preview
    // route. A drop here means the scan lost sight of a payload, not that a
    // message stopped existing.
    expect(total).toBeGreaterThanOrEqual(13)
  })

  it.each(files.map((f) => [f]))("%s", (file) => {
    const src = blankComments(readFileSync(file, "utf8"))
    const missing = sendCallArgs(src)
      .filter((c) => !/\breplyTo\b/.test(c.body))
      .map((c) => `line ${src.slice(0, c.index).split("\n").length}`)

    expect(missing, `${file}: send(s) without replyTo at ${missing.join(", ")}`).toEqual([])
  })
})
