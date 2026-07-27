/**
 * ص-٩ — one place that knows how to ask a Studio generator to run.
 *
 * Every generate button used to POST with NO body at all, so the
 * server-side cache guard (`b?.force === true`) always read `false` and
 * answered `{ cached: true }`. "إعادة التوليد" was decorative: it
 * returned the same bad output, with no message saying so. The word
 * `force` did not appear anywhere in the Studio UI.
 *
 * `force: true` means a DELIBERATE, billable regeneration — pass it only
 * from an affordance the operator can see and understand, never on an
 * automatic or first-time call. Keeping the shape here (instead of eight
 * hand-rolled fetches) is what stops it drifting apart again.
 */
export interface GenerationOptions {
  force?: boolean
}

export function postGeneration(
  url: string,
  options?: GenerationOptions,
): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ force: options?.force === true }),
  })
}
