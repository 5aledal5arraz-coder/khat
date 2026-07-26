/**
 * The local-only gate for the blind judgment panel.
 *
 * Its own leaf module (no imports) so both the page and the server actions can
 * reach it without pulling in `store.ts` → `lib/db.ts` → `pg`. Same rule as
 * `types.ts`: anything the client graph can touch must have no runtime deps.
 */

/**
 * The panel never renders in production.
 *
 * It is a bench instrument, not a feature: it holds full model outputs in a
 * config row, it is meaningless to anyone but the person judging, and its
 * whole value depends on exactly one person seeing exactly one un-revealed
 * session. Shipping it to the droplet would add an admin page that no
 * production operator should ever open.
 *
 * `NODE_ENV` is the gate because it is the one signal that is true on the
 * droplet and false under `npm run dev`, and it cannot be flipped by a
 * request. The page checks it per-request (`dynamic = "force-dynamic"`), and
 * every server action re-checks it — a page gate alone is not a gate, since
 * actions are POST endpoints reachable without ever rendering the page.
 */
export function isBlindPanelEnabled(): boolean {
  return process.env.NODE_ENV !== "production"
}
