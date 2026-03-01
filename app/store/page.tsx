import { Metadata } from "next"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ShoppingBag } from "lucide-react"
import { StoreNotifyForm } from "./store-notify-form"

export const metadata: Metadata = {
  title: "المتجر",
  description: "متجر خط - قريباً",
}

export default function StorePage() {
  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8">
      <Card className="max-w-lg text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/20">
            <ShoppingBag className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl">المتجر قادم قريباً</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">
            نعمل على تجهيز متجر خط بمنتجات مميزة تحمل هوية البودكاست.
            سجل بريدك الإلكتروني ليصلك إشعار فور الإطلاق.
          </p>

          <StoreNotifyForm />

          <div className="rounded-lg bg-secondary/50 p-4">
            <p className="text-sm font-medium">ماذا نحضّر؟</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>• ملابس بتصاميم حصرية</li>
              <li>• دفاتر ومستلزمات مكتبية</li>
              <li>• منتجات رقمية ومحتوى حصري</li>
              <li>• وأكثر...</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
