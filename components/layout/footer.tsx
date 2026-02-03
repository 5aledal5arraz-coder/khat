import Link from "next/link"
import Image from "next/image"
import { Youtube, Instagram } from "lucide-react"
import { XIcon } from "@/components/icons/x-icon"

const navigation = {
  main: [
    { name: "الحلقات", href: "/episodes" },
    { name: "الضيوف", href: "/guests" },
    { name: "ابدأ من هنا", href: "/start-here" },
    { name: "كن راعياً", href: "/sponsor" },
    { name: "تواصل", href: "/contact" },
  ],
  social: [
    {
      name: "YouTube",
      href: "https://youtube.com/@KhatPodcast",
      icon: Youtube,
    },
    {
      name: "X",
      href: "https://x.com/KhatPodcast",
      icon: XIcon,
    },
    {
      name: "Instagram",
      href: "https://instagram.com/KhatPodcast",
      icon: Instagram,
    },
  ],
  platforms: [
    { name: "YouTube", href: "https://youtube.com/@KhatPodcast" },
    { name: "Spotify", href: "https://open.spotify.com/show/KhatPodcast" },
    { name: "Apple Podcasts", href: "https://podcasts.apple.com/podcast/KhatPodcast" },
  ],
}

export function Footer() {
  return (
    <footer className="border-t bg-muted/50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="inline-block">
              <Image
                src="/logo.png"
                alt="خط"
                width={72}
                height={72}
                className="h-18 w-auto"
              />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground">
              بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h3 className="text-sm font-semibold">روابط سريعة</h3>
            <ul className="mt-4 space-y-2">
              {navigation.main.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Platforms */}
          <div>
            <h3 className="text-sm font-semibold">استمع عبر</h3>
            <ul className="mt-4 space-y-2">
              {navigation.platforms.map((item) => (
                <li key={item.name}>
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-muted-foreground hover:text-foreground"
                  >
                    {item.name}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Social */}
          <div>
            <h3 className="text-sm font-semibold">تابعنا</h3>
            <div className="mt-4 flex gap-4">
              {navigation.social.map((item) => (
                <a
                  key={item.name}
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <span className="sr-only">{item.name}</span>
                  <item.icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 border-t pt-8 text-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} خط. جميع الحقوق محفوظة.
          </p>
        </div>
      </div>
    </footer>
  )
}
