import Link from 'next/link'

interface PageProps {
  searchParams: Promise<{ status?: string; type?: string }>
}

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const { status, type } = await searchParams

  const typeLabels: Record<string, string> = {
    newsletter: 'النشرة البريدية',
    comments: 'إشعارات التعليقات',
    replies: 'إشعارات الردود',
    likes: 'إشعارات الإعجابات',
    follows: 'إشعارات المتابعات',
    all: 'جميع الإشعارات',
  }

  const typeLabel = type ? typeLabels[type] || type : ''

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-bold">خط بودكاست</h1>

        {status === 'success' && (
          <div className="rounded-lg border bg-card p-8 space-y-4">
            <div className="text-4xl">✓</div>
            <h2 className="text-xl font-semibold">تم إلغاء الاشتراك بنجاح</h2>
            <p className="text-muted-foreground">
              {typeLabel
                ? `تم إلغاء اشتراكك من ${typeLabel}.`
                : 'تم تحديث تفضيلاتك بنجاح.'}
            </p>
          </div>
        )}

        {status === 'already' && (
          <div className="rounded-lg border bg-card p-8 space-y-4">
            <div className="text-4xl">ℹ️</div>
            <h2 className="text-xl font-semibold">تم إلغاء الاشتراك مسبقاً</h2>
            <p className="text-muted-foreground">
              هذا الاشتراك ملغى بالفعل.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-lg border bg-card p-8 space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-semibold">حدث خطأ</h2>
            <p className="text-muted-foreground">
              لم نتمكن من معالجة طلبك. يرجى المحاولة مرة أخرى.
            </p>
          </div>
        )}

        {!status && (
          <div className="rounded-lg border bg-card p-8 space-y-4">
            <p className="text-muted-foreground">رابط غير صالح.</p>
          </div>
        )}

        <Link
          href="/"
          className="inline-block text-sm text-muted-foreground hover:text-foreground underline"
        >
          العودة إلى الصفحة الرئيسية
        </Link>
      </div>
    </div>
  )
}
