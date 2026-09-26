import type { Metadata } from "next"
import { headers } from "next/headers"
import { getPrepFormByToken, validatePrepToken } from "@/lib/guest-prep"
import { checkIpRateLimit } from "@/lib/rate-limit"
import { linkAccess } from "@/lib/guest-link/access"
import {
  findGuestLinkByToken,
  listOwnSuggestions,
  markSuggestionsNotified,
  recordGuestOpen,
} from "@/lib/guest-link/service"
import { buildGuestPageProps } from "@/lib/guest-link/page-props"
import { GUEST_RATE_LIMITS } from "@/lib/guest-link/route-helpers"
import { PrepFormClient } from "./prep-form-client"
import { GuestLinkClient } from "./guest-link-client"

/**
 * Neutral on purpose — this title is what WhatsApp shows in the link preview
 * and what sits in the guest's browser tab. It never names the episode.
 */
const GUEST_PAGE_TITLE = "بودكاست خط — تحضير حلقتك"

export const metadata: Metadata = {
  title: { absolute: GUEST_PAGE_TITLE },
  description: "صفحة خاصة بضيف بودكاست خط.",
  robots: { index: false, follow: false, nocache: true },
  openGraph: {
    title: GUEST_PAGE_TITLE,
    description: "صفحة خاصة بضيف بودكاست خط.",
  },
  twitter: { card: "summary", title: GUEST_PAGE_TITLE },
}

interface PreparePageProps {
  params: Promise<{ token: string }>
}

/**
 * /prepare/[token] serves TWO kinds of link:
 *   1. «نسخة الضيف» (guest_episode_links) — resolved FIRST.
 *   2. The legacy guest_prep_forms questionnaire — every link already sent
 *      keeps working exactly as before.
 * /prepare/live/[token] is a separate static segment and never reaches here.
 */
export default async function PreparePage({ params }: PreparePageProps) {
  const { token } = await params

  const rate = checkIpRateLimit(
    { headers: await headers() },
    "guest_link_page",
    GUEST_RATE_LIMITS.read.max,
    GUEST_RATE_LIMITS.read.windowMs,
  )
  if (!rate.allowed) {
    return (
      <StatusCard
        title="لحظة من فضلك"
        description="فتحت الصفحة مرات كثيرة خلال وقت قصير. جرّب مرة ثانية بعد دقيقة."
      />
    )
  }

  const link = await findGuestLinkByToken(token)
  if (link) {
    const access = linkAccess(link.row, link.recordingAt)
    if (access === "expired") return <ExpiredState name={link.row.guest_display_name} />
    if (access === "revoked") {
      return (
        <StatusCard
          title="الرابط غير متاح"
          description="هذا الرابط لم يعد مستخدماً. لأي استفسار تواصل مع فريق خط."
        />
      )
    }

    const own = link.row.questionnaire_submitted_at
      ? await listOwnSuggestions(link.row.id)
      : { items: [], toNotify: [] }
    const props = buildGuestPageProps({ token, row: link.row, suggestions: own.items })
    // Side effects after the props are fixed: the open is counted, and an
    // accepted suggestion's «تم الأخذ باقتراحك» is shown exactly once.
    await recordGuestOpen(link.row.id)
    if (props.view) await markSuggestionsNotified(own.toNotify)

    return <GuestLinkClient {...props} />
  }

  // ── Legacy guest_prep_forms link ─────────────────────────────────────
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

/** wa.me link to the team, prefilled. KHAT_TEAM_WHATSAPP = digits only. */
function teamWhatsappHref(text: string): string {
  const number = (process.env.KHAT_TEAM_WHATSAPP ?? "").replace(/[^\d]/g, "")
  const q = `text=${encodeURIComponent(text)}`
  return number ? `https://wa.me/${number}?${q}` : `https://wa.me/?${q}`
}

function ExpiredState({ name }: { name: string }) {
  const href = teamWhatsappHref(`السلام عليكم، معكم ${name}. حاب أتواصل معكم بخصوص حلقتي في بودكاست خط.`)
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-3 text-subhead font-semibold text-foreground">شكراً لك من القلب</h1>
        <p className="text-body leading-relaxed text-foreground/80">
          سعدنا بوجودك معنا في بودكاست خط. انتهت مدة هذه الصفحة، وإذا حاب تتواصل معنا فإحنا
          موجودين.
        </p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-6 text-caption font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          تواصل معنا عبر واتساب
        </a>
        <div className="mt-8 text-micro text-muted-foreground">بودكاست خط</div>
      </div>
    </div>
  )
}

function StatusCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <h1 className="mb-3 text-subhead font-semibold text-foreground">{title}</h1>
        <p className="text-caption text-muted-foreground">{description}</p>
        <div className="mt-8 text-micro text-muted-foreground">بودكاست خط</div>
      </div>
    </div>
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
        <h1 className="mb-3 text-subhead font-semibold text-foreground">{title}</h1>
        <p className="text-caption text-muted-foreground">{description}</p>
        <div className="mt-8 text-micro text-muted-foreground/60">بودكاست خط</div>
      </div>
    </div>
  )
}
