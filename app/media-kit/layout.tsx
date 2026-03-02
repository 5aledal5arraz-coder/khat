import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "الملف الإعلامي",
  description: "الملف الإعلامي لبودكاست خط — إحصائيات وبيانات الجمهور والشراكات.",
}

export default function MediaKitLayout({ children }: { children: React.ReactNode }) {
  return children
}
