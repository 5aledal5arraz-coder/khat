/**
 * Phase X Step 1 — enqueue a market.collect job.
 *
 *   npm run market:collect
 *
 * Fires-and-forgets. Worker (`npm run worker`) picks the job up; handler
 * iterates every preset in `config/market-presets.json` and writes
 * signals via the adapters (YouTube, podcast).
 */

import { enqueueJob } from "@/lib/jobs"

async function main() {
  const job = await enqueueJob(
    "market.collect",
    {},
    { priority: 5, maxAttempts: 1 },
  )
  console.log(
    `Phase X — market.collect enqueued (id=${job.id}). Run \`npm run worker\` to process it.`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ market:collect enqueue failed:", err)
  process.exit(1)
})
