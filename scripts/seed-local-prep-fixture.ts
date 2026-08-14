/**
 * Creates ONE preparation row in the LOCAL database so the studio screen can be
 * measured. Local only, and it refuses to run against anything else.
 *
 * WHY IT EXISTS. The preparation studio is the screen Khalid hit four defects
 * on, and none of them were findable without loading it: the tab labels only
 * collapse below 640px, the «٩/٩» badge only lies when a section fails, and the
 * frozen toolbar needs a rejected fetch. A local database with zero preparation
 * rows means that screen has never been opened in a browser here.
 *
 * The fixture reproduces the SHAPE of the real incident — production row
 * b1c03ea8: nine sections where eight are ready and `question_system` carries
 * the timeout error — so the badge, the failure chip and the per-section error
 * state are all exercised.
 *
 *   npx tsx scripts/seed-local-prep-fixture.ts
 */

import { readFileSync } from "node:fs"
import path from "node:path"

for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(path.resolve(__dirname, "..", f), "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
      if (!m || process.env[m[1]]) continue
      let v = m[2].trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      process.env[m[1]] = v
    }
  } catch {
    /* next candidate */
  }
}

/** Fail closed. A fixture must never be able to reach a shared database. */
const url = process.env.DATABASE_URL ?? ""
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
  console.error("REFUSED: DATABASE_URL does not point at localhost. This script is local-only.")
  process.exit(1)
}

const SECTIONS_STATUS = {
  research: { status: "ready", updated_at: new Date().toISOString() },
  executive_summary: { status: "ready", updated_at: new Date().toISOString() },
  knowledge_bank: { status: "ready", updated_at: new Date().toISOString() },
  guest_intelligence: { status: "ready", updated_at: new Date().toISOString() },
  conversation_axes: { status: "ready", updated_at: new Date().toISOString() },
  episode_flow: { status: "ready", updated_at: new Date().toISOString() },
  // The real failure, kept verbatim — this is what made the badge read «٩/٩».
  question_system: {
    status: "error",
    error: "Provider timeout after 280000ms",
    updated_at: new Date().toISOString(),
  },
  host_instructions: { status: "ready", updated_at: new Date().toISOString() },
  quotes_references: { status: "ready", updated_at: new Date().toISOString() },
  viral_moments: { status: "ready", updated_at: new Date().toISOString() },
}

const TEXT = (s: string) => ({ headline: s, what_its_really_about: s, stakes: s, audience_promise: s })

async function main() {
  const { db } = await import("../lib/db")
  const { sql } = await import("drizzle-orm")

  const id = "fixture-local-prep-0001"
  await db!.execute(sql`delete from episode_preparations where id = ${id}`)

  await db!.execute(sql`
    insert into episode_preparations
      (id, title, guest_name, guest_description, short_description, episode_goal,
       key_questions, tone_type, focus_mode, expected_duration_min, depth_level,
       boldness_level, content_focus, sections_status, status,
       executive_summary, knowledge_bank, guest_intelligence, conversation_axes,
       episode_flow, question_system, host_instructions, quotes_references,
       viral_moments, research_data, created_by, created_at, updated_at)
    values
      (${id},
       ${"فِكسْتشر محلي — قياس شاشة الإعداد"},
       ${"ضيف تجريبي"}, ${"وصف تعريفي قصير للضيف"},
       ${"حلقة تجريبية لقياس الواجهة فقط — ليست محتوى حقيقياً."},
       ${"قياس التخطيط والتباين"},
       ${JSON.stringify([])}::jsonb, ${"deep"}, ${"guest"}, ${60}, ${3}, ${3},
       ${JSON.stringify([])}::jsonb,
       ${JSON.stringify(SECTIONS_STATUS)}::jsonb,
       ${"researched"},
       ${JSON.stringify(TEXT("ملخّص تنفيذي تجريبي لقياس الواجهة."))}::jsonb,
       ${JSON.stringify({ key_facts: [], insights: [], angles: [], context: [] })}::jsonb,
       ${JSON.stringify({ personality_analysis: "تحليل تجريبي", communication_style: "أسلوب تجريبي", strengths: [], weaknesses: [], sensitive_zones: [], known_triggers: [], rapport_tips: [] })}::jsonb,
       ${JSON.stringify({ main_themes: [] })}::jsonb,
       ${JSON.stringify({ timeline: [], phases: [] })}::jsonb,
       ${null},
       ${JSON.stringify({ stay_calm_when: [], push_when: [], interrupt_when: [], allow_silence_when: [], if_guest_avoids: [] })}::jsonb,
       ${JSON.stringify({ quotes: [] })}::jsonb,
       ${JSON.stringify({ moments: [] })}::jsonb,
       ${JSON.stringify({ generated_at: new Date().toISOString(), query: "q", queries_used: [], sources: [], retrieval: [], claims: [], quotes: [], past_interviews: [], verified_count: 0, weak_count: 0, unverified_count: 0 })}::jsonb,
       ${"local-fixture"}, now(), now())`)

  const r = await db!.execute(
    sql`select id, title, status from episode_preparations where id = ${id}`,
  )
  const rows = (r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[])
  console.log("seeded:", JSON.stringify(rows))
  console.log(`open: http://localhost:3000/admin/preparation/${id}`)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
