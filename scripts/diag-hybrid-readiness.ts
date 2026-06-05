/**
 * Diagnostic — Hybrid Generator readiness against the live DB.
 *
 * Read-only. Prints the exact decision the generator would make right
 * now: which inputs exist, which fallback path it would pick, whether
 * it would bail with `no_inputs`, and which pipeline jobs the action
 * would auto-enqueue.
 *
 *   npx tsx scripts/diag-hybrid-readiness.ts
 *
 * Does NOT call OpenAI. Use the operator UI button (or a separate
 * runner) to fire a real generation; this just proves the dependency
 * chain is sound.
 */

import { readFileSync } from "node:fs"
import path from "node:path"
// Minimal env loader — repo doesn't depend on dotenv.
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
} catch {
  // .env.local missing — rely on shell env.
}

async function main() {
  const { getHybridReadiness } = await import("../lib/hybrid-topics/diagnostics")
  const { loadHybridInputs } = await import("../lib/hybrid-topics/inputs")

  console.log("\n📊 Hybrid Readiness — live DB snapshot\n")

  const readiness = await getHybridReadiness()
  console.log("counts")
  console.log(`  market_signals_total     : ${readiness.market_signals_total}`)
  console.log(`  market_signals_extracted : ${readiness.market_signals_extracted}`)
  console.log(`  market_clusters_total    : ${readiness.market_clusters_total}`)
  console.log(`  original_topics_fresh    : ${readiness.original_topics_fresh}`)
  console.log(`  memory (strong/weak)     : ${readiness.worked_strong_domains}/${readiness.worked_weak_domains}`)
  console.log("\ngates")
  console.log(`  has_clusters          : ${readiness.has_clusters}`)
  console.log(`  has_recent_signals    : ${readiness.has_recent_signals}`)
  console.log(`  has_originals         : ${readiness.has_originals}`)
  console.log(`  has_memory            : ${readiness.has_memory}`)
  console.log(`  generator_ready       : ${readiness.generator_ready}`)
  console.log(`  blocking_reason       : ${readiness.blocking_reason ?? "—"}`)
  console.log("\nself-heal recommendations")
  console.log(`  trigger market.extract        : ${readiness.should_trigger_extraction}`)
  console.log(`  trigger market.cluster_signals: ${readiness.should_trigger_clustering}`)
  console.log("\ninflight jobs")
  console.log(
    `  collect=${readiness.inflight.collect} extract=${readiness.inflight.extract} cluster=${readiness.inflight.cluster}`,
  )

  // Show which fallback path the generator WOULD pick if you clicked
  // "generate" right now — without actually spending OpenAI credits.
  const inputs = await loadHybridInputs({ language: "ar", extraExclusions: [] })
  let fallback: string
  if (inputs.market_clusters.length > 0) fallback = "clusters"
  else if (inputs.original_topics.length > 0) fallback = "originals_only"
  else if (
    inputs.worked_report.strong_topic_domains.length > 0 ||
    inputs.worked_report.weak_topic_domains.length > 0
  )
    fallback = "memory_only"
  else fallback = "(would bail — no_inputs)"
  const isEmpty = fallback === "(would bail — no_inputs)"
  console.log("\ngenerator behaviour")
  console.log(`  is_empty       : ${isEmpty}`)
  console.log(`  fallback_path  : ${fallback}`)
  console.log(`  cluster_count  : ${inputs.market_clusters.length}`)
  console.log(`  original_count : ${inputs.original_topics.length}`)
  console.log(`  exclusion_ct   : ${inputs.excluded_titles.length}`)

  console.log("")
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ diag failed:", err)
  process.exit(1)
})
