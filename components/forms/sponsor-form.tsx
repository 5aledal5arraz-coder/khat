"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, Check } from "lucide-react"

export function SponsorForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus("loading")

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      company: formData.get("company") as string,
      message: formData.get("message") as string,
    }

    try {
      const response = await fetch("/api/sponsor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (response.ok) {
        setStatus("success")
        setMessage("شكراً لك! سنتواصل معك قريباً.")
        e.currentTarget.reset()
      } else {
        setStatus("error")
        setMessage(result.error || "حدث خطأ. يرجى المحاولة مرة أخرى.")
      }
    } catch {
      setStatus("error")
      setMessage("حدث خطأ. يرجى المحاولة مرة أخرى.")
    }
  }

  if (status === "success") {
    return (
      <div className="rounded-lg border bg-green-50 p-6 text-center">
        <Check className="mx-auto h-12 w-12 text-green-600" />
        <h3 className="mt-4 text-lg font-semibold">تم الإرسال بنجاح!</h3>
        <p className="mt-2 text-muted-foreground">{message}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">الاسم *</Label>
          <Input
            id="name"
            name="name"
            required
            disabled={status === "loading"}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">البريد الإلكتروني *</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            disabled={status === "loading"}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="company">الشركة</Label>
        <Input
          id="company"
          name="company"
          disabled={status === "loading"}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="message">رسالتك</Label>
        <Textarea
          id="message"
          name="message"
          rows={4}
          placeholder="أخبرنا المزيد عن اهتماماتك وأهدافك من الرعاية..."
          disabled={status === "loading"}
        />
      </div>
      {message && status === "error" && (
        <p className="text-sm text-destructive">{message}</p>
      )}
      <Button type="submit" className="w-full" disabled={status === "loading"}>
        {status === "loading" ? (
          <>
            <Loader2 className="me-2 h-4 w-4 animate-spin" />
            جاري الإرسال...
          </>
        ) : (
          "إرسال طلب الرعاية"
        )}
      </Button>
    </form>
  )
}
