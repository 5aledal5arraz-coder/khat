"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft } from "lucide-react"

const LABEL_MAP: Record<string, string> = {
  admin: "الرئيسية",
  episodes: "الحلقات",
  studio: "الاستوديو",
  "home-content": "الصفحة الرئيسية",
  guests: "الضيوف",
  topics: "المواضيع",
  content: "المحتوى",
  analyze: "تحليل",
  submissions: "الطلبات",
  moderation: "الإشراف",
  ads: "الإعلانات",
  analytics: "الإحصائيات",
  "media-kit": "ملف الشراكة",
  settings: "الإعدادات",
  members: "فريق خط",
  newsletter: "النشرة البريدية",
}

export function Breadcrumbs() {
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)

  // Don't show breadcrumbs on the root admin page
  if (segments.length <= 1) return null

  const crumbs = segments.map((segment, index) => {
    const path = "/" + segments.slice(0, index + 1).join("/")
    const label = LABEL_MAP[segment] || decodeURIComponent(segment)
    const isLast = index === segments.length - 1

    return { path, label, isLast }
  })

  return (
    <nav aria-label="Breadcrumb" className="hidden lg:flex items-center gap-1 text-sm">
      {crumbs.map((crumb, index) => (
        <span key={crumb.path} className="flex items-center gap-1">
          {index > 0 && (
            <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground/40" />
          )}
          {crumb.isLast ? (
            <span className="font-medium text-foreground">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.path}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
