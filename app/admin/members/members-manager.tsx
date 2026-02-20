"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Ban,
  Trash2,
  Mail,
  ShieldCheck,
  ShieldAlert,
  X,
  Loader2,
  UserCog,
  UserPlus,
} from "lucide-react"

// --- Types ---

interface Member {
  id: string
  display_name: string | null
  username: string | null
  email: string | null
  avatar_url: string | null
  role: string
  is_admin: boolean
  is_banned: boolean
  ban_reason: string | null
  articles_count: number
  followers_count: number
  created_at: string
}

type RoleValue = "admin" | "editor" | "moderator" | "user"

const ROLE_LABELS: Record<RoleValue, string> = {
  admin: "مدير",
  editor: "محرر",
  moderator: "مشرف",
  user: "عضو",
}

const ROLE_COLORS: Record<RoleValue, string> = {
  admin: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  editor: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  moderator: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  user: "bg-neutral-500/20 text-neutral-400 border-neutral-500/30",
}

const PAGE_SIZE = 50

// --- API helpers ---

async function apiFetch(url: string, options?: RequestInit) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-requested-with": "khat",
      ...options?.headers,
    },
  })
  return res.json()
}

// --- Component ---

export function MembersManager() {
  const [members, setMembers] = useState<Member[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [roleFilter, setRoleFilter] = useState("")
  const [banFilter, setBanFilter] = useState("")
  const [loading, setLoading] = useState(true)

  // Modal states
  const [banModal, setBanModal] = useState<Member | null>(null)
  const [banReason, setBanReason] = useState("")
  const [deleteModal, setDeleteModal] = useState<Member | null>(null)
  const [emailModal, setEmailModal] = useState<Member | null>(null)
  const [emailSubject, setEmailSubject] = useState("")
  const [emailBody, setEmailBody] = useState("")
  const [actionLoading, setActionLoading] = useState(false)

  // Add member modal
  const [addModal, setAddModal] = useState(false)
  const [newName, setNewName] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [newUsername, setNewUsername] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [newRole, setNewRole] = useState<RoleValue>("user")
  const [addError, setAddError] = useState("")

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  // Fetch members
  const fetchMembers = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (debouncedSearch) params.set("search", debouncedSearch)
    if (roleFilter) params.set("role", roleFilter)
    if (banFilter) params.set("is_banned", banFilter)
    params.set("limit", String(PAGE_SIZE))
    params.set("offset", String(page * PAGE_SIZE))

    const data = await apiFetch(`/api/admin/members?${params}`)
    setMembers(data.members || [])
    setTotal(data.total || 0)
    setLoading(false)
  }, [debouncedSearch, roleFilter, banFilter, page])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  // --- Actions ---

  async function handleRoleChange(member: Member, newRole: RoleValue) {
    await apiFetch(`/api/admin/members/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({ role: newRole }),
    })
    fetchMembers()
  }

  async function handleBan() {
    if (!banModal) return
    setActionLoading(true)
    await apiFetch(`/api/admin/members/${banModal.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_banned: true, ban_reason: banReason }),
    })
    setBanModal(null)
    setBanReason("")
    setActionLoading(false)
    fetchMembers()
  }

  async function handleUnban(member: Member) {
    await apiFetch(`/api/admin/members/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_banned: false }),
    })
    fetchMembers()
  }

  async function handleDelete() {
    if (!deleteModal) return
    setActionLoading(true)
    await apiFetch(`/api/admin/members/${deleteModal.id}`, {
      method: "DELETE",
    })
    setDeleteModal(null)
    setActionLoading(false)
    fetchMembers()
  }

  async function handleSendEmail() {
    if (!emailModal) return
    setActionLoading(true)
    await apiFetch(`/api/admin/members/${emailModal.id}/email`, {
      method: "POST",
      body: JSON.stringify({ subject: emailSubject, body: emailBody }),
    })
    setEmailModal(null)
    setEmailSubject("")
    setEmailBody("")
    setActionLoading(false)
  }

  async function handleAddMember() {
    if (!newName.trim() || !newEmail.trim() || !newPassword) return
    setActionLoading(true)
    setAddError("")
    const data = await apiFetch("/api/admin/members", {
      method: "POST",
      body: JSON.stringify({
        display_name: newName.trim(),
        email: newEmail.trim(),
        password: newPassword,
        username: newUsername.trim() || undefined,
        role: newRole,
      }),
    })
    if (data.error) {
      setAddError(data.error)
      setActionLoading(false)
      return
    }
    setAddModal(false)
    setNewName("")
    setNewEmail("")
    setNewPassword("")
    setNewUsername("")
    setNewRole("user")
    setAddError("")
    setActionLoading(false)
    fetchMembers()
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCog className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">فريق خط</h1>
          <span className="text-sm text-muted-foreground">({total})</span>
        </div>
        <button
          onClick={() => setAddModal(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <UserPlus className="h-4 w-4" />
          <span className="hidden sm:inline">إضافة عضو</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="بحث بالاسم أو المعرف أو البريد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-card ps-10 pe-4 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(0) }}
          className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">كل الصلاحيات</option>
          <option value="admin">مدير</option>
          <option value="editor">محرر</option>
          <option value="moderator">مشرف</option>
          <option value="user">عضو</option>
        </select>
        <select
          value={banFilter}
          onChange={(e) => { setBanFilter(e.target.value); setPage(0) }}
          className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
        >
          <option value="">الكل</option>
          <option value="true">محظور</option>
          <option value="false">نشط</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : members.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
          لا يوجد أعضاء في الفريق
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto rounded-lg border border-border md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">العضو</th>
                  <th className="px-4 py-3 text-start font-medium text-muted-foreground">البريد</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">الصلاحية</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">الحالة</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">المقالات</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">المتابعون</th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-muted-foreground">
                            {(m.display_name || m.username || "?")[0]}
                          </div>
                        )}
                        <div>
                          <div className="font-medium">{m.display_name || "—"}</div>
                          {m.username && <div className="text-xs text-muted-foreground">@{m.username}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{m.email || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={m.role || "user"}
                        onChange={(e) => handleRoleChange(m, e.target.value as RoleValue)}
                        className={`rounded-md border px-2 py-1 text-xs font-medium ${ROLE_COLORS[(m.role as RoleValue) || "user"]} bg-transparent cursor-pointer focus:outline-none`}
                      >
                        {Object.entries(ROLE_LABELS).map(([val, label]) => (
                          <option key={val} value={val} className="bg-card text-foreground">
                            {label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.is_banned ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
                          <Ban className="h-3 w-3" /> محظور
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2 py-0.5 text-xs text-green-400">
                          <ShieldCheck className="h-3 w-3" /> نشط
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{m.articles_count}</td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{m.followers_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        {m.is_banned ? (
                          <button
                            onClick={() => handleUnban(m)}
                            title="إلغاء الحظر"
                            className="rounded-md p-1.5 text-green-400 hover:bg-green-500/20"
                          >
                            <ShieldCheck className="h-4 w-4" />
                          </button>
                        ) : (
                          <button
                            onClick={() => setBanModal(m)}
                            title="حظر"
                            className="rounded-md p-1.5 text-orange-400 hover:bg-orange-500/20"
                          >
                            <ShieldAlert className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteModal(m)}
                          title="حذف"
                          className="rounded-md p-1.5 text-red-400 hover:bg-red-500/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        {m.email && (
                          <button
                            onClick={() => setEmailModal(m)}
                            title="إرسال بريد"
                            className="rounded-md p-1.5 text-blue-400 hover:bg-blue-500/20"
                          >
                            <Mail className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {members.map((m) => (
              <div key={m.id} className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-sm font-bold text-muted-foreground">
                      {(m.display_name || m.username || "?")[0]}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-medium">{m.display_name || "—"}</div>
                    {m.username && <div className="text-xs text-muted-foreground">@{m.username}</div>}
                    {m.email && <div className="text-xs text-muted-foreground">{m.email}</div>}
                  </div>
                  {m.is_banned && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-xs text-red-400">
                      <Ban className="h-3 w-3" /> محظور
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>مقالات: {m.articles_count}</span>
                  <span>متابعون: {m.followers_count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={m.role || "user"}
                    onChange={(e) => handleRoleChange(m, e.target.value as RoleValue)}
                    className={`rounded-md border px-2 py-1 text-xs font-medium ${ROLE_COLORS[(m.role as RoleValue) || "user"]} bg-transparent focus:outline-none`}
                  >
                    {Object.entries(ROLE_LABELS).map(([val, label]) => (
                      <option key={val} value={val} className="bg-card text-foreground">
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="flex-1" />
                  {m.is_banned ? (
                    <button onClick={() => handleUnban(m)} className="rounded-md p-1.5 text-green-400 hover:bg-green-500/20">
                      <ShieldCheck className="h-4 w-4" />
                    </button>
                  ) : (
                    <button onClick={() => setBanModal(m)} className="rounded-md p-1.5 text-orange-400 hover:bg-orange-500/20">
                      <ShieldAlert className="h-4 w-4" />
                    </button>
                  )}
                  <button onClick={() => setDeleteModal(m)} className="rounded-md p-1.5 text-red-400 hover:bg-red-500/20">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  {m.email && (
                    <button onClick={() => setEmailModal(m)} className="rounded-md p-1.5 text-blue-400 hover:bg-blue-500/20">
                      <Mail className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-lg border border-border p-2 hover:bg-muted disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="text-sm text-muted-foreground">
                صفحة {page + 1} من {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-lg border border-border p-2 hover:bg-muted disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Ban Modal */}
      {banModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">حظر العضو</h3>
              <button onClick={() => { setBanModal(null); setBanReason("") }} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              سيتم حظر <strong className="text-foreground">{banModal.display_name || banModal.username}</strong> من استخدام المنصة.
            </p>
            <textarea
              placeholder="سبب الحظر (اختياري)..."
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setBanModal(null); setBanReason("") }}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                onClick={handleBan}
                disabled={actionLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "حظر"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-red-400">حذف العضو</h3>
              <button onClick={() => setDeleteModal(null)} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              هل أنت متأكد من حذف <strong className="text-foreground">{deleteModal.display_name || deleteModal.username}</strong>؟
            </p>
            <p className="text-xs text-red-400/80">
              سيتم حذف الحساب وإخفاء جميع المقالات والخواطر. هذا الإجراء لا يمكن التراجع عنه.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteModal(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "حذف نهائي"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Modal */}
      {emailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">إرسال بريد</h3>
              <button onClick={() => { setEmailModal(null); setEmailSubject(""); setEmailBody("") }} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              إرسال بريد إلى <strong className="text-foreground">{emailModal.display_name || emailModal.username}</strong> ({emailModal.email})
            </p>
            <input
              type="text"
              placeholder="الموضوع"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <textarea
              placeholder="محتوى الرسالة..."
              value={emailBody}
              onChange={(e) => setEmailBody(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-border bg-background p-3 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setEmailModal(null); setEmailSubject(""); setEmailBody("") }}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                onClick={handleSendEmail}
                disabled={actionLoading || !emailSubject.trim() || !emailBody.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "إرسال"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">إضافة عضو جديد</h3>
              <button
                onClick={() => { setAddModal(false); setAddError(""); setNewName(""); setNewEmail(""); setNewPassword(""); setNewUsername(""); setNewRole("user") }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {addError && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5 text-sm text-red-400">
                {addError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">الاسم <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="الاسم الكامل"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">البريد الإلكتروني <span className="text-red-400">*</span></label>
                <input
                  type="email"
                  placeholder="example@email.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  dir="ltr"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">كلمة المرور المؤقتة <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="كلمة مرور مؤقتة (٦ أحرف على الأقل)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  dir="ltr"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
                <p className="mt-1 text-xs text-muted-foreground">سيُطلب من العضو تغييرها عند أول تسجيل دخول</p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">اسم المستخدم</label>
                <input
                  type="text"
                  placeholder="username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  dir="ltr"
                  className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">الصلاحية</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as RoleValue)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                >
                  {Object.entries(ROLE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => { setAddModal(false); setAddError(""); setNewName(""); setNewEmail(""); setNewPassword(""); setNewUsername(""); setNewRole("user") }}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                onClick={handleAddMember}
                disabled={actionLoading || !newName.trim() || !newEmail.trim() || !newPassword}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "إضافة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
