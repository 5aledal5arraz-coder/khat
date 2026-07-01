/**
 * Dev probe: run the live season-topic engine (generateBatch, the wizard's
 * editorial path) against a season and print the topics as text, so we can
 * compare topic QUALITY + DIVERSITY before/after a change. Persists candidates
 * (same as the wizard) — use a throwaway/dev season.
 *
 * Usage: npx tsx scripts/gen-topics-probe.ts <seasonId> [size]
 */
import "@/lib/jobs/load-env"
import { generateBatch } from "@/lib/khat-map/v2/batch-engine"

async function main() {
  const seasonId = process.argv[2]
  const size = Number(process.argv[3] || 6)
  if (!seasonId) {
    console.error("Usage: npx tsx scripts/gen-topics-probe.ts <seasonId> [size]")
    process.exit(1)
  }

  const res = await generateBatch({
    season_id: seasonId,
    size,
    admin_id: null,
    use_cross_season_negatives: true,
  })

  console.log(`\n=== ${res.cards.length} topics (batch ${res.batch_index}) ===\n`)
  res.cards.forEach((c, i) => {
    const card = c as unknown as Record<string, unknown>
    const t = (card.topic_candidate ?? {}) as Record<string, unknown>
    const intel = (card.editorial_intel ?? {}) as Record<string, unknown>
    console.log(`${i + 1}. ${t.working_title}`)
    console.log(`   category: ${t.topic_category ?? "—"} / sub: ${card.subcategory ?? "—"}`)
    console.log(`   archetype: ${(t.archetype as string) ?? (intel.archetype as string) ?? "—"} | domain: ${t.topic_domain ?? "—"}`)
    console.log(`   success: ${card.success_score ?? "—"} | editorial: ${card.editorial_score ?? "—"}`)
    console.log(`   hook: ${String(t.hook ?? "").slice(0, 140)}`)
    console.log()
  })
  console.log("stats:", JSON.stringify(res.stats))
  process.exit(0)
}

main().catch((err) => {
  console.error("probe failed:", err)
  process.exit(1)
})
