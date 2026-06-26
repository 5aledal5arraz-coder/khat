import type { Metadata } from "next"

// Secret per-company offers must never be indexed or followed.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default function OfferLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
