"use client"

import { useState, useEffect } from "react"
import {
  Loader2,
  Play,
  Users,
  Eye,
  Search,
  TrendingUp,
  Youtube,
  Mail,
  MailOpen,
  MousePointerClick,
  UserPlus,
  Handshake,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  Info,
  Clock,
  Mic2,
  Quote,
  BookOpen,
  Shield,
  EyeOff,
  ThumbsUp,
  MessageCircle,
  BarChart3,
  Activity,
  FileText,
  Clapperboard,
  RefreshCw,
  Save,
  UserCircle,
} from "lucide-react"
import { GlowCard } from "../components/glow-card"
import { formatDate } from "@/lib/shared/formatters"

// ── Types ──────────────────────────────────────────────────────────────────

interface DashboardData {
  platform: {
    totalEpisodes: number
    publishedEpisodes: number
    draftEpisodes: number
    hiddenEpisodes: number
    totalGuests: number
    totalQuotes: number
    totalTimestamps: number
    totalSponsors: number
  }
  submissions: {
    guestApplications: number
    newGuestApplications: number
    sponsorshipLeads: number
    newSponsorshipLeads: number
    thinkerSuggestions: number
    newsletterSubscribers: number
    activeSubscribers: number
  }
  newsletter: {
    totalCampaigns: number
    sentCampaigns: number
    totalEmailsSent: number
    openRate: number
    clickRate: number
    recentCampaigns: {
      id: string
      subject: string
      total_sent: number
      total_opened: number
      total_clicked: number
      sent_at: string
    }[]
  }
  youtube: {
    available: boolean
    channel: {
      title: string
      subscriberCount: number
      videoCount: number
      viewCount: number
      thumbnailUrl: string
    } | null
    recentVideos: {
      id: string
      title: string
      publishedAt: string
      thumbnailUrl: string
      viewCount: number
      likeCount: number
      commentCount: number
      durationSeconds: number
    }[]
    topVideos: {
      id: string
      title: string
      thumbnailUrl: string
      viewCount: number
      likeCount: number
      commentCount: number
    }[]
    totalViews: number
    totalLikes: number
    totalComments: number
    avgViewsPerVideo: number
    avgEngagementRate: number
  }
  visitors: {
    uniqueVisitors: number
    totalEvents: number
    episodeViews: number
    engagementRate: number
    searchCount: number
    topEpisodes: {
      id: string
      title: string
      slug: string
      thumbnail: string | null
      views: number
    }[]
    topSearches: { query: string; count: number }[]
  }
  studio: {
    totalSessions: number
    completedSessions: number
  }
  insights: {
    type: "success" | "warning" | "info"
    title: string
    description: string
  }[]
  recentActivity: {
    type: string
    label: string
    targetName: string
    created_at: string | null
  }[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M"
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K"
  return n.toLocaleString("ar-EG")
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return ""
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return "الآن"
  if (minutes < 60) return `منذ ${minutes} د`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `منذ ${hours} س`
  const days = Math.floor(hours / 24)
  if (days < 7) return `منذ ${days} ي`
  return formatDate(dateStr)
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

const ACTIVITY_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  episode_view: { icon: Eye, color: "text-blue-500" },
  episode_watch: { icon: Play, color: "text-indigo-500" },
  watch_25: { icon: TrendingUp, color: "text-lime-500" },
  watch_50: { icon: TrendingUp, color: "text-orange-500" },
  watch_90: { icon: TrendingUp, color: "text-red-500" },
  guest_open: { icon: UserCircle, color: "text-emerald-500" },
  quote_open: { icon: Quote, color: "text-amber-500" },
  search_used: { icon: Search, color: "text-cyan-500" },
  search: { icon: Search, color: "text-cyan-500" },
  episode_saved: { icon: Save, color: "text-pink-500" },
  save_item: { icon: Save, color: "text-pink-500" },
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  value,
  sub,
  color = "primary" as const,
}: {
  icon: React.ElementType
  iconBg: string
  iconColor: string
  label: string
  value: string | number
  sub?: string
  color?: "primary" | "purple" | "green" | "muted"
}) {
  return (
    <GlowCard color={color}>
      <div className="flex items-center gap-3 p-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums">{value}</p>
          {sub && <p className="text-[10px] text-muted-foreground/60">{sub}</p>}
        </div>
      </div>
    </GlowCard>
  )
}

function SectionHeader({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted/40">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <h2 className="text-sm font-semibold">{title}</h2>
      {badge && (
        <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground/70">
          {badge}
        </span>
      )}
    </div>
  )
}

function MiniBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0
  return (
    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted/30">
      <div className="h-full rounded-full bg-primary/40 transition-all" style={{ width: `${pct}%` }} />
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function AnalyticsDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/analytics/dashboard")
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || "Failed to load dashboard")
      }
      setData(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">جاري تحميل لوحة التحكم...</p>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <p className="text-sm font-medium text-destructive">{error || "فشل تحميل البيانات"}</p>
        <button
          onClick={fetchData}
          className="mt-3 text-xs text-muted-foreground underline hover:text-foreground"
        >
          إعادة المحاولة
        </button>
      </div>
    )
  }

  const { platform, submissions, newsletter, youtube, visitors, studio, insights, recentActivity } = data

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {/* ─── Page Header ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">لوحة التحكم</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">نظرة شاملة على أداء المنصة والقناة</p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 rounded-lg border border-border/30 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          تحديث
        </button>
      </div>

      {/* ─── Smart Insights ──────────────────────────────────────────────── */}
      {insights.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {insights.map((insight, i) => {
            const iconMap = {
              success: { icon: CheckCircle2, bg: "bg-emerald-500/10", color: "text-emerald-500", border: "border-emerald-500/20" },
              warning: { icon: AlertTriangle, bg: "bg-amber-500/10", color: "text-amber-500", border: "border-amber-500/20" },
              info: { icon: Info, bg: "bg-blue-500/10", color: "text-blue-500", border: "border-blue-500/20" },
            }
            const meta = iconMap[insight.type]
            const Icon = meta.icon
            return (
              <div key={i} className={`flex items-start gap-3 rounded-xl border ${meta.border} bg-card/50 p-3`}>
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.bg}`}>
                  <Icon className={`h-4 w-4 ${meta.color}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">{insight.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground leading-relaxed">{insight.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Platform Overview ───────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader icon={BarChart3} title="نظرة عامة على المنصة" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <StatCard icon={Mic2} iconBg="bg-primary/10" iconColor="text-primary" label="إجمالي الحلقات" value={fmt(platform.totalEpisodes)} sub={`${platform.publishedEpisodes} منشورة`} />
          <StatCard icon={Users} iconBg="bg-emerald-500/10" iconColor="text-emerald-500" label="الضيوف" value={fmt(platform.totalGuests)} color="green" />
          <StatCard icon={Quote} iconBg="bg-amber-500/10" iconColor="text-amber-500" label="الاقتباسات" value={fmt(platform.totalQuotes)} color="muted" />
          <StatCard icon={BookOpen} iconBg="bg-indigo-500/10" iconColor="text-indigo-500" label="الفصول الزمنية" value={fmt(platform.totalTimestamps)} color="muted" />
          <StatCard icon={Shield} iconBg="bg-purple-500/10" iconColor="text-purple-500" label="الرعاة" value={fmt(platform.totalSponsors)} color="purple" />
          <StatCard icon={EyeOff} iconBg="bg-muted-foreground/10" iconColor="text-muted-foreground" label="حلقات مخفية" value={fmt(platform.hiddenEpisodes)} color="muted" />
          <StatCard icon={FileText} iconBg="bg-orange-500/10" iconColor="text-orange-500" label="مسودات" value={fmt(platform.draftEpisodes)} color="muted" />
          <StatCard icon={Clapperboard} iconBg="bg-cyan-500/10" iconColor="text-cyan-500" label="جلسات الاستوديو" value={fmt(studio.totalSessions)} sub={`${studio.completedSessions} مكتملة`} color="muted" />
        </div>
      </section>

      {/* ─── Website Visitors (30 day) ───────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader icon={Activity} title="زوار الموقع" badge="آخر 30 يوم" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Users} iconBg="bg-primary/10" iconColor="text-primary" label="زوار فريدون" value={fmt(visitors.uniqueVisitors)} />
          <StatCard icon={Eye} iconBg="bg-blue-500/10" iconColor="text-blue-500" label="مشاهدات الحلقات" value={fmt(visitors.episodeViews)} />
          <StatCard icon={TrendingUp} iconBg="bg-emerald-500/10" iconColor="text-emerald-500" label="نسبة التفاعل العميق" value={`${visitors.engagementRate}%`} color="green" />
          <StatCard icon={Search} iconBg="bg-cyan-500/10" iconColor="text-cyan-500" label="عمليات البحث" value={fmt(visitors.searchCount)} color="muted" />
        </div>

        {/* Top episodes & searches side by side */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Top episodes */}
          {visitors.topEpisodes.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-card/50">
              <div className="border-b border-border/30 px-4 py-3">
                <h3 className="text-[13px] font-semibold">أكثر الحلقات مشاهدة</h3>
              </div>
              <div className="divide-y divide-border/15">
                {visitors.topEpisodes.map((ep, i) => (
                  <div key={ep.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="w-5 text-center text-[11px] font-medium text-muted-foreground/50">{i + 1}</span>
                    {ep.thumbnail ? (
                      <img src={ep.thumbnail} alt="" className="h-9 w-9 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted/40">
                        <Play className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    )}
                    <span className="min-w-0 flex-1 truncate text-[13px]">{ep.title}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmt(ep.views)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top searches */}
          {visitors.topSearches.length > 0 && (
            <div className="rounded-xl border border-border/30 bg-card/50">
              <div className="border-b border-border/30 px-4 py-3">
                <h3 className="text-[13px] font-semibold">عمليات البحث الشائعة</h3>
              </div>
              <div className="flex flex-wrap gap-2 p-4">
                {visitors.topSearches.map((s) => (
                  <span
                    key={s.query}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border/20 bg-muted/20 px-3 py-1.5 text-[13px]"
                  >
                    <Search className="h-3 w-3 text-muted-foreground" />
                    {s.query}
                    <span className="text-[11px] text-muted-foreground">{s.count}</span>
                  </span>
                ))}
              </div>
              {visitors.topSearches.length === 0 && (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground/50">لا توجد بيانات بحث بعد</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ─── YouTube Performance ─────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader icon={Youtube} title="أداء قناة يوتيوب" badge={youtube.available ? "متصل" : "غير متصل"} />

        {youtube.available && youtube.channel ? (
          <>
            {/* Channel KPIs */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <GlowCard color="muted">
                <div className="p-4 text-center">
                  <p className="text-[11px] text-muted-foreground">المشتركون</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{fmt(youtube.channel.subscriberCount)}</p>
                </div>
              </GlowCard>
              <GlowCard color="muted">
                <div className="p-4 text-center">
                  <p className="text-[11px] text-muted-foreground">إجمالي المشاهدات</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{fmt(youtube.channel.viewCount)}</p>
                </div>
              </GlowCard>
              <GlowCard color="muted">
                <div className="p-4 text-center">
                  <p className="text-[11px] text-muted-foreground">عدد الفيديوهات</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{fmt(youtube.channel.videoCount)}</p>
                </div>
              </GlowCard>
              <GlowCard color="muted">
                <div className="p-4 text-center">
                  <p className="text-[11px] text-muted-foreground">متوسط المشاهدات</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{fmt(youtube.avgViewsPerVideo)}</p>
                </div>
              </GlowCard>
              <GlowCard color="muted">
                <div className="p-4 text-center">
                  <p className="text-[11px] text-muted-foreground">معدل التفاعل</p>
                  <p className="mt-1 text-xl font-bold tabular-nums">{youtube.avgEngagementRate}%</p>
                </div>
              </GlowCard>
            </div>

            {/* Aggregate engagement */}
            <div className="grid grid-cols-3 gap-3">
              <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-card/50 p-3">
                <ThumbsUp className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-[11px] text-muted-foreground">إجمالي الإعجابات</p>
                  <p className="text-sm font-semibold tabular-nums">{fmt(youtube.totalLikes)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-card/50 p-3">
                <MessageCircle className="h-4 w-4 text-emerald-500" />
                <div>
                  <p className="text-[11px] text-muted-foreground">إجمالي التعليقات</p>
                  <p className="text-sm font-semibold tabular-nums">{fmt(youtube.totalComments)}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl border border-border/30 bg-card/50 p-3">
                <Eye className="h-4 w-4 text-amber-500" />
                <div>
                  <p className="text-[11px] text-muted-foreground">إجمالي المشاهدات</p>
                  <p className="text-sm font-semibold tabular-nums">{fmt(youtube.totalViews)}</p>
                </div>
              </div>
            </div>

            {/* Top videos & recent videos */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Top performing */}
              {youtube.topVideos.length > 0 && (
                <div className="rounded-xl border border-border/30 bg-card/50">
                  <div className="border-b border-border/30 px-4 py-3">
                    <h3 className="text-[13px] font-semibold">الأكثر مشاهدة على القناة</h3>
                  </div>
                  <div className="divide-y divide-border/15">
                    {youtube.topVideos.map((v, i) => (
                      <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-5 text-center text-[11px] font-medium text-muted-foreground/50">{i + 1}</span>
                        <img src={v.thumbnailUrl} alt="" className="h-9 w-16 rounded-md object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px]">{v.title}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{fmt(v.viewCount)} مشاهدة</span>
                            <span>·</span>
                            <span>{fmt(v.likeCount)} إعجاب</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent uploads */}
              {youtube.recentVideos.length > 0 && (
                <div className="rounded-xl border border-border/30 bg-card/50">
                  <div className="border-b border-border/30 px-4 py-3">
                    <h3 className="text-[13px] font-semibold">آخر الفيديوهات</h3>
                  </div>
                  <div className="divide-y divide-border/15">
                    {youtube.recentVideos.map((v) => (
                      <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                        <img src={v.thumbnailUrl} alt="" className="h-9 w-16 rounded-md object-cover" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px]">{v.title}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{fmt(v.viewCount)} مشاهدة</span>
                            <span>·</span>
                            <span>{formatDuration(v.durationSeconds)}</span>
                            <span>·</span>
                            <span>{timeAgo(v.publishedAt)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-border/30 bg-card/50 px-6 py-12 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/30">
              <Youtube className="h-5 w-5 text-muted-foreground/50" />
            </div>
            <p className="text-[13px] font-medium text-muted-foreground/70">يوتيوب غير متصل</p>
            <p className="mt-1 text-[11px] text-muted-foreground/40">
              أضف YOUTUBE_API_KEY و YOUTUBE_CHANNEL_ID لتفعيل تحليلات يوتيوب
            </p>
          </div>
        )}
      </section>

      {/* ─── Newsletter & Audience ───────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader icon={Mail} title="النشرة البريدية والجمهور" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <GlowCard color="green">
            <div className="p-4 text-center">
              <p className="text-[11px] text-muted-foreground">مشتركون نشطون</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{fmt(submissions.activeSubscribers)}</p>
            </div>
          </GlowCard>
          <GlowCard color="muted">
            <div className="p-4 text-center">
              <p className="text-[11px] text-muted-foreground">إجمالي المشتركين</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{fmt(submissions.newsletterSubscribers)}</p>
            </div>
          </GlowCard>
          <GlowCard color="muted">
            <div className="p-4 text-center">
              <p className="text-[11px] text-muted-foreground">نشرات مرسلة</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{fmt(newsletter.sentCampaigns)}</p>
            </div>
          </GlowCard>
          <GlowCard color="muted">
            <div className="p-4 text-center">
              <p className="text-[11px] text-muted-foreground">معدل الفتح</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{newsletter.openRate}%</p>
            </div>
          </GlowCard>
          <GlowCard color="muted">
            <div className="p-4 text-center">
              <p className="text-[11px] text-muted-foreground">معدل النقر</p>
              <p className="mt-1 text-xl font-bold tabular-nums">{newsletter.clickRate}%</p>
            </div>
          </GlowCard>
        </div>

        {/* Recent campaigns */}
        {newsletter.recentCampaigns.length > 0 && (
          <div className="rounded-xl border border-border/30 bg-card/50">
            <div className="border-b border-border/30 px-4 py-3">
              <h3 className="text-[13px] font-semibold">آخر النشرات المرسلة</h3>
            </div>
            <div className="divide-y divide-border/15">
              {newsletter.recentCampaigns.map((c) => {
                const openRate = c.total_sent > 0 ? Math.round((c.total_opened / c.total_sent) * 100) : 0
                return (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <MailOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px]">{c.subject}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span>{c.total_sent} مرسل</span>
                        <span>·</span>
                        <span>{openRate}% فتح</span>
                        <span>·</span>
                        <span>{c.total_clicked} نقرة</span>
                      </div>
                    </div>
                    <span className="shrink-0 text-[11px] text-muted-foreground/60">{timeAgo(c.sent_at)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </section>

      {/* ─── Submissions Overview ────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader icon={UserPlus} title="الطلبات والنماذج" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/30 bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-emerald-500" />
                <span className="text-[13px]">طلبات الضيوف</span>
              </div>
              {submissions.newGuestApplications > 0 && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                  {submissions.newGuestApplications} جديد
                </span>
              )}
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{submissions.guestApplications}</p>
          </div>
          <div className="rounded-xl border border-border/30 bg-card/50 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Handshake className="h-4 w-4 text-blue-500" />
                <span className="text-[13px]">طلبات الرعاية</span>
              </div>
              {submissions.newSponsorshipLeads > 0 && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                  {submissions.newSponsorshipLeads} جديد
                </span>
              )}
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{submissions.sponsorshipLeads}</p>
          </div>
          <div className="rounded-xl border border-border/30 bg-card/50 p-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <span className="text-[13px]">اقتراحات ضيوف</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{submissions.thinkerSuggestions}</p>
          </div>
          <div className="rounded-xl border border-border/30 bg-card/50 p-4">
            <div className="flex items-center gap-2">
              <MousePointerClick className="h-4 w-4 text-purple-500" />
              <span className="text-[13px]">إجمالي الإيميلات</span>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">{fmt(newsletter.totalEmailsSent)}</p>
          </div>
        </div>
      </section>

      {/* ─── Recent Activity Feed ────────────────────────────────────────── */}
      {recentActivity.length > 0 && (
        <section className="space-y-4">
          <SectionHeader icon={Clock} title="النشاط الأخير" badge={`${visitors.totalEvents} حدث`} />
          <div className="rounded-xl border border-border/30 bg-card/50">
            <div className="divide-y divide-border/15">
              {recentActivity.map((activity, i) => {
                const meta = ACTIVITY_ICONS[activity.type] || { icon: Eye, color: "text-muted-foreground" }
                const Icon = meta.icon
                return (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <Icon className={`h-4 w-4 shrink-0 ${meta.color}`} />
                    <span className="min-w-0 flex-1 text-[13px]">
                      <span className="text-muted-foreground">{activity.label}</span>{" "}
                      <span className="font-medium">{activity.targetName}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-muted-foreground/50">
                      {timeAgo(activity.created_at)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
