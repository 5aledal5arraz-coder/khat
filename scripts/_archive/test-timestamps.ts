/**
 * Test script: Verify the full AI architecture — model specialization,
 * global episode intelligence, and editorial quality.
 *
 * Usage: npx tsx scripts/test-timestamps.ts
 */
import fs from "fs"
import path from "path"
// Load .env.local manually
const envPath = path.join(process.cwd(), ".env.local")
const envContent = fs.readFileSync(envPath, "utf-8")
for (const line of envContent.split("\n")) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith("#")) continue
  const eqIdx = trimmed.indexOf("=")
  if (eqIdx === -1) continue
  const key = trimmed.slice(0, eqIdx)
  const val = trimmed.slice(eqIdx + 1)
  if (!process.env[key]) process.env[key] = val
}

import pg from "pg"
import {
  formatSecondsToTimestamp,
  parseTimestampToSeconds,
  STRUCTURE_MODEL,
  EDITORIAL_MODEL,
} from "../lib/ai/client"
import { generateGlobalEpisodeIntelligence } from "../lib/ai/episode-intelligence"
import { generateStudioChapters } from "../lib/ai/studio"
import { generateWebsitePackage } from "../lib/ai/website"

const { Client } = pg

async function main() {
  const dbClient = new Client({ connectionString: process.env.DATABASE_URL })
  await dbClient.connect()

  const sessionId = "7019c529-7879-46ae-a887-d42a85959710"

  // 1. Get session info
  const session = (
    await dbClient.query(
      "SELECT video_title, duration_seconds FROM studio_sessions WHERE id = $1",
      [sessionId]
    )
  ).rows[0]

  console.log("=== EPISODE INFO ===")
  console.log("Title:", session.video_title)
  console.log(
    "Duration:",
    session.duration_seconds,
    "seconds (" + Math.round(session.duration_seconds / 60) + " minutes)"
  )

  // 2. Get transcript
  const transcriptRow = (
    await dbClient.query(
      "SELECT LENGTH(transcript_clean) as chars, transcript_clean FROM studio_transcripts WHERE session_id = $1 AND status = 'ready' ORDER BY created_at DESC LIMIT 1",
      [sessionId]
    )
  ).rows[0]

  console.log("\n=== TRANSCRIPT ===")
  console.log("Total chars:", transcriptRow.chars)

  await dbClient.end()

  console.log("\n=== MODEL ARCHITECTURE ===")
  console.log("STRUCTURE_MODEL:", STRUCTURE_MODEL)
  console.log("EDITORIAL_MODEL:", EDITORIAL_MODEL)

  const transcriptText: string = transcriptRow.transcript_clean

  // 3. Global Episode Intelligence
  console.log("\n=== GLOBAL EPISODE INTELLIGENCE ===")
  const intelStart = Date.now()
  const intelResult = await generateGlobalEpisodeIntelligence(
    transcriptText,
    session.video_title
  )
  const intelDuration = Date.now() - intelStart

  if (!intelResult.success) {
    console.log("INTELLIGENCE FAILED:", intelResult.error)
    process.exit(1)
  }

  const intel = intelResult.data
  console.log("Generation time:", Math.round(intelDuration / 1000) + "s")
  console.log("Model used: EDITORIAL_MODEL (" + EDITORIAL_MODEL + ")")
  console.log("")
  console.log("Narrative Arc:")
  console.log("  Beginning:", intel.narrative_arc.beginning.slice(0, 100) + "...")
  console.log("  Key Insight:", intel.narrative_arc.key_insight.slice(0, 100) + "...")
  console.log("  Conclusion:", intel.narrative_arc.conclusion.slice(0, 100) + "...")
  console.log("")
  console.log("Core Ideas:", intel.core_ideas.length)
  for (const idea of intel.core_ideas.slice(0, 3)) {
    console.log("  →", idea.slice(0, 100) + (idea.length > 100 ? "..." : ""))
  }
  console.log("")
  console.log("Strongest Moments:", intel.strongest_moments.length)
  for (const m of intel.strongest_moments.slice(0, 3)) {
    console.log("  → \"" + m.slice(0, 80) + (m.length > 80 ? "..." : "") + "\"")
  }
  console.log("")
  console.log("Themes:", intel.themes.join("، "))
  console.log("Turning Points:", intel.turning_points.length)
  console.log("Emotional Peaks:", intel.emotional_peaks.length)
  console.log("Guest Profile:", intel.guest_profile ? intel.guest_profile.slice(0, 100) + "..." : "null (monologue)")
  console.log("Episode Essence:", intel.episode_essence.slice(0, 150) + "...")

  // 4. Generate chapters (STRUCTURE_MODEL — no intelligence needed)
  console.log("\n=== GENERATING CHAPTERS (STRUCTURE_MODEL) ===")
  const chStart = Date.now()
  const chapterResult = await generateStudioChapters(
    transcriptText,
    session.video_title,
    session.duration_seconds
  )
  const chDuration = Date.now() - chStart

  if (!chapterResult.success || !chapterResult.data) {
    console.log("CHAPTER GENERATION FAILED:", chapterResult.error)
    process.exit(1)
  }

  const chapters = chapterResult.data.chapters
  console.log("Generation time:", Math.round(chDuration / 1000) + "s")
  console.log("Model used: STRUCTURE_MODEL (" + STRUCTURE_MODEL + ")")
  console.log("Total chapters:", chapters.length)

  const firstCh = chapters[0]
  const lastCh = chapters[chapters.length - 1]
  const lastChSec = parseTimestampToSeconds(lastCh.start_time)

  console.log("")
  console.log("First chapter:", firstCh.start_time, "-", firstCh.title)
  console.log("Last chapter:", lastCh.start_time, "-", lastCh.title)
  console.log(
    "Coverage:",
    Math.round((lastChSec / session.duration_seconds) * 100) + "% of episode"
  )

  console.log("")
  console.log("All chapters:")
  for (const ch of chapters) {
    const sec = parseTimestampToSeconds(ch.start_time)
    const pct = Math.round((sec / session.duration_seconds) * 100)
    console.log(ch.start_time + " [" + pct + "%] " + ch.title)
  }

  // 5. Generate website package (STRUCTURE_MODEL for timestamps + EDITORIAL_MODEL for content, with intelligence)
  console.log("\n=== GENERATING WEBSITE PACKAGE (DUAL MODEL + INTELLIGENCE) ===")
  const webStart = Date.now()
  const webResult = await generateWebsitePackage(
    transcriptText,
    session.video_title,
    session.duration_seconds,
    intel // Pass the global intelligence
  )
  const webDuration = Date.now() - webStart

  if (!webResult.success || !webResult.data) {
    console.log("WEBSITE PACKAGE FAILED:", webResult.error)
    process.exit(1)
  }

  const timestamps = webResult.data.timestamps
  console.log("Generation time:", Math.round(webDuration / 1000) + "s")
  console.log("Timestamps model: STRUCTURE_MODEL (" + STRUCTURE_MODEL + ")")
  console.log("Editorial model: EDITORIAL_MODEL (" + EDITORIAL_MODEL + ")")
  console.log("")
  console.log("Total timestamps:", timestamps.length)

  if (timestamps.length > 0) {
    const lastTs = timestamps[timestamps.length - 1]
    console.log("First:", timestamps[0].time_seconds + "s -", timestamps[0].title)
    console.log("Last:", lastTs.time_seconds + "s -", lastTs.title)
    console.log(
      "Coverage:",
      Math.round((lastTs.time_seconds / session.duration_seconds) * 100) + "%"
    )
  }

  console.log("")
  console.log("All timestamps:")
  for (const ts of timestamps) {
    const pct = Math.round((ts.time_seconds / session.duration_seconds) * 100)
    const desc = ts.description ? " — " + ts.description : ""
    console.log(
      formatSecondsToTimestamp(ts.time_seconds) + " [" + pct + "%] " + ts.title + desc
    )
  }

  // 6. Editorial quality (generated by EDITORIAL_MODEL with intelligence)
  const data = webResult.data
  console.log("\n=== EDITORIAL QUALITY (EDITORIAL_MODEL + INTELLIGENCE) ===")
  console.log("Quotes:", data.quotes.length)
  if (data.quotes.length > 0) {
    console.log("  Sample quotes:")
    for (const q of data.quotes.slice(0, 5)) {
      console.log("  → \"" + q.text.slice(0, 100) + (q.text.length > 100 ? "..." : "") + "\" [" + q.theme + "]")
    }
  }
  console.log("Takeaways:", data.takeaways.length)
  if (data.takeaways.length > 0) {
    console.log("  Sample takeaways:")
    for (const t of data.takeaways.slice(0, 5)) {
      console.log("  → " + t.slice(0, 120) + (t.length > 120 ? "..." : ""))
    }
  }
  console.log("Resources:", data.resources.length)
  console.log("Hero summary:", data.hero_summary)
  console.log("Full summary (first 200 chars):", data.full_summary.slice(0, 200) + "...")

  // 7. Deduplication check — verify no repetitive ideas/quotes
  console.log("\n=== DEDUPLICATION CHECK ===")
  const ideaSet = new Set<string>()
  let duplicateIdeas = 0
  for (const idea of intel.core_ideas) {
    const normalized = idea.slice(0, 30).trim()
    if (ideaSet.has(normalized)) {
      duplicateIdeas++
      console.log("  DUPLICATE IDEA:", idea.slice(0, 80))
    }
    ideaSet.add(normalized)
  }
  console.log("Duplicate ideas:", duplicateIdeas + "/" + intel.core_ideas.length)

  const quoteTexts = data.quotes.map(q => q.text.slice(0, 40))
  const uniqueQuotes = new Set(quoteTexts).size
  console.log("Unique quotes:", uniqueQuotes + "/" + data.quotes.length)

  console.log("\n=== PERFORMANCE SUMMARY ===")
  console.log("Episode Intelligence (EDITORIAL_MODEL):", Math.round(intelDuration / 1000) + "s")
  console.log("Chapters (STRUCTURE_MODEL):", Math.round(chDuration / 1000) + "s")
  console.log("Website Package (DUAL MODEL):", Math.round(webDuration / 1000) + "s")
  console.log("Total:", Math.round((intelDuration + chDuration + webDuration) / 1000) + "s")

  console.log("\n=== TEST COMPLETE ===")
}

main().catch((err) => {
  console.error("FATAL:", err.message)
  process.exit(1)
})
