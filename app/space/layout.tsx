import { notFound } from "next/navigation"
import { isEnabled } from "@/config/site"

export default async function SpaceLayout({ children }: { children: React.ReactNode }) {
  if (!(await isEnabled("hibrEnabled"))) notFound()
  return <>{children}</>
}
