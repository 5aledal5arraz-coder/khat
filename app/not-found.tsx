import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Home, ArrowRight } from "lucide-react"

export default function NotFound() {
  return (
    <div className="container mx-auto flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <h2 className="mt-4 text-2xl font-bold">الصفحة غير موجودة</h2>
      <p className="mt-2 text-muted-foreground">
        عذراً، الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
      </p>
      <div className="mt-8 flex gap-4">
        <Link href="/">
          <Button className="gap-2">
            <Home className="h-4 w-4" />
            الصفحة الرئيسية
          </Button>
        </Link>
        <Link href="/episodes">
          <Button variant="outline" className="gap-2">
            تصفح الحلقات
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  )
}
