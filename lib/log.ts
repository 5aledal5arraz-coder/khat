/**
 * Minimal leveled logger — no dependencies.
 *
 * Why: `console.*` calls can't be gated, so a chatty background worker floods
 * production logs with per-poll noise and there's no consistent structure. This
 * gives four levels (debug < info < warn < error), a `LOG_LEVEL` gate, and
 * `child(ns)` namespacing that prefixes `[ns]`. It writes to the same
 * stdout/stderr streams `console` does, so nothing downstream changes except
 * that sub-threshold lines are dropped.
 *
 * LOG_LEVEL: one of debug|info|warn|error. Defaults to `info` in production,
 * `debug` otherwise. (A load-time knob — read here, not in lib/env.ts.)
 *
 * Adoption is incremental: this is the standard for new code and the worker/jobs
 * backend; the rest of the codebase can migrate its `console.*` calls over time.
 */

export type LogLevel = "debug" | "info" | "warn" | "error"

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 }

function threshold(): number {
  const raw = (process.env.LOG_LEVEL || "").toLowerCase()
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return ORDER[raw]
  }
  return process.env.NODE_ENV === "production" ? ORDER.info : ORDER.debug
}

function emit(level: LogLevel, ns: string | undefined, msg: string, ctx?: unknown): void {
  if (ORDER[level] < threshold()) return
  const line = ns ? `[${ns}] ${msg}` : msg
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log
  if (ctx !== undefined) sink(line, ctx)
  else sink(line)
}

export interface Logger {
  debug(msg: string, ctx?: unknown): void
  info(msg: string, ctx?: unknown): void
  warn(msg: string, ctx?: unknown): void
  error(msg: string, ctx?: unknown): void
  /** Return a namespaced child: `[parent:child] …`. */
  child(ns: string): Logger
}

function make(ns?: string): Logger {
  return {
    debug: (m, c) => emit("debug", ns, m, c),
    info: (m, c) => emit("info", ns, m, c),
    warn: (m, c) => emit("warn", ns, m, c),
    error: (m, c) => emit("error", ns, m, c),
    child: (n) => make(ns ? `${ns}:${n}` : n),
  }
}

/** Root logger. Use `log.child("worker")` etc. for a namespace. */
export const log = make()
