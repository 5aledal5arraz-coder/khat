import Link from "next/link"
import { listPlatformsForSurface } from "@/lib/queries/official-platforms"
import { PlatformIcon } from "@/components/platforms/platform-icon"
import { KhatLogoLockup } from "@/components/brand/khat-logo"

const navigation = {
  main: [
    { name: "الحلقات", href: "/episodes" },
    { name: "الضيوف", href: "/guests" },
    { name: "من نحن", href: "/about" },
    { name: "تواصل", href: "/contact" },
    { name: "استمع", href: "/listen" },
  ],
  partner: [
    { name: "كن شريكاً", href: "/sponsor" },
    { name: "كن ضيفاً", href: "/guest" },
  ],
}

export async function Footer() {
  // Pull everything in one query; partition client-side by category.
  const footerPlatforms = await listPlatformsForSurface("footer").catch(() => [])
  const socialLinks = footerPlatforms.filter(
    (p) => p.category === "social" || p.category === "community" || p.category === "video",
  )
  const listenLinks = footerPlatforms.filter((p) => p.category === "audio")

  return (
    <footer className="border-t bg-muted/50">
      <div className="container mx-auto px-4 py-12">
        <div className="grid gap-8 md:grid-cols-5">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="inline-flex" aria-label="خط — الرئيسية">
              <KhatLogoLockup size={44} />
            </Link>
            <p className="mt-4 text-sm text-muted-foreground max-w-xs">
              بودكاست يستكشف القصص الإنسانية والتجارب الحياتية من خلال حوارات عميقة مع ضيوف ملهمين.
            </p>
            {/* Social */}
            {socialLinks.length > 0 && (
              <div className="mt-4 flex gap-4">
                {socialLinks.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <span className="sr-only">{item.platform_name}</span>
                    <PlatformIcon iconName={item.icon_name} className="h-5 w-5" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div>
            <h3 className="text-sm font-semibold">تصفّح</h3>
            <ul className="mt-4 space-y-2">
              {navigation.main.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    prefetch={item.href === "/episodes" || item.href === "/guests"}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Partner / Join */}
          <div>
            <h3 className="text-sm font-semibold">انضم إلينا</h3>
            <ul className="mt-4 space-y-2">
              {navigation.partner.map((item) => (
                <li key={item.name}>
                  <Link
                    href={item.href}
                    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Platforms */}
          {listenLinks.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold">استمع عبر</h3>
              <ul className="mt-4 space-y-2">
                {listenLinks.map((item) => (
                  <li key={item.id}>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {item.platform_name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="mt-8 border-t pt-8 flex items-center justify-center">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} خط. جميع الحقوق محفوظة.
          </p>
        </div>
      </div>
    </footer>
  )
}
