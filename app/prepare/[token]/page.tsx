import type { Metadata } from "next"
import { getPrepFormByToken, validatePrepToken } from "@/lib/guest-prep"
import { PrepFormClient } from "./prep-form-client"

export const metadata: Metadata = {
  title: "نموذج التحضير",
  robots: { index: false, follow: false },
}

interface PreparePageProps {
  params: Promise<{ token: string }>
}

export default async function PreparePage({ params }: PreparePageProps) {
  const { token } = await params

  const form = await getPrepFormByToken(token)
  const validation = validatePrepToken(form)

  if (!validation.valid) {
    return <ErrorState reason={validation.reason} />
  }

  const { form: validForm } = validation

  return (
    <PrepFormClient
      token={token}
      guestName={validForm.guest_name}
      status={validForm.status}
      existingResponse={validForm.response}
      editable={validForm.status === "pending" || validForm.status === "submitted"}
    />
  )
}

function ErrorState({ reason }: { reason: "not_found" | "expired" | "revoked" }) {
  const messages = {
    not_found: {
      title: "الرابط غير صالح",
      description: "هذا الرابط غير موجود أو لم يعد متاحاً. إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع فريق خط.",
    },
    expired: {
      title: "انتهت صلاحية الرابط",
      description: "لقد انتهت فترة صلاحية هذا الرابط. يرجى التواصل مع فريق خط للحصول على رابط جديد.",
    },
    revoked: {
      title: "تم إلغاء الرابط",
      description: "هذا الرابط لم يعد صالحاً. يرجى التواصل مع فريق خط إذا كنت بحاجة إلى رابط جديد.",
    },
  }

  const { title, description } = messages[reason]

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted/30">
          <svg className="h-8 w-8 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </div>
        <h1 className="mb-3 text-xl font-semibold text-foreground">{title}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-8 text-xs text-muted-foreground/60">خط بودكاست</div>
      </div>
    </div>
  )
}
