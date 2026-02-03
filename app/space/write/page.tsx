import { Metadata } from "next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Lock } from "lucide-react"
import Link from "next/link"

export const metadata: Metadata = {
  title: "كتابة مقال",
  description: "شارك أفكارك مع مجتمع خط",
}

export default function WriteArticlePage() {
  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8">
      <Card className="max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
            <Lock className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>الكتابة متاحة قريباً</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            نعمل على تطوير ميزة كتابة المقالات لمجتمع خط. سيتمكن الأعضاء قريباً
            من مشاركة أفكارهم وتأملاتهم.
          </p>
          <p className="text-sm text-muted-foreground">
            سجل في النشرة البريدية ليصلك إشعار عند إطلاق الميزة.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/space">
              <Button variant="outline">العودة للمساحة</Button>
            </Link>
            <Link href="/#newsletter">
              <Button>اشترك في النشرة</Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
