"use client"

import { useState, useEffect, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Users,
  Play,
  TrendingUp,
  Search,
  Save,
  Loader2,
  BarChart3,
  Youtube,
  Twitter,
  Instagram,
  Music2,
  ExternalLink,
  Compass,
  Eye,
} from "lucide-react"
import { GlowCard } from "../components/glow-card"
import type { AnalyticsConfig, PlatformStats } from "@/types/media-kit"

// --- Types ---

interface WebsiteData {
  configured: boolean
  error?: string
  uniqueVisitors: number
  episodeViews: number
  engagementRate: number
  searchCount: number
  totalEvents: number
  topEpisodes: {
    id: string
    title: string
    slug: string
    thumbnail: string | null
    views: number
    deepWatches: number
  }[]
  contentBreakdown: { label: string; count: number }[]
  topSearches: { query: string; count: number }[]
  topPaths: { slug: string; title: string; count: number }[]
}

// --- Constants ---

const PERIODS = [
  { value: "7d", label: "7 أيام" },
  { value: "30d", label: "30 يوم" },
  { value: "90d", label: "90 يوم" },
  { value: "all", label: "الكل" },
]

const defaultSocial: AnalyticsConfig = {
  youtube: { followers: 0, posts: 0, engagement: "0%", url: "" },
  x: { followers: 0, posts: 0, engagement: "0%", url: "" },
  tiktok: { followers: 0, posts: 0, engagement: "0%", url: "" },
  instagram: { followers: 0, posts: 0, engagement: "0%", url: "" },
}

const socialPlatforms = [
  {
    key: "youtube" as const,
    label: "YouTube",
    icon: Youtube,
    color: "#FF0000",
    followersLabel: "مشتركين",
    postsLabel: "فيديو",
  },
  {
    key: "x" as const,
    label: "X (Twitter)",
    icon: Twitter,
    color: "#1DA1F2",
    followersLabel: "متابعين",
    postsLabel: "تغريدة",
  },
  {
    key: "tiktok" as const,
    label: "TikTok",
    icon: Music2,
    color: "#00f2ea",
    followersLabel: "متابعين",
    postsLabel: "فيديو",
  },
  {
    key: "instagram" as const,
    label: "Instagram",
    icon: Instagram,
    color: "#E4405F",
    followersLabel: "متابعين",
    postsLabel: "منشور",
  },
]

const CONTENT_ICONS: Record<string, { icon: React.ElementType; bg: string; text: string }> = {
  "صفحات الحلقات": { icon: Play, bg: "bg-blue-500/10", text: "text-blue-500" },
  "تشغيل الحلقات": { icon: Eye, bg: "bg-indigo-500/10", text: "text-indigo-500" },
  المسارات: { icon: Compass, bg: "bg-purple-500/10", text: "text-purple-500" },
  الضيوف: { icon: Users, bg: "bg-emerald-500/10", text: "text-emerald-500" },
  الاقتباسات: { icon: BarChart3, bg: "bg-amber-500/10", text: "text-amber-500" },
  البحث: { icon: Search, bg: "bg-cyan-500/10", text: "text-cyan-500" },
  المحفوظات: { icon: Save, bg: "bg-pink-500/10", text: "text-pink-500" },
  "مشاهدة 25%": { icon: TrendingUp, bg: "bg-lime-500/10", text: "text-lime-500" },
  "مشاهدة 50%": { icon: TrendingUp, bg: "bg-orange-500/10", text: "text-orange-500" },
  "مشاهدة 90%": { icon: TrendingUp, bg: "bg-red-500/10", text: "text-red-500" },
}

// --- Helpers ---

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return n.toLocaleString()
}

// --- Component ---

export default function AnalyticsPage() {
  const [period, setPeriod] = useState("30d")
  const [websiteData, setWebsiteData] = useState<WebsiteData | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Social media state
  const [social, setSocial] = useState<AnalyticsConfig>(defaultSocial)
  const [socialLoaded, setSocialLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fetch website analytics
  const fetchWebsite = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch(`/api/admin/analytics/website?period=${period}`)
      const data = await res.json()
      setWebsiteData(data)
    } catch {
      setWebsiteData(null)
    }
    setIsLoading(false)
  }, [period])

  // Fetch social stats (once)
  useEffect(() => {
    fetch("/api/admin/analytics")
      .then((r) => r.json())
      .then((data) => {
        setSocial(data)
        setSocialLoaded(true)
      })
      .catch(() => setSocialLoaded(true))
  }, [])

  useEffect(() => {
    fetchWebsite()
  }, [fetchWebsite])

  const handleSaveSocial = async () => {
    setSaving(true)
    await fetch("/api/admin/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(social),
    })
    setSaving(false)
  }

  const updatePlatform = (key: keyof AnalyticsConfig, stats: PlatformStats) => {
    setSocial((prev) => ({ ...prev, [key]: stats }))
  }

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold">تحليلات الموقع</h1>
        {websiteData && websiteData.totalEvents > 0 && (
          <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {formatNumber(websiteData.totalEvents)} حدث
          </span>
        )}
      </div>

      {/* Period tabs */}
      <div className="flex items-center gap-2 rounded-xl border border-border/30 bg-card/50 p-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className={
              period === p.value
                ? "rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm font-medium ring-1 ring-border/50"
                : "rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-white/[0.03]"
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !websiteData || (!websiteData.configured && !websiteData.error) ? (
        /* Supabase not configured */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/[0.03] ring-1 ring-border/50">
            <BarChart3 className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold text-muted-foreground">
            Supabase غير مُهيّأ
          </p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground/60">
            أضف متغيرات البيئة NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY لتفعيل التحليلات
          </p>
        </div>
      ) : websiteData.totalEvents === 0 && !websiteData.error ? (
        /* No data yet */
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/[0.03] ring-1 ring-border/50">
            <BarChart3 className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold text-muted-foreground">
            لا توجد بيانات زوار بعد
          </p>
          <p className="mt-2 max-w-xs text-sm text-muted-foreground/60">
            بيانات الزوار تُجمع تلقائياً عبر نظام التخصيص عند تصفّح الموقع
          </p>
        </div>
      ) : (
        <>
          {/* Error banner */}
          {websiteData.error && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-500">
              {websiteData.error}
            </div>
          )}

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <GlowCard>
              <div className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">زوار الموقع</p>
                  <p className="text-xl font-bold">
                    {formatNumber(websiteData.uniqueVisitors)}
                  </p>
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                  <Play className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">مشاهدات الحلقات</p>
                  <p className="text-xl font-bold">
                    {formatNumber(websiteData.episodeViews)}
                  </p>
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10">
                  <TrendingUp className="h-5 w-5 text-emerald-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">نسبة التفاعل</p>
                  <p className="text-xl font-bold">{websiteData.engagementRate}%</p>
                </div>
              </div>
            </GlowCard>
            <GlowCard>
              <div className="flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10">
                  <Search className="h-5 w-5 text-cyan-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">عمليات البحث</p>
                  <p className="text-xl font-bold">
                    {formatNumber(websiteData.searchCount)}
                  </p>
                </div>
              </div>
            </GlowCard>
          </div>

          {/* Top episodes */}
          {websiteData.topEpisodes.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-card/50">
              <div className="flex items-center gap-3 border-b border-border/20 px-4 py-3">
                <h2 className="text-sm font-semibold">أكثر الحلقات مشاهدة</h2>
                <span className="rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {websiteData.topEpisodes.length} حلقة
                </span>
              </div>
              <div className="divide-y divide-border/20">
                {websiteData.topEpisodes.map((ep, i) => (
                  <div key={ep.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-5 text-center text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    {ep.thumbnail ? (
                      <img
                        src={ep.thumbnail}
                        alt=""
                        className="h-10 w-10 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50">
                        <Play className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{ep.title}</p>
                      {ep.deepWatches > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {ep.deepWatches} مشاهدة عميقة
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {formatNumber(ep.views)} مشاهدة
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Content breakdown */}
          {websiteData.contentBreakdown.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-card/50">
              <div className="border-b border-border/20 px-4 py-3">
                <h2 className="text-sm font-semibold">أكثر الصفحات زيارة</h2>
              </div>
              <div className="divide-y divide-border/20">
                {websiteData.contentBreakdown.map((item) => {
                  const meta = CONTENT_ICONS[item.label] || {
                    icon: BarChart3,
                    bg: "bg-muted/50",
                    text: "text-muted-foreground",
                  }
                  const Icon = meta.icon
                  const maxCount = websiteData.contentBreakdown[0]?.count || 1
                  const widthPercent = Math.max(
                    4,
                    Math.round((item.count / maxCount) * 100)
                  )

                  return (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 px-4 py-2.5"
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${meta.bg}`}
                      >
                        <Icon className={`h-4 w-4 ${meta.text}`} />
                      </div>
                      <span className="min-w-0 flex-1 text-sm">{item.label}</span>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {formatNumber(item.count)}
                      </span>
                      <div className="hidden w-24 sm:block">
                        <div
                          className="h-1.5 rounded-full bg-primary/20"
                          style={{ width: `${widthPercent}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Top searches */}
          {websiteData.topSearches.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-card/50">
              <div className="border-b border-border/20 px-4 py-3">
                <h2 className="text-sm font-semibold">عمليات البحث الشائعة</h2>
              </div>
              <div className="flex flex-wrap gap-2 p-4">
                {websiteData.topSearches.map((s) => (
                  <span
                    key={s.query}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/30 bg-muted/30 px-3 py-1 text-sm"
                  >
                    <Search className="h-3 w-3 text-muted-foreground" />
                    {s.query}
                    <span className="text-xs text-muted-foreground">
                      {s.count}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Top emotional paths */}
          {websiteData.topPaths.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-card/50">
              <div className="border-b border-border/20 px-4 py-3">
                <h2 className="text-sm font-semibold">المسارات الأكثر استكشافاً</h2>
              </div>
              <div className="divide-y divide-border/20">
                {websiteData.topPaths.map((p, i) => (
                  <div
                    key={p.slug}
                    className="flex items-center gap-3 px-4 py-2.5"
                  >
                    <span className="w-5 text-center text-xs text-muted-foreground">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 text-sm font-medium">
                      {p.title}
                    </span>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      {formatNumber(p.count)} نقرة
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Social media stats */}
      {socialLoaded && (
        <div className="rounded-xl border border-border/30 bg-card/50">
          <div className="flex items-center justify-between border-b border-border/20 px-4 py-3">
            <h2 className="text-sm font-semibold">
              إحصائيات التواصل الاجتماعي
            </h2>
            <Button
              size="sm"
              onClick={handleSaveSocial}
              disabled={saving}
              className="h-8 gap-1.5 rounded-xl text-xs"
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saving ? "جارٍ الحفظ..." : "حفظ"}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2 xl:grid-cols-4">
            {socialPlatforms.map((platform) => {
              const Icon = platform.icon
              const stats = social[platform.key]
              return (
                <div key={platform.key} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-xl"
                      style={{ backgroundColor: platform.color + "20" }}
                    >
                      <Icon
                        className="h-4 w-4"
                        style={{ color: platform.color }}
                      />
                    </div>
                    <span className="text-sm font-medium">{platform.label}</span>
                    {stats.url && (
                      <a
                        href={stats.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ms-auto text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[10px] text-muted-foreground">
                        {platform.followersLabel}
                      </label>
                      <Input
                        type="number"
                        value={stats.followers}
                        onChange={(e) =>
                          updatePlatform(platform.key, {
                            ...stats,
                            followers: parseInt(e.target.value) || 0,
                          })
                        }
                        className="h-8 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-muted-foreground">
                        {platform.postsLabel}
                      </label>
                      <Input
                        type="number"
                        value={stats.posts}
                        onChange={(e) =>
                          updatePlatform(platform.key, {
                            ...stats,
                            posts: parseInt(e.target.value) || 0,
                          })
                        }
                        className="h-8 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-muted-foreground">
                        نسبة التفاعل
                      </label>
                      <Input
                        value={stats.engagement}
                        onChange={(e) =>
                          updatePlatform(platform.key, {
                            ...stats,
                            engagement: e.target.value,
                          })
                        }
                        placeholder="مثال: 4.5%"
                        className="h-8 rounded-xl text-xs"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] text-muted-foreground">
                        رابط الحساب
                      </label>
                      <Input
                        value={stats.url}
                        onChange={(e) =>
                          updatePlatform(platform.key, {
                            ...stats,
                            url: e.target.value,
                          })
                        }
                        placeholder="https://..."
                        className="h-8 rounded-xl text-xs"
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
