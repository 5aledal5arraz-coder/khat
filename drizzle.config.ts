// MUST be first: drizzle-kit loads only `.env`, and this repo has only
// `.env.local`. Without this import DATABASE_URL is undefined here, and
// `drizzle-kit migrate` exits 0 without applying anything. See lib/env-file.ts.
import { loadEnvFiles } from "./lib/env-file"
import { defineConfig } from "drizzle-kit"

loadEnvFiles()

const rawUrl = process.env.DATABASE_URL

if (!rawUrl) {
  throw new Error(
    "[drizzle.config] DATABASE_URL is not set.\n" +
      "  drizzle-kit reads only `.env`; this repo keeps its config in `.env.local`,\n" +
      "  which is now loaded above — so an empty value here means the variable is\n" +
      "  genuinely absent, not merely unloaded.\n" +
      "  Fix: add DATABASE_URL to .env.local, or export it for this command.\n" +
      "  Refusing to continue — a config with an undefined url makes drizzle-kit\n" +
      "  report success while applying nothing.",
  )
}

// ─── Target guard ────────────────────────────────────────────────────
// `.env.local` holds LIVE_DATABASE_URL (the production connection string) one
// line below DATABASE_URL. A single mistaken export — or a copy/paste into the
// wrong variable — turns `npm run db:migrate` into a production migration with
// no confirmation step. drizzle-kit itself asks nothing.
//
// So: anything that isn't a local host must be opted into EXPLICITLY via
// KHAT_DB_TARGET=production. This blocks the accident, not the deploy — a
// legitimate production migration just carries the extra variable, which also
// makes it visible in shell history and CI logs.
const host = (() => {
  try {
    return new URL(rawUrl).hostname
  } catch {
    // Unparseable URL: treat as non-local (fail closed).
    return ""
  }
})()

const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1"

if (!isLocal && process.env.KHAT_DB_TARGET !== "production") {
  throw new Error(
    `[drizzle.config] Refusing to run against a NON-LOCAL database (host: ${host || "<unparseable>"}).\n` +
      "  `.env.local` also contains LIVE_DATABASE_URL, so a stray export here means\n" +
      "  migrating PRODUCTION by accident.\n" +
      "  If this is intentional, re-run with an explicit target:\n" +
      "    KHAT_DB_TARGET=production npm run db:migrate\n" +
      "  If it is not, point DATABASE_URL at localhost.",
  )
}

// Strip sslmode from the connection string — pg v8.x treats `sslmode=require`
// as verify-full and rejects the managed DB's self-signed cert, which surfaces
// as drizzle-kit hanging rather than as an error. SSL is set explicitly below,
// mirroring lib/db.ts.
const url = rawUrl.replace(/[?&]sslmode=[^&]*/g, "").replace(/\?$/, "")

export default defineConfig({
  schema: "./lib/db/schema/index.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  },
})
