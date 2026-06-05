/**
 * Smoke test for the preparation research pipeline.
 *
 * Usage:
 *   npx tsx scripts/test-preparation-research.ts
 *
 * Hits the REAL pipeline (Gemini + YouTube), prints source counts, verifier
 * decisions, and a sample of cited claims. Requires GEMINI_API_KEY and
 * YOUTUBE_API_KEY to be set in .env.local.
 */

import { runPreparationResearch } from "@/lib/ai/preparation/research"
import type { PreparationInputs } from "@/types/preparation"

const inputs: PreparationInputs = {
  title: "فلسفة الكتابة والفقد",
  guest_name: "أحلام مستغانمي",
  guest_description: "روائية جزائرية، صاحبة ثلاثية ذاكرة الجسد",
  guest_profile_link: null,
  short_description: "حوار عن الكتابة، الهوية، والذاكرة.",
  episode_goal: "استكشاف علاقة الضيفة بالكلمة واللغة والوجع",
  key_questions: ["ما الذي يدفعك للكتابة؟", "هل الكتابة علاج أم جرح؟"],
  tone_type: "deep",
  focus_mode: "guest",
  expected_duration_min: 60,
  depth_level: 4,
  boldness_level: 3,
  content_focus: ["emotions", "ideas"],
}

async function main() {
  console.log("Starting preparation research pipeline…")
  console.log(`Guest: ${inputs.guest_name}`)
  console.log(`Topic: ${inputs.title}`)
  console.log("")

  const start = Date.now()
  const research = await runPreparationResearch(inputs)
  const ms = Date.now() - start

  console.log(`Completed in ${ms}ms`)
  console.log("")
  console.log("=== Retrieval diagnostics ===")
  for (const d of research.retrieval) {
    console.log(`  ${d.provider}: ${d.status} (${d.count})${d.message ? " — " + d.message : ""}`)
  }
  console.log("")
  console.log(`=== Sources: ${research.sources.length} ===`)
  research.sources.slice(0, 10).forEach((s) => {
    console.log(`  [#${s.id}] (${s.provider}) ${s.title}`)
    console.log(`       ${s.url}`)
    if (s.publisher) console.log(`       publisher: ${s.publisher}`)
  })
  console.log("")
  console.log(`=== Verification ===`)
  console.log(`  verified:   ${research.verified_count}`)
  console.log(`  weak:       ${research.weak_count}`)
  console.log(`  unverified (dropped): ${research.unverified_count}`)
  console.log("")
  console.log(`=== Claims: ${research.claims.length} ===`)
  research.claims.slice(0, 8).forEach((c) => {
    console.log(`  [${c.status}] (${c.category}) ${c.claim}`)
    console.log(`       sources: ${c.source_ids.join(", ")}`)
    if (c.verifier_note) console.log(`       verifier: ${c.verifier_note}`)
  })
  console.log("")
  console.log(`=== Quotes: ${research.quotes.length} ===`)
  research.quotes.slice(0, 4).forEach((q) => {
    console.log(`  "${q.text}"`)
    console.log(`       — ${q.attributed_to} [sources: ${q.source_ids.join(", ")}]`)
  })
  console.log("")
  if (research.notes) {
    console.log(`=== Notes ===`)
    console.log(`  ${research.notes}`)
  }
}

main().catch((err) => {
  console.error("FAIL:", err)
  process.exit(1)
})
