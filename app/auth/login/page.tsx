"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowRight, Mail, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { toast } from "@/lib/use-toast"

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect") || "/space"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<"login" | "signup" | "magic">("login")
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  const supabase = createClient()

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return

    setIsLoading(true)

    try {
      if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
          },
        })
        if (error) throw error
        setMagicLinkSent(true)
        toast({
          title: "تم إرسال رابط الدخول",
          description: "تحقق من بريدك الإلكتروني",
          variant: "success",
        })
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
          },
        })
        if (error) throw error
        toast({
          title: "تم إنشاء الحساب",
          description: "تحقق من بريدك لتأكيد الحساب",
          variant: "success",
        })
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
        router.push(redirect)
        router.refresh()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "حدث خطأ غير متوقع"
      toast({
        title: "خطأ",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  if (magicLinkSent) {
    return (
      <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-8 w-8 text-primary" />
            </div>
            <h2 className="mb-2 text-xl font-bold">تحقق من بريدك</h2>
            <p className="mb-6 text-muted-foreground">
              أرسلنا رابط الدخول إلى <strong>{email}</strong>
            </p>
            <Button variant="outline" onClick={() => setMagicLinkSent(false)}>
              العودة
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto flex min-h-[60vh] items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Link href="/space" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-4 w-4" />
            العودة لحبر
          </Link>
          <CardTitle className="text-2xl">
            {mode === "signup" ? "إنشاء حساب" : "تسجيل الدخول"}
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            انضم لمجتمع حبر وشارك أفكارك
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Magic Link */}
          {mode === "magic" ? (
            <form onSubmit={handleEmailLogin} className="space-y-3">
              <Input
                type="email"
                placeholder="البريد الإلكتروني"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                dir="ltr"
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : <Mail className="h-4 w-4 me-2" />}
                إرسال رابط الدخول
              </Button>
              <Button type="button" variant="ghost" className="w-full text-sm" onClick={() => setMode("login")}>
                الدخول بكلمة المرور
              </Button>
            </form>
          ) : (
            <form onSubmit={handleEmailLogin} className="space-y-3">
              <Input
                type="email"
                placeholder="البريد الإلكتروني"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
                dir="ltr"
              />
              <Input
                type="password"
                placeholder="كلمة المرور"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLoading}
                minLength={6}
                dir="ltr"
              />
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="h-4 w-4 animate-spin me-2" />}
                {mode === "signup" ? "إنشاء حساب" : "تسجيل الدخول"}
              </Button>

              <div className="flex items-center justify-between text-sm">
                <Button type="button" variant="link" className="h-auto p-0" onClick={() => setMode("magic")}>
                  الدخول برابط سحري
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0"
                  onClick={() => setMode(mode === "signup" ? "login" : "signup")}
                >
                  {mode === "signup" ? "لدي حساب" : "حساب جديد"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
