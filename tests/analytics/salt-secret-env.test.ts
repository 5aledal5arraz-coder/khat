/**
 * ANALYTICS_SALT_SECRET is checked by scripts/validate-env.ts like the other
 * production keys: a STRICT run (every `prebuild`) fails without it, because
 * without it /api/track silently counts nothing.
 *
 * Spawns the real validator. `process.loadEnvFile` never overrides a variable
 * that is already set, so passing it EMPTY here wins over `.env.local`.
 */
import { spawnSync } from "child_process"
import { describe, it, expect } from "vitest"

function run(value: string, args: string[]) {
  const r = spawnSync("npx", ["tsx", "scripts/validate-env.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ANALYTICS_SALT_SECRET: value, NODE_ENV: "test" },
    encoding: "utf8",
  })
  return { code: r.status, out: `${r.stdout}\n${r.stderr}` }
}

describe("validate-env — ANALYTICS_SALT_SECRET", () => {
  it("strict mode FAILS the run when it is unset, and names it", () => {
    const { code, out } = run("", ["--strict"])
    expect(code).toBe(2)
    expect(out).toMatch(/\[FAIL\]\s+RECOMMENDED\s+ANALYTICS_SALT_SECRET\s+missing or empty/)
    expect(out).toMatch(/STRICT MODE[\s\S]*- ANALYTICS_SALT_SECRET:/)
  }, 30_000)

  it("rejects a short or placeholder value", () => {
    expect(run("short", ["--strict"]).out).toMatch(/ANALYTICS_SALT_SECRET\s+too short/)
    expect(run("a_long_random_string", ["--strict"]).out).toMatch(/ANALYTICS_SALT_SECRET\s+appears to be a placeholder/)
  }, 30_000)

  it("accepts a real 64-hex key", () => {
    const { out } = run("a".repeat(64), ["--strict"])
    expect(out).toMatch(/\[OK\]\s+RECOMMENDED\s+ANALYTICS_SALT_SECRET/)
  }, 30_000)

  it("lax mode only warns (local `npm run dev` keeps working)", () => {
    const { out } = run("", [])
    expect(out).toMatch(/\[FAIL\]\s+RECOMMENDED\s+ANALYTICS_SALT_SECRET/)
    expect(out).not.toMatch(/STRICT MODE —/)
  }, 30_000)
})
