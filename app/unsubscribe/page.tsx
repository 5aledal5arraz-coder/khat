import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Info, AlertTriangle } from 'lucide-react'
import { KhatLogo } from '@/components/brand/khat-logo'
import { NewsletterSignup } from '@/components/forms/newsletter-signup'

export const metadata: Metadata = {
  title: 'إلغاء الاشتراك',
  robots: { index: false },
}

interface PageProps {
  searchParams: Promise<{ status?: string; type?: string }>
}

const TYPE_LABELS: Record<string, string> = {
  newsletter: 'النشرة البريدية',
  comments: 'إشعارات التعليقات',
  replies: 'إشعارات الردود',
  likes: 'إشعارات الإعجابات',
  follows: 'إشعارات المتابعات',
  all: 'جميع الإشعارات',
}

type View = {
  icon: typeof CheckCircle2
  tone: 'primary' | 'muted' | 'destructive'
  title: string
  body: string
}

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const { status, type } = await searchParams
  const typeLabel = type ? TYPE_LABELS[type] || type : ''

  const view: View =
    status === 'success'
      ? {
          icon: CheckCircle2,
          tone: 'primary',
          title: 'تم إلغاء الاشتراك',
          body: typeLabel
            ? `لن تصلك بعد الآن رسائل ${typeLabel}. نأسف لرحيلك — وسنكون هنا متى عدت.`
            : 'تم تحديث تفضيلاتك بنجاح.',
        }
      : status === 'already'
        ? {
            icon: Info,
            tone: 'muted',
            title: 'أنت غير مشترك بالفعل',
            body: 'هذا الاشتراك ملغى مسبقاً — لا حاجة لأي إجراء.',
          }
        : {
            icon: AlertTriangle,
            tone: 'destructive',
            title: 'تعذّر إتمام الطلب',
            body: 'الرابط غير صالح أو منتهي الصلاحية. يرجى المحاولة من أحدث رسالة وصلتك.',
          }

  const Icon = view.icon
  const toneClass =
    view.tone === 'primary'
      ? 'bg-primary/10 text-primary'
      : view.tone === 'destructive'
        ? 'bg-destructive/10 text-destructive'
        : 'bg-muted text-muted-foreground'

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12" dir="rtl">
      <div className="w-full max-w-md">
        <div className="flex justify-center">
          <Link href="/" aria-label="خط — الرئيسية">
            <KhatLogo size={52} />
          </Link>
        </div>

        <div className="mt-8 rounded-3xl border border-border bg-card p-8 text-center shadow-sm sm:p-10">
          <span
            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ${toneClass}`}
          >
            <Icon className="h-7 w-7" />
          </span>
          <h1 className="mt-5 text-xl font-bold tracking-tight text-foreground">{view.title}</h1>
          <p className="mt-2.5 text-[14.5px] leading-relaxed text-muted-foreground">{view.body}</p>

          {status === 'success' && (
            <div className="mt-7 border-t border-border pt-6 text-start">
              <p className="mb-3 text-center text-[13px] font-medium text-foreground">
                غيّرت رأيك؟ يمكنك العودة في أي وقت
              </p>
              <NewsletterSignup variant="footer-bare" />
            </div>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            العودة إلى الصفحة الرئيسية
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
