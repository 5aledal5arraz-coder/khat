/**
 * Phase X Step 2 — Original Thinking schema migration.
 *
 *   table: original_thinking_topics
 *   npm run migrate:khat-brain-original-thinking
 */

import { db } from "@/lib/db"
import { sql } from "drizzle-orm"

async function exec(label: string, text: string): Promise<void> {
  process.stdout.write(`  · ${label} … `)
  await db!.execute(sql.raw(text))
  console.log("ok")
}

async function main() {
  console.log("Phase X Step 2 — Original Thinking schema\n")

  console.log("original_thinking_topics:")
  await exec(
    "create table",
    `
    CREATE TABLE IF NOT EXISTS original_thinking_topics (
      id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
      title               text NOT NULL,
      lens                text NOT NULL,
      philosophical_frame text NOT NULL,
      conflict            text NOT NULL,
      emotional_hook      text NOT NULL,
      language            text NOT NULL DEFAULT 'ar',
      generated_at        timestamptz NOT NULL DEFAULT now(),
      consumed_at         timestamptz,
      expires_at          timestamptz NOT NULL DEFAULT (now() + interval '90 days')
    )
    `,
  )
  await exec(
    "idx generated_at",
    `CREATE INDEX IF NOT EXISTS idx_original_topics_generated_at
       ON original_thinking_topics (generated_at DESC)`,
  )
  await exec(
    "idx lens",
    `CREATE INDEX IF NOT EXISTS idx_original_topics_lens ON original_thinking_topics (lens)`,
  )
  await exec(
    "idx language",
    `CREATE INDEX IF NOT EXISTS idx_original_topics_language ON original_thinking_topics (language)`,
  )
  await exec(
    "idx unconsumed (partial)",
    // now() is non-IMMUTABLE — Postgres forbids it in index predicates.
    // Filter unconsumed at index level; the expiry check happens at query time.
    `CREATE INDEX IF NOT EXISTS idx_original_topics_unconsumed
       ON original_thinking_topics (generated_at DESC)
       WHERE consumed_at IS NULL`,
  )

  console.log("\nDone!")
  process.exit(0)
}

main().catch((err) => {
  console.error("\n💥 migration failed:", err)
  process.exit(1)
})
