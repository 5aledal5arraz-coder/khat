/**
 * AI model diagnostics — CLI twin of the admin Settings → AI panel.
 *
 *   npx tsx scripts/ai-models-status.ts            # cached catalog
 *   npx tsx scripts/ai-models-status.ts --refresh  # force /v1/models fetch
 *
 * Shows the live OpenAI catalog state, the effective model per task kind
 * (with its source: default / config override / env / fallback), the
 * fallback order, and when the model list was last refreshed.
 * Strategy doc: docs/ai-model-selection.md
 */

import "@/lib/jobs/load-env"
import { getAiModelsDiagnostics } from "@/lib/ai-router/model-selection"

async function main() {
  const force = process.argv.includes("--refresh")
  const d = await getAiModelsDiagnostics({ forceRefresh: force })

  console.log("── OpenAI model catalog ─────────────────────────────────────")
  console.log(`   refreshed_at : ${d.catalog.refreshedAt ?? "never"}${d.catalog.stale ? "  (stale)" : ""}`)
  console.log(`   text models  : ${d.catalog.textModelCount ?? "unknown (catalog unavailable — fail-open)"}`)
  if (d.catalog.lastError) console.log(`   last_error   : ${d.catalog.lastError}`)
  if (d.catalog.families.length) {
    console.log(`   families     : ${d.catalog.families.map((f) => `${f.label}×${f.models.length}`).join("  ")}`)
  }
  if (d.catalog.newerFamily) {
    console.log(`   ⚠ newer family available: gpt-${d.catalog.newerFamily} — adopt via Settings → AI or KHAT_AI_MODEL_<KIND>`)
  }

  console.log("\n── Effective model per task ─────────────────────────────────")
  for (const t of d.tasks) {
    const src =
      t.effective.source === "fallback"
        ? `FALLBACK (wanted ${t.effective.requestedModel})`
        : t.effective.source
    console.log(
      `   ${t.taskKind.padEnd(13)} ${t.effective.modelName.padEnd(16)} ` +
        `effort=${String(t.effective.reasoningEffort ?? "—").padEnd(7)} ` +
        `src=${src}${t.pricingKnown ? "" : "  (pricing unknown → cost_usd null)"}`,
    )
    console.log(`   ${"".padEnd(13)} chain: ${t.chain.join(" → ")}`)
    if (t.envModel) console.log(`   ${"".padEnd(13)} env override: ${t.envModel}`)
    if (t.effective.fallbackReason) console.log(`   ${"".padEnd(13)} note: ${t.effective.fallbackReason}`)
  }
}

main().catch((err) => {
  console.error("ai-models-status failed:", err)
  process.exit(1)
})
