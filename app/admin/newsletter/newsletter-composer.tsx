"use client"

import { useState, useMemo } from 'react'
import {
  Mail,
  PenLine,
  Sparkles,
  X,
  Loader2,
  Users,
  Copy,
  Search,
  Send,
  Eye,
  Clock,
} from 'lucide-react'

interface RecentSend {
  id: string
  subject: string
  recipient_count: number
  sent_at: string
}

interface Subscriber {
  email: string
  created_at: string
}

interface NewsletterComposerProps {
  subscriberCount: number
  recentSends: RecentSend[]
  subscribers: Subscriber[]
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

export function NewsletterComposer({ subscriberCount, recentSends, subscribers }: NewsletterComposerProps) {
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

  // Subscriber search
  const [subscriberSearch, setSubscriberSearch] = useState('')

  const filteredSubscribers = useMemo(() => {
    if (!subscriberSearch.trim()) return subscribers
    const q = subscriberSearch.toLowerCase()
    return subscribers.filter((s) => s.email.toLowerCase().includes(q))
  }, [subscribers, subscriberSearch])

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
        setMessage({ type: 'success', text: `تم الإرسال بنجاح — ${data.sent} من ${data.total} مشترك` })
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

  function handleCopyAllEmails() {
    const emails = subscribers.map((s) => s.email).join(', ')
    navigator.clipboard.writeText(emails)
    setMessage({ type: 'success', text: `تم نسخ ${subscribers.length} بريد` })
    setTimeout(() => setMessage(null), 2000)
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
                {ARABIC_MONTHS.map((name, i) => (
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
                  جاري الإنشاء...
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
              {sending ? 'جاري الإرسال...' : `إرسال إلى ${subscriberCount} مشترك`}
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

      {/* Section 4: Active Subscribers */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">المشتركون النشطون</h2>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              {subscribers.length}
            </span>
          </div>
          <button
            onClick={handleCopyAllEmails}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            <Copy className="h-3.5 w-3.5" />
            نسخ الكل
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="بحث بالبريد الإلكتروني..."
            value={subscriberSearch}
            onChange={(e) => setSubscriberSearch(e.target.value)}
            className="w-full rounded-lg border border-border bg-background ps-10 pe-4 py-2.5 text-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            dir="ltr"
          />
        </div>

        {filteredSubscribers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {subscriberSearch ? 'لا توجد نتائج' : 'لا يوجد مشتركون'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">البريد الإلكتروني</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">تاريخ الاشتراك</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubscribers.map((sub, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-4 py-2.5 font-mono text-xs" dir="ltr">{sub.email}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {new Date(sub.created_at).toLocaleDateString('en-GB', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Section 5: Recent Sends */}
      {recentSends.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">الرسائل السابقة</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">الموضوع</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">المستلمون</th>
                  <th className="px-4 py-2.5 text-start font-medium text-muted-foreground">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {recentSends.map((send) => (
                  <tr key={send.id} className="border-b border-border/50">
                    <td className="px-4 py-2.5">{send.subject}</td>
                    <td className="px-4 py-2.5">{send.recipient_count}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {new Date(send.sent_at).toLocaleDateString('en-GB', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
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
