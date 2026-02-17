import { readFile, writeFile, mkdir, rename, unlink } from "fs/promises"
import path from "path"
import crypto from "crypto"

const CONFIG_DIR = path.join(process.cwd(), "config")

// ---------------------------------------------------------------------------
// Per-file FIFO write queue — ensures only one write per file at a time
// ---------------------------------------------------------------------------

const writeQueues = new Map<string, Promise<void>>()

function enqueueWrite(filePath: string, fn: () => Promise<void>): Promise<void> {
  const prev = writeQueues.get(filePath) ?? Promise.resolve()
  const next = prev.then(fn, fn) // run even if previous failed
  writeQueues.set(filePath, next)
  // Clean up reference when chain settles
  next.finally(() => {
    if (writeQueues.get(filePath) === next) {
      writeQueues.delete(filePath)
    }
  })
  return next
}

// ---------------------------------------------------------------------------
// Atomic write: write to temp file then rename (prevents partial reads)
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 50

async function atomicWrite(filePath: string, data: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      await writeFile(tmpPath, data, "utf-8")
      await rename(tmpPath, filePath)
      return
    } catch (err) {
      // Clean up temp file on failure
      try { await unlink(tmpPath) } catch { /* ignore */ }
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (attempt + 1)))
      } else {
        throw err
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public factory — drop-in replacement with queue + atomic writes
// ---------------------------------------------------------------------------

export function createConfigStore<T>(filename: string, defaults: T) {
  const filePath = path.join(CONFIG_DIR, filename)

  async function read(): Promise<T> {
    try {
      const data = await readFile(filePath, "utf-8")
      return JSON.parse(data) as T
    } catch {
      return defaults
    }
  }

  async function write(value: T): Promise<void> {
    return enqueueWrite(filePath, () =>
      atomicWrite(filePath, JSON.stringify(value, null, 2))
    )
  }

  return { read, write, filePath }
}
