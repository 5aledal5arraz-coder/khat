/**
 * Real-world audit follow-up — inspect evidence URLs per candidate
 * per source for a discovery run.
 *
 *   npm run audit:inspect-evidence -- <run_id>
 *
 * For each candidate in the run, print the source breakdown:
 *   - which sources returned evidence
 *   - the first 2 evidence URLs + titles + snippets per source
 *
 * Goal: diagnose WHY recall is low. Are the sources matching
 * the archetype? Returning real bios? Returning channel landing
 * pages instead of interviews?
 */

import { eq } from "drizzle-orm"
import { mkdir, writeFile } from "node:fs/promises"
import { resolve as resolvePath } from "node:path"
import { db, closeDb } from "@/lib/db"
import { guestDiscoveryCandidates } from "@/lib/db/schema/discovery"

const TAG = "[audit-inspect-evidence]"

async function main(): Promise<void> {
  if (!db) {
    console.error(`${TAG} db is null`)
    process.exit(1)
  }
  const runId = process.argv[2]
  if (!runId) {
    console.error(`${TAG} usage: audit-inspect-evidence.ts <run_id>`)
    process.exit(1)
  }

  const rows = await db
    .select({
      id: guestDiscoveryCandidates.id,
      proposed_name: guestDiscoveryCandidates.proposed_name,
      evidence_urls: guestDiscoveryCandidates.evidence_urls,
      platform_signals: guestDiscoveryCandidates.platform_signals,
      identity_confidence: guestDiscoveryCandidates.identity_confidence,
    })
    .from(guestDiscoveryCandidates)
    .where(eq(guestDiscoveryCandidates.discovery_run_id, runId))

  if (rows.length === 0) {
    console.log(`${TAG} no candidates for run ${runId}`)
    await closeDb()
    return
  }

  // ─── Per-platform tallies + sample URLs ──────────────────────────
  const platformTallies: Record<
    string,
    { count: number; samples: Array<{ name: string | null; url: string; title: string | null; snippet: string | null }> }
  > = {}

  const subSourceTallies: Record<string, number> = {}

  for (const r of rows) {
    const urls = (r.evidence_urls ?? []) as Array<{
      platform: string
      url: string
      title?: string | null
      snippet?: string | null
    }>
    const signals = (r.platform_signals ?? {}) as Record<string, unknown>
    // Editorial / public_voice / network attach sub_source signal
    for (const sigKey of Object.keys(signals)) {
      const sig = signals[sigKey] as Record<string, unknown> | undefined
      const sub = sig?.sub_source
      if (typeof sub === "string") {
        const key = `${sigKey}.${sub}`
        subSourceTallies[key] = (subSourceTallies[key] ?? 0) + 1
      }
    }
    for (const u of urls) {
      platformTallies[u.platform] ??= { count: 0, samples: [] }
      platformTallies[u.platform].count++
      if (platformTallies[u.platform].samples.length < 3) {
        platformTallies[u.platform].samples.push({
          name: r.proposed_name,
          url: u.url,
          title: u.title ?? null,
          snippet: u.snippet ? u.snippet.slice(0, 200) : null,
        })
      }
    }
  }

  const md: string[] = [
    `# Evidence-URL audit — run \`${runId}\``,
    "",
    `Total candidates: ${rows.length}`,
    "",
    `## Per-platform evidence URL counts`,
    "",
    "| Platform | URLs | Sample candidates / titles |",
    "| --- | --- | --- |",
  ]
  for (const [platform, data] of Object.entries(platformTallies).sort(
    ([, a], [, b]) => b.count - a.count,
  )) {
    md.push(
      `| ${platform} | ${data.count} | ${data.samples
        .slice(0, 2)
        .map(
          (s) =>
            `${(s.name ?? "(no name)").slice(0, 30)} ← ${(s.title ?? "(no title)").slice(0, 60)}`,
        )
        .join("<br>")} |`,
    )
  }
  md.push("")

  md.push(`## Sub-source tallies`)
  md.push("")
  md.push("| Sub-source | candidates |")
  md.push("| --- | --- |")
  for (const [key, n] of Object.entries(subSourceTallies).sort(
    ([, a], [, b]) => b - a,
  )) {
    md.push(`| ${key} | ${n} |`)
  }
  md.push("")

  md.push(`## Per-platform sample evidence URLs (verbatim)`)
  md.push("")
  for (const [platform, data] of Object.entries(platformTallies)) {
    md.push(`### ${platform}`)
    for (const s of data.samples) {
      md.push(`- **candidate:** ${s.name ?? "(no name)"}`)
      md.push(`  - **url:** \`${s.url}\``)
      md.push(`  - **title:** ${s.title ?? "(none)"}`)
      if (s.snippet) md.push(`  - **snippet:** ${s.snippet}`)
      md.push("")
    }
  }

  const outDir = resolvePath(process.cwd(), "outputs", "audit-results")
  await mkdir(outDir, { recursive: true })
  await writeFile(resolvePath(outDir, `${runId}.evidence.md`), md.join("\n"))
  console.log(`${TAG} wrote outputs/audit-results/${runId}.evidence.md`)

  // Also print to stdout for the .command window
  console.log("")
  console.log(md.slice(0, 30).join("\n"))

  await closeDb()
}

main().catch(async (err) => {
  console.error(`${TAG} fatal:`, err)
  try {
    await closeDb()
  } catch {}
  process.exit(1)
})
