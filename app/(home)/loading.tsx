/**
 * Inside `(home)` — a route group — on purpose, and it must stay there.
 *
 * A `loading.tsx` is a Suspense boundary around everything BELOW it. While this
 * file sat at `app/loading.tsx` that meant every route in the app: the shell was
 * flushed with the homepage skeleton before any page function ran, so the
 * response status was already committed as 200 by the time a page called
 * `notFound()`. Next only sets 404 when the error escapes to the top-level
 * render (see `isHTTPAccessFallbackError` in next/dist/server/app-render) — a
 * boundary in the way catches it first and streams the not-found UI into a page
 * that already said "OK". Measured: `/episodes/<bad>`, `/guests/<bad>`,
 * `/topics/<bad>`, `/categories/<bad>` all answered 200 with a «الصفحة غير
 * موجودة» body — a soft 404, which search engines index as a real page.
 *
 * The route group scopes the boundary to `/` alone without changing the URL.
 * It also stops a homepage-shaped skeleton (hero + paths + episode cards) from
 * flashing over /about, /contact, /partner and the admin panel.
 */
export default function HomeLoading() {
  return (
    <div>
      <div className="container mx-auto px-4">
        <div className="mx-auto max-w-2xl">
        {/* Hero skeleton */}
        <div className="flex min-h-[60vh] flex-col items-center justify-center py-16">
          <div className="mx-auto max-w-2xl space-y-6 text-center">
            <div className="mx-auto h-4 w-24 animate-pulse rounded-sm bg-muted" />
            <div className="space-y-3">
              <div className="mx-auto h-8 w-3/4 animate-pulse rounded-sm bg-muted" />
              <div className="mx-auto h-8 w-1/2 animate-pulse rounded-sm bg-muted" />
            </div>
            <div className="mx-auto h-4 w-32 animate-pulse rounded-sm bg-muted" />
          </div>
        </div>
        {/* Paths skeleton */}
        <div className="py-12">
          <div className="mb-8 space-y-2 text-center">
            <div className="mx-auto h-7 w-48 animate-pulse rounded-sm bg-muted" />
            <div className="mx-auto h-4 w-40 animate-pulse rounded-sm bg-muted" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col items-center gap-3 rounded-xl border p-6">
                <div className="h-14 w-14 animate-pulse rounded-full bg-muted" />
                <div className="h-4 w-20 animate-pulse rounded-sm bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded-sm bg-muted" />
              </div>
            ))}
          </div>
        </div>
        {/* Episodes skeleton */}
        <div className="py-12 space-y-4">
          <div className="h-6 w-40 animate-pulse rounded-sm bg-muted" />
          {/* `rounded-2xl` — every 16:9 frame on the site is 16px now. */}
          <div className="aspect-video animate-pulse rounded-2xl bg-muted" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-4 rounded-xl border p-4">
              <div className="h-20 w-32 shrink-0 animate-pulse rounded-lg bg-muted" />
              <div className="flex flex-1 flex-col justify-between">
                <div className="h-4 w-3/4 animate-pulse rounded-sm bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded-sm bg-muted" />
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
    </div>
  )
}
