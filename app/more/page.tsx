import { Metadata } from "next"
import Link from "next/link"
import {
  Users,
  Layers,
  BookOpen,
  ShoppingBag,
  Handshake,
  Mic,
  Mail,
  Settings,
  Bookmark,
  Compass,
} from "lucide-react"

export const metadata: Metadata = {
  title: "المزيد",
}

const menuItems = [
  { href: "/guests", icon: Users, label: "الضيوف", description: "تعرّف على ضيوف خط" },
  { href: "/series", icon: Layers, label: "المجموعات", description: "حلقات مرتبة حسب الموضوع" },
  { href: "/resources", icon: BookOpen, label: "خطوط", description: "كتب ومقالات وروابط مختارة" },
  { href: "/paths", icon: Compass, label: "مسارات الاستماع", description: "حلقات على حسب مزاجك" },
  { href: "/store", icon: ShoppingBag, label: "المتجر", description: "قريباً" },
  { href: "/sponsor", icon: Handshake, label: "كن شريكاً", description: "فرص الشراكة" },
  { href: "/guest", icon: Mic, label: "كن ضيفاً", description: "قدّم طلب ضيافة" },
  { href: "/contact", icon: Mail, label: "تواصل معنا", description: "كلّمنا" },
]

const userItems = [
  { href: "/saved", icon: Bookmark, label: "المحفوظات", description: "الحلقات والاقتباسات المحفوظة" },
  { href: "/settings", icon: Settings, label: "الإعدادات", description: "إعدادات الحساب" },
]

export default function MorePage() {
  return (
    <div className="container mx-auto px-4 py-8 pb-24">
      <h1 className="mb-6 text-2xl font-bold">المزيد</h1>

      {/* User Section */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">حسابي</h2>
        <div className="space-y-1">
          {userItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-secondary"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Browse Section */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">تصفح</h2>
        <div className="space-y-1">
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-secondary"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-medium">{item.label}</p>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
