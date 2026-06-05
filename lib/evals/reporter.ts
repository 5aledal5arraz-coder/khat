/**
 * Khat Brain — Eval report writer.
 *
 * Writes one EvalReport JSON file to evals/results/<feature>/<iso>.json.
 * Also updates evals/baselines.json when explicitly asked (only the
 * CLI baseline subcommand does this).
 */

import { promises as fs } from "node:fs"
import path from "node:path"
import type { EvalFeature, EvalReport } from "./types"

const EVALS_ROOT = path.resolve(process.cwd(), "evals")

export async function writeReport(report: EvalReport): Promise<string> {
  const dir = path.join(EVALS_ROOT, "results", report.feature)
  await fs.mkdir(dir, { recursive: true })
  const fileName = `${report.timestamp.replace(/[:.]/g, "-")}.json`
  const file = path.join(dir, fileName)
  await fs.writeFile(file, JSON.stringify(report, null, 2), "utf8")
  return file
}

export interface BaselineEntry {
  feature: EvalFeature
  prompt_version: string | null
  golden_hash: string
  quality_score: number
  timestamp: string
  /** Path of the source report — useful for tracing later. */
  source_report: string
}

const BASELINES_FILE = path.join(EVALS_ROOT, "baselines.json")

export async function readBaselines(): Promise<Record<string, BaselineEntry>> {
  try {
    const raw = await fs.readFile(BASELINES_FILE, "utf8")
    return JSON.parse(raw) as Record<string, BaselineEntry>
  } catch {
    return {}
  }
}

export async function writeBaseline(entry: BaselineEntry): Promise<void> {
  const all = await readBaselines()
  all[entry.feature] = entry
  await fs.writeFile(BASELINES_FILE, JSON.stringify(all, null, 2), "utf8")
}
