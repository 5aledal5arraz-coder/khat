/**
 * Khat Brain Phase 4 — Studio backfill (HISTORICAL).
 *
 * This script copied legacy `studio_*` rows into `studio_analysis_records`
 * during the Phase 4 migration. After Phase 5 dropped the legacy tables,
 * the script is no longer runnable — its imports point at tables that
 * don't exist anymore.
 *
 * Kept as a stub for documentation. Re-running it is a no-op that exits
 * with a clear message. Removed from package.json scripts.
 */

console.log(
  "Khat Brain Phase 4 backfill — legacy studio_* tables were dropped in Phase 5.",
)
console.log("Studio outputs now live exclusively in studio_analysis_records.")
console.log("Nothing to do.")
process.exit(0)
