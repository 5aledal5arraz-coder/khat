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
 * The loading itself now lives in `lib/env-file.ts`, shared with
 * `drizzle.config.ts` and the tsx scripts — the same missing-loader bug bit all
 * three, so there is exactly one implementation to keep correct. This file
 * stays as the worker's side-effect import so the ordering contract above
 * remains explicit at the call site.
 */

import { loadEnvFiles } from "@/lib/env-file"

loadEnvFiles()
