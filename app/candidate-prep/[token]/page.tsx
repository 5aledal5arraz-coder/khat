import type { Metadata } from "next"
import { recordPrepLinkOpen, validatePrepLinkByToken } from "@/lib/guest-candidates"
import { CandidatePrepClient } from "./candidate-prep-client"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "نموذج التحضير",
  robots: { index: false, follow: false },
}

interface PageProps {
  params: Promise<{ token: string }>
}

export default async function CandidatePrepPage({ params }: PageProps) {
  const { token } = await params

  const result = await validatePrepLinkByToken(token)
  if (!result.ok) {
    return <ErrorState reason={result.reason} />
  }

  // Record open (best-effort, non-blocking semantics)
  try {
    await recordPrepLinkOpen(result.data.link.id)
  } catch {
    // ignore — UX should not break on tracking failure
  }

  const { link, template, candidate, existingResponse } = result.data
  const isCompleted = link.status === "completed"

  // Serialize Date fields
  const serializedLink = {
    ...link,
    expires_at: link.expires_at ? new Date(link.expires_at as unknown as Date).toISOString() : null,
    first_opened_at: link.first_opened_at ? new Date(link.first_opened_at as unknown as Date).toISOString() : null,
    last_opened_at: link.last_opened_at ? new Date(link.last_opened_at as unknown as Date).toISOString() : null,
    submitted_at: link.submitted_at ? new Date(link.submitted_at as unknown as Date).toISOString() : null,
    created_at: new Date(link.created_at as unknown as Date).toISOString(),
    updated_at: new Date(link.updated_at as unknown as Date).toISOString(),
  }
  const serializedTemplate = {
    ...template,
    created_at: new Date(template.created_at as unknown as Date).toISOString(),
    updated_at: new Date(template.updated_at as unknown as Date).toISOString(),
  }
  const serializedResponse = existingResponse
    ? {
        ...existingResponse,
        submitted_at: existingResponse.submitted_at
          ? new Date(existingResponse.submitted_at as unknown as Date).toISOString()
          : null,
        created_at: new Date(existingResponse.created_at as unknown as Date).toISOString(),
        updated_at: new Date(existingResponse.updated_at as unknown as Date).toISOString(),
      }
    : null

  return (
    <CandidatePrepClient
      token={token}
      link={serializedLink}
      template={serializedTemplate}
      candidate={candidate}
      existingResponse={serializedResponse}
      readOnly={isCompleted}
    />
  )
}

function ErrorState({ reason }: { reason: "not_found" | "expired" | "cancelled" | "completed" }) {
  const messages = {
    not_found: {
      title: "الرابط غير صالح",
      description: "هذا الرابط غير موجود. إذا كنت تعتقد أن هذا خطأ، يرجى التواصل مع فريق خط.",
    },
    expired: {
      title: "انتهت صلاحية الرابط",
      description: "لقد انتهت فترة صلاحية هذا الرابط. يرجى التواصل مع فريق خط للحصول على رابط جديد.",
    },
    cancelled: {
      title: "تم إلغاء الرابط",
      description: "هذا الرابط لم يعد صالحاً. يرجى التواصل مع فريق خط إذا كنت بحاجة إلى رابط جديد.",
    },
    completed: {
      title: "تم استلام إجاباتك",
      description: "شكراً لتعبئتك النموذج — وصلتنا إجاباتك ونتواصل معك قريباً.",
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
