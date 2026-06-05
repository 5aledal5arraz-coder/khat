/**
 * One-shot — Run one real hybrid generation against the live DB.
 *
 *   npx tsx scripts/run-hybrid-generation-once.ts
 *
 * Hits OpenAI (editorial model). Writes a hybrid_topic_generations row,
 * an ai_runs row, and zero+ khat_map_episode_candidates rows. Surfaces
 * the fallback path used so we can confirm the degraded raw-signal
 * prompt path produced output.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
try {
  const envPath = path.resolve(__dirname, "..", ".env.local")
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const [, k, rawV] = m
    if (process.env[k]) continue
    let v = rawV.trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    process.env[k] = v
  }
} catch {}

async function main() {
  const { generateHybridTopics } = await import("../lib/hybrid-topics/generate")

  console.log("\n🧪 Running one real hybrid generation against live DB…\n")

  const r = await generateHybridTopics({
    seasonId: null,
    language: "ar",
    count: 6,
    allowKuwaitBias: false,
    createdBy: null,
  })

  console.log("result")
  console.log(`  ok              : ${r.ok}`)
  console.log(`  reason          : ${r.reason ?? "—"}`)
  console.log(`  fallback_path   : ${r.fallback_path ?? "—"}`)
  console.log(`  asked           : ${r.asked}`)
  console.log(`  accepted        : ${r.accepted.length}`)
  console.log(`  rejected        : ${r.rejected.length}`)
  console.log(`  persisted_rows  : ${r.persisted.length}`)
  console.log(`  generation_id   : ${r.generation_id ?? "—"}`)
  console.log(`  ai_run_id       : ${r.ai_run_id ?? "—"}`)
  if (Object.keys(r.rejection_summary).length > 0) {
    console.log("\nrejection summary")
    for (const [k, v] of Object.entries(r.rejection_summary)) {
      console.log(`  ${k}: ${v}`)
    }
  }
  if (r.accepted.length > 0) {
    console.log("\naccepted titles")
    for (const t of r.accepted) {
      console.log(`  • ${t.title}`)
      console.log(`      lens=${t.original_lens}  score=${t.estimated_strength_score?.toFixed(2) ?? "—"}`)
      console.log(`      inspiration: ${t.market_inspiration?.slice(0, 100) ?? "—"}`)
    }
  }
  console.log("")
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ generation failed:", err)
  process.exit(1)
})
