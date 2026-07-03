/**
 * Derive living themes + resonance/saturation/white-space from the corpus.
 * Usage: npx tsx scripts/corpus-analyze.ts [k]
 */
import "@/lib/jobs/load-env"
import { analyzeCorpus } from "@/lib/corpus/analyze"
import { db } from "@/lib/db"
import { corpusThemes } from "@/lib/db/schema/corpus"
import { desc } from "drizzle-orm"

async function main() {
  const k = Number(process.argv[2] || 40)
  console.log(`Analyzing corpus (k=${k})…`)
  const res = await analyzeCorpus({ k })
  console.log(`embedded=${res.embedded} clusters=${res.clusters} themes=${res.themes}\n`)

  const themes = await db!.select().from(corpusThemes).orderBy(desc(corpusThemes.resonance_score))
  const f = (n: number | null) => (n == null ? "—" : n.toFixed(2))
  console.log("=== MOST RESONANT themes (median engagement × show's own median) ===")
  for (const t of themes.slice(0, 12)) {
    console.log(`  [res ${f(t.resonance_score)} sat ${f(t.saturation_score)} n=${t.episode_count} src=${t.source_count} khat=${t.khat_count}] ${t.label_ar}`)
  }
  console.log("\n=== WHITE SPACE (resonant + under-covered / Khat gap) ===")
  for (const t of themes.filter((x) => x.is_white_space).slice(0, 10)) {
    console.log(`  [res ${f(t.resonance_score)} sat ${f(t.saturation_score)} khat=${t.khat_count}] ${t.label_ar} — ${t.description_ar ?? ""}`)
  }
  console.log("\n=== MOST SATURATED (done-to-death across shows) ===")
  for (const t of [...themes].sort((a, b) => (b.saturation_score ?? 0) - (a.saturation_score ?? 0)).slice(0, 8)) {
    console.log(`  [sat ${f(t.saturation_score)} n=${t.episode_count} src=${t.source_count}] ${t.label_ar}`)
  }
  process.exit(0)
}
main().catch((e) => { console.error(e); process.exit(1) })
