/**
 * Phase X Step 4 — CLI for the Preparation V2 pipeline.
 *
 *   npm run prep:v2 -- <preparationId> [language]
 *
 * Force-runs the pipeline regardless of PREP_V2_ENABLED. Useful to
 * regenerate prep_v2 for an existing preparation row.
 *
 * Persists the payload (or partial payload, when validation fails)
 * onto episode_preparations.prep_v2.
 */

import { runPrepV2Pipeline } from "@/lib/preparation/v2/pipeline"

async function main() {
  const preparationId = process.argv[2]
  const language = (process.argv[3] as "ar" | "en") ?? "ar"
  if (!preparationId) {
    console.error("usage: npm run prep:v2 -- <preparationId> [ar|en]")
    process.exit(1)
  }
  const r = await runPrepV2Pipeline({
    preparationId,
    language,
    force: true,
  })
  console.log("\n— Prep V2 —")
  console.log(`  ok=${r.ok} reason=${r.reason ?? "—"}`)
  console.log(`  preparation_id=${r.preparation_id}`)
  if (r.payload) {
    console.log(`  thesis: ${r.payload.thesis.slice(0, 100)}…`)
    console.log(`  axes_of_tension: ${r.payload.axes_of_tension.length}`)
    console.log(`  sections: ${r.payload.episode_sections.length}`)
    console.log(
      `  questions: ${r.payload.question_bank.length} (must_ask=${r.payload.question_bank.filter((q) => q.priority === "must_ask").length})`,
    )
    console.log(`  total_estimated_minutes: ${r.payload.total_estimated_minutes}`)
    console.log(`  generator_version: ${r.payload.generator_version}`)
  }
  console.log(`  ai_run_ids:`)
  for (const [k, v] of Object.entries(r.ai_run_ids)) {
    console.log(`    ${k}: ${v ?? "—"}`)
  }
  if (!r.validation.ok) {
    console.log(`\n  validation failures:`)
    for (const f of r.validation.failures) {
      console.log(`    · ${f.code}: ${f.message}`)
    }
  }
  process.exit(r.ok ? 0 : 1)
}

main().catch((err) => {
  console.error("\n💥 prep:v2 failed:", err)
  process.exit(1)
})
