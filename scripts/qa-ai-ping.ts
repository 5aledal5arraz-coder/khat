/**
 * Cheap AI ping — verifies the OpenAI key + billing works after the
 * audit-time outage. Fires one tiny structural call (gpt-4o-mini) and
 * reports the result. Doesn't seed any season-level data.
 */

import { runAiTask } from "@/lib/ai-router/router"

async function main() {
  console.log("── AI ping ────────────────────────────────────────────")
  const startedAt = Date.now()
  try {
    const r = await runAiTask({
      taskKind: "structural",
      input: { ping: "fix-sprint smoke" },
      prompt: [
        {
          role: "system",
          content:
            "You return strict JSON only. Reply with {\"ok\": true, \"echo\": <input>}.",
        },
        { role: "user", content: 'Echo back the JSON: {"ping":"khat"}' },
      ],
      expectJson: true,
      timeoutMs: 60_000,
    })
    const elapsed = Date.now() - startedAt
    console.log(`   status        : ${r.status}`)
    console.log(`   provider      : ${r.provider}`)
    console.log(`   model         : ${r.modelName}`)
    console.log(`   latency_ms    : ${r.latencyMs}`)
    console.log(`   cost_usd      : $${(r.costUsd ?? 0).toFixed(6)}`)
    console.log(`   tokens_in/out : ${r.tokensIn ?? "—"}/${r.tokensOut ?? "—"}`)
    if (r.errorClass) console.log(`   error_class   : ${r.errorClass}`)
    if (r.errorMessage) console.log(`   error_message : ${r.errorMessage.slice(0, 200)}`)
    console.log(`   raw_text(64)  : ${(r.rawText ?? "").slice(0, 64)}`)
    console.log(`   parsed        : ${JSON.stringify(r.parsed ?? null).slice(0, 100)}`)
    console.log(`\n   total elapsed : ${elapsed}ms`)
    process.exit(r.status === "succeeded" ? 0 : 1)
  } catch (err) {
    console.log(`   threw         : ${err instanceof Error ? err.message : String(err)}`)
    process.exit(2)
  }
}

main()
