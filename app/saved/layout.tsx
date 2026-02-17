import { Metadata } from "next"

export const metadata: Metadata = {
  title: "المحفوظات",
  description: "الحلقات والاقتباسات واللحظات التي حفظتها من بودكاست خط",
  robots: { index: false, follow: false },
}

export default function SavedLayout({ children }: { children: React.ReactNode }) {
  return children
}
