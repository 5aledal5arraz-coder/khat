import { Metadata } from "next"
import { SettingsClient } from "./settings-client"

export const metadata: Metadata = {
  title: "الإعدادات",
  description: "إدارة تفضيلاتك وإعدادات الحساب في خط",
  robots: { index: false, follow: false },
}

export default function SettingsPage() {
  return <SettingsClient />
}
