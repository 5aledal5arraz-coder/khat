"use client"

import { useState } from 'react'

interface RecentSend {
  id: string
  subject: string
  recipient_count: number
  sent_at: string
}

interface NewsletterComposerProps {
  subscriberCount: number
  recentSends: RecentSend[]
}

export function NewsletterComposer({ subscriberCount, recentSends }: NewsletterComposerProps) {
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [previewEmail, setPreviewEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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

  return (
    <div className="space-y-8">
      {/* Compose Form */}
      <div className="rounded-lg border bg-card p-6 space-y-4">
        <h2 className="text-lg font-semibold">إنشاء رسالة جديدة</h2>

        <div>
          <label className="block text-sm font-medium mb-1.5">الموضوع</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="موضوع الرسالة..."
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            dir="rtl"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1.5">المحتوى (HTML)</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="محتوى الرسالة... (يدعم HTML)"
            rows={10}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
            dir="rtl"
          />
        </div>

        {/* Preview Section */}
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-1.5">بريد المعاينة</label>
            <input
              type="email"
              value={previewEmail}
              onChange={(e) => setPreviewEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              dir="ltr"
            />
          </div>
          <button
            onClick={handlePreview}
            disabled={previewing}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            {previewing ? 'جاري الإرسال...' : 'معاينة'}
          </button>
        </div>

        {/* Send Button */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSend}
            disabled={sending || subscriberCount === 0}
            className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {sending ? 'جاري الإرسال...' : `إرسال إلى ${subscriberCount} مشترك`}
          </button>
        </div>

        {/* Status Message */}
        {message && (
          <div className={`rounded-md p-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-400 border border-green-500/20'
              : 'bg-red-500/10 text-red-400 border border-red-500/20'
          }`}>
            {message.text}
          </div>
        )}
      </div>

      {/* Recent Sends */}
      {recentSends.length > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">الرسائل السابقة</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="pb-2 text-right font-medium">الموضوع</th>
                  <th className="pb-2 text-right font-medium">المستلمون</th>
                  <th className="pb-2 text-right font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {recentSends.map((send) => (
                  <tr key={send.id} className="border-b border-border/50">
                    <td className="py-3">{send.subject}</td>
                    <td className="py-3">{send.recipient_count}</td>
                    <td className="py-3 text-muted-foreground">
                      {new Date(send.sent_at).toLocaleDateString('ar-SA', {
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
