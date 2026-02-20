"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Mail } from "lucide-react"
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth"
import { auth as getAuth } from "@/lib/firebase/config"

export default function AdminLoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [showReset, setShowReset] = useState(false)
  const [resetSending, setResetSending] = useState(false)
  const [resetMessage, setResetMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const handleReset = async () => {
    const resetEmail = email.trim()
    if (!resetEmail) return
    setResetSending(true)
    setResetMessage(null)
    try {
      await sendPasswordResetEmail(getAuth(), resetEmail)
      setResetMessage({ type: "success", text: "تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني" })
    } catch (err: any) {
      const code = err?.code
      if (code === "auth/user-not-found") {
        setResetMessage({ type: "error", text: "لا يوجد حساب بهذا البريد" })
      } else {
        setResetMessage({ type: "error", text: "حدث خطأ" })
      }
    } finally {
      setResetSending(false)
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return

    setIsLoading(true)
    setError("")

    try {
      const userCredential = await signInWithEmailAndPassword(getAuth(), email.trim(), password)
      const idToken = await userCredential.user.getIdToken()

      const res = await fetch("/api/admin/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      })

      if (res.status === 403) {
        setError("ليس لديك صلاحية للوصول إلى لوحة التحكم")
        return
      }

      if (!res.ok) {
        setError("فشل تسجيل الدخول")
        return
      }

      router.push("/admin")
      router.refresh()
    } catch {
      setError("البريد الإلكتروني أو كلمة المرور غير صحيحة")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4">
            <Image
              src="/logo.png"
              alt="KHAT"
              width={48}
              height={48}
              className="rounded"
            />
          </div>
          <CardTitle className="text-2xl">لوحة تحكم خط</CardTitle>
          <p className="text-sm text-muted-foreground">
            أدخل بياناتك للوصول إلى لوحة التحكم
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-center text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3">
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
              تسجيل الدخول
            </Button>
          </form>

          <div className="mt-3 text-center">
            <button
              type="button"
              onClick={() => { setShowReset(!showReset); setResetMessage(null) }}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              نسيت كلمة المرور؟
            </button>

            {showReset && (
              <div className="mt-3 space-y-2">
                <div className="flex gap-2" dir="ltr">
                  <Input
                    type="email"
                    placeholder="البريد الإلكتروني"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={resetSending}
                    dir="ltr"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReset}
                    disabled={resetSending || !email.trim()}
                    className="shrink-0"
                  >
                    {resetSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">إرسال رابط إعادة التعيين</p>

                {resetMessage && (
                  <div className={`rounded-md p-2 text-center text-xs ${
                    resetMessage.type === "success"
                      ? "bg-green-500/10 text-green-500"
                      : "bg-destructive/10 text-destructive"
                  }`}>
                    {resetMessage.text}
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
