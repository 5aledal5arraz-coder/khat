"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { Loader2, Lock } from "lucide-react"
import type { MediaKitConfig, AnalyticsConfig } from "@/types/media-kit"
import { MediaKitView } from "@/components/media-kit/media-kit-view"

export default function MediaKitSharePage() {
  const params = useParams()
  const slug = params.slug as string

  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [mediaKit, setMediaKit] = useState<MediaKitConfig | null>(null)
  const [analytics, setAnalytics] = useState<AnalyticsConfig | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password.trim()) return

    setLoading(true)
    setError("")

    try {
      const res = await fetch("/api/media-kit/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || "حدث خطأ")
        return
      }

      const data = await res.json()
      setMediaKit(data.mediaKit)
      setAnalytics(data.analytics)
      setUnlocked(true)
    } catch {
      setError("حدث خطأ في الاتصال")
    } finally {
      setLoading(false)
    }
  }

  if (unlocked && mediaKit && analytics) {
    return (
      <div className="fixed inset-0 z-50 overflow-auto bg-[#0a0a0a]">
        <MediaKitView mediaKit={mediaKit} analytics={analytics} />
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0a0a0a]"
      dir="rtl"
      style={{ fontFamily: "'IBM Plex Sans Arabic', -apple-system, sans-serif" }}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_45%,rgba(201,168,76,0.06)_0%,transparent_70%)]" />

      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Logo & Branding */}
        <div className="mb-10 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="KHAT"
            className="mx-auto mb-6 h-16 w-16 rounded-2xl border border-[#333] shadow-[0_0_40px_rgba(201,168,76,0.1)]"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
          />
          <h1 className="text-2xl font-bold text-[#f5f2ed]">بودكاست خط</h1>
          <p className="mt-1 text-xs font-light tracking-[8px] text-[#c9a84c]" dir="ltr">
            KHAT PODCAST
          </p>
        </div>

        {/* Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-[#9a9590]">
            <Lock className="h-4 w-4 text-[#c9a84c]" />
            <span>هذا الملف محمي بكلمة مرور</span>
          </div>

          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="أدخل كلمة المرور"
            className="w-full rounded-xl border border-[#2a2a2a] bg-[#1e1e1e] px-4 py-3 text-sm text-[#e8e4dd] placeholder-[#6b6560] outline-none transition-colors focus:border-[#c9a84c]/40"
            dir="rtl"
            autoFocus
          />

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#c9a84c] px-4 py-3 text-sm font-semibold text-[#0a0a0a] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "عرض الملف"
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
