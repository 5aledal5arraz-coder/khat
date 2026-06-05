import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "استبيان التحضير — خط بودكاست",
  robots: "noindex, nofollow",
}

/**
 * Minimal layout for the guest preparation page.
 * No header/footer — this is a private branded page, not a public site page.
 */
export default function PrepareLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background" dir="rtl" lang="ar">
      {children}
    </div>
  )
}
