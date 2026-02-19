"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowRight, Loader2 } from "lucide-react"
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
} from "firebase/auth"
import { auth as getAuth } from "@/lib/firebase/config"
import { toast } from "@/lib/use-toast"

async function createSession(idToken: string) {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  })
  if (!res.ok) throw new Error("Failed to create session")
}

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get("redirect") || "/space"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [mode, setMode] = useState<"login" | "signup">("login")

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) return

    setIsLoading(true)

    try {
      let userCredential
      if (mode === "signup") {
        userCredential = await createUserWithEmailAndPassword(getAuth(),email.trim(), password)
        toast({
          title: "تم إنشاء الحساب",
          description: "مرحباً بك في حبر",
          variant: "success",
        })
      } else {
        userCredential = await signInWithEmailAndPassword(getAuth(),email.trim(), password)
      }

      const idToken = await userCredential.user.getIdToken()
      await createSession(idToken)
      router.push(redirect)
      router.refresh()
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

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      const result = await signInWithPopup(getAuth(), provider)
      const idToken = await result.user.getIdToken()
      await createSession(idToken)
      router.push(redirect)
      router.refresh()
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

  const handleAppleSignIn = async () => {
    setIsLoading(true)
    try {
      const provider = new OAuthProvider("apple.com")
      const result = await signInWithPopup(getAuth(), provider)
      const idToken = await result.user.getIdToken()
      await createSession(idToken)
      router.push(redirect)
      router.refresh()
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
          {/* Social sign-in buttons */}
          <div className="space-y-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleGoogleSignIn}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : (
                <svg className="h-4 w-4 me-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              )}
              الدخول بحساب Google
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={handleAppleSignIn}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin me-2" /> : (
                <svg className="h-4 w-4 me-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                </svg>
              )}
              الدخول بحساب Apple
            </Button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">أو</span>
            </div>
          </div>

          {/* Email/Password form */}
          <form onSubmit={handleEmailAuth} className="space-y-3">
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

            <div className="flex items-center justify-center text-sm">
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
        </CardContent>
      </Card>
    </div>
  )
}
