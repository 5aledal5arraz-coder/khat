"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Bell, CheckCircle } from "lucide-react"

export function StoreNotifyForm() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return

    setStatus("loading")
    setErrorMsg("")

    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-requested-with": "khat",
        },
        body: JSON.stringify({ email: email.trim() }),
      })

      const data = await res.json()

      if (!res.ok) {
        setStatus("error")
        setErrorMsg(data.error || "حدث خطأ. يرجى المحاولة مرة أخرى.")
        return
      }

      setStatus("success")
    } catch {
      setStatus("error")
      setErrorMsg("حدث خطأ. يرجى المحاولة مرة أخرى.")
    }
  }

  if (status === "success") {
    return (
      <div className="mx-auto flex max-w-sm items-center justify-center gap-2 rounded-lg bg-green-500/10 p-4 text-green-600">
        <CheckCircle className="h-5 w-5" />
        <span className="text-sm font-medium">تم التسجيل! سنبلغك فور الإطلاق.</span>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-sm">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input
          type="email"
          placeholder="بريدك الإلكتروني"
          className="flex-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={status === "loading"}
        />
        <Button type="submit" className="gap-2" disabled={status === "loading"}>
          <Bell className="h-4 w-4" />
          {status === "loading" ? "..." : "أعلمني"}
        </Button>
      </form>
      {status === "error" && (
        <p className="mt-2 text-sm text-red-500">{errorMsg}</p>
      )}
    </div>
  )
}
