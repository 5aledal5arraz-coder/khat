"use client"

import Link from "next/link"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "./components/ui-kit"

/**
 * Admin-scoped error boundary. Catches render/data errors thrown by
 * admin pages and renders inside the admin shell (errors thrown by the
 * admin layout itself still bubble to the root app/error.tsx).
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center p-6">
      <div className="w-full">
        <EmptyState
          icon={AlertTriangle}
          title="حدث خطأ غير متوقع في اللوحة"
          description="أعد المحاولة، وإذا تكرر الخطأ شارك المعرّف أدناه مع الفريق التقني."
          action={
            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={reset} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  إعادة المحاولة
                </Button>
                <Link href="/admin/ops">
                  <Button variant="outline" className="gap-2">
                    <Home className="h-4 w-4" />
                    العودة للرئيسية
                  </Button>
                </Link>
              </div>
              {error.digest ? (
                <code
                  dir="ltr"
                  className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {error.digest}
                </code>
              ) : null}
            </div>
          }
        />
      </div>
    </div>
  )
}
