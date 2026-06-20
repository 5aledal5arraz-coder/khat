"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { KhatLogo } from "@/components/brand/khat-logo"
import { ADMIN_LIGHT_TOKENS } from "../components/light-theme"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2 } from "lucide-react"

export default function AdminLoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return

    setIsLoading(true)
    setError("")

    try {
      const res = await fetch("/api/admin/auth/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-requested-with": "khat",
        },
        body: JSON.stringify({ email: email.trim(), password }),
      })

      if (res.status === 429) {
        setError("عدد محاولات كثيرة. يرجى المحاولة لاحقاً.")
        return
      }

      if (res.status === 403) {
        setError("الحساب معطل. تواصل مع المالك.")
        return
      }

      if (!res.ok) {
        setError("البريد الإلكتروني أو كلمة المرور غير صحيحة")
        return
      }

      router.push("/admin")
      router.refresh()
    } catch {
      setError("حدث خطأ في الاتصال")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={ADMIN_LIGHT_TOKENS} className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      {/* Background subtle gradient */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/3 via-transparent to-accent/3" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="admin-card admin-glow p-8">
          {/* Top edge accent */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-primary/30 to-transparent rounded-t-2xl" />

          <div className="flex flex-col items-center mb-8">
            <div className="mb-4">
              <KhatLogo size={48} />
            </div>
            <h1 className="text-lg font-semibold tracking-tight">لوحة تحكم خط</h1>
            <p className="mt-1 text-[13px] text-muted-foreground">
              أدخل بياناتك للوصول إلى لوحة التحكم
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-center text-[13px] text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3.5">
            <div>
              <Input
                type="email"
                placeholder="البريد الإلكتروني"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                dir="ltr"
                className="h-11 bg-muted/30 border-border/50 focus:border-primary/50 focus:bg-background transition-colors"
              />
            </div>
            <div>
              <Input
                type="password"
                placeholder="كلمة المرور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={10}
                dir="ltr"
                className="h-11 bg-muted/30 border-border/50 focus:border-primary/50 focus:bg-background transition-colors"
              />
            </div>
            <Button type="submit" className="w-full h-11 mt-1 font-medium" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin me-2" />}
              تسجيل الدخول
            </Button>
          </form>
        </div>

        {/* Subtle brand footer */}
        <p className="mt-6 text-center text-[10px] text-muted-foreground/30">
          خط بودكاست — لوحة التحكم
        </p>
      </div>
    </div>
  )
}
