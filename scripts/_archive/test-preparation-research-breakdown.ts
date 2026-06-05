/**
 * Breakdown of a research run by provider and cross-source stats.
 *
 * Prints:
 *  - provider counts
 *  - claim rank (top 5)
 *  - cross-source verified count
 *  - every YouTube source
 *  - every claim that cites YouTube
 *  - every claim that cites BOTH web + YouTube
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
  const start = Date.now()
  const r = await runPreparationResearch(inputs)
  const ms = Date.now() - start

  const byProv: Record<string, number> = {}
  for (const s of r.sources) byProv[s.provider] = (byProv[s.provider] ?? 0) + 1
  console.log(`Completed in ${ms}ms`)
  console.log("")
  console.log("=== Source provider counts ===")
  console.log("  " + JSON.stringify(byProv))
  console.log("")

  const yt = r.sources.filter((s) => s.provider === "youtube")
  const web = r.sources.filter((s) => s.provider === "gemini_web")

  const ytIds = new Set(yt.map((s) => s.id))
  const webIds = new Set(web.map((s) => s.id))

  console.log("=== Claim totals ===")
  console.log(`  total:                 ${r.claims.length}`)
  console.log(`  verified:              ${r.verified_count}`)
  console.log(`  weak:                  ${r.weak_count}`)
  console.log(`  unverified (dropped):  ${r.unverified_count}`)
  console.log("")

  const crossSource = r.claims.filter((c) => c.cross_source_verified)
  const multiProvider = r.claims.filter((c) => c.provider_types.length >= 2)
  const claimsWithYT = r.claims.filter((c) => c.source_ids.some((id) => ytIds.has(id)))
  const claimsWithWeb = r.claims.filter((c) => c.source_ids.some((id) => webIds.has(id)))
  const claimsWithBoth = r.claims.filter(
    (c) =>
      c.source_ids.some((id) => ytIds.has(id)) &&
      c.source_ids.some((id) => webIds.has(id)),
  )

  console.log("=== Cross-source correlation ===")
  console.log(`  cross_source_verified:           ${crossSource.length}`)
  console.log(`  multi-provider (any status):     ${multiProvider.length}`)
  console.log(`  claims citing web:               ${claimsWithWeb.length}`)
  console.log(`  claims citing youtube:           ${claimsWithYT.length}`)
  console.log(`  claims citing BOTH web+youtube:  ${claimsWithBoth.length}`)
  console.log("")

  console.log("=== Top 5 claims by rank ===")
  r.claims.slice(0, 5).forEach((c, i) => {
    const cross = c.cross_source_verified ? " [CROSS]" : ""
    console.log(`  ${i + 1}. [${c.status}]${cross} (${c.category}) ${c.claim}`)
    console.log(
      `       providers=${c.provider_types.join("+")} | source_ids=${c.source_ids.join(",")}`,
    )
  })
  console.log("")

  console.log("=== Claims citing BOTH web + youtube (full list) ===")
  if (claimsWithBoth.length === 0) {
    console.log("  (none)")
  } else {
    claimsWithBoth.forEach((c) => {
      console.log(`  [${c.status}] ${c.claim}`)
      console.log(`       source_ids: ${c.source_ids.join(", ")}`)
    })
  }
  console.log("")

  console.log("=== Claims citing youtube only ===")
  const ytOnly = claimsWithYT.filter((c) => !c.source_ids.some((id) => webIds.has(id)))
  ytOnly.slice(0, 5).forEach((c) => {
    console.log(`  [${c.status}] ${c.claim}`)
    console.log(`       source_ids: ${c.source_ids.join(", ")}`)
  })
}

main().catch((err) => {
  console.error("FAIL:", err)
  process.exit(1)
})
