"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Mail, Loader2, Check } from "lucide-react"

export function NewsletterForm() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("loading")

    try {
      const response = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const data = await response.json()

      if (response.ok) {
        setStatus("success")
        setMessage("شكراً لك! تم تسجيلك بنجاح.")
        setEmail("")
      } else {
        setStatus("error")
        setMessage(data.error || "حدث خطأ. يرجى المحاولة مرة أخرى.")
      }
    } catch {
      setStatus("error")
      setMessage("حدث خطأ. يرجى المحاولة مرة أخرى.")
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="email"
            placeholder="بريدك الإلكتروني"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ps-10"
            required
            disabled={status === "loading" || status === "success"}
          />
        </div>
        <Button type="submit" disabled={status === "loading" || status === "success"}>
          {status === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : status === "success" ? (
            <Check className="h-4 w-4" />
          ) : (
            "اشترك"
          )}
        </Button>
      </div>
      {message && (
        <p className={`text-sm ${status === "error" ? "text-destructive" : "text-green-600"}`}>
          {message}
        </p>
      )}
    </form>
  )
}
