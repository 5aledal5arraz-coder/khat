/**
 * WHO RECEIVES THE «طلب جديد» NOTIFICATIONS — resolved here, written nowhere else.
 *
 * Four call sites each carried their own copy of
 * `env.ADMIN_NOTIFY_EMAIL || "khatpodcast@hotmail.com"`. `ADMIN_NOTIFY_EMAIL`
 * was never set on the droplet, so all four quietly fell through to a hotmail
 * address that predates the podcast's own domain — guest applications, sponsor
 * applications, candidate prep submissions and the partner-task digest all went
 * there, and the code read as if it were configurable.
 *
 * There is deliberately NO fallback address now. An unset variable returns an
 * empty list and the caller fails loudly (a red row in `jobs`, an error in the
 * notification log) instead of succeeding into a mailbox nobody opens. Silent
 * delivery to the wrong place is the failure this module exists to end.
 *
 * The value is a LIST: `ADMIN_NOTIFY_EMAIL="a@x.com, b@y.com"`. Khaled takes
 * these at both khaled@khatpodcast.com (the Zoho box, webmail-only on the free
 * plan) and his personal Gmail, so one address was never going to be enough.
 */
import { env } from "@/lib/env"

/** Split a list var on comma/semicolon/whitespace, keeping only address-shaped entries. */
function parseList(raw: string | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(/[,;\s]+/)) {
    const addr = part.trim()
    // Not full RFC validation — just enough to drop a stray "and" or a trailing
    // comma without silently swallowing a real typo like "a@@b".
    if (!addr || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) continue
    const key = addr.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(addr)
  }
  return out
}

/**
 * Everyone who should see a new public submission. Empty when
 * `ADMIN_NOTIFY_EMAIL` is unset or holds nothing address-shaped — callers must
 * treat that as an error, not as "no one to tell".
 */
export function adminNotifyRecipients(): string[] {
  return parseList(env.ADMIN_NOTIFY_EMAIL)
}

/**
 * Recipients for guest-candidate notifications. `CANDIDATE_NOTIFY_EMAIL` routes
 * them somewhere separate when set; otherwise they join the admin list.
 *
 * A function, not the module-level `const` this replaced: that const read
 * `process.env` once at import, so it froze whatever the environment looked
 * like when the module first loaded and ignored every later change.
 */
export function candidateNotifyRecipients(): string[] {
  const specific = parseList(env.CANDIDATE_NOTIFY_EMAIL)
  return specific.length > 0 ? specific : adminNotifyRecipients()
}

/** `no recipients` message shared by the callers, so the fix reads the same everywhere. */
export const NO_RECIPIENTS_ERROR =
  "ADMIN_NOTIFY_EMAIL is not set (or holds no valid address) — nobody would be notified. Set it in the PM2 env / .env.local as a comma-separated list."
