/**
 * Guard — no Server Action and no API route may call the slow AI functions.
 *
 * These are minutes-long (five prep passes, a hybrid generation, a guided
 * batch, a full-episode Whisper run). Awaited inside a request they sit behind
 * nginx's 120s cut: the operator gets a severed connection while the server
 * keeps paying, and a retry pays again. They run in the worker now
 * (lib/jobs/handlers/*); the request path only enqueues.
 *
 * What is scanned: every file under app/ whose first statement is
 * "use server", and every app/api/**\/route.ts. What counts as a use: the
 * function's identifier appearing in CODE — comments are stripped, and
 * `import type` lines are ignored (a type carries no runtime call). Dynamic
 * `await import("…/pipeline")` is caught too, because the identifier still has
 * to appear to be called.
 *
 * An exception has to be written into ALLOWLIST with its reason — a decision,
 * not an accident. It is empty today.
 */

import { describe, it, expect } from "vitest"
import { readFileSync, readdirSync, statSync } from "fs"
import { join, relative } from "path"

const ROOT = process.cwd()

/** identifier → the module it lives in (for the failure message). */
const SLOW_AI: Record<string, string> = {
  runPrepV2Pipeline: "@/lib/preparation/v2/pipeline",
  generateHybridTopics: "@/lib/hybrid-topics/generate",
  generateOriginalTopics: "@/lib/original-thinking/generator",
  generateBatch: "@/lib/khat-map/v2 (batch-engine)",
  generateGuestFirstCards: "@/lib/khat-map/v2 (guest-first-engine)",
  transcribeAudioFile: "@/lib/whisper",
}

/** "relative/path.ts" → why it may call a slow AI function in-request. */
const ALLOWLIST: Record<string, string> = {}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}

/** Source with comments and type-only imports removed. */
export function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
    .replace(/^\s*import\s+type\s[\s\S]*?from\s+["'][^"']+["'];?/gm, "")
}

function isUseServer(src: string): boolean {
  return /^\s*["']use server["']/.test(codeOnly(src))
}

function requestPathFiles(): string[] {
  const app = join(ROOT, "app")
  return walk(app).filter((f) => {
    const rel = relative(ROOT, f)
    if (/^app\/api\/.*\/route\.ts$/.test(rel)) return true
    return isUseServer(readFileSync(f, "utf8"))
  })
}

function offenders(files: string[]): string[] {
  const out: string[] = []
  for (const f of files) {
    const rel = relative(ROOT, f)
    if (rel in ALLOWLIST) continue
    const code = codeOnly(readFileSync(f, "utf8"))
    for (const [id, mod] of Object.entries(SLOW_AI)) {
      if (new RegExp(`\\b${id}\\b`).test(code)) out.push(`${rel} → ${id} (${mod})`)
    }
  }
  return out
}

describe("slow AI stays off the request path", () => {
  const files = requestPathFiles()

  it("actually scans the request path (not vacuous)", () => {
    const rels = files.map((f) => relative(ROOT, f))
    // The files this change moved off the request path must be in the sweep.
    expect(rels).toContain("app/admin/khat-brain/seasons/actions.ts")
    expect(rels).toContain("app/admin/khat-brain/episodes/[eirId]/job-actions.ts")
    expect(rels).toContain("app/admin/khat-brain/seasons/[seasonId]/_components/hybrid-actions.ts")
    expect(rels).toContain("app/admin/khat-brain/original-thinking/actions.ts")
    expect(rels).toContain("app/api/admin/studio/[id]/transcript/whisper/route.ts")
    expect(rels).toContain("app/api/admin/studio/[id]/generate-stream/route.ts")
    expect(files.length).toBeGreaterThan(50)
  })

  it("no Server Action or route calls a slow AI function", () => {
    expect(offenders(files)).toEqual([])
  })

  it("the detector sees a call, a dynamic import, and ignores comments + type imports", () => {
    const probe = (src: string) => {
      const code = codeOnly(src)
      return Object.keys(SLOW_AI).filter((id) => new RegExp(`\\b${id}\\b`).test(code))
    }
    expect(probe(`const r = await runPrepV2Pipeline({ preparationId })`)).toEqual(["runPrepV2Pipeline"])
    expect(
      probe(`const { transcribeAudioFile } = await import("@/lib/whisper")`),
    ).toEqual(["transcribeAudioFile"])
    expect(probe(`// the worker runs runPrepV2Pipeline\n/* generateBatch */`)).toEqual([])
    expect(probe(`import type { generateHybridTopics } from "x"`)).toEqual([])
    // A longer identifier that merely starts with a slow name is not a call.
    expect(probe(`await generateHybridTopicsAction({})`)).toEqual([])
  })
})
