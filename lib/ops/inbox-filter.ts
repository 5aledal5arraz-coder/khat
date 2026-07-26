/**
 * The query-param contract between the «الوارد» card on `/admin/ops` and the
 * pages its links open.
 *
 * WHY THIS IS ITS OWN MODULE
 * --------------------------
 * The card promises, in copy and in `InboxChannel.href`, that a channel opens
 * "ALREADY filtered — no second click to see the queue". For «طلبات الضيوف»
 * and «طلبات الرعاية» that promise was false: both links landed on the full
 * `/admin/submissions` list, so the operator was told «3 بانتظار قرارك» and
 * handed 40 undifferentiated cards.
 *
 * Fixing it means the counter and the destination filter have to agree on ONE
 * definition of "new" — including the NULL case, which is the whole reason the
 * counter uses `COALESCE(status,'new')` (both columns are nullable with no
 * CHECK constraint, and a NULL there means "never triaged", the most urgent
 * kind of new). If the list dropped NULL rows the card would count records the
 * page then refuses to show.
 *
 * This file is PURE and isomorphic on purpose: `lib/ops/inbox.ts` imports the
 * database, so the client component that renders the filtered list cannot
 * import from it. Both ends import from here instead.
 */

/** The param name both the link and the destination page use. */
export const INBOX_STATUS_PARAM = "status"

/** The value «الوارد» sends — the slice the counters count. */
export const INBOX_NEW_STATUS = "new"

/**
 * The in-memory twin of `COALESCE(status, 'new') = <filter>` from
 * `INBOX_COUNTS_SQL`. A null/undefined/empty status counts as `new`, exactly
 * like the SQL, so the list length and the card's number can never disagree.
 *
 * A null `filter` means "no filter" and matches everything — that is the state
 * of the page when it is opened from the sidebar rather than from the card.
 */
export function matchesInboxStatus(
  rowStatus: string | null | undefined,
  filter: string | null,
): boolean {
  if (!filter) return true
  return (rowStatus || INBOX_NEW_STATUS) === filter
}
