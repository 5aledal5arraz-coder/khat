"use client"

import { useState } from "react"
import Image from "next/image"
import { Loader2, Plus, Trash2, Upload, ArrowUp, ArrowDown, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { PlatformIcon } from "@/components/platforms/platform-icon"
import { cn } from "@/lib/utils"
import type { TeamMember } from "@/types/static-content"
import { deleteMemberAction, reorderTeamAction, saveMemberAction } from "./actions"

/**
 * The team editor — the first screen that has ever written `/about`.
 *
 * ── EVERY FIELD IS OPTIONAL EXCEPT THE NAME ────────────────────────────────
 * The page is built to degrade one field at a time: no photo → the shared «ط»
 * panel, no video → the photo, no message → no quote and no orphaned rule. So
 * this form must never demand a field to let a save through, or it would force placeholder content into a page designed to look
 * deliberate while half-filled.
 *
 * ── THE SOCIAL KEYS ARE A FIXED LIST, NOT FREE TEXT ────────────────────────
 * `platform` is a key from the shared `PlatformIcon` map, chosen from a
 * dropdown. Typed freehand it would silently fall through to the generic
 * fallback glyph — a member's X account rendering as a pair of headphones, with
 * nothing anywhere reporting it.
 */

const SOCIAL_CHOICES = [
  { value: "x", label: "X" },
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "threads", label: "Threads" },
  { value: "snapchat", label: "Snapchat" },
  { value: "website", label: "موقع شخصي" },
]

const blank = (): TeamMember => ({
  id: `member-${crypto.randomUUID().slice(0, 8)}`,
  name: "",
  role: "",
  description: "",
  image: "",
  order: 0,
})

export function TeamEditor({ initial }: { initial: TeamMember[] }) {
  const [members, setMembers] = useState<TeamMember[]>(initial)
  const [editing, setEditing] = useState<TeamMember | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function save(m: TeamMember) {
    setBusy(true)
    setError("")
    try {
      const r = await saveMemberAction(m)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setMembers((prev) => {
        const i = prev.findIndex((p) => p.id === m.id)
        if (i >= 0) {
          const next = [...prev]
          next[i] = m
          return next
        }
        return [...prev, { ...m, order: m.order || prev.length + 1 }]
      })
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الحفظ")
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    if (!confirm("حذف هذا العضو من صفحة «من نحن»؟")) return
    setBusy(true)
    try {
      await deleteMemberAction(id)
      setMembers((prev) => prev.filter((m) => m.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر الحذف")
    } finally {
      setBusy(false)
    }
  }

  async function move(id: string, dir: -1 | 1) {
    const i = members.findIndex((m) => m.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= members.length) return
    const next = [...members]
    ;[next[i], next[j]] = [next[j], next[i]]
    setMembers(next)
    setBusy(true)
    try {
      await reorderTeamAction(next.map((m) => m.id))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-caption text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between">
        <p className="text-caption text-muted-foreground">
          {members.length} عضو — الترتيب هنا هو الترتيب على الصفحة
        </p>
        <Button onClick={() => setEditing(blank())} disabled={busy}>
          <Plus className="me-1.5 h-4 w-4" /> إضافة عضو
        </Button>
      </div>

      <div className="space-y-3">
        {members.map((m, i) => (
          /* ── THE ROW STACKS ON A PHONE, AND HAS TO ────────────────────────
             Khaled, on an iPhone: «ليش جذي الاسم مو كامل ولا الايميل». Every
             name was one letter — «خ», «ف», «ش».

             The text column was already `min-w-0 flex-1` and the names were
             already `truncate`, so nothing was overflowing; the column had
             simply been squeezed to about a character. Four `shrink-0`
             controls (up, down, تعديل, delete) plus a 56px photo plus gaps
             claim roughly 300px before any text exists, and a phone is 390px
             wide. `truncate` then did exactly what it was told, on 80px.

             So the fix is not on the text — it is giving the text a full-width
             line of its own below `sm` and moving the controls under it. */
          <div
            key={m.id}
            className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-muted">
                {m.image ? (
                  <Image src={m.image} alt="" fill className="object-cover" sizes="56px" />
                ) : (
                  <span className="flex h-full items-center justify-center text-center text-micro leading-tight text-muted-foreground">
                    بلا صورة
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{m.name || "—"}</p>
                <p className="truncate text-caption text-muted-foreground">
                  {m.role || "بلا مسمّى"}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-muted-foreground">
                  {m.videoUrl && <span>▶ فيديو</span>}
                  {(m.socials?.length ?? 0) > 0 && <span>{m.socials!.length} حساب</span>}
                  {!m.message && <span className="text-accent-strong">بلا رسالة</span>}
                </div>
              </div>
            </div>
            <div className="flex shrink-0 items-center justify-end gap-1">
              <Button variant="ghost" size="icon" disabled={busy || i === 0} onClick={() => void move(m.id, -1)}>
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy || i === members.length - 1}
                onClick={() => void move(m.id, 1)}
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setEditing({ ...m })} disabled={busy}>
                تعديل
              </Button>
              <Button variant="ghost" size="icon" onClick={() => void remove(m.id)} disabled={busy}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
        {members.length === 0 && (
          <p className="rounded-2xl border border-dashed border-border p-10 text-center text-caption text-muted-foreground">
            ما فيه أعضاء بعد. اضغط «إضافة عضو».
          </p>
        )}
      </div>

      {editing && (
        <MemberForm
          member={editing}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={(m) => void save(m)}
        />
      )}
    </div>
  )
}

function MemberForm({
  member,
  busy,
  onCancel,
  onSave,
}: {
  member: TeamMember
  busy: boolean
  onCancel: () => void
  onSave: (m: TeamMember) => void
}) {
  const [m, setM] = useState<TeamMember>(member)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")

  const set = <K extends keyof TeamMember>(k: K, v: TeamMember[K]) =>
    setM((prev) => ({ ...prev, [k]: v }))

  async function upload(file: File) {
    setUploading(true)
    setUploadError("")
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/about-team/upload", { method: "POST", body: fd })
      const data = await res.json()
      // `res.ok` is checked, not just `data.url`: a 500 that returns HTML would
      // otherwise set `image` to undefined and look like a successful upload.
      if (!res.ok) {
        setUploadError(data.error || "تعذّر رفع الصورة")
        return
      }
      set("image", data.url)
    } catch {
      setUploadError("تعذّر رفع الصورة")
    } finally {
      setUploading(false)
    }
  }

  const socials = m.socials ?? []

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lead font-bold">{m.name || "عضو جديد"}</h3>
        <Button variant="ghost" size="icon" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="الاسم *">
          <Input value={m.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="المسمّى" hint="سطر واحد — «المؤسس والمقدّم»">
          <Input value={m.role} onChange={(e) => set("role", e.target.value)} />
        </Field>
      </div>

      <Field label="نبذة" hint="ماذا يفعل فعلاً — يظهر تحت المسمّى">
        <Textarea rows={3} value={m.description} onChange={(e) => set("description", e.target.value)} />
      </Field>

      <Field
        label="رسالته"
        hint="جملة واحدة بصوته — تُعرض كاقتباس وتحتها خط خط البرتقالي. اتركها فارغة ولن يظهر الاقتباس."
      >
        <Textarea rows={2} value={m.message ?? ""} onChange={(e) => set("message", e.target.value)} />
      </Field>

      {/* THE PER-MEMBER EMAIL FIELD IS GONE, and its absence is the point.
          /about no longer publishes a personal address — every member's button
          writes to the ONE team address with his name in the subject. A field
          that is still editable but no longer rendered anywhere is the exact
          shape of the bug this codebase keeps shipping: the admin saves it,
          reports success, and nothing changes on the site. Better to remove it
          than to leave a control that lies. */}
      <Field label="رابط فيديو (يوتيوب)" hint="يحلّ محل الصورة على الصفحة">
        <Input dir="ltr" value={m.videoUrl ?? ""} onChange={(e) => set("videoUrl", e.target.value)} />
      </Field>

      {/* Photo */}
      <div className="mt-4 space-y-2">
        <Label>الصورة</Label>
        <div className="flex items-center gap-4">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
            {m.image ? (
              <Image src={m.image} alt="" fill className="object-cover" sizes="80px" />
            ) : (
              <span className="flex h-full items-center justify-center text-micro text-muted-foreground">
                بلا صورة
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border px-4 py-2 text-caption font-medium transition-colors hover:bg-secondary",
                uploading && "pointer-events-none opacity-60",
              )}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "جارٍ الرفع…" : "اختر صورة"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void upload(f)
                }}
              />
            </label>
            {m.image && (
              <button
                type="button"
                onClick={() => set("image", "")}
                className="text-start text-micro text-destructive hover:underline"
              >
                إزالة الصورة
              </button>
            )}
            {uploadError && <p className="text-micro text-destructive">{uploadError}</p>}
          </div>
        </div>
      </div>

      {/* Socials */}
      <div className="mt-5 space-y-2">
        <Label>حسابات التواصل</Label>
        {socials.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <PlatformIcon iconName={s.platform} className="h-4 w-4 shrink-0 text-muted-foreground" />
            <select
              value={s.platform}
              onChange={(e) => {
                const next = [...socials]
                next[i] = { ...next[i], platform: e.target.value }
                set("socials", next)
              }}
              className="h-10 rounded-xl border border-border bg-background px-3 text-caption"
            >
              {SOCIAL_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <Input
              dir="ltr"
              placeholder="https://…"
              value={s.url}
              onChange={(e) => {
                const next = [...socials]
                next[i] = { ...next[i], url: e.target.value }
                set("socials", next)
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => set("socials", socials.filter((_, k) => k !== i))}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => set("socials", [...socials, { platform: "x", url: "" }])}
        >
          <Plus className="me-1.5 h-3.5 w-3.5" /> إضافة حساب
        </Button>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          إلغاء
        </Button>
        <Button onClick={() => onSave(m)} disabled={busy || uploading}>
          {busy && <Loader2 className="me-1.5 h-4 w-4 animate-spin" />}
          حفظ
        </Button>
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="mt-4 space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-micro text-muted-foreground">{hint}</p>}
    </div>
  )
}
