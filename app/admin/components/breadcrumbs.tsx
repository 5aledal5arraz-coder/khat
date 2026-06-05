"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { useBreadcrumbLabels } from "@/lib/admin/breadcrumb-context"

/**
 * Static segment → Arabic label map. Covers every admin section.
 * Dynamic segments (UUIDs, slugs) get resolved through the breadcrumb
 * label context, which pages populate via `<SetBreadcrumb />`.
 */
const LABEL_MAP: Record<string, string> = {
  // Top-level admin
  admin: "الرئيسية",

  // Episodes / studio / content
  episodes: "الحلقات",
  studio: "الاستوديو",
  "home-content": "الصفحة الرئيسية",
  preparation: "إعداد الحلقة",

  // Guests
  guests: "الضيوف",
  "guest-candidates": "المرشحون",

  // Khat Brain — Seasons
  seasons: "المواسم",
  new: "جديد",

  // Phase 4 — previously leaked as raw Latin slugs in the Arabic
  // breadcrumb (e.g. "الرئيسية > khat-brain > market > signals").
  // Map every Khat Brain segment + its children to operator-friendly
  // Arabic labels.
  ops: "العمليات",
  "khat-brain": "Khat Brain",
  market: "ذكاء السوق",
  signals: "إشارات السوق",
  sources: "المصادر الموثوقة",
  discovery: "اكتشاف الضيوف",
  "original-thinking": "التفكير الأصيل",
  recording: "التسجيل",

  // System / communications
  submissions: "الطلبات",
  partnerships: "الشركاء",
  analytics: "الإحصائيات",
  "media-kit": "ملف الشراكة",
  settings: "الإعدادات",
  team: "فريق خط",
  newsletter: "النشرة البريدية",
  "audio-platforms": "روابط المنصات",
  "rss-sync": "مزامنة RSS",
  subscribers: "المشتركون",
  metrics: "المقاييس",
  health: "الصحة",
  campaigns: "الحملات",
  responses: "الردود",
}

/** UUID v4 detector — used to hide raw ids from breadcrumbs when no override is registered. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(s: string): boolean {
  return UUID_PATTERN.test(s)
}

function looksLikeRawId(segment: string): boolean {
  if (isUuid(segment)) return true
  // Also hide numeric-only or hex-only long strings (slug fallbacks).
  if (/^[0-9]{8,}$/.test(segment)) return true
  if (/^[0-9a-f]{16,}$/i.test(segment)) return true
  return false
}

export function Breadcrumbs() {
  const pathname = usePathname()
  const overrides = useBreadcrumbLabels()
  const segments = pathname.split("/").filter(Boolean)

  // Don't show breadcrumbs on the root admin page
  if (segments.length <= 1) return null

  // Build crumbs, skipping any raw-id segment that has no override —
  // the resolved label from `overrides` is attached to the FULL path,
  // so we check that first and drop the segment entirely if nothing's
  // registered.
  const crumbs: Array<{ path: string; label: string; isLast: boolean }> = []
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const path = "/" + segments.slice(0, i + 1).join("/")

    let label: string | undefined = overrides[path]

    if (!label) {
      if (looksLikeRawId(segment)) {
        // No override registered for a raw id segment — skip it entirely.
        // The breadcrumbs then read as: الرئيسية › خريطة خط › المواسم › (next labeled segment)
        // This is better than leaking a UUID.
        continue
      }
      label = LABEL_MAP[segment]
    }

    if (!label) {
      // Unknown static segment — fall back to URL-decoded text.
      // (Better than nothing, but indicates a missing entry in LABEL_MAP.)
      label = decodeURIComponent(segment)
    }

    crumbs.push({ path, label, isLast: false })
  }

  if (crumbs.length === 0) return null
  crumbs[crumbs.length - 1].isLast = true

  return (
    <nav
      aria-label="Breadcrumb"
      className="hidden lg:flex items-center gap-1.5 text-[13px]"
    >
      {crumbs.map((crumb, index) => (
        <span key={crumb.path} className="flex items-center gap-1.5">
          {index > 0 && (
            <ChevronLeft className="h-3 w-3 text-muted-foreground/30" />
          )}
          {crumb.isLast ? (
            <span className="font-medium text-foreground/90">{crumb.label}</span>
          ) : (
            <Link
              href={crumb.path}
              className="text-muted-foreground/60 transition-colors hover:text-foreground/80"
            >
              {crumb.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
