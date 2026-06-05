// Khat Brain Phase 6 — discovery stalled-run sweep.
//
// Enqueues `discovery.cron_check`. The handler scans for runs stuck
// in {seeding, searching, verifying, ranking} for too long and
// either marks them failed or recovers them by enqueueing a rank job.
//
// Run from host crontab every 10 minutes:
//   crontab entry uses the literal: every-10-minutes ALL ALL ALL ALL
//   then: cd /root/khat && /usr/bin/npm run jobs:discovery-cron-check

import { enqueueJob } from "@/lib/jobs"

async function main() {
  const job = await enqueueJob(
    "discovery.cron_check",
    {},
    { priority: 9, maxAttempts: 1 },
  )
  console.log(
    `Khat Brain — discovery.cron_check enqueued (id=${job.id}). Worker (npm run worker) will process it.`,
  )
  process.exit(0)
}

main().catch((err) => {
  console.error("❌ cron_check enqueue failed:", err)
  process.exit(1)
})
