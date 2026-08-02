import { Metadata } from "next"
import Link from "next/link"
import {
  Users,
  Handshake,
  Mic,
  Mail,
  ArrowLeft,
} from "lucide-react"

export const metadata: Metadata = {
  title: "المزيد",
}

const menuItems = [
  { href: "/guests", icon: Users, label: "الضيوف", description: "تعرّف على ضيوف خط" },
  { href: "/sponsor", icon: Handshake, label: "كن شريكاً", description: "فرص الشراكة" },
  { href: "/guest", icon: Mic, label: "كن ضيفاً", description: "قدّم طلب ضيافة" },
  { href: "/contact", icon: Mail, label: "تواصل معنا", description: "كلّمنا" },
]

/**
 * MEASURED BEFORE (2026-08-02, 1280px): each entry was a bare `flex` row inside
 * the full-width `.container`, so the row box was 1240px wide around 114–159px
 * of ink — 1059–1104px of invisible click target per row, and the page read as
 * 85% empty. At 375px the same rows still carried 162–207px of dead width.
 *
 * The row was never the problem on its own: a start-aligned row only looks
 * broken when nothing caps it and nothing sits at the far end. So the page gets
 * an editorial column (`max-w-3xl`), a two-up grid that fills that column
 * instead of stacking four near-empty bands, and a trailing chevron that
 * anchors the far edge of every card at every width.
 */
export default function MorePage() {
  return (
    <div className="container mx-auto px-4 py-8 pb-24">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-subhead font-bold">المزيد</h1>

        {/* Browse Section */}
        <div className="mt-8">
          <h2 className="text-caption font-medium text-muted-foreground">تصفح</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-secondary"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-caption text-muted-foreground">{item.description}</p>
                </div>
                {/* `ArrowLeft` is this codebase's RTL "forward" arrow (same as
                    the homepage CTAs) — decorative here, the label already
                    names the destination. */}
                <ArrowLeft aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
