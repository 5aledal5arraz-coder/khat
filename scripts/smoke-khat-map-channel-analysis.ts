/**
 * Phase 2 smoke test — runs pure DB paths end-to-end.
 *
 * Does NOT call Gemini (avoids burning the API key during a smoke run).
 * It verifies:
 *   1. collectChannelSignals() reads the live DB without crashing.
 *   2. buildChannelCorpus() produces a bounded Arabic corpus.
 *   3. seedInvasionAnglesIdempotent() plants the 12 canonical angles
 *      and can be run twice safely.
 */

import { collectChannelSignals, buildChannelCorpus } from "@/lib/khat-map/channel-analysis/collector"
import { seedInvasionAnglesIdempotent } from "@/lib/khat-map/core/seed-invasion"

async function main() {
  console.log("─── 1. Signal collection ──────────────────")
  const signals = await collectChannelSignals()
  console.log(`Episodes analyzed: ${signals.coverage.non_hidden_episodes}`)
  console.log(`  · with hero summary: ${signals.coverage.with_hero_summary}`)
  console.log(`  · with takeaways:    ${signals.coverage.with_takeaways}`)
  console.log(`  · with guest:        ${signals.coverage.with_guest_assigned}`)
  console.log(`  · with category:     ${signals.coverage.with_category_assigned}`)
  console.log(`  · with view count:   ${signals.coverage.with_view_count}`)
  console.log(`  · date span: ${signals.coverage.earliest_release_date} → ${signals.coverage.latest_release_date}`)
  if (signals.coverage.notes.length) {
    console.log("  Coverage notes:")
    for (const n of signals.coverage.notes) console.log("   -", n)
  }
  console.log(`Top viewed: ${signals.top_viewed.length}`)
  console.log(`Recent:     ${signals.most_recent.length}`)
  console.log(`Sample:     ${signals.representative_sample.length}`)
  console.log(`Keywords:   ${signals.title_keywords.length}`)
  console.log(`Repeat guests: ${signals.repeat_guests.length}`)
  console.log(`Categories: ${signals.by_category.length}`)

  console.log("\n─── 2. Corpus distillation ────────────────")
  const corpus = buildChannelCorpus(signals)
  console.log(`Corpus size: ${corpus.length} chars`)
  console.log("First 400 chars:")
  console.log(corpus.slice(0, 400))

  console.log("\n─── 3. Invasion seeder (run 1) ────────────")
  const r1 = await seedInvasionAnglesIdempotent()
  console.log(`  seeds_considered: ${r1.seeds_considered}`)
  console.log(`  inserted:         ${r1.inserted}`)
  console.log(`  patched:          ${r1.patched}`)
  console.log(`  unchanged:        ${r1.unchanged}`)

  console.log("\n─── 4. Invasion seeder (run 2 — idempotency) ──")
  const r2 = await seedInvasionAnglesIdempotent()
  console.log(`  inserted:         ${r2.inserted} (must be 0)`)
  console.log(`  patched:          ${r2.patched} (must be 0)`)
  console.log(`  unchanged:        ${r2.unchanged} (must equal seeds_considered)`)

  if (r2.inserted !== 0 || r2.patched !== 0) {
    console.error("❌ Idempotency violated — second run changed rows")
    process.exit(1)
  }
  console.log("\n✓ Phase 2 smoke test passed.")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
