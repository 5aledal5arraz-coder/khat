/**
 * Prebuild migration-drift check — WARNING ONLY, never fails the build.
 *
 *   npx tsx scripts/check-migration-drift.ts
 *
 * The worker treats drift as fatal (a worker on the wrong schema is useless).
 * A build is different: it legitimately runs in environments with no database
 * at all, and the build output itself doesn't depend on the DB. So this prints
 * a loud warning and exits 0 — its job is to make the drift VISIBLE at the
 * moment someone is already looking at the terminal, not to block them.
 *
 * Always exits 0. Deliberately. Do not "harden" this into a failure.
 */

// MUST be first — bare tsx process, no automatic .env.local. See lib/env-file.ts.
import { loadEnvFiles } from "../lib/env-file"

loadEnvFiles()

/**
 * `lib/db.ts` reads DATABASE_URL at MODULE-EVALUATION time and builds the pool
 * (or leaves it null) right there. ES imports are hoisted above the
 * `loadEnvFiles()` call above, so a static `import { closeDb } from "../lib/db"`
 * evaluates the connection layer BEFORE the env file is read — the pool comes
 * out null and this check reports a bogus "DATABASE_URL unset".
 *
 * That is the very bug this script exists to catch, so: everything that can
 * reach `lib/db` is imported dynamically, AFTER the env is in place.
 */
async function main(): Promise<void> {
  const { checkMigrationDrift, formatDriftMessage } = await import(
    "../lib/db/migration-guard"
  )
  const result = await checkMigrationDrift()

  if (result.status === "in_sync") {
    console.log(
      `[migration-guard] القاعدة متطابقة مع الكود (${result.applied}/${result.expected}).`,
    )
    return
  }

  if (result.status === "unknown") {
    console.log(`[migration-guard] تخطّي الفحص — ${result.reason}`)
    return
  }

  console.warn("")
  console.warn(`[migration-guard] ${formatDriftMessage(result)}`)
  console.warn(
    "  البناء بيكمل، بس التطبيق راح يفشل وقت التشغيل على أي عمود أو جدول ناقص.",
  )
  console.warn("")
}

main()
  .catch((err) => {
    // Even an unexpected crash must not fail the build.
    console.warn(
      `[migration-guard] تعذّر تشغيل الفحص: ${err instanceof Error ? err.message : String(err)}`,
    )
  })
  .finally(async () => {
    const { closeDb } = await import("../lib/db")
    await closeDb()
  })
