/**
 * `/admin/ops` — «الوارد»: the human inbox.
 *
 * Four channels where a PERSON filed something and a person owes them an
 * answer. Everything else on the home page is machine telemetry; this section
 * is the only one where the count means "someone is waiting".
 *
 * Why all four live in one module and one query:
 *   • The «أسئلة الجمهور» channel was the reason this section exists — the
 *     teaser-question queue had no reader on either end. Shipping it alone,
 *     next to three sibling queues that stay invisible, would have replaced one
 *     blind spot with three.
 *   • One round-trip: four scalar sub-selects in a single statement. Four
 *     awaits on four counters is four times the latency on the page every admin
 *     session lands on.
 *
 * The counting rules are load-bearing, and each is defensive for a concrete
 * reason found in the schema:
 *   • `guest_applications.status` and `sponsorship_leads.status` are NULLABLE
 *     with NO CHECK constraint. A NULL there means "never triaged" — i.e. the
 *     most urgent kind of new — so `COALESCE(status,'new')` counts it. Without
 *     it the counter under-reports and the operator is told the inbox is empty.
 *   • `community_contributions` excludes `spam` (NOT NULL, default false):
 *     flagged junk is not a person waiting for an answer.
 *   • `teaser_questions` counts `pending` and NOTHING else — the predicate is
 *     owned by `lib/teaser.ts` so the counter and the review page's default
 *     filter are literally the same SQL.
 */

import { sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { PENDING_TEASER_QUESTIONS_COUNT } from "@/lib/teaser"

export const INBOX_CHANNEL_KEYS = [
  "guest_applications",
  "sponsorship_leads",
  "community_contributions",
  "teaser_questions",
] as const

export type InboxChannelKey = (typeof INBOX_CHANNEL_KEYS)[number]

/** `null` = the count could not be read. NEVER render that as zero. */
export type InboxCounts = Record<InboxChannelKey, number> | null

/**
 * The whole inbox in one statement. Exported so a test can assert the exact
 * predicates — these conditions are the feature, and a silent edit to one of
 * them turns the section back into a queue that lies.
 */
export const INBOX_COUNTS_SQL = sql`
  SELECT
    (SELECT COUNT(*) FROM guest_applications WHERE COALESCE(status, 'new') = 'new')::int AS guest_applications,
    (SELECT COUNT(*) FROM sponsorship_leads WHERE COALESCE(status, 'new') = 'new')::int AS sponsorship_leads,
    (SELECT COUNT(*) FROM community_contributions WHERE status = 'new' AND spam = false)::int AS community_contributions,
    ${PENDING_TEASER_QUESTIONS_COUNT} AS teaser_questions
`

export async function getInboxCounts(): Promise<InboxCounts> {
  if (!db) return null
  try {
    const res = await db.execute(INBOX_COUNTS_SQL)
    const row = res.rows[0] as Record<string, unknown> | undefined
    if (!row) return null
    const out = {} as Record<InboxChannelKey, number>
    for (const key of INBOX_CHANNEL_KEYS) {
      const v = row[key]
      // A partially-readable row is not a readable row: reporting three real
      // counts and one silent zero is worse than reporting nothing.
      if (typeof v !== "number") return null
      out[key] = v
    }
    return out
  } catch (e) {
    console.error("getInboxCounts exception:", e)
    return null
  }
}

export interface InboxChannel {
  key: InboxChannelKey
  label: string
  /** null when unreadable. */
  count: number | null
  /** Opens the channel ALREADY filtered — no second click to see the queue. */
  href: string
  /** Empty-state sentence shown by the destination page, kept here for parity. */
  emptyHint: string
}

const CHANNEL_META: Record<
  InboxChannelKey,
  { label: string; href: string; emptyHint: string }
> = {
  guest_applications: {
    label: "طلبات الضيوف",
    href: "/admin/submissions?tab=guests",
    emptyHint: "ما فيه طلبات ضيوف جديدة",
  },
  sponsorship_leads: {
    label: "طلبات الرعاية",
    href: "/admin/submissions?tab=sponsors",
    emptyHint: "ما فيه طلبات رعاية جديدة",
  },
  community_contributions: {
    label: "مساهمات المجتمع",
    href: "/admin/community",
    emptyHint: "ما فيه مساهمات جديدة",
  },
  teaser_questions: {
    label: "أسئلة الجمهور",
    href: "/admin/teaser-questions?status=pending",
    emptyHint: "ما فيه أسئلة قيد المراجعة",
  },
}

/**
 * Pure derivation — counts in, display rows out. Kept out of the component so
 * the zero-state and unreadable-state rules are unit-testable.
 *
 * Zero is a legitimate, calm answer: it renders as «0» with NO attention dot,
 * and the link still works (the destination shows its own empty message rather
 * than a blank page). An unreadable count renders «—», never «0».
 */
export function buildInboxChannels(counts: InboxCounts): InboxChannel[] {
  return INBOX_CHANNEL_KEYS.map((key) => ({
    key,
    ...CHANNEL_META[key],
    count: counts ? counts[key] : null,
  }))
}

/** Total waiting items, or null if any part of the inbox is unreadable. */
export function totalWaiting(counts: InboxCounts): number | null {
  if (!counts) return null
  return INBOX_CHANNEL_KEYS.reduce((sum, k) => sum + counts[k], 0)
}
