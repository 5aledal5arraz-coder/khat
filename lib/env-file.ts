/**
 * Shared `.env` file bootstrap for plain-Node entrypoints.
 *
 * Next.js auto-loads `.env.local`; nothing else does. Every other entrypoint
 * (the worker, tsx scripts, and — the reason this module exists —
 * `drizzle.config.ts`) is a bare Node process that starts with whatever the
 * shell exported and nothing more.
 *
 * The concrete bug this fixes: `drizzle-kit` loads only `.env`, and this repo
 * has no `.env` — only `.env.local`. So `drizzle.config.ts` resolved
 * `DATABASE_URL` to `undefined`, and `drizzle-kit migrate` printed
 * "applying migrations..." and exited 0 WITHOUT APPLYING ANYTHING. The local DB
 * silently sat 9 migrations behind the journal for 22 days. The same missing
 * loader made `scripts/validate-env.ts` (the `prebuild` gate) report
 * `required=0/2` and fail `npm run build`.
 *
 * Precedence, deliberately: an already-exported variable always wins. Both
 * `process.loadEnvFile` and the `--env-file` flag it mirrors refuse to clobber
 * an existing `process.env` entry, so `DATABASE_URL=... npm run db:migrate`
 * still overrides the file. `.env.local` is read first for the same reason —
 * whatever lands first wins, and `.env` is only a fallback for environments
 * that use it.
 *
 * No new dependency: `process.loadEnvFile` is built into Node ≥ 20.12 and is
 * already the pattern used by `lib/jobs/load-env.ts`.
 *
 * Production is unaffected: PM2 supplies env directly and neither file exists
 * on the droplet, so the `existsSync` guard makes this a no-op.
 */

import { existsSync } from "node:fs"
import { resolve } from "node:path"

/** Files loaded in order. First writer wins, so the more specific one is first. */
const ENV_FILES = [".env.local", ".env"] as const

// `process.loadEnvFile` landed in Node 20.12; type it optionally so the build
// doesn't depend on the installed @types/node version exposing it.
const proc = process as NodeJS.Process & {
  loadEnvFile?: (path?: string) => void
}

let loaded = false

/**
 * Load `.env.local` then `.env` into `process.env`, once per process.
 *
 * Never throws: a malformed or unreadable file degrades to "variable absent",
 * which the callers already report with a far better message than a parse
 * error would give.
 *
 * @param cwd Directory to resolve the env files against. Defaults to the
 *   process working directory; parameterised for tests.
 * @returns The files that were actually read.
 */
export function loadEnvFiles(cwd: string = process.cwd()): string[] {
  if (loaded) return []
  loaded = true

  if (typeof proc.loadEnvFile !== "function") return []

  const read: string[] = []
  for (const file of ENV_FILES) {
    const path = resolve(cwd, file)
    if (!existsSync(path)) continue
    try {
      proc.loadEnvFile(path)
      read.push(file)
    } catch {
      // Unparseable file — treat as absent. The caller's own validation
      // produces a clearer diagnostic than a raw parse error.
    }
  }
  return read
}
