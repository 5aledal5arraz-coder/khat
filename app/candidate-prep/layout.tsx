import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "نموذج التحضير — خط بودكاست",
  robots: "noindex, nofollow",
}

/**
 * Minimal layout for the candidate prep public page.
 * No header/footer — branded private page reachable only via secure token URL.
 */
export default function CandidatePrepLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background" dir="rtl" lang="ar">
      {children}
    </div>
  )
}
