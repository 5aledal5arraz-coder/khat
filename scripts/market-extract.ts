/**
 * Phase X Step 1 — enqueue a market.extract job.
 *
 *   npm run market:extract
 *
 * Worker scans market_topic_signals where theme IS NULL and fills
 * theme/emotional_trigger/controversy_score via the AI router.
 */

import { enqueueJob } from "@/lib/jobs"

async function main() {
  const job = await enqueueJob(
    "market.extract",
    {},
    { priority: 5, maxAttempts: 2 },
  )
  console.log(
    `Phase X — market.extract enqueued (id=${job.id}). Run \`npm run worker\` to process it.`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ market:extract enqueue failed:", err)
  process.exit(1)
})
