"use client"

import { useEffect, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"

const CHECK_INTERVAL_MS = 5 * 60_000

/**
 * Detects that the site was redeployed while this admin tab was open.
 *
 * Why: Server Actions are addressed by build-specific ids. After a deploy,
 * every action invoked from a pre-deploy tab fails with "Failed to find
 * Server Action" — buttons silently do nothing (293 such errors in the
 * week after the 2026-07 redeploy). The watcher snapshots /api/version on
 * mount and re-checks on focus + every 5 minutes; on mismatch it shows a
 * fixed reload banner instead of letting mutations fail silently.
 */
export function VersionWatcher() {
  const baseline = useRef<string | null>(null)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        const res = await fetch("/api/version", { cache: "no-store" })
        if (!res.ok) return
        const { buildId } = (await res.json()) as { buildId?: string }
        if (cancelled || !buildId || buildId === "dev") return
        if (baseline.current === null) {
          baseline.current = buildId
        } else if (buildId !== baseline.current) {
          setStale(true)
        }
      } catch {
        // Network blip — never nag over a failed probe.
      }
    }

    void check()
    const timer = setInterval(check, CHECK_INTERVAL_MS)
    const onFocus = () => void check()
    window.addEventListener("focus", onFocus)
    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener("focus", onFocus)
    }
  }, [])

  if (!stale) return null

  return (
    <div className="fixed bottom-4 start-1/2 z-[100] -translate-x-[-50%] rtl:translate-x-1/2">
      <div className="flex items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-2.5 shadow-lg">
        <RefreshCw className="h-4 w-4 shrink-0 text-amber-700" />
        <span className="text-[13px] font-medium text-amber-800">
          تم تحديث لوحة التحكم — هذه الصفحة تعمل بنسخة قديمة وقد لا تُحفظ التعديلات.
        </span>
        <button
          onClick={() => window.location.reload()}
          className="rounded-lg bg-amber-600 px-3 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-amber-700"
        >
          إعادة التحميل
        </button>
      </div>
    </div>
  )
}
