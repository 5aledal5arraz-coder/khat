/**
 * Phase X Step 1 — enqueue a market.cluster_signals job.
 *
 *   npm run market:cluster
 *
 * Recomputes the market_topic_clusters projection from the last 90 days
 * of extracted signals. Wipes + rewrites the table atomically.
 */

import { enqueueJob } from "@/lib/jobs"

async function main() {
  const job = await enqueueJob(
    "market.cluster_signals",
    {},
    { priority: 5, maxAttempts: 1 },
  )
  console.log(
    `Phase X — market.cluster_signals enqueued (id=${job.id}). Run \`npm run worker\` to process it.`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ market:cluster enqueue failed:", err)
  process.exit(1)
})
