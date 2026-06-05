/**
 * Isolated YouTube retrieval smoke test.
 * Bypasses Gemini so we can confirm YouTube alone now works with KEY2.
 */
import { youtubeSearch } from "@/lib/ai/preparation/research/youtube"

async function main() {
  const query = "أحلام مستغانمي فلسفة الكتابة"
  console.log(`Querying YouTube: "${query}"`)
  const results = await youtubeSearch(query, 6)
  console.log(`Got ${results.length} sources`)
  results.slice(0, 3).forEach((s, i) => {
    console.log(`\n[${i + 1}] ${s.title}`)
    console.log(`    ${s.url}`)
    console.log(`    publisher: ${s.publisher}`)
    console.log(`    published: ${s.published_at}`)
    console.log(`    views: ${s.metrics?.view_count ?? "—"}`)
    console.log(`    snippet: ${s.snippet.slice(0, 120)}${s.snippet.length > 120 ? "…" : ""}`)
  })
}

main().catch((err) => {
  console.error("FAIL:", err instanceof Error ? err.message : err)
  process.exit(1)
})
