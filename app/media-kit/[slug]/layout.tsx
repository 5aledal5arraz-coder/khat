import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "ملف الشراكة",
  robots: { index: false, follow: false },
}

export default function MediaKitShareLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
