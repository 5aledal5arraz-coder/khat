import { readFile, writeFile, mkdir } from "fs/promises"
import path from "path"

const LOG_PATH = path.join(process.cwd(), "config", "studio-push-log.json")
const MAX_ENTRIES = 100

export interface PushLogEntry {
  sessionId: string
  episodeId: string
  episodeTitle: string
  pushedFields: string[]
  pushedAt: string
}

async function readLog(): Promise<PushLogEntry[]> {
  try {
    const data = await readFile(LOG_PATH, "utf-8")
    return JSON.parse(data) as PushLogEntry[]
  } catch {
    return []
  }
}

async function writeLog(entries: PushLogEntry[]): Promise<void> {
  const configDir = path.dirname(LOG_PATH)
  await mkdir(configDir, { recursive: true })
  await writeFile(LOG_PATH, JSON.stringify(entries, null, 2), "utf-8")
}

export async function appendPushLog(entry: PushLogEntry): Promise<void> {
  const log = await readLog()
  log.unshift(entry)
  // Keep only the most recent entries
  await writeLog(log.slice(0, MAX_ENTRIES))
}
