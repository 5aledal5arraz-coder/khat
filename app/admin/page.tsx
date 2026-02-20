import Link from "next/link"
import {
  PlayCircle,
  Users,
  Mail,
  Inbox,
  UserPlus,
  Handshake,
  Mic,
  Home,
  Settings,
  FileText,
  Clock,
  Pencil,
  ArrowUpLeft,
} from "lucide-react"
import { RefreshButton } from "./refresh-button"
import { getEpisodes, getGuests } from "@/lib/queries/episodes"
import { getSubmissionCounts } from "@/lib/admin/queries"
import { GlowCard } from "./components/glow-card"
import { formatDuration, getYouTubeId } from "@/lib/utils"

export const dynamic = "force-dynamic"

function getRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)

  if (diffMins < 1) return "الآن"
  if (diffMins < 60) return `قبل ${diffMins} دقيقة`
  if (diffHours < 24) return `قبل ${diffHours} ساعة`
  if (diffDays === 1) return "أمس"
  if (diffDays < 7) return `قبل ${diffDays} أيام`
  if (diffWeeks === 1) return "قبل أسبوع"
  if (diffWeeks < 5) return `قبل ${diffWeeks} أسابيع`
  if (diffMonths === 1) return "قبل شهر"
  return `قبل ${diffMonths} أشهر`
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return "صباح الخير"
  return "مساء الخير"
}

export default async function AdminDashboard() {
  const [episodes, guests, submissionCounts] = await Promise.all([
    getEpisodes({ limit: 100 }),
    getGuests(),
    getSubmissionCounts(),
  ])

  const totalNewSubmissions =
    submissionCounts.guestApplications + submissionCounts.sponsorshipLeads

  const recentEpisodes = episodes.slice(0, 5)
  const footerEpisodes = episodes.slice(0, 3)

  const needsAttention = [
    ...(submissionCounts.guestApplications > 0
      ? [
          {
            label: "طلبات ضيوف جديدة",
            count: submissionCounts.guestApplications,
            href: "/admin/submissions?tab=guests",
            icon: UserPlus,
            color: "text-accent",
            bgColor: "bg-accent/10",
          },
        ]
      : []),
    ...(submissionCounts.sponsorshipLeads > 0
      ? [
          {
            label: "طلبات رعاية جديدة",
            count: submissionCounts.sponsorshipLeads,
            href: "/admin/submissions?tab=sponsors",
            icon: Handshake,
            color: "text-primary",
            bgColor: "bg-primary/10",
          },
        ]
      : []),
  ]

  const quickActions = [
    {
      title: "الاستوديو",
      description: "تحضير وإنتاج الحلقات",
      icon: Mic,
      href: "/admin/studio",
      color: "bg-amber-500/10 text-amber-500",
    },
    {
      title: "الصفحة الرئيسية",
      description: "تعديل المحتوى والأقسام",
      icon: Home,
      href: "/admin/home-content",
      color: "bg-emerald-500/10 text-emerald-500",
    },
    {
      title: "ملف الشراكة",
      description: "تحديث ملف Media Kit",
      icon: FileText,
      href: "/admin/media-kit",
      color: "bg-rose-500/10 text-rose-500",
    },
    {
      title: "الإعدادات",
      description: "إعدادات الموقع والثيم",
      icon: Settings,
      href: "/admin/settings",
      color: "bg-muted text-muted-foreground",
    },
  ]

  const todayDate = new Date().toLocaleDateString("ar-u-ca-gregory", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  })

  // KPI subtitle context
  const lastEpisodeRelative = episodes[0]
    ? getRelativeTime(episodes[0].release_date)
    : null
  const totalDurationHours = Math.round(
    episodes.reduce((sum, ep) => sum + (ep.duration_minutes || 0), 0) / 60
  )

  return (
    <div className="space-y-8">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{getGreeting()} 👋</h1>
          <p className="text-sm text-muted-foreground">{todayDate}</p>
        </div>
        <div className="flex items-center gap-3">
          {totalNewSubmissions > 0 && (
            <Link
              href="/admin/submissions"
              className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
            >
              <span className="flex h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              {totalNewSubmissions} بانتظار المراجعة
            </Link>
          )}
          <RefreshButton />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Link href="/admin/episodes">
          <GlowCard color="primary">
            <div className="p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10">
                  <PlayCircle className="h-4 w-4 text-primary" />
                </div>
                <span className="text-xs font-medium">الحلقات</span>
              </div>
              <p className="mt-3 text-3xl font-bold">{episodes.length}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {lastEpisodeRelative
                  ? `آخر حلقة ${lastEpisodeRelative}`
                  : "لا توجد حلقات بعد"}
              </p>
            </div>
          </GlowCard>
        </Link>

        <Link href="/admin/guests">
          <GlowCard color="purple">
            <div className="p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-accent/10">
                  <Users className="h-4 w-4 text-accent" />
                </div>
                <span className="text-xs font-medium">الضيوف</span>
              </div>
              <p className="mt-3 text-3xl font-bold">{guests.length}</p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {totalDurationHours > 0
                  ? `${totalDurationHours}+ ساعة محتوى`
                  : "ابدأ بإضافة ضيوف"}
              </p>
            </div>
          </GlowCard>
        </Link>

        <Link href="/admin/submissions">
          <GlowCard color={totalNewSubmissions > 0 ? "green" : "muted"}>
            <div className="p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/10">
                  <Inbox className="h-4 w-4 text-emerald-500" />
                </div>
                <span className="text-xs font-medium">الطلبات الجديدة</span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <p className="text-3xl font-bold">{totalNewSubmissions}</p>
                {totalNewSubmissions > 0 && (
                  <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                {submissionCounts.guestApplications > 0 &&
                submissionCounts.sponsorshipLeads > 0
                  ? `${submissionCounts.guestApplications} ضيوف · ${submissionCounts.sponsorshipLeads} رعاية`
                  : submissionCounts.guestApplications > 0
                    ? "طلبات ضيوف"
                    : submissionCounts.sponsorshipLeads > 0
                      ? "طلبات رعاية"
                      : "لا توجد طلبات جديدة"}
              </p>
            </div>
          </GlowCard>
        </Link>

        <Link href="/admin/submissions?tab=newsletter">
          <GlowCard color="muted">
            <div className="p-5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-muted">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-xs font-medium">المشتركين</span>
              </div>
              <p className="mt-3 text-3xl font-bold">
                {submissionCounts.newsletterSubscribers}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground/70">
                النشرة البريدية
              </p>
            </div>
          </GlowCard>
        </Link>
      </div>

      {/* Two-Column Content */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left: Needs Attention + Recent Episodes */}
        <div className="space-y-6 lg:col-span-8">
          {/* Needs Attention */}
          <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm">
            <div className="flex items-center gap-2 border-b border-border/30 px-5 py-4">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold">يحتاج انتباهك</h2>
            </div>
            <div className="p-4">
              {needsAttention.length > 0 ? (
                <div className="space-y-2">
                  {needsAttention.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center justify-between rounded-xl p-3 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${item.bgColor}`}
                        >
                          <item.icon className={`h-4 w-4 ${item.color}`} />
                        </div>
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-primary/10 px-2 text-xs font-bold text-primary">
                          {item.count}
                        </span>
                        <ArrowUpLeft className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  لا توجد عناصر تحتاج مراجعة حالياً ✓
                </p>
              )}
            </div>
          </div>

          {/* Recent Episodes */}
          <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-border/30 px-5 py-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">آخر الحلقات</h2>
              </div>
              <Link
                href="/admin/episodes"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                عرض الكل
              </Link>
            </div>
            <div className="divide-y divide-border/20">
              {recentEpisodes.map((ep) => (
                <Link
                  key={ep.id}
                  href={`/admin/episodes/${ep.id}`}
                  className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{ep.title}</p>
                    <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground/70">
                      {ep.guest?.name && <span>{ep.guest.name}</span>}
                      <span>{getRelativeTime(ep.release_date)}</span>
                      {ep.duration_minutes > 0 && (
                        <span>{formatDuration(ep.duration_minutes)}</span>
                      )}
                    </div>
                  </div>
                  <Pencil className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                </Link>
              ))}
              {recentEpisodes.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  لا توجد حلقات بعد
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: Quick Actions */}
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm">
            <div className="border-b border-border/30 px-5 py-4">
              <h2 className="text-sm font-semibold">إجراءات سريعة</h2>
            </div>
            <div className="space-y-1 p-3">
              {quickActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="flex items-center gap-3 rounded-xl p-3 transition-colors hover:bg-muted/50"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${action.color}`}
                  >
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{action.title}</p>
                    <p className="text-[11px] text-muted-foreground/70">
                      {action.description}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity Footer */}
      {footerEpisodes.length > 0 && (
        <div>
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">
            آخر النشاط
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            {footerEpisodes.map((ep) => {
              const ytId = getYouTubeId(ep.youtube_url)
              return (
                <Link
                  key={ep.id}
                  href={`/admin/episodes/${ep.id}`}
                  className="group/footer overflow-hidden rounded-xl border border-border/50 bg-card/80 transition-all hover:border-border"
                >
                  {ytId && (
                    <div className="relative aspect-video w-full overflow-hidden bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                        alt=""
                        className="h-full w-full object-cover transition-transform group-hover/footer:scale-105"
                      />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="line-clamp-1 text-xs font-medium">
                      {ep.title}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/60">
                      {ep.guest?.name && <span>{ep.guest.name}</span>}
                      <span>{getRelativeTime(ep.release_date)}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
