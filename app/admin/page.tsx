import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Megaphone,
  PlayCircle,
  Users,
  Mail,
  Inbox,
  TrendingUp,
  ArrowUpRight,
  UserPlus,
  Handshake,
} from "lucide-react"
import { RefreshButton } from "./refresh-button"
import { getEpisodes, getGuests } from "@/lib/supabase/queries"
import { getSubmissionCounts } from "@/lib/admin/queries"

export const dynamic = "force-dynamic"

export default async function AdminDashboard() {
  const [episodes, guests, submissionCounts] = await Promise.all([
    getEpisodes({ limit: 100 }),
    getGuests(),
    getSubmissionCounts(),
  ])

  const stats = [
    {
      label: "الحلقات",
      value: episodes.length,
      icon: PlayCircle,
      href: "/admin/episodes",
      color: "text-blue-600 bg-blue-100",
    },
    {
      label: "الضيوف",
      value: guests.length,
      icon: Users,
      href: "/admin/guests",
      color: "text-purple-600 bg-purple-100",
    },
    {
      label: "طلبات الضيوف",
      value: submissionCounts.guestApplications,
      icon: UserPlus,
      href: "/admin/submissions?tab=guests",
      color: "text-green-600 bg-green-100",
      badge: submissionCounts.guestApplications > 0 ? "جديد" : null,
    },
    {
      label: "طلبات الرعاية",
      value: submissionCounts.sponsorshipLeads,
      icon: Handshake,
      href: "/admin/submissions?tab=sponsors",
      color: "text-amber-600 bg-amber-100",
      badge: submissionCounts.sponsorshipLeads > 0 ? "جديد" : null,
    },
    {
      label: "المشتركين",
      value: submissionCounts.newsletterSubscribers,
      icon: Mail,
      href: "/admin/submissions?tab=newsletter",
      color: "text-rose-600 bg-rose-100",
    },
  ]

  const quickActions = [
    {
      title: "الحلقات",
      description: "تعديل عناوين الحلقات وإدارة المحتوى",
      icon: PlayCircle,
      href: "/admin/episodes",
      color: "bg-blue-500",
    },
    {
      title: "الضيوف",
      description: "إضافة وتعديل معلومات الضيوف",
      icon: Users,
      href: "/admin/guests",
      color: "bg-purple-500",
    },
    {
      title: "الطلبات",
      description: "مراجعة طلبات الضيوف والرعاية",
      icon: Inbox,
      href: "/admin/submissions",
      color: "bg-green-500",
    },
    {
      title: "الإعلانات",
      description: "إدارة الإعلانات والمحتوى المدعوم",
      icon: Megaphone,
      href: "/admin/ads",
      color: "bg-amber-500",
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مرحباً بك في لوحة التحكم</h1>
          <p className="mt-1 text-muted-foreground">
            إدارة محتوى وإعدادات موقع خط
          </p>
        </div>
        <RefreshButton />
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition-all hover:shadow-md hover:border-primary/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}
                  >
                    <stat.icon className="h-5 w-5" />
                  </div>
                  {stat.badge && (
                    <Badge variant="destructive" className="text-xs">
                      {stat.badge}
                    </Badge>
                  )}
                </div>
                <div className="mt-3">
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">إجراءات سريعة</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href}>
              <Card className="h-full transition-all hover:shadow-md hover:border-primary/50 group">
                <CardHeader className="pb-2">
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-xl ${action.color} text-white mb-2`}
                  >
                    <action.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    {action.title}
                    <ArrowUpRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </CardTitle>
                  <CardDescription>{action.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent Activity & Tips */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              عناصر تحتاج مراجعة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {submissionCounts.guestApplications > 0 && (
              <Link
                href="/admin/submissions?tab=guests"
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <UserPlus className="h-5 w-5 text-green-600" />
                  <span>طلبات ضيوف جديدة</span>
                </div>
                <Badge>{submissionCounts.guestApplications}</Badge>
              </Link>
            )}
            {submissionCounts.sponsorshipLeads > 0 && (
              <Link
                href="/admin/submissions?tab=sponsors"
                className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Handshake className="h-5 w-5 text-amber-600" />
                  <span>طلبات رعاية جديدة</span>
                </div>
                <Badge>{submissionCounts.sponsorshipLeads}</Badge>
              </Link>
            )}
            {submissionCounts.guestApplications === 0 &&
              submissionCounts.sponsorshipLeads === 0 && (
                <p className="text-muted-foreground text-center py-4">
                  لا توجد عناصر تحتاج مراجعة حالياً
                </p>
              )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              نظرة سريعة
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">إجمالي الحلقات</span>
              <span className="font-semibold">{episodes.length} حلقة</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">إجمالي الضيوف</span>
              <span className="font-semibold">{guests.length} ضيف</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">مشتركي النشرة</span>
              <span className="font-semibold">
                {submissionCounts.newsletterSubscribers} مشترك
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">طلبات الرعاية</span>
              <span className="font-semibold">
                {submissionCounts.sponsorshipLeads} طلب
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
