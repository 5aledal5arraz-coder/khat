"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { KeyRound, Loader2, Check, X, ShieldCheck, Clock, MonitorSmartphone } from "lucide-react"

export interface AccountInfo {
  email: string
  role: string
  lastLoginAt: string | null
  activeSessions: number
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "المالك",
  ADMIN: "مدير",
  EDITOR: "محرّر",
  VIEWER: "مشاهد",
}

// Mirror of lib/admin/auth.ts `validateAdminPassword` — the server's rule.
const PASSWORD_REQUIREMENTS = [
  { label: "١٠ أحرف على الأقل", test: (p: string) => p.length >= 10 },
  { label: "حرف واحد على الأقل (a-z أو A-Z)", test: (p: string) => /[a-zA-Z]/.test(p) },
  { label: "رقم واحد على الأقل (0-9)", test: (p: string) => /[0-9]/.test(p) },
]

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("ar", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d)
}

export function AccountSecurityForm({ account }: { account: AccountInfo }) {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const allPwPassed = PASSWORD_REQUIREMENTS.every((r) => r.test(newPassword))
  const pwMatch = newPassword === confirmPassword && confirmPassword.length > 0
  const canSubmit = currentPassword.length > 0 && allPwPassed && pwMatch && !loading

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch("/api/admin/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage({ type: "error", text: data.error || "فشل تغيير كلمة المرور" })
        return
      }
      const revoked = typeof data.sessionsRevoked === "number" ? data.sessionsRevoked : 0
      setMessage({
        type: "success",
        text:
          revoked > 0
            ? `تم تغيير كلمة المرور — تم إنهاء ${revoked} جلسة أخرى`
            : "تم تغيير كلمة المرور بنجاح",
      })
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } catch {
      setMessage({ type: "error", text: "حدث خطأ غير متوقع" })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Account summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            معلومات الحساب
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <InfoCell icon={KeyRound} label="الدور" value={ROLE_LABELS[account.role] || account.role} />
            <InfoCell icon={Clock} label="آخر دخول" value={formatDate(account.lastLoginAt)} />
            <InfoCell
              icon={MonitorSmartphone}
              label="الجلسات النشطة"
              value={String(account.activeSessions)}
            />
          </div>
          <p className="mt-4 text-[11.5px] text-muted-foreground" dir="ltr">
            {account.email}
          </p>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-[13px] font-semibold flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            تغيير كلمة المرور
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="max-w-md space-y-4">
            <div>
              <Label className="mb-1.5 block text-[13px] font-medium">كلمة المرور الحالية</Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={loading}
                dir="ltr"
                autoComplete="current-password"
              />
            </div>

            <div>
              <Label className="mb-1.5 block text-[13px] font-medium">كلمة المرور الجديدة</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={loading}
                dir="ltr"
                autoComplete="new-password"
              />
            </div>

            <div>
              <Label className="mb-1.5 block text-[13px] font-medium">تأكيد كلمة المرور</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={loading}
                dir="ltr"
                autoComplete="new-password"
              />
              {confirmPassword.length > 0 && !pwMatch && (
                <p className="mt-1 text-xs text-red-700">كلمتا المرور غير متطابقتين</p>
              )}
            </div>

            <div className="space-y-1.5 rounded-lg border border-border/30 bg-muted/20 p-3">
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">متطلبات كلمة المرور:</p>
              {PASSWORD_REQUIREMENTS.map((req) => {
                const passed = req.test(newPassword)
                return (
                  <div key={req.label} className="flex items-center gap-2 text-xs">
                    {newPassword.length > 0 ? (
                      passed ? (
                        <Check className="h-3.5 w-3.5 text-green-700" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-red-700" />
                      )
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />
                    )}
                    <span
                      className={
                        newPassword.length > 0
                          ? passed
                            ? "text-green-700"
                            : "text-red-700"
                          : "text-muted-foreground"
                      }
                    >
                      {req.label}
                    </span>
                  </div>
                )
              })}
            </div>

            {message && (
              <div
                className={`rounded-md p-3 text-center text-sm ${
                  message.type === "success"
                    ? "bg-green-500/10 text-green-700"
                    : "bg-destructive/10 text-destructive"
                }`}
              >
                {message.text}
              </div>
            )}

            <Button type="submit" disabled={!canSubmit}>
              {loading && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              تغيير كلمة المرور
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function InfoCell({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType
  label: string
  value: string
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1.5 text-[14px] font-semibold tabular-nums">{value}</div>
    </div>
  )
}
