/**
 * Local-dev env bootstrap for the standalone worker process.
 *
 * Unlike `next dev`, the worker is a plain Node process and does NOT
 * auto-load `.env.local`. Without this, `npm run worker` (and therefore
 * `npm run dev:all`) would start with no DATABASE_URL / OPENAI_API_KEY and
 * fail to process any job.
 *
 * This module must be imported FIRST in `worker.ts` — before `./queue`
 * (which pulls in `@/lib/db` and creates the pg pool at import time), so
 * the vars exist before the pool reads them.
 *
 * Production is unaffected: PM2 supplies env directly and there is no
 * `.env.local` on the server, so the `existsSync` guard makes this a
 * no-op. Vars already present in the environment win — `loadEnvFile`
 * does not clobber an already-set process.env.
 */

import { existsSync } from "node:fs"
import { resolve } from "node:path"

// `process.loadEnvFile` landed in Node 20.12; type it optionally so the
// build doesn't depend on the installed @types/node version exposing it.
const proc = process as NodeJS.Process & {
  loadEnvFile?: (path?: string) => void
}

const envPath = resolve(process.cwd(), ".env.local")
if (existsSync(envPath) && typeof proc.loadEnvFile === "function") {
  proc.loadEnvFile(envPath)
}
