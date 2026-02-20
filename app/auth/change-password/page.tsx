"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Check, X } from "lucide-react"
import { toast } from "@/lib/use-toast"

const REQUIREMENTS = [
  { label: "٨ أحرف على الأقل", test: (p: string) => p.length >= 8 },
  { label: "حرف كبير واحد على الأقل (A-Z)", test: (p: string) => /[A-Z]/.test(p) },
  { label: "حرف صغير واحد على الأقل (a-z)", test: (p: string) => /[a-z]/.test(p) },
  { label: "رقم واحد على الأقل (0-9)", test: (p: string) => /[0-9]/.test(p) },
  { label: "رمز خاص واحد على الأقل", test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(p) },
]

export default function ChangePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const allPassed = REQUIREMENTS.every((r) => r.test(password))
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0
  const canSubmit = allPassed && passwordsMatch && !isLoading

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setIsLoading(true)
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast({
          title: "خطأ",
          description: data.error || "فشل تغيير كلمة المرور",
          variant: "destructive",
        })
        return
      }

      toast({ title: "تم تغيير كلمة المرور بنجاح" })
      router.push("/space")
      router.refresh()
    } catch {
      toast({
        title: "خطأ",
        description: "حدث خطأ غير متوقع",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">تغيير كلمة المرور</CardTitle>
          <p className="text-sm text-muted-foreground">
            يجب تغيير كلمة المرور قبل المتابعة
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">كلمة المرور الجديدة</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                dir="ltr"
                autoFocus
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium">تأكيد كلمة المرور</label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
                dir="ltr"
              />
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="mt-1 text-xs text-red-400">كلمتا المرور غير متطابقتين</p>
              )}
            </div>

            {/* Requirements checklist */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground mb-2">متطلبات كلمة المرور:</p>
              {REQUIREMENTS.map((req) => {
                const passed = req.test(password)
                return (
                  <div key={req.label} className="flex items-center gap-2 text-xs">
                    {password.length > 0 ? (
                      passed ? (
                        <Check className="h-3.5 w-3.5 text-green-400" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-red-400" />
                      )
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />
                    )}
                    <span className={password.length > 0 ? (passed ? "text-green-400" : "text-red-400") : "text-muted-foreground"}>
                      {req.label}
                    </span>
                  </div>
                )
              })}
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              تغيير كلمة المرور
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
