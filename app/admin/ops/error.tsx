/**
 * Phase 2.5 (P2.5.b) — Error boundary for `/admin/ops`.
 *
 * Next.js convention: this is a client component that catches errors
 * thrown during rendering of `page.tsx`. Per-section failures don't
 * surface here — they're caught inside `Promise.allSettled` and
 * rendered inline by the section components. This boundary only
 * triggers on rare outer-level failures (e.g., DB module fails to
 * import, render throws synchronously).
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
    <div dir="rtl" lang="ar" className="mx-auto max-w-7xl px-4 py-8 lg:px-6">
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-900">
        <h1 className="mb-2 text-lg font-semibold">تعذّر تحميل لوحة العمليات</h1>
        <p className="mb-3 text-sm">
          حدث خطأ غير متوقع أثناء جلب البيانات. حاول إعادة المحاولة أو إعادة
          تحميل المتصفح.
        </p>
        <div className="mb-4 break-words rounded border border-red-200 bg-card/60 p-2 font-mono text-xs">
          {error.message || "خطأ غير معروف"}
        </div>
        <button
          type="button"
          onClick={reset}
          className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  )
}
