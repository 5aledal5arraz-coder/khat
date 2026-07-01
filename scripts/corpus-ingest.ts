/**
 * Ingest Arabic-podcast catalogues into corpus_episodes.
 *
 * Usage:
 *   npx tsx scripts/corpus-ingest.ts                 # all configured sources
 *   npx tsx scripts/corpus-ingest.ts bidon_waraq khat  # only these slugs
 */
import "@/lib/jobs/load-env"
import { ingestAllSources, corpusCounts } from "@/lib/corpus/ingest"

async function main() {
  const only = process.argv.slice(2)
  console.log(only.length ? `Ingesting: ${only.join(", ")}` : "Ingesting ALL configured sources")
  const results = await ingestAllSources(only.length ? { only } : {})
  for (const r of results) {
    if (r.error) console.log(`  ✗ ${r.slug}: ${r.error}`)
    else console.log(`  ✓ ${r.slug}: channel=${r.channel_id} fetched=${r.fetched} upserted=${r.upserted}`)
  }
  console.log("\n=== corpus counts by source ===")
  for (const c of await corpusCounts()) console.log(`  ${c.source_slug}: ${c.n}`)
  process.exit(0)
}

main().catch((err) => {
  console.error("corpus ingest failed:", err)
  process.exit(1)
})
