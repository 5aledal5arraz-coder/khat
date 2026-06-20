"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Loader2, Copy, Check, Pencil,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { CopyButton } from "./shared"

// ---------------------------------------------------------------------------
// EditableField — single text input or textarea with auto-save
// ---------------------------------------------------------------------------

export function EditableField({
  label,
  value,
  type,
  onSave,
}: {
  label: string
  value: string
  type: "input" | "textarea"
  onSave: (value: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDraft(value)
  }, [value])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleSave = useCallback(async (newValue: string) => {
    setSaving(true)
    try {
      await onSave(newValue)
    } finally {
      setSaving(false)
    }
  }, [onSave])

  const handleChange = (newValue: string) => {
    setDraft(newValue)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => handleSave(newValue), 1000)
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">{label}</span>
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          {!saving && editing && <span className="text-[10px] text-green-700 dark:text-green-400">محفوظ تلقائياً</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
            title="نسخ"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-700" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={() => setEditing(!editing)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              editing ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
            )}
            title={editing ? "إغلاق التحرير" : "تحرير"}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {editing ? (
        type === "textarea" ? (
          <textarea
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            dir="rtl"
            rows={8}
            className="w-full rounded-lg border bg-background px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/20 resize-y"
          />
        ) : (
          <input
            type="text"
            value={draft}
            onChange={(e) => handleChange(e.target.value)}
            dir="rtl"
            className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        )
      ) : (
        <div
          className="rounded-lg border border-border/30 bg-muted/20 px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap cursor-pointer hover:bg-muted/40 transition-colors"
          dir="rtl"
          onClick={() => setEditing(true)}
        >
          {value || <span className="text-muted-foreground">—</span>}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// EditableListField — array of strings, displayed as numbered list
// ---------------------------------------------------------------------------

export function EditableListField({
  label,
  values,
  onSave,
}: {
  label: string
  values: string[]
  onSave: (values: string[]) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [drafts, setDrafts] = useState<string[]>(values)
  const [saving, setSaving] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDrafts(values)
  }, [values])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleSave = useCallback(async (newValues: string[]) => {
    setSaving(true)
    try {
      await onSave(newValues)
    } finally {
      setSaving(false)
    }
  }, [onSave])

  const handleItemChange = (index: number, newValue: string) => {
    const updated = [...drafts]
    updated[index] = newValue
    setDrafts(updated)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => handleSave(updated), 1000)
  }

  const handleCopyItem = async (index: number) => {
    await navigator.clipboard.writeText(drafts[index])
    setCopiedIdx(index)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const handleCopyAll = async () => {
    await navigator.clipboard.writeText(drafts.join("\n"))
    setCopiedIdx(-1)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">{label}</span>
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyAll}
            className="flex h-7 items-center gap-1 rounded-md px-2 hover:bg-muted transition-colors"
            title="نسخ الكل"
          >
            {copiedIdx === -1 ? (
              <Check className="h-3.5 w-3.5 text-green-700" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-[11px] text-muted-foreground">الكل</span>
          </button>
          <button
            onClick={() => setEditing(!editing)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              editing ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
            )}
            title={editing ? "إغلاق التحرير" : "تحرير"}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="space-y-1.5">
        {drafts.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="shrink-0 w-5 text-xs text-muted-foreground text-center">{idx + 1}</span>
            {editing ? (
              <input
                type="text"
                value={item}
                onChange={(e) => handleItemChange(idx, e.target.value)}
                dir="rtl"
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            ) : (
              <div
                className="flex-1 rounded-lg border border-border/30 bg-muted/20 px-3 py-2 text-[13px] cursor-pointer hover:bg-muted/40 transition-colors"
                dir="rtl"
                onClick={() => setEditing(true)}
              >
                {item}
              </div>
            )}
            <button
              onClick={() => handleCopyItem(idx)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-muted transition-colors"
              title="نسخ"
            >
              {copiedIdx === idx ? (
                <Check className="h-3 w-3 text-green-700" />
              ) : (
                <Copy className="h-3 w-3 text-muted-foreground" />
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EditableTagsField — comma-separated tags displayed as pills
// ---------------------------------------------------------------------------

export function EditableTagsField({
  label,
  values,
  prefix,
  onSave,
}: {
  label: string
  values: string[]
  prefix?: string
  onSave: (values: string[]) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(values.join("، "))
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setDraft(values.join("، "))
  }, [values])

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [])

  const handleSave = useCallback(async (text: string) => {
    const newValues = text
      .split(/[,،\n]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    setSaving(true)
    try {
      await onSave(newValues)
    } finally {
      setSaving(false)
    }
  }, [onSave])

  const handleChange = (text: string) => {
    setDraft(text)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => handleSave(text), 1000)
  }

  const handleCopy = async () => {
    const text = prefix
      ? values.map((v) => `${prefix}${v}`).join(" ")
      : values.join("، ")
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold">{label}</span>
          <span className="text-xs text-muted-foreground">({values.length})</span>
          {saving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
            title="نسخ"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-700" />
            ) : (
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            )}
          </button>
          <button
            onClick={() => setEditing(!editing)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              editing ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
            )}
            title={editing ? "إغلاق التحرير" : "تحرير"}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          dir="rtl"
          rows={3}
          placeholder="أدخل القيم مفصولة بفاصلة..."
          className="w-full rounded-lg border bg-background px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/20 resize-y"
        />
      ) : (
        <div
          className="flex flex-wrap gap-1.5 cursor-pointer"
          onClick={() => setEditing(true)}
        >
          {values.map((tag, idx) => (
            <span
              key={idx}
              className="inline-flex rounded-md bg-muted/60 px-2.5 py-0.5 text-[11px] font-medium hover:bg-muted/80 transition-colors"
            >
              {prefix}{tag}
            </span>
          ))}
          {values.length === 0 && (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// WebPkgEditableField — for website package text fields
// ---------------------------------------------------------------------------

export function WebPkgEditableField({
  label,
  icon,
  value,
  type,
  rows,
  onChange,
  onCopy,
}: {
  label: string
  icon: React.ReactNode
  value: string
  type: "input" | "textarea"
  rows?: number
  onChange: (value: string) => void
  onCopy: () => void
}) {
  const [editing, setEditing] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-[13px] font-semibold">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          <CopyButton onClick={onCopy} />
          <button
            onClick={() => setEditing(!editing)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              editing ? "bg-primary/10 text-primary" : "hover:bg-muted text-muted-foreground"
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {editing ? (
        type === "textarea" ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            dir="rtl"
            rows={rows || 4}
            className="w-full rounded-lg border bg-background px-4 py-3 text-sm leading-relaxed outline-none focus:ring-2 focus:ring-primary/20 resize-y"
          />
        ) : (
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            dir="rtl"
            className="w-full rounded-lg border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
        )
      ) : (
        <div
          className="rounded-lg border border-border/30 bg-muted/20 px-4 py-3 text-[13px] leading-relaxed whitespace-pre-wrap cursor-pointer hover:bg-muted/40 transition-colors"
          dir="rtl"
          onClick={() => setEditing(true)}
        >
          {value || <span className="text-muted-foreground">—</span>}
        </div>
      )}
    </div>
  )
}
