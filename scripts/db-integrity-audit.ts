/**
 * Database integrity audit. Read-only.
 * Usage: npx tsx scripts/db-integrity-audit.ts
 */
import { db } from "../lib/db"
import { sql } from "drizzle-orm"

interface Result { section: string; items: string[] }
const results: Result[] = []
const add = (section: string, items: string[]) => results.push({ section, items })

async function main() {
  if (!db) throw new Error("DB not configured")

  // 1. Table list + row counts
  const tables = await db.execute<{ table_name: string }>(sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)
  const counts: string[] = []
  for (const t of tables.rows) {
    const row = await db.execute<{ c: number }>(
      sql.raw(`SELECT count(*)::int AS c FROM "${t.table_name}"`),
    )
    counts.push(`${t.table_name.padEnd(42, " ")} ${row.rows[0].c}`)
  }
  add(`1. Tables (${tables.rows.length} total)`, counts)

  // 2. Foreign key constraints
  const fks = await db.execute<{
    table_name: string
    column_name: string
    foreign_table_name: string
    foreign_column_name: string
    delete_rule: string
  }>(sql`
    SELECT
      tc.table_name,
      kcu.column_name,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name,
      rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
    ORDER BY tc.table_name, kcu.column_name
  `)
  add(`2. Foreign Keys (${fks.rows.length})`, fks.rows.map(
    (r) => `${r.table_name}.${r.column_name} -> ${r.foreign_table_name}.${r.foreign_column_name} [${r.delete_rule}]`,
  ))

  // 3. Orphan detection — key relationships
  const orphanChecks: Array<[string, string]> = [
    [
      "episodes without valid guest_id (if set)",
      `SELECT count(*)::int AS c FROM episodes e LEFT JOIN guests g ON e.guest_id = g.id WHERE e.guest_id IS NOT NULL AND g.id IS NULL`,
    ],
    [
      "quotes with missing episode",
      `SELECT count(*)::int AS c FROM quotes q LEFT JOIN episodes e ON q.episode_id = e.id WHERE q.episode_id IS NOT NULL AND e.id IS NULL`,
    ],
    [
      "timestamps with missing episode",
      `SELECT count(*)::int AS c FROM timestamps t LEFT JOIN episodes e ON t.episode_id = e.id WHERE e.id IS NULL`,
    ],
    [
      "episode_sponsors with missing episode",
      `SELECT count(*)::int AS c FROM episode_sponsors es LEFT JOIN episodes e ON es.episode_id = e.id WHERE e.id IS NULL`,
    ],
    [
      "studio_sessions with missing episode (if episode_id set)",
      `SELECT count(*)::int AS c FROM studio_sessions s LEFT JOIN episodes e ON s.episode_id = e.id WHERE s.episode_id IS NOT NULL AND e.id IS NULL`,
    ],
    [
      "studio_ai_outputs with missing session",
      `SELECT count(*)::int AS c FROM studio_ai_outputs a LEFT JOIN studio_sessions s ON a.session_id = s.id WHERE s.id IS NULL`,
    ],
    [
      "prep_form_links with missing candidate",
      `SELECT count(*)::int AS c FROM prep_form_links l LEFT JOIN guest_candidates c ON l.candidate_id = c.id WHERE c.id IS NULL`,
    ],
    [
      "prep_form_responses with missing link",
      `SELECT count(*)::int AS c FROM prep_form_responses r LEFT JOIN prep_form_links l ON r.prep_link_id = l.id WHERE l.id IS NULL`,
    ],
    [
      "episode_topics with missing episode",
      `SELECT count(*)::int AS c FROM episode_topics et LEFT JOIN episodes e ON et.episode_id = e.id WHERE e.id IS NULL`,
    ],
    [
      "episode_topics with missing topic",
      `SELECT count(*)::int AS c FROM episode_topics et LEFT JOIN topics t ON et.topic_id = t.id WHERE t.id IS NULL`,
    ],
    [
      "episode_versions with missing episode",
      `SELECT count(*)::int AS c FROM episode_versions ev LEFT JOIN episodes e ON ev.episode_id = e.id WHERE e.id IS NULL`,
    ],
    [
      "episode_enrichments with missing episode",
      `SELECT count(*)::int AS c FROM episode_enrichments ee LEFT JOIN episodes e ON ee.episode_id = e.id WHERE e.id IS NULL`,
    ],
    [
      "episode_overrides with missing episode",
      `SELECT count(*)::int AS c FROM episode_overrides eo LEFT JOIN episodes e ON eo.episode_id = e.id WHERE e.id IS NULL`,
    ],
    [
      "admin_sessions with missing user",
      `SELECT count(*)::int AS c FROM admin_sessions s LEFT JOIN admin_users u ON s.user_id = u.id WHERE u.id IS NULL`,
    ],
  ]
  const orphanLines: string[] = []
  for (const [name, q] of orphanChecks) {
    try {
      const res = await db.execute<{ c: number }>(sql.raw(q))
      const c = res.rows[0]?.c ?? 0
      orphanLines.push(`${c === 0 ? "✓" : "✗"} ${name}: ${c}`)
    } catch (e) {
      orphanLines.push(`? ${name}: ERROR — ${(e as Error).message.slice(0, 80)}`)
    }
  }
  add("3. Orphan checks", orphanLines)

  // 4. Unique/check constraints
  const checks = await db.execute<{ table_name: string; constraint_name: string; constraint_type: string }>(sql`
    SELECT table_name, constraint_name, constraint_type
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND constraint_type IN ('UNIQUE','CHECK','PRIMARY KEY')
    ORDER BY table_name, constraint_type
  `)
  const byTable = new Map<string, string[]>()
  for (const r of checks.rows) {
    if (!byTable.has(r.table_name)) byTable.set(r.table_name, [])
    byTable.get(r.table_name)!.push(`${r.constraint_type}: ${r.constraint_name}`)
  }
  const constraintLines: string[] = []
  for (const [t, cs] of [...byTable.entries()].sort()) {
    constraintLines.push(`${t}: ${cs.length} constraints`)
  }
  add(`4. Constraints per table`, constraintLines)

  // 5. Triggers
  const triggers = await db.execute<{ event_object_table: string; trigger_name: string; action_timing: string; event_manipulation: string }>(sql`
    SELECT event_object_table, trigger_name, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
    ORDER BY event_object_table, trigger_name
  `)
  add(
    `5. Triggers (${triggers.rows.length})`,
    triggers.rows.map(
      (r) => `${r.event_object_table}: ${r.trigger_name} (${r.action_timing} ${r.event_manipulation})`,
    ),
  )

  // 6. Schema drift — tables in DB but not in Drizzle schema (and vice-versa)
  // (Just list — comparing against Drizzle requires importing every schema file)

  // 7. Episodes with NULL required fields
  const missingTitle = await db.execute<{ c: number }>(sql`
    SELECT count(*)::int AS c FROM episodes WHERE title IS NULL OR slug IS NULL
  `)
  const missingRelease = await db.execute<{ c: number }>(sql`
    SELECT count(*)::int AS c FROM episodes WHERE release_date IS NULL
  `)
  const dupSlugs = await db.execute<{ slug: string; c: number }>(sql`
    SELECT slug, count(*)::int AS c FROM episodes GROUP BY slug HAVING count(*) > 1
  `)
  add("6. Data quality — episodes", [
    `NULL title/slug: ${missingTitle.rows[0].c}`,
    `NULL release_date: ${missingRelease.rows[0].c}`,
    `Duplicate slugs: ${dupSlugs.rows.length}`,
  ])

  // 8. Indexes
  const indexes = await db.execute<{ tablename: string; indexname: string }>(sql`
    SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public'
    ORDER BY tablename, indexname
  `)
  add(`7. Indexes (${indexes.rows.length})`, [`${indexes.rows.length} total across ${new Set(indexes.rows.map((r) => r.tablename)).size} tables`])

  // Print
  for (const r of results) {
    console.log(`\n=== ${r.section} ===`)
    for (const line of r.items) console.log(`  ${line}`)
  }
  process.exit(0)
}

main().catch((e) => { console.error("FAIL:", e); process.exit(1) })
