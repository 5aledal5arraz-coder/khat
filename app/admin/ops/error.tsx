/**
 * Phase 2.5 (P2.5.b) — Error boundary for `/admin/ops`.
 *
 * Next.js convention: this is a client component that catches errors
 * thrown during rendering of `page.tsx`. Per-section failures don't
 * surface here — they're caught inside `Promise.allSettled` and
 * rendered inline by the section components. This boundary only
 * triggers on rare outer-level failures (e.g., DB module fails to
 * import, render throws synchronously).
 *
 * `error.message` is deliberately NOT rendered. Next.js sanitizes
 * SERVER errors in production (message replaced, `digest` kept), but a
 * client-side render error keeps its raw message in every environment —
 * so printing it here leaks whatever the throw happened to contain. The
 * `digest` is the correlation key into the server log and is the only
 * technical value shown.
 */

"use client"

export default function OpsErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    // No wrapper padding/width: the admin shell already applies
    // `p-4 lg:p-6` + `max-w-[1400px]`, same as `page.tsx`.
    <div dir="rtl" lang="ar">
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-900">
        <h1 className="mb-2 text-lg font-semibold">تعذّر تحميل لوحة العمليات</h1>
        <p className="mb-3 text-sm">
          حدث خطأ غير متوقع أثناء جلب البيانات. حاول إعادة المحاولة أو إعادة
          تحميل المتصفح.
        </p>
        {error.digest ? (
          <div className="mb-4 break-words rounded border border-red-200 bg-card/60 p-2 text-xs">
            رقم للمتابعة مع المطوّر:{" "}
            <span className="font-mono" dir="ltr">
              {error.digest}
            </span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={reset}
          // Neutral, not red: retrying is a safe, idempotent action —
          // red is reserved for destructive controls.
          className="rounded bg-foreground px-3 py-1.5 text-sm font-medium text-white hover:bg-foreground/90"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  )
}
