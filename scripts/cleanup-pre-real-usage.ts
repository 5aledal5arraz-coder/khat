/**
 * Pre-real-usage cleanup.
 *
 * Deletes generated/testing/editorial-runtime content. Preserves
 * admin accounts, auth tables, system configuration, editorial
 * constitution (accepted/rejected patterns + fingerprints + feedback
 * + taste profile), reusable reference data, and public-website
 * content (home quotes, daily reflections, etc.).
 *
 * Wraps all deletes in a single transaction so partial failure
 * rolls back to the starting state.
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

interface Plan {
  delete: string[]
  preserve: string[]
}

const PLAN: Plan = {
  // FK-safe order: children before parents.
  delete: [
    // Eir transitions point at eir rows.
    "eir_phase_transitions",
    // Card materials point at interview cards.
    "card_materials",
    // Interview cards point at prep + rooms.
    "interview_cards",
    // Room children.
    "room_markers",
    "room_notes",
    "room_card_states",
    "room_participants",
    // Collaboration rooms reference preparations.
    "collaboration_rooms",
    // Prep responses reference prep links + templates.
    "prep_form_responses",
    "prep_form_links",
    "guest_prep_forms",
    // Episode children (delete before episodes).
    "episode_versions",
    "episode_enrichments",
    "episode_overrides",
    "episode_sponsors",
    "episode_quotes_config",
    "episode_topics",
    "episode_knowledge",
    "episode_knowledge_meta",
    "deleted_episodes",
    // Studio analysis records reference sessions + eir.
    "studio_analysis_records",
    // Studio sessions reference episodes + eir.
    "studio_sessions",
    // Episodes themselves.
    "episodes",
    // Preparations.
    "episode_preparations",
    // Episode intelligence records (workspace spine).
    "episode_intelligence_records",
    // Guest discovery candidates → runs.
    "guest_discovery_candidates",
    "discovery_runs",
    // Guest candidate children → guest_candidates.
    "guest_candidate_outreach_messages",
    "guest_candidate_notifications",
    "guest_candidate_ai_runs",
    "guest_candidate_social_links",
    "guest_candidate_status_history",
    "guest_candidates",
    // Khat map content under seasons.
    "khat_map_season_decisions",
    "khat_map_episode_candidates",
    "khat_map_guest_candidates",
    "khat_map_topic_bank",
    "khat_map_seasons",
    // Generated topics + market intel.
    "hybrid_topic_generations",
    "original_thinking_topics",
    "market_topic_signals",
    "market_topic_clusters",
    "topics",
    // Guest identity profiles point at guests.
    "guest_identity_profiles",
    // Guests last.
    "guests",
    // Telemetry + queue (no FK dependents we care about).
    "ai_runs",
    "jobs",
  ],
  preserve: [
    "admin_users",
    "admin_sessions",
    "admin_audit_logs",
    "config_store",
    "site_settings",
    "static_content",
    "episode_categories",
    "topics_config",
    "prep_form_templates",
    "podcast_platform_links",
    "trusted_partners",
    "khat_map_accepted_patterns",
    "khat_map_rejected_patterns",
    "khat_map_topic_fingerprints",
    "khat_map_user_feedback",
    "khat_map_user_taste_profile",
    "khat_map_channel_fingerprint",
    "home_quotes",
    "daily_reflections",
    "homepage_featured",
    "newsletter_campaigns",
    "newsletter_deliveries",
    "newsletter_links",
    "newsletter_subscribers",
    "sponsorship_leads",
    "visitor_events",
    "visitor_profiles",
    "platform_analytics",
  ],
}

async function tableExists(name: string): Promise<boolean> {
  if (!db) return false
  const r = await db.execute(
    sql`SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename = ${name}`,
  )
  return r.rows.length > 0
}

async function countRows(name: string): Promise<number> {
  if (!db) return 0
  if (!(await tableExists(name))) return -1
  try {
    const r = await db.execute(sql.raw(`SELECT count(*)::int AS n FROM "${name}"`))
    return Number((r.rows[0] as { n?: number } | undefined)?.n ?? 0)
  } catch {
    return -1
  }
}

async function main() {
  if (!db) {
    console.error("DB unavailable — set DATABASE_URL")
    process.exit(1)
  }

  console.log("\n=== BEFORE counts (delete set) ===")
  const beforeCounts = new Map<string, number>()
  let totalToDelete = 0
  for (const t of PLAN.delete) {
    const n = await countRows(t)
    beforeCounts.set(t, n)
    if (n > 0) totalToDelete += n
    console.log(
      `  ${t.padEnd(46)} ${n === -1 ? "(missing)" : n.toString().padStart(6)}`,
    )
  }
  console.log(`  ${"─".repeat(54)}\n  total rows to delete: ${totalToDelete}`)

  console.log("\n=== Executing DELETE in transaction ===")
  await db.execute(sql`BEGIN`)
  try {
    let actualDeleted = 0
    for (const t of PLAN.delete) {
      if (!(await tableExists(t))) {
        console.log(`  skip ${t} (table missing)`)
        continue
      }
      const before = await countRows(t)
      if (before === 0) {
        console.log(`  ${t.padEnd(46)} already empty`)
        continue
      }
      await db.execute(sql.raw(`DELETE FROM "${t}"`))
      const after = await countRows(t)
      const deleted = before - after
      actualDeleted += deleted
      console.log(`  ${t.padEnd(46)} deleted ${deleted}`)
    }
    await db.execute(sql`COMMIT`)
    console.log(`\n  COMMIT — total rows deleted: ${actualDeleted}`)
  } catch (e) {
    await db.execute(sql`ROLLBACK`)
    console.error("\n  ROLLBACK due to:", e instanceof Error ? e.message : e)
    process.exit(1)
  }

  console.log("\n=== AFTER counts (preserve set — should be unchanged) ===")
  for (const t of PLAN.preserve) {
    const n = await countRows(t)
    console.log(
      `  ${t.padEnd(46)} ${n === -1 ? "(missing)" : n.toString().padStart(6)}`,
    )
  }

  console.log("\n=== Integrity probes ===")
  // 1. No orphan EIR transitions.
  const orphanTr = await db.execute(sql`
    SELECT count(*)::int AS n FROM eir_phase_transitions t
    LEFT JOIN episode_intelligence_records e ON e.id = t.eir_id
    WHERE e.id IS NULL
  `)
  console.log("  orphan eir_phase_transitions:", (orphanTr.rows[0] as { n?: number }).n ?? 0)
  // 2. No orphan studio_analysis_records.
  const orphanSar = await db.execute(sql`
    SELECT count(*)::int AS n FROM studio_analysis_records r
    LEFT JOIN episode_intelligence_records e ON e.id = r.eir_id
    LEFT JOIN studio_sessions s ON s.id::text = r.studio_session_id
    WHERE r.eir_id IS NOT NULL AND e.id IS NULL
       OR r.studio_session_id IS NOT NULL AND s.id IS NULL
  `)
  console.log(
    "  orphan studio_analysis_records:",
    (orphanSar.rows[0] as { n?: number }).n ?? 0,
  )
  // 3. No orphan guest_discovery_candidates.
  const orphanGdc = await db.execute(sql`
    SELECT count(*)::int AS n FROM guest_discovery_candidates c
    LEFT JOIN discovery_runs r ON r.id = c.discovery_run_id
    WHERE c.discovery_run_id IS NOT NULL AND r.id IS NULL
  `)
  console.log(
    "  orphan guest_discovery_candidates:",
    (orphanGdc.rows[0] as { n?: number }).n ?? 0,
  )
  // 4. No orphan khat_map_episode_candidates.
  const orphanEc = await db.execute(sql`
    SELECT count(*)::int AS n FROM khat_map_episode_candidates c
    LEFT JOIN khat_map_seasons s ON s.id = c.season_id
    WHERE s.id IS NULL
  `)
  console.log(
    "  orphan khat_map_episode_candidates:",
    (orphanEc.rows[0] as { n?: number }).n ?? 0,
  )

  console.log("\n=== Editorial constitution preserved (sanity) ===")
  for (const t of [
    "khat_map_accepted_patterns",
    "khat_map_rejected_patterns",
    "khat_map_topic_fingerprints",
    "khat_map_user_feedback",
    "khat_map_user_taste_profile",
    "khat_map_channel_fingerprint",
    "admin_users",
    "podcast_platform_links",
  ]) {
    const n = await countRows(t)
    console.log(`  ${t.padEnd(46)} ${n.toString().padStart(6)}`)
  }

  console.log("\n✓ Cleanup complete. System ready for fresh real-world testing.")
}

main().then(() => process.exit(0)).catch((e) => {
  console.error("cleanup-pre-real-usage crashed:", e)
  process.exit(1)
})
