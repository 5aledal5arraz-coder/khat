/**
 * Phase X Step 2 — enqueue an original.generate_topics job.
 *
 *   npm run original:generate
 *
 * Worker (`npm run worker`) picks the job up, calls the editorial AI
 * model, judges outputs, persists accepted ones to original_thinking_topics.
 *
 * Defaults: language=ar, count=10, no Kuwait bias.
 */

import { enqueueJob } from "@/lib/jobs"

async function main() {
  const language = (process.argv[2] as "ar" | "en") ?? "ar"
  const count = Number(process.argv[3] ?? "10")
  const job = await enqueueJob(
    "original.generate_topics",
    { language, count },
    { priority: 5, maxAttempts: 1 },
  )
  console.log(
    `Phase X — original.generate_topics enqueued (id=${job.id}, language=${language}, count=${count}). Run \`npm run worker\` to process it.`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ original:generate enqueue failed:", err)
  process.exit(1)
})
