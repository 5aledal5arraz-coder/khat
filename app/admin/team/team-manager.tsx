"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Plus, Shield, Trash2, LogOut, KeyRound,
  Loader2, AlertCircle, CheckCircle, UserX, UserCheck, Copy,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { formatDateDDMMYYYY } from "@/lib/admin/date"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AdminRole = "OWNER" | "ADMIN" | "EDITOR" | "VIEWER"

interface AdminUser {
  id: string
  email: string
  role: AdminRole
  is_active: boolean
  last_login_at: string | null
  created_at: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<AdminRole, string> = {
  OWNER: "المالك",
  ADMIN: "مدير",
  EDITOR: "محرر",
  VIEWER: "مشاهد",
}

const ROLE_COLORS: Record<AdminRole, string> = {
  OWNER: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  ADMIN: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  EDITOR: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  VIEWER: "bg-neutral-500/15 text-neutral-600 dark:text-neutral-400",
}

const ASSIGNABLE_ROLES: AdminRole[] = ["ADMIN", "EDITOR", "VIEWER"]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null) {
  return formatDateDDMMYYYY(iso)
}

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "x-requested-with": "khat",
      ...opts?.headers,
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || "حدث خطأ")
  return data
}

// ---------------------------------------------------------------------------
// TeamManager
// ---------------------------------------------------------------------------

export function TeamManager() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  // Add user modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [addEmail, setAddEmail] = useState("")
  const [addPassword, setAddPassword] = useState("")
  const [addRole, setAddRole] = useState<AdminRole>("VIEWER")
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState("")

  // Reset password modal
  const [resetUserId, setResetUserId] = useState<string | null>(null)
  const [resetPassword, setResetPassword] = useState("")
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState("")
  const [resetSuccess, setResetSuccess] = useState(false)

  // Action states
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: "success" | "error"; text: string } | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api("/api/admin/team")
      setUsers(data.users)
      setError("")
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "حدث خطأ")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toast])

  const showToast = (type: "success" | "error", text: string) => setToast({ type, text })

  // -- Actions --

  const handleAddUser = async () => {
    setAddLoading(true)
    setAddError("")
    try {
      await api("/api/admin/team", {
        method: "POST",
        body: JSON.stringify({ email: addEmail, password: addPassword, role: addRole }),
      })
      setShowAddModal(false)
      setAddEmail("")
      setAddPassword("")
      setAddRole("VIEWER")
      showToast("success", "تم إنشاء المستخدم بنجاح")
      fetchUsers()
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "حدث خطأ")
    } finally {
      setAddLoading(false)
    }
  }

  const handleRoleChange = async (userId: string, newRole: AdminRole) => {
    setActionLoading(userId)
    try {
      await api(`/api/admin/team/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      })
      showToast("success", "تم تغيير الصلاحية")
      fetchUsers()
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "حدث خطأ")
    } finally {
      setActionLoading(null)
    }
  }

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    setActionLoading(userId)
    try {
      await api(`/api/admin/team/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !currentlyActive }),
      })
      showToast("success", currentlyActive ? "تم تعطيل الحساب" : "تم تفعيل الحساب")
      fetchUsers()
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "حدث خطأ")
    } finally {
      setActionLoading(null)
    }
  }

  const handleResetPassword = async () => {
    if (!resetUserId || !resetPassword) return
    setResetLoading(true)
    setResetError("")
    try {
      await api(`/api/admin/team/${resetUserId}`, {
        method: "PATCH",
        body: JSON.stringify({ new_password: resetPassword }),
      })
      setResetSuccess(true)
      showToast("success", "تم إعادة تعيين كلمة المرور")
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : "حدث خطأ")
    } finally {
      setResetLoading(false)
    }
  }

  const handleForceLogout = async (userId: string) => {
    setActionLoading(userId)
    try {
      await api(`/api/admin/team/${userId}/force-logout`, { method: "POST" })
      showToast("success", "تم إنهاء جميع الجلسات")
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "حدث خطأ")
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المستخدم؟ لا يمكن التراجع.")) return
    setActionLoading(userId)
    try {
      await api(`/api/admin/team/${userId}`, { method: "DELETE" })
      showToast("success", "تم حذف المستخدم")
      fetchUsers()
    } catch (err: unknown) {
      showToast("error", err instanceof Error ? err.message : "حدث خطأ")
    } finally {
      setActionLoading(null)
    }
  }

  // -- Render --

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
        <AlertCircle className="mx-auto h-8 w-8 text-destructive mb-2" />
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={fetchUsers} className="mt-3">
          إعادة المحاولة
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-500" />
          <h2 className="text-[15px] font-bold">فريق خط</h2>
          <span className="rounded-md bg-muted/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground/70">
            {users.length}
          </span>
        </div>
        <Button onClick={() => setShowAddModal(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          إضافة مستخدم
        </Button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg border p-3 text-sm animate-in slide-in-from-top-2",
            toast.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-600 dark:text-green-400"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {toast.type === "success" ? (
            <CheckCircle className="h-4 w-4 shrink-0" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0" />
          )}
          {toast.text}
        </div>
      )}

      {/* Users table */}
      <div className="overflow-hidden rounded-xl border border-border/30 bg-card/50 admin-glow">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border/30 text-muted-foreground/60">
                <th className="px-4 py-3 text-start text-[11px] font-medium uppercase tracking-wider">البريد الإلكتروني</th>
                <th className="px-4 py-3 text-start text-[11px] font-medium uppercase tracking-wider">الصلاحية</th>
                <th className="px-4 py-3 text-start text-[11px] font-medium uppercase tracking-wider">الحالة</th>
                <th className="px-4 py-3 text-start text-[11px] font-medium uppercase tracking-wider">آخر دخول</th>
                <th className="px-4 py-3 text-start text-[11px] font-medium uppercase tracking-wider">تاريخ الإنشاء</th>
                <th className="px-4 py-3 text-start text-[11px] font-medium uppercase tracking-wider">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isOwner = user.role === "OWNER"
                const isActionLoading = actionLoading === user.id

                return (
                  <tr key={user.id} className="border-b border-border/15 last:border-b-0 hover:bg-muted/20 transition-all duration-200">
                    {/* Email */}
                    <td className="px-4 py-3 font-mono text-xs" dir="ltr">
                      {user.email}
                    </td>

                    {/* Role */}
                    <td className="px-4 py-3">
                      {isOwner ? (
                        <span className={cn("inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium", ROLE_COLORS[user.role])}>
                          <Shield className="h-3 w-3" />
                          {ROLE_LABELS[user.role]}
                        </span>
                      ) : (
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value as AdminRole)}
                          disabled={isActionLoading}
                          className="rounded-lg border border-border/30 bg-transparent px-2 py-1 text-[11px] outline-none transition-all duration-200 focus:ring-1 focus:ring-ring"
                        >
                          {ASSIGNABLE_ROLES.map((r) => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium",
                          user.is_active
                            ? "bg-green-500/15 text-green-600 dark:text-green-400"
                            : "bg-red-500/15 text-red-600 dark:text-red-400",
                        )}
                      >
                        {user.is_active ? "نشط" : "معطل"}
                      </span>
                    </td>

                    {/* Last login */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(user.last_login_at)}
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {formatDate(user.created_at)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      {isOwner ? (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      ) : (
                        <div className="flex items-center gap-1">
                          {/* Toggle active */}
                          <button
                            onClick={() => handleToggleActive(user.id, user.is_active)}
                            disabled={isActionLoading}
                            className="rounded-md p-1.5 hover:bg-muted transition-colors"
                            title={user.is_active ? "تعطيل" : "تفعيل"}
                          >
                            {user.is_active ? (
                              <UserX className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <UserCheck className="h-3.5 w-3.5 text-green-500" />
                            )}
                          </button>

                          {/* Reset password */}
                          <button
                            onClick={() => {
                              setResetUserId(user.id)
                              setResetPassword("")
                              setResetError("")
                              setResetSuccess(false)
                            }}
                            disabled={isActionLoading}
                            className="rounded-md p-1.5 hover:bg-muted transition-colors"
                            title="إعادة تعيين كلمة المرور"
                          >
                            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>

                          {/* Force logout */}
                          <button
                            onClick={() => handleForceLogout(user.id)}
                            disabled={isActionLoading}
                            className="rounded-md p-1.5 hover:bg-muted transition-colors"
                            title="إنهاء جميع الجلسات"
                          >
                            <LogOut className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            disabled={isActionLoading}
                            className="rounded-md p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="حذف المستخدم"
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-red-500" />
                          </button>

                          {isActionLoading && (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---------- Add User Modal ---------- */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddModal(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-border/30 bg-card p-6 shadow-2xl mx-4 space-y-4">
            <h3 className="font-semibold text-[15px]">إضافة مستخدم جديد</h3>

            {addError && (
              <div className="rounded-md bg-destructive/10 p-2.5 text-center text-xs text-destructive">
                {addError}
              </div>
            )}

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground/60">البريد الإلكتروني</label>
                <Input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  dir="ltr"
                  placeholder="admin@example.com"
                  disabled={addLoading}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground/60">كلمة المرور (١٠ أحرف على الأقل، أحرف + أرقام)</label>
                <Input
                  type="text"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  dir="ltr"
                  placeholder="كلمة مرور مؤقتة"
                  disabled={addLoading}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground/60">الصلاحية</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as AdminRole)}
                  disabled={addLoading}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
                >
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowAddModal(false)} disabled={addLoading}>
                إلغاء
              </Button>
              <Button
                size="sm"
                onClick={handleAddUser}
                disabled={addLoading || !addEmail.trim() || !addPassword}
              >
                {addLoading && <Loader2 className="h-3.5 w-3.5 animate-spin me-1.5" />}
                إنشاء
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Reset Password Modal ---------- */}
      {resetUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setResetUserId(null)} />
          <div className="relative z-10 w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl mx-4 space-y-4">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-amber-500" />
              إعادة تعيين كلمة المرور
            </h3>
            <p className="text-xs text-muted-foreground">
              {users.find((u) => u.id === resetUserId)?.email}
            </p>

            {resetError && (
              <div className="rounded-md bg-destructive/10 p-2.5 text-center text-xs text-destructive">
                {resetError}
              </div>
            )}

            {resetSuccess ? (
              <div className="space-y-3">
                <div className="rounded-md bg-green-500/10 p-3 text-center text-xs text-green-600 dark:text-green-400">
                  تم إعادة تعيين كلمة المرور بنجاح. تم إنهاء جميع الجلسات.
                </div>
                <div className="flex items-center gap-2 rounded-lg border bg-muted/50 px-3 py-2">
                  <code className="flex-1 text-xs font-mono" dir="ltr">{resetPassword}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(resetPassword)}
                    className="rounded p-1 hover:bg-muted"
                    title="نسخ"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                </div>
                <p className="text-[10px] text-muted-foreground/60 text-center">
                  احفظ كلمة المرور الآن — لن تظهر مرة أخرى
                </p>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={() => setResetUserId(null)}>
                    إغلاق
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-muted-foreground/60">كلمة المرور الجديدة (١٠ أحرف على الأقل)</label>
                  <Input
                    type="text"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    dir="ltr"
                    placeholder="كلمة مرور جديدة"
                    disabled={resetLoading}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground/60">
                  سيتم إنهاء جميع جلسات المستخدم الحالية.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => setResetUserId(null)} disabled={resetLoading}>
                    إلغاء
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={handleResetPassword}
                    disabled={resetLoading || !resetPassword}
                  >
                    {resetLoading && <Loader2 className="h-3.5 w-3.5 animate-spin me-1.5" />}
                    إعادة التعيين
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
