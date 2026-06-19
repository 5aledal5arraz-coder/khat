"use client"

import { useState } from 'react'
import Link from 'next/link'
import {
  Mail,
  PenLine,
  Sparkles,
  X,
  Loader2,
  Send,
  Eye,
  Clock,
  ExternalLink,
} from 'lucide-react'
import { pct, formatDateTime, AR_MONTHS } from "@/lib/newsletter/format"

interface RecentCampaign {
  id: string
  subject: string
  status: string
  total_recipients: number
  total_sent: number
  total_opened: number
  total_clicked: number
  sent_at: string
}

interface NewsletterComposerProps {
  subscriberCount: number
  recentCampaigns: RecentCampaign[]
}

export function NewsletterComposer({ subscriberCount, recentCampaigns }: NewsletterComposerProps) {
  // Compose state
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [previewEmail, setPreviewEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Panel visibility
  const [showCompose, setShowCompose] = useState(false)
  const [showGenerate, setShowGenerate] = useState(false)

  // Generate state
  const now = new Date()
  const [genMonth, setGenMonth] = useState(now.getMonth() + 1)
  const [genYear, setGenYear] = useState(now.getFullYear())
  const [generating, setGenerating] = useState(false)

  async function handleGenerate() {
    if ((subject.trim() || body.trim()) && !window.confirm('الحقول تحتوي على محتوى. هل تريد استبداله؟')) {
      return
    }

    setGenerating(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/newsletter/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: genYear, month: genMonth }),
      })
      const data = await res.json()
      if (res.ok) {
        setSubject(data.subject)
        setBody(data.body)
        setShowCompose(true)
        setShowGenerate(false)
        setMessage({ type: 'success', text: 'تم إنشاء النشرة بنجاح — راجع المحتوى ثم أرسل' })
      } else {
        setMessage({ type: 'error', text: data.error || 'فشل إنشاء النشرة' })
      }
    } catch {
      setMessage({ type: 'error', text: 'حدث خطأ في الاتصال' })
    } finally {
      setGenerating(false)
    }
  }

  async function handlePreview() {
    if (!subject.trim() || !body.trim() || !previewEmail.trim()) {
      setMessage({ type: 'error', text: 'يرجى ملء جميع الحقول' })
      return
    }

    setPreviewing(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/newsletter/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body, email: previewEmail }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: `تم إرسال المعاينة إلى ${previewEmail}` })
      } else {
        setMessage({ type: 'error', text: data.error || 'فشل إرسال المعاينة' })
      }
    } catch {
      setMessage({ type: 'error', text: 'حدث خطأ في الاتصال' })
    } finally {
      setPreviewing(false)
    }
  }

  async function handleSend() {
    if (!subject.trim() || !body.trim()) {
      setMessage({ type: 'error', text: 'يرجى ملء الموضوع والمحتوى' })
      return
    }

    const confirmed = window.confirm(
      `هل أنت متأكد من إرسال هذه الرسالة إلى ${subscriberCount} مشترك؟`
    )
    if (!confirmed) return

    setSending(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/newsletter/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({
          type: 'success',
          text: data.queued
            ? `بدأ الإرسال إلى ${data.total} مشترك — يتم التنفيذ في الخلفية وتتحدّث الأرقام تلقائياً.`
            : 'لا يوجد مشتركون نشطون لإرسال الرسالة إليهم.',
        })
        setSubject('')
        setBody('')
      } else {
        setMessage({ type: 'error', text: data.error || 'فشل الإرسال' })
      }
    } catch {
      setMessage({ type: 'error', text: 'حدث خطأ في الاتصال' })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Section 1: Stats + Quick Actions */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold">{subscriberCount}</p>
            <p className="text-sm text-muted-foreground">مشترك نشط</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => { setShowCompose(!showCompose); setShowGenerate(false) }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              showCompose
                ? 'bg-primary text-primary-foreground'
                : 'border border-border hover:bg-muted'
            }`}
          >
            <PenLine className="h-4 w-4" />
            إنشاء رسالة جديدة
          </button>
          <button
            onClick={() => { setShowGenerate(!showGenerate); setShowCompose(false) }}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              showGenerate
                ? 'bg-primary text-primary-foreground'
                : 'border border-border hover:bg-muted'
            }`}
          >
            <Sparkles className="h-4 w-4" />
            إنشاء نشرة الشهر
          </button>
        </div>
      </div>

      {/* Section 2: Generate Panel */}
      {showGenerate && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">إنشاء نشرة الشهر بالذكاء الاصطناعي</h2>
            </div>
            <button
              onClick={() => setShowGenerate(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium">الشهر</label>
              <select
                value={genMonth}
                onChange={(e) => setGenMonth(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
              >
                {AR_MONTHS.map((name, i) => (
                  <option key={i + 1} value={i + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium">السنة</label>
              <select
                value={genYear}
                onChange={(e) => setGenYear(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
              >
                <option value={now.getFullYear()}>{now.getFullYear()}</option>
                <option value={now.getFullYear() - 1}>{now.getFullYear() - 1}</option>
              </select>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ الإنشاء...
                </>
              ) : (
                'إنشاء'
              )}
            </button>
          </div>

          {message && showGenerate && (
            <div className={`rounded-lg p-3 text-sm ${
              message.type === 'success'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {message.text}
            </div>
          )}
        </div>
      )}

      {/* Section 3: Compose Form */}
      {showCompose && (
        <div className="rounded-lg border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PenLine className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">إنشاء رسالة</h2>
            </div>
            <button
              onClick={() => setShowCompose(false)}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">الموضوع</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="موضوع الرسالة..."
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
              dir="rtl"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">المحتوى (HTML)</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="محتوى الرسالة... (يدعم HTML)"
              rows={12}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-mono focus:border-primary focus:outline-none"
              dir="rtl"
            />
          </div>

          {/* Preview Section */}
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1.5 block text-sm font-medium">بريد المعاينة</label>
              <input
                type="email"
                value={previewEmail}
                onChange={(e) => setPreviewEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
                dir="ltr"
              />
            </div>
            <button
              onClick={handlePreview}
              disabled={previewing}
              className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              معاينة
            </button>
          </div>

          {/* Send Button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSend}
              disabled={sending || subscriberCount === 0}
              className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {sending ? 'جارٍ الإرسال...' : `إرسال إلى ${subscriberCount} مشترك`}
            </button>
          </div>

          {/* Status Message */}
          {message && showCompose && (
            <div className={`rounded-lg p-3 text-sm ${
              message.type === 'success'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              {message.text}
            </div>
          )}
        </div>
      )}

      {/* Section 4: Recent Campaigns */}
      {recentCampaigns.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">الحملات السابقة</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">الموضوع</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">الحالة</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">المُرسل</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">الفتح</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">النقر</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">التاريخ</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {recentCampaigns.map((campaign) => (
                  <tr key={campaign.id} className="border-b border-border/50">
                    <td className="px-4 py-2.5 max-w-[200px] truncate">{campaign.subject}</td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        campaign.status === 'sent'
                          ? 'bg-green-500/10 text-green-400'
                          : campaign.status === 'sending'
                          ? 'bg-yellow-500/10 text-yellow-400'
                          : campaign.status === 'failed'
                          ? 'bg-red-500/10 text-red-400'
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {campaign.status === 'sent' ? 'مُرسل' :
                         campaign.status === 'sending' ? 'جارٍ الإرسال' :
                         campaign.status === 'failed' ? 'فشل' :
                         campaign.status === 'draft' ? 'مسودة' : campaign.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {campaign.total_sent}/{campaign.total_recipients}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {campaign.total_opened} <span className="text-muted-foreground">({pct(campaign.total_opened, campaign.total_sent)})</span>
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {campaign.total_clicked} <span className="text-muted-foreground">({pct(campaign.total_clicked, campaign.total_sent)})</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                      {formatDateTime(campaign.sent_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/newsletter/campaigns/${campaign.id}`}
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        تفاصيل
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
