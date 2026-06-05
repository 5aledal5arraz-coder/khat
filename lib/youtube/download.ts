import { execFile } from "child_process"
import { promisify } from "util"
import fs from "fs/promises"
import path from "path"

const execFileAsync = promisify(execFile)

/** Strict YouTube video ID pattern: exactly 11 chars of [A-Za-z0-9_-] */
const VIDEO_ID_REGEX = /^[A-Za-z0-9_-]{11}$/

const COOKIES_PATH = path.join(process.cwd(), "data", "cookies.txt")

/** Max retries per strategy before moving to next */
const MAX_RETRIES = 3
/** Delay between retries (ms) */
const RETRY_DELAY_MS = 5_000
/** Download timeout (10 min — JS challenge alone can take 3-4 min) */
const DOWNLOAD_TIMEOUT_MS = 600_000

interface DownloadResult {
  filePath: string
  cleanup: () => Promise<void>
}

type Strategy = {
  name: string
  args: string[]
}

async function hasCookies(): Promise<boolean> {
  return fs.access(COOKIES_PATH).then(() => true, () => false)
}

/**
 * Resolve the full path to yt-dlp, falling back to common Homebrew locations.
 * Node.js child processes may not inherit the user's full shell PATH.
 */
async function resolveYtDlp(): Promise<string> {
  const candidates = [
    "yt-dlp",                                     // system PATH
    "/usr/local/bin/yt-dlp",                       // Homebrew Intel
    "/opt/homebrew/bin/yt-dlp",                    // Homebrew Apple Silicon
    path.join(process.cwd(), "node_modules", ".bin", "yt-dlp"), // local
  ]

  for (const bin of candidates) {
    try {
      await execFileAsync(bin, ["--version"], { timeout: 5_000 })
      return bin
    } catch {
      // try next
    }
  }

  throw new Error(
    "yt-dlp غير مثبّت أو غير موجود في PATH.\n" +
    "ثبّته عبر: brew install yt-dlp"
  )
}

/** Cache the resolved path after first lookup */
let ytDlpBin: string | null = null

async function getYtDlpBin(): Promise<string> {
  if (ytDlpBin) return ytDlpBin
  ytDlpBin = await resolveYtDlp()
  console.log(`[yt-dlp] Resolved binary: ${ytDlpBin}`)
  return ytDlpBin
}

/**
 * Check yt-dlp + ffmpeg availability on startup (call from server init).
 * Logs warnings if missing — does not throw.
 */
export async function checkDependencies(): Promise<{ ytDlp: boolean; ffmpeg: boolean }> {
  const result = { ytDlp: false, ffmpeg: false }

  try {
    const bin = await getYtDlpBin()
    const { stdout } = await execFileAsync(bin, ["--version"], { timeout: 5_000 })
    console.log(`[yt-dlp] ✓ Found version ${stdout.trim()}`)
    result.ytDlp = true
  } catch {
    console.error("[yt-dlp] ✗ NOT FOUND — YouTube audio extraction will fail. Install: brew install yt-dlp")
  }

  try {
    const { stdout } = await execFileAsync("ffmpeg", ["-version"], { timeout: 5_000 })
    const version = stdout.split("\n")[0] || ""
    console.log(`[ffmpeg] ✓ ${version}`)
    result.ffmpeg = true
  } catch {
    console.error("[ffmpeg] ✗ NOT FOUND — Audio conversion will fail. Install: brew install ffmpeg")
  }

  return result
}

function buildStrategies(videoId: string, outputPath: string, cookies: boolean): Strategy[] {
  const base = [
    "-f", "bestaudio",
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "5",
    "--no-playlist",
    "--no-warnings",
    "-o", outputPath,
  ]

  const strategies: Strategy[] = []

  // Strategy 1: plain download (no cookies)
  strategies.push({
    name: "plain",
    args: [...base, "--", videoId],
  })

  // Strategy 2: with cookies
  if (cookies) {
    strategies.push({
      name: "cookies",
      args: [...base, "--cookies", COOKIES_PATH, "--", videoId],
    })
  }

  // Strategy 3: cookies + spoofed user-agent + geo-bypass
  if (cookies) {
    strategies.push({
      name: "cookies+bypass",
      args: [
        ...base,
        "--cookies", COOKIES_PATH,
        "--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "--no-check-certificates",
        "--geo-bypass",
        "--", videoId,
      ],
    })
  }

  return strategies
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Download audio from a YouTube video using yt-dlp.
 *
 * Tries multiple strategies in order, with retries per strategy:
 *  1. Plain yt-dlp (no cookies) — up to 2 retries
 *  2. With cookies from data/cookies.txt — up to 2 retries
 *  3. Cookies + spoofed user-agent + geo-bypass — up to 2 retries
 *
 * Returns the path to the downloaded MP3 file and a cleanup function.
 * Requires: yt-dlp + ffmpeg installed on the system.
 */
export async function downloadYouTubeAudio(
  videoId: string,
  outputDir: string
): Promise<DownloadResult> {
  if (!VIDEO_ID_REGEX.test(videoId)) {
    throw new Error("معرّف الفيديو غير صالح")
  }

  const bin = await getYtDlpBin()
  await fs.mkdir(outputDir, { recursive: true })

  const outputPath = path.join(outputDir, `${videoId}.mp3`)
  const cookies = await hasCookies()
  const strategies = buildStrategies(videoId, outputPath, cookies)

  const errors: string[] = []

  for (const strategy of strategies) {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Clean up any partial file from a previous attempt
        await fs.unlink(outputPath).catch(() => {})

        console.log(`[yt-dlp] Strategy "${strategy.name}" attempt ${attempt}/${MAX_RETRIES} for ${videoId}`)

        const { stderr } = await execFileAsync(bin, strategy.args, {
          timeout: DOWNLOAD_TIMEOUT_MS,
          maxBuffer: 10 * 1024 * 1024,
          env: { ...process.env, PATH: `${process.env.PATH}:/usr/local/bin:/opt/homebrew/bin` },
        })

        if (stderr) {
          console.warn(`[yt-dlp] stderr: ${stderr.slice(0, 500)}`)
        }

        // Verify the file exists and has content
        const stat = await fs.stat(outputPath)
        if (stat.size < 1024) {
          throw new Error(`Output file too small (${stat.size} bytes) — likely corrupt`)
        }

        console.log(`[yt-dlp] ✓ Success: ${strategy.name} (attempt ${attempt}), ${(stat.size / 1024 / 1024).toFixed(1)} MB`)

        return {
          filePath: outputPath,
          cleanup: async () => {
            try { await fs.unlink(outputPath) } catch { /* ignore */ }
          },
        }
      } catch (err) {
        const isTimeout = err instanceof Error && "killed" in err && (err as unknown as { killed: boolean }).killed
        const msg = isTimeout
          ? `انتهت مهلة التحميل (${DOWNLOAD_TIMEOUT_MS / 1000} ثانية) — الفيديو كبير أو الاتصال بطيء`
          : err instanceof Error ? err.message : String(err)
        const shortMsg = msg.length > 300 ? msg.slice(0, 300) + "..." : msg
        console.error(`[yt-dlp] Strategy "${strategy.name}" attempt ${attempt} failed${isTimeout ? " (TIMEOUT)" : ""}: ${shortMsg}`)
        errors.push(`${strategy.name} (${attempt}/${MAX_RETRIES}): ${shortMsg}`)

        // Wait before retry (but not after last attempt of this strategy)
        if (attempt < MAX_RETRIES) {
          console.log(`[yt-dlp] Retrying in ${RETRY_DELAY_MS / 1000}s...`)
          await sleep(RETRY_DELAY_MS)
        }
      }
    }
  }

  throw new Error(
    `فشل تحميل الصوت من يوتيوب بعد ${errors.length} محاولة.\n` +
    errors.map((e, i) => `  ${i + 1}. ${e}`).join("\n")
  )
}
