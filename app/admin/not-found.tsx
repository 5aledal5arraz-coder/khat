import Link from "next/link"
import { SearchX, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "./components/ui-kit"

/**
 * Admin-scoped 404. Renders inside app/admin/layout.tsx (admin shell +
 * ADMIN_LIGHT_TOKENS), so operators stay in the panel instead of being
 * bounced to the public-site 404. Reached via notFound() from any admin
 * page — including app/admin/[...missing], which catches URLs that
 * match no admin route.
 */
export default function AdminNotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center p-6">
      <div className="w-full">
        <EmptyState
          icon={SearchX}
          title="الصفحة غير موجودة — 404"
          description="الرابط الذي فتحته لا يقابل أي صفحة في لوحة التحكم. ربما نُقلت الصفحة أو أن الرابط قديم."
          action={
            <Link href="/admin/ops">
              <Button className="gap-2">
                <Home className="h-4 w-4" />
                العودة للرئيسية
              </Button>
            </Link>
          }
        />
      </div>
    </div>
  )
}
