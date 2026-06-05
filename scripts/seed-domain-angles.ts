/**
 * Seed Phase-D domain angles into khat_map_topic_bank.
 *
 * Idempotent — safe to re-run on every deploy. Inserts missing rows,
 * patches only empty fields on existing rows, unions tags. Never
 * overwrites admin-curated freshness / notes / importance_score.
 *
 * Invocation:
 *   env $(grep -v '^#' .env.local | grep DATABASE_URL | xargs) \
 *     npx tsx scripts/seed-domain-angles.ts
 */

import { seedDomainAnglesIdempotent } from "@/lib/khat-map/core/seed-invasion"

async function main() {
  console.log("Seeding domain angles…\n")
  const r = await seedDomainAnglesIdempotent()
  console.log(`seeds considered : ${r.seeds_considered}`)
  console.log(`  inserted       : ${r.inserted}`)
  console.log(`  patched        : ${r.patched}`)
  console.log(`  unchanged      : ${r.unchanged}`)
  if (r.angle_codes_inserted.length > 0) {
    console.log(`\ninserted codes:`)
    for (const c of r.angle_codes_inserted) console.log(`  + ${c}`)
  }
  if (r.angle_codes_patched.length > 0) {
    console.log(`\npatched codes:`)
    for (const c of r.angle_codes_patched) console.log(`  ~ ${c}`)
  }
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ seed failed:", err)
  process.exit(1)
})
