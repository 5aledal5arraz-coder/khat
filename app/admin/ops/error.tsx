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

import { AlertTriangle } from "lucide-react"

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
      {/* Token surface, not a raw `bg-red-50 / text-red-900` panel. The sister
          boundary one level up (app/admin/error.tsx) renders through the UI kit
          on the neutral card surface, and a failed data fetch is not a
          destructive event — the whole-panel red made a transient read error
          look like data loss. `-900` was also two steps past the admin's
          documented `-700` colored-text floor (ui-kit.tsx). The destructive
          token now appears once, on the icon, where it identifies the state
          without shouting it. */}
      <div className="rounded-2xl border border-border/60 bg-card p-6">
        <div className="mb-3 flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/12 text-destructive">
            <AlertTriangle className="h-[18px] w-[18px]" />
          </span>
          <h1 className="text-[17px] font-semibold text-foreground">
            تعذّر تحميل لوحة العمليات
          </h1>
        </div>
        <p className="mb-3 text-[13px] text-muted-foreground">
          حدث خطأ غير متوقع أثناء جلب البيانات. حاول إعادة المحاولة أو إعادة
          تحميل المتصفح.
        </p>
        {error.digest ? (
          <div className="mb-4 break-words rounded-xl border border-border/60 bg-muted/40 p-2 text-[11px] text-muted-foreground">
            رقم للمتابعة مع المطوّر:{" "}
            <span className="font-mono" dir="ltr">
              {error.digest}
            </span>
          </div>
        ) : null}
        {/* `text-background`, not `text-white`: the pair to `bg-foreground` is
            the background token, so the two move together if the palette does.
            Neutral, not red — retrying is safe and idempotent. `min-h-[44px]`
            on mobile for the pointer-target floor. */}
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-[44px] items-center rounded-xl bg-foreground px-3.5 py-1.5 text-[13px] font-medium text-background transition-colors hover:bg-foreground/90 sm:min-h-0"
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  )
}
