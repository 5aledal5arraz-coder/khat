"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Loader2, Check } from "lucide-react"

export function GuestApplicationForm() {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle")
  const [message, setMessage] = useState("")

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setStatus("loading")

    const formData = new FormData(e.currentTarget)
    const data = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      topic: formData.get("topic") as string,
      links: formData.get("links") as string,
      bio: formData.get("bio") as string,
    }

    try {
      const response = await fetch("/api/guest-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      })

      const result = await response.json()

      if (response.ok) {
        setStatus("success")
        setMessage("شكراً لك! سنراجع طلبك ونتواصل معك قريباً.")
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
          <Label htmlFor="guest-name">الاسم الكامل *</Label>
          <Input
            id="guest-name"
            name="name"
            required
            disabled={status === "loading"}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="guest-email">البريد الإلكتروني *</Label>
          <Input
            id="guest-email"
            name="email"
            type="email"
            required
            disabled={status === "loading"}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="topic">الموضوع المقترح *</Label>
        <Input
          id="topic"
          name="topic"
          required
          placeholder="ما الموضوع الذي تود مناقشته؟"
          disabled={status === "loading"}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="links">روابط (LinkedIn, Twitter, موقع شخصي)</Label>
        <Input
          id="links"
          name="links"
          placeholder="https://..."
          disabled={status === "loading"}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bio">نبذة عنك *</Label>
        <Textarea
          id="bio"
          name="bio"
          rows={4}
          required
          placeholder="أخبرنا عن نفسك وخبراتك..."
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
          "إرسال طلب الضيافة"
        )}
      </Button>
    </form>
  )
}
