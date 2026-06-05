/**
 * A4 — Environment-variable validator.
 *
 *   npm run validate-env             # uses NODE_ENV to pick mode
 *   npm run validate-env -- --strict # force strict (treat warnings as errors)
 *   npm run validate-env -- --quiet  # only print on failure
 *
 * Runs at prebuild and can be invoked standalone. Exits non-zero when a
 * REQUIRED variable is missing or malformed, so a partial deploy that
 * forgets a key fails the build instead of failing at first runtime
 * call (which would otherwise pollute `ai_runs` / job rows with crashes).
 *
 * Operating modes:
 *   • production (NODE_ENV=production): strict. Missing REQUIRED vars
 *     fail. Missing OPTIONAL vars are reported as warnings.
 *   • development / test / unset: lax. Missing REQUIRED vars print a
 *     warning but exit code stays 0 — local devs can run `npm run dev`
 *     without a full prod env. `--strict` forces production behavior.
 *
 * Never echoes secret values. Every line prints only the variable name
 * + its category + length-class signal (empty / short / present).
 *
 * Validation contract: presence + cheap shape sanity (prefix or length).
 * NO live API calls; this is a one-second prebuild check.
 */

type Severity = "required" | "recommended" | "optional"

interface EnvSpec {
  name: string
  severity: Severity
  description: string
  /** Prefix the value should start with (e.g. "sk-" for OpenAI). Optional. */
  expectedPrefix?: string
  /** Minimum length the value should have. Helps catch placeholders like "TODO". */
  minLength?: number
  /**
   * Allowlist of placeholder values the validator should reject. Catches
   * cases where someone copied `.env.local.example` verbatim and forgot
   * to substitute real values.
   */
  rejectValues?: string[]
}

const SPECS: EnvSpec[] = [
  // Required for the app to function at all.
  {
    name: "DATABASE_URL",
    severity: "required",
    description: "PostgreSQL connection string (server-only)",
    expectedPrefix: "postgres",
    minLength: 30,
    rejectValues: ["your_database_url", "postgres://placeholder"],
  },
  {
    name: "OPENAI_API_KEY",
    severity: "required",
    description: "OpenAI API key for the AI router",
    expectedPrefix: "sk-",
    minLength: 20,
    rejectValues: ["your_openai_key", "sk-..."],
  },

  // Recommended in production; OK to skip in local dev.
  {
    name: "RESEND_API_KEY",
    severity: "recommended",
    description: "Resend API key for transactional email",
    expectedPrefix: "re_",
    minLength: 20,
    rejectValues: ["your_resend_key", "re_..."],
  },
  {
    name: "RESEND_FROM_EMAIL",
    severity: "recommended",
    description: "From address for Resend (e.g. noreply@khatpodcast.com)",
    minLength: 6,
  },
  {
    name: "YOUTUBE_API_KEY",
    severity: "recommended",
    description: "YouTube Data API key (read-only)",
    expectedPrefix: "AIza",
    minLength: 30,
    rejectValues: ["your_youtube_key", "AIza..."],
  },

  // Optional features.
  {
    name: "GEMINI_API_KEY",
    severity: "optional",
    description: "Google Gemini key (AI research preparation module)",
    minLength: 20,
  },
  {
    name: "GOOGLE_CSE_KEY",
    severity: "optional",
    description: "Google Custom Search API key (research)",
    expectedPrefix: "AIza",
    minLength: 30,
  },
  {
    name: "GOOGLE_CSE_CX",
    severity: "optional",
    description: "Google Custom Search engine ID (research)",
    minLength: 10,
  },
  {
    name: "GOOGLE_VIDEO_API_KEY",
    severity: "optional",
    description: "Google Video Intelligence API key",
    expectedPrefix: "AIza",
    minLength: 30,
  },
]

// ─── CLI parsing ──────────────────────────────────────────────────────

interface Args {
  strict: boolean
  quiet: boolean
}

function parseArgs(argv: string[]): Args {
  return {
    strict: argv.includes("--strict"),
    quiet: argv.includes("--quiet"),
  }
}

// ─── Validation ──────────────────────────────────────────────────────

type Outcome =
  | { ok: true; spec: EnvSpec; lengthClass: "short" | "present" }
  | { ok: false; spec: EnvSpec; reason: string }

function classifyLength(len: number): "short" | "present" {
  return len < 16 ? "short" : "present"
}

function validateOne(spec: EnvSpec): Outcome {
  const raw = process.env[spec.name]
  if (!raw || raw.length === 0) {
    return { ok: false, spec, reason: "missing or empty" }
  }
  if (spec.rejectValues?.includes(raw)) {
    return { ok: false, spec, reason: "appears to be a placeholder value" }
  }
  if (spec.minLength != null && raw.length < spec.minLength) {
    return {
      ok: false,
      spec,
      reason: `too short (got ${raw.length}, expected at least ${spec.minLength})`,
    }
  }
  if (spec.expectedPrefix && !raw.startsWith(spec.expectedPrefix)) {
    return {
      ok: false,
      spec,
      reason: `expected to start with "${spec.expectedPrefix}"`,
    }
  }
  return { ok: true, spec, lengthClass: classifyLength(raw.length) }
}

// ─── Reporting ───────────────────────────────────────────────────────

function formatOutcome(o: Outcome): string {
  const pad = (s: string, n: number) => s.padEnd(n)
  const sev = pad(o.spec.severity.toUpperCase(), 11)
  const name = pad(o.spec.name, 24)
  if (o.ok) {
    return `  [OK]    ${sev} ${name} (${o.lengthClass})`
  }
  return `  [FAIL]  ${sev} ${name} ${o.reason}`
}

// ─── Main ─────────────────────────────────────────────────────────────

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const isProd = process.env.NODE_ENV === "production"
  const strict = args.strict || isProd

  const outcomes = SPECS.map(validateOne)
  const failures = outcomes.filter((o) => !o.ok)
  const requiredFailures = failures.filter(
    (o) => o.spec.severity === "required",
  )
  const recommendedFailures = failures.filter(
    (o) => o.spec.severity === "recommended",
  )
  const optionalFailures = failures.filter(
    (o) => o.spec.severity === "optional",
  )

  const willExitNonZero =
    requiredFailures.length > 0 ||
    (strict && recommendedFailures.length > 0)

  if (!args.quiet || willExitNonZero) {
    const mode = strict ? "STRICT" : "LAX"
    console.log(`[validate-env] mode=${mode} NODE_ENV=${process.env.NODE_ENV ?? "<unset>"}`)
    console.log("")
    for (const o of outcomes) {
      console.log(formatOutcome(o))
    }
    console.log("")
    console.log(
      `[validate-env] required=${SPECS.filter((s) => s.severity === "required").length - requiredFailures.length}/${SPECS.filter((s) => s.severity === "required").length}` +
        `  recommended=${SPECS.filter((s) => s.severity === "recommended").length - recommendedFailures.length}/${SPECS.filter((s) => s.severity === "recommended").length}` +
        `  optional=${SPECS.filter((s) => s.severity === "optional").length - optionalFailures.length}/${SPECS.filter((s) => s.severity === "optional").length}`,
    )
  }

  if (willExitNonZero) {
    console.error("")
    if (requiredFailures.length > 0) {
      console.error(
        `[validate-env] FAILED — ${requiredFailures.length} required var(s) missing or malformed:`,
      )
      for (const o of requiredFailures) {
        if (!o.ok) console.error(`  - ${o.spec.name}: ${o.reason}  (${o.spec.description})`)
      }
    }
    if (strict && recommendedFailures.length > 0) {
      console.error("")
      console.error(
        `[validate-env] STRICT MODE — ${recommendedFailures.length} recommended var(s) also failed:`,
      )
      for (const o of recommendedFailures) {
        if (!o.ok) console.error(`  - ${o.spec.name}: ${o.reason}  (${o.spec.description})`)
      }
    }
    console.error("")
    console.error(
      "Set the missing variables in your environment (e.g. .env.local for dev, PM2 ecosystem env block for prod) and re-run.",
    )
    process.exit(2)
  }

  if (recommendedFailures.length > 0 && !args.quiet) {
    console.log("")
    console.log(
      `[validate-env] ${recommendedFailures.length} recommended var(s) absent — features that depend on them will degrade gracefully. Set --strict to fail on these.`,
    )
  }
}

main()
