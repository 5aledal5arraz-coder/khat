import { Metadata } from "next"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bell, Moon, Globe, Trash2 } from "lucide-react"

export const metadata: Metadata = {
  title: "الإعدادات",
}

export default function SettingsPage() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">الإعدادات</h1>
          <p className="mt-2 text-muted-foreground">
            إدارة تفضيلاتك وإعدادات الحساب
          </p>
        </div>

        <div className="space-y-6">
          {/* Notifications */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                  <Bell className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">الإشعارات</CardTitle>
                  <CardDescription>إدارة إشعارات البريد والتطبيق</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">حلقات جديدة</p>
                  <p className="text-sm text-muted-foreground">
                    إشعار عند نشر حلقة جديدة
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  تفعيل
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">النشرة الأسبوعية</p>
                  <p className="text-sm text-muted-foreground">
                    ملخص أسبوعي بالمحتوى الجديد
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  تفعيل
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Appearance */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                  <Moon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">المظهر</CardTitle>
                  <CardDescription>تخصيص مظهر التطبيق</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">الوضع الداكن</p>
                  <p className="text-sm text-muted-foreground">
                    مفعّل تلقائياً
                  </p>
                </div>
                <Button variant="secondary" size="sm" disabled>
                  مفعّل
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Language */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                  <Globe className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">اللغة</CardTitle>
                  <CardDescription>لغة واجهة المستخدم</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">العربية</p>
                  <p className="text-sm text-muted-foreground">
                    اللغة الحالية
                  </p>
                </div>
                <Button variant="outline" size="sm" disabled>
                  اللغة الوحيدة
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Data */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/20">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <CardTitle className="text-lg">البيانات</CardTitle>
                  <CardDescription>إدارة البيانات المحفوظة محلياً</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">مسح المحفوظات</p>
                  <p className="text-sm text-muted-foreground">
                    حذف جميع الحلقات والاقتباسات المحفوظة
                  </p>
                </div>
                <Button variant="destructive" size="sm">
                  مسح
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
