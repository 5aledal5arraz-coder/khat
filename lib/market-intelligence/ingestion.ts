/**
 * Phase X Step 1 — collect signals from preset queries.
 *
 *   runPresetCollection(preset)  → fetch via every adapter, persist with
 *                                  ON CONFLICT DO UPDATE so re-runs are
 *                                  idempotent and never duplicate rows.
 *
 * Preserves AI-extracted fields (theme, emotional_trigger,
 * controversy_score) on conflict so the extraction pass doesn't lose
 * its work when ingestion runs again on the same row.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import {
  ALL_MARKET_SOURCES,
  runAdapter,
  type MarketCollectionResult,
  type MarketRawSignal,
  type MarketSource,
} from "./adapters"
import type { MarketPreset } from "./presets"

export interface PresetRunSummary {
  preset: string
  collected: Array<{ source: MarketSource; result: MarketCollectionResult }>
  inserted: number
}

export async function runPresetCollection(
  preset: MarketPreset,
  opts?: { maxPerSource?: number },
): Promise<PresetRunSummary> {
  const sources = preset.sources ?? ALL_MARKET_SOURCES
  const maxPerSource = opts?.maxPerSource ?? 10
  const collected: Array<{ source: MarketSource; result: MarketCollectionResult }> = []
  let inserted = 0
  for (const src of sources) {
    const result = await runAdapter(src, preset.query, preset.language, maxPerSource)
    collected.push({ source: src, result })
    if (!result.configured) continue
    for (const sig of result.signals) {
      await persistSignal(sig)
      inserted++
    }
  }
  return { preset: preset.label, collected, inserted }
}

export async function persistSignal(s: MarketRawSignal): Promise<void> {
  await db!.execute(sql`
    INSERT INTO market_topic_signals (
      id, source, external_id, title, description, language, view_signal, raw
    ) VALUES (
      gen_random_uuid()::text,
      ${s.source}, ${s.external_id}, ${s.title}, ${s.description}, ${s.language},
      ${s.view_signal}, ${JSON.stringify(s.raw)}::jsonb
    )
    ON CONFLICT (source, external_id) DO UPDATE SET
      title       = EXCLUDED.title,
      description = EXCLUDED.description,
      language    = EXCLUDED.language,
      view_signal = EXCLUDED.view_signal,
      raw         = EXCLUDED.raw
    -- preserve theme, emotional_trigger, controversy_score (set by extraction)
  `)
}
