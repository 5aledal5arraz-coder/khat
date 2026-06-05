/**
 * Khat Brain — job handler registry.
 *
 * Handlers are registered by job type at module-load time. The worker
 * imports lib/jobs/registered.ts (which imports every handler module
 * for its side effects) before starting the claim loop.
 */

import type { JobHandler } from "./types"

const handlers = new Map<string, JobHandler>()

export function registerHandler<TPayload = Record<string, unknown>, TResult = Record<string, unknown> | void>(
  type: string,
  handler: JobHandler<TPayload, TResult>,
): void {
  if (handlers.has(type)) {
    // Re-registration is allowed (hot-reload friendly) but we warn —
    // a duplicate in production is usually a bug.
    console.warn(`[jobs] handler for "${type}" was re-registered`)
  }
  handlers.set(type, handler as JobHandler)
}

export function getHandler(type: string): JobHandler | undefined {
  return handlers.get(type)
}

export function listRegisteredTypes(): string[] {
  return Array.from(handlers.keys()).sort()
}
