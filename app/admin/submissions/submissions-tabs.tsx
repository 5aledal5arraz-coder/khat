"use client"

import { useState, useRef, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  UserPlus,
  Handshake,
  Mail,
  ExternalLink,
  Trash2,
  Copy,
  Check,
  Download,
  Search,
  X,
  MoreVertical,
  Inbox,
  Building2,
  Calendar,
  FileText,
  Phone,
  MapPin,
  Mic,
  Printer,
  Send,
  CircleCheck,
  CircleX,
  Eye,
  ChevronDown,
  Lightbulb,
  BookOpen,
  Link,
  Brain,
  Sparkles,
  AlertTriangle,
  Shield,
  Loader2,
  RefreshCw,
  ClipboardCopy,
  Lock,
  Unlock,
  LinkIcon,
  ClipboardCheck,
} from "lucide-react"
import type {
  GuestApplication,
  GuestApplicationStatus,
  SponsorshipLead,
  SponsorshipStatus,
  SponsorshipAnalysis,
  SponsorshipProposal,
  GuestApplicationAnalysis,
  GuestApplicationConcept,
  GuestApplicationResponse,
  NewsletterSubscriber,
  ThinkerSuggestion,
  ThinkerSuggestionStatus,
  GuestPrepForm,
  GuestPrepFormStatus,
  GuestPrepResponse,
} from "@/types/database"
import { formatDate } from "@/lib/shared/formatters"

/* ─── Status Helpers ─── */

const STATUS_CONFIG: Record<
  GuestApplicationStatus,
  { label: string; color: string; bg: string; ring: string }
> = {
  new: {
    label: "جديد",
    color: "text-blue-700",
    bg: "bg-blue-500/10",
    ring: "ring-blue-500/20",
  },
  under_review: {
    label: "قيد المراجعة",
    color: "text-amber-700",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/20",
  },
  accepted: {
    label: "مقبول",
    color: "text-emerald-700",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/20",
  },
  rejected: {
    label: "معتذر",
    color: "text-red-700",
    bg: "bg-red-500/10",
    ring: "ring-red-500/20",
  },
  consider_later: {
    label: "للاحتفاظ",
    color: "text-purple-700",
    bg: "bg-purple-500/10",
    ring: "ring-purple-500/20",
  },
}

const SPONSOR_STATUS_CONFIG: Record<
  SponsorshipStatus,
  { label: string; color: string; bg: string; ring: string }
> = {
  new: {
    label: "جديد",
    color: "text-blue-700",
    bg: "bg-blue-500/10",
    ring: "ring-blue-500/20",
  },
  reviewing: {
    label: "قيد المراجعة",
    color: "text-amber-700",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/20",
  },
  proposal_sent: {
    label: "تم إرسال العرض",
    color: "text-cyan-700",
    bg: "bg-cyan-500/10",
    ring: "ring-cyan-500/20",
  },
  negotiation: {
    label: "تفاوض",
    color: "text-orange-700",
    bg: "bg-orange-500/10",
    ring: "ring-orange-500/20",
  },
  confirmed: {
    label: "مؤكد",
    color: "text-emerald-700",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/20",
  },
  declined: {
    label: "معتذر",
    color: "text-red-700",
    bg: "bg-red-500/10",
    ring: "ring-red-500/20",
  },
}

const THINKER_STATUS_CONFIG: Record<
  ThinkerSuggestionStatus,
  { label: string; color: string; bg: string; ring: string }
> = {
  new: {
    label: "جديد",
    color: "text-blue-700",
    bg: "bg-blue-500/10",
    ring: "ring-blue-500/20",
  },
  reviewing: {
    label: "قيد المراجعة",
    color: "text-amber-700",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/20",
  },
  approved: {
    label: "مقبول",
    color: "text-emerald-700",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/20",
  },
  rejected: {
    label: "مرفوض",
    color: "text-red-700",
    bg: "bg-red-500/10",
    ring: "ring-red-500/20",
  },
}

const COLLABORATION_LABELS: Record<string, string> = {
  episode_partnership: "شراكة حلقة",
  multiple_episodes: "عدة حلقات",
  season_partnership: "شراكة موسم",
  collaborative_episode: "حلقة تعاونية",
  website_presence: "ظهور على الموقع",
  social_media_content: "سوشيال ميديا",
  live_event: "فعالية حية",
  other: "أخرى",
}

const GOAL_LABELS: Record<string, string> = {
  brand_awareness: "زيادة الوعي بالعلامة",
  product_launch: "إطلاق منتج أو خدمة",
  brand_image: "تعزيز صورة العلامة",
  recruitment: "استقطاب المواهب",
  community_engagement: "التفاعل مع المجتمع",
  other: "أخرى",
}

const BUDGET_LABELS: Record<string, string> = {
  below_500: "أقل من 500 د.ك",
  "500_1000": "500 - 1,000 د.ك",
  "1000_3000": "1,000 - 3,000 د.ك",
  "3000_plus": "أكثر من 3,000 د.ك",
}

import { GlowCard } from "../components/glow-card"
import { LinkCanonicalDialog } from "../guest-candidates/components/link-canonical-dialog"

/* ─── Action Menu ─── */

function ActionMenu({
  children,
}: {
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="خيارات"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all duration-200 hover:bg-muted/40 hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-border/30 bg-card/95 py-1 shadow-xl shadow-black/20 backdrop-blur-xl"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  variant,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  variant?: "default" | "danger"
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-2 text-[13px] transition-all duration-200 ${
        variant === "danger"
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-muted/40"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-60" />
      {label}
    </button>
  )
}

/* ─── Detail Dialog ─── */

function DetailDialog({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
}) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border/30 bg-card/95 shadow-2xl shadow-black/30 backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

/* ─── Status Dropdown ─── */

function StatusDropdown({
  current,
  onChange,
}: {
  current: GuestApplicationStatus
  onChange: (status: GuestApplicationStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const config = STATUS_CONFIG[current]

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all duration-200 ${config.bg} ${config.color}`}
      >
        {config.label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border/30 bg-card/95 py-1 shadow-xl shadow-black/20 backdrop-blur-xl">
          {(Object.keys(STATUS_CONFIG) as GuestApplicationStatus[]).map(
            (status) => {
              const s = STATUS_CONFIG[status]
              return (
                <button
                  key={status}
                  onClick={() => {
                    onChange(status)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2.5 px-4 py-2 text-[13px] transition-all duration-200 hover:bg-muted/40 ${
                    current === status ? "bg-white/[0.03]" : ""
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${s.bg} ${s.color}`}
                  >
                    {current === status ? (
                      <Check className="h-3 w-3" />
                    ) : null}
                  </span>
                  <span className={s.color}>{s.label}</span>
                </button>
              )
            }
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Sponsor Status Dropdown ─── */

function SponsorStatusDropdown({
  current,
  onChange,
}: {
  current: SponsorshipStatus
  onChange: (status: SponsorshipStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const config = SPONSOR_STATUS_CONFIG[current]

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all duration-200 ${config.bg} ${config.color}`}
      >
        {config.label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-border/30 bg-card/95 py-1 shadow-xl shadow-black/20 backdrop-blur-xl">
          {(Object.keys(SPONSOR_STATUS_CONFIG) as SponsorshipStatus[]).map(
            (status) => {
              const s = SPONSOR_STATUS_CONFIG[status]
              return (
                <button
                  key={status}
                  onClick={() => {
                    onChange(status)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2.5 px-4 py-2 text-[13px] transition-all duration-200 hover:bg-muted/40 ${
                    current === status ? "bg-white/[0.03]" : ""
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${s.bg} ${s.color}`}
                  >
                    {current === status ? (
                      <Check className="h-3 w-3" />
                    ) : null}
                  </span>
                  <span className={s.color}>{s.label}</span>
                </button>
              )
            }
          )}
        </div>
      )}
    </div>
  )
}

/* ─── Helpers ─── */

function timeAgo(dateString: string) {
  const now = new Date()
  const date = new Date(dateString)
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "اليوم"
  if (diffDays === 1) return "أمس"
  if (diffDays < 7) return `منذ ${diffDays} أيام`
  if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسابيع`
  return formatDate(dateString)
}

/* ─── Message Templates ─── */

function generateAcceptanceMessage(
  name: string,
  tone: "formal" | "warm"
): string {
  if (tone === "formal") {
    return `مرحبًا ${name}،

شكرًا لاهتمامك بالظهور في بودكاست خط.

بعد مراجعة طلبك، نودّ أن نخبرك أن قصتك والأفكار التي شاركتها لفتت انتباهنا بشكل حقيقي.
نؤمن أنك تستطيع إضافة حوار ذي معنى للمساحة التي نبنيها.

يسعدنا استضافتك كضيف في خط.

البودكاست مبني على حوار هادئ وعميق وليس مقابلة تقليدية، فلا حاجة لتحضير مسبق أو إجابات محفوظة — فقط كن على طبيعتك.

في الخطوة القادمة، سنتواصل معك لاختيار موعد تسجيل مناسب ومشاركة جميع التفاصيل المتعلقة بالحلقة والمكان وعملية التسجيل.

نتطلّع للقائك وسماع قصتك.

فريق بودكاست خط`
  }

  return `أهلًا ${name} 👋

وصلنا طلبك — وبصراحة، قصتك لفتت انتباهنا جدًا.

نحب نستضيفك في خط 🎙️

ما تحتاج تجهّز شيء مسبقًا. خط قائم على حوار طبيعي وحقيقي — بس تعال على طبيعتك.

بنتواصل معك قريب نرتّب موعد التسجيل ونشاركك كل التفاصيل.

متحمسين نشوفك ونسمع قصتك.

فريق خط`
}

function generateRejectionMessage(
  name: string,
  tone: "formal" | "warm"
): string {
  if (tone === "formal") {
    return `مرحبًا ${name}،

شكرًا جزيلاً لاهتمامك بالظهور في بودكاست خط ولتخصيصك الوقت لمشاركة قصتك معنا.

نراجع بعناية كل طلب يصلنا. في الوقت الحالي، لن نتمكن من المضي قدمًا في استضافتك في حلقة قادمة. هذا لا يعكس قيمة تجربتك، بل يتعلق بالاتجاه والمواضيع التي نخطط لها حاليًا في حواراتنا القادمة.

نقدّر حقًا جهدك وانفتاحك في الكتابة إلينا، ونشكرك على تفكيرك في أن تكون جزءًا من خط.

نتمنى لك كل التوفيق ونأمل أن تتقاطع دروبنا في المستقبل.

فريق بودكاست خط`
  }

  return `أهلًا ${name}،

شكرًا من قلب إنك تواصلت مع خط — نقدّر جدًا إنك شاركتنا قصتك.

بعد مراجعة دقيقة، ما بنقدر نمضي قدام بالاستضافة حاليًا. الموضوع ما له علاقة فيك أو بتجربتك — بل بالمواضيع المحددة اللي نشتغل عليها الحين.

نقدّر اهتمامك بشكل حقيقي، ومن يدري — يمكن دروبنا تتقاطع في المستقبل.

نتمنى لك كل التوفيق.

فريق خط`
}

function generateSponsorResponseMessage(
  name: string,
  tone: "formal" | "warm"
): string {
  if (tone === "formal") {
    return `مرحبًا ${name}،

شكرًا لاهتمامكم بالشراكة مع بودكاست خط.

راجعنا طلبكم بعناية، ويسعدنا إبلاغكم أننا مهتمون بالتعاون معكم.

سنعمل على إعداد مقترح شراكة يناسب أهدافكم وسنشاركه معكم قريبًا.

في حال وجود أي استفسارات، لا تترددوا بالتواصل معنا.

فريق بودكاست خط`
  }

  return `أهلًا ${name} 👋

شكرًا على اهتمامكم بخط — وصلنا طلبكم وراجعناه.

الصراحة، نشوف إن في فرصة حلوة نتعاون مع بعض 🤝

بنجهّز لكم مقترح شراكة يناسب أهدافكم ونرسله قريب.

لو عندكم أي سؤال، كلّمونا مباشرة.

فريق خط`
}

function generateSponsorDeclineMessage(
  name: string,
  tone: "formal" | "warm"
): string {
  if (tone === "formal") {
    return `مرحبًا ${name}،

شكرًا جزيلاً لاهتمامكم بالشراكة مع بودكاست خط ولتخصيصكم الوقت لإرسال طلبكم.

بعد مراجعة دقيقة، لن نتمكن حاليًا من المضي في هذه الشراكة. يتعلق الأمر باتجاهنا الحالي وخطط المحتوى القادمة.

نقدّر اهتمامكم ونتمنى أن تتاح لنا فرصة للتعاون في المستقبل.

فريق بودكاست خط`
  }

  return `أهلًا ${name}،

شكرًا إنكم تواصلتم مع خط — نقدّر اهتمامكم بشكل حقيقي.

حاليًا، ما بنقدر نمضي بالشراكة — الموضوع مرتبط بخططنا الحالية وليس بجودة عرضكم.

نتمنى إن دروبنا تتقاطع في المستقبل، وما نقفل الباب أبد.

فريق خط`
}

/* ─── Tab Button ─── */

function TabButton({
  active,
  icon: Icon,
  label,
  shortLabel,
  count,
  onClick,
  color = "primary",
}: {
  active: boolean
  icon: React.ElementType
  label: string
  shortLabel: string
  count: number
  onClick: () => void
  color?: string
}) {
  const colorMap: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    purple: "text-accent bg-accent/10",
    green: "text-emerald-700 bg-emerald-500/10",
    amber: "text-amber-700 bg-amber-500/10",
  }

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg px-4 py-2 text-[13px] font-medium transition-all duration-200 ${
        active
          ? "bg-muted/50 text-foreground"
          : "text-muted-foreground hover:bg-muted/30 hover:text-foreground"
      }`}
    >
      <div
        className={`flex h-7 w-7 items-center justify-center rounded-lg ${
          active ? colorMap[color] : "bg-muted/30"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel}</span>
      {count > 0 && (
        <span
          className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums ${
            active
              ? "bg-primary/10 text-primary"
              : "bg-muted/40 text-muted-foreground"
          }`}
        >
          {count}
        </span>
      )}
    </button>
  )
}

/* ─── Narrative Block (for long-form answers) ─── */

function NarrativeBlock({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap rounded-lg bg-muted/20 px-4 py-3 text-[13px] leading-[1.8] border border-border/20">
        {value}
      </p>
    </div>
  )
}

/* ─── Main Component ─── */

interface SubmissionsTabsProps {
  guestApplications: GuestApplication[]
  sponsorshipLeads: SponsorshipLead[]
  newsletterSubscribers: NewsletterSubscriber[]
  thinkerSuggestions: ThinkerSuggestion[]
}

export function SubmissionsTabs({
  guestApplications: initialGuestApps,
  sponsorshipLeads: initialSponsors,
  newsletterSubscribers: initialSubscribers,
  thinkerSuggestions: initialThinkers,
}: SubmissionsTabsProps) {
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get("tab") || "guests"

  const [activeTab, setActiveTab] = useState(defaultTab)
  const [search, setSearch] = useState("")

  const [guestApplications, setGuestApplications] = useState(initialGuestApps)
  const [sponsorshipLeads, setSponsorshipLeads] = useState(initialSponsors)
  const [newsletterSubscribers, setNewsletterSubscribers] =
    useState(initialSubscribers)
  const [thinkerSuggestions, setThinkerSuggestions] = useState(initialThinkers)

  const [selectedApplication, setSelectedApplication] =
    useState<GuestApplication | null>(null)
  const [selectedLead, setSelectedLead] = useState<SponsorshipLead | null>(null)
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const printRef = useRef<HTMLDivElement>(null)

  // Guest response message state
  const [messageType, setMessageType] = useState<"acceptance" | "rejection" | "consider_later">(
    "acceptance"
  )
  const [messageTone, setMessageTone] = useState<"formal" | "warm">("formal")
  const [messageText, setMessageText] = useState("")
  const [messageCopied, setMessageCopied] = useState<
    "whatsapp" | "email" | null
  >(null)

  // Sponsor response message state
  const [sponsorMessageType, setSponsorMessageType] = useState<"response" | "decline" | "proposal">("response")
  const [sponsorMessageTone, setSponsorMessageTone] = useState<"formal" | "warm">("formal")
  const [sponsorMessageText, setSponsorMessageText] = useState("")

  // AI Analysis & Proposal state (Sponsors)
  const [aiAnalysis, setAiAnalysis] = useState<SponsorshipAnalysis | null>(null)
  const [aiProposal, setAiProposal] = useState<SponsorshipProposal | null>(null)
  const [analyzingLead, setAnalyzingLead] = useState(false)
  const [generatingProposal, setGeneratingProposal] = useState(false)
  const [proposalTone, setProposalTone] = useState<"formal" | "warm">("formal")
  const [aiScores, setAiScores] = useState<Record<string, { score: number; quality: string }>>({})

  // AI state (Guest Applications)
  const [guestAiAnalysis, setGuestAiAnalysis] = useState<GuestApplicationAnalysis | null>(null)
  const [guestAiConcept, setGuestAiConcept] = useState<GuestApplicationConcept | null>(null)
  const [guestAiResponses, setGuestAiResponses] = useState<GuestApplicationResponse | null>(null)
  const [analyzingGuest, setAnalyzingGuest] = useState(false)
  const [generatingConcept, setGeneratingConcept] = useState(false)
  const [generatingResponses, setGeneratingResponses] = useState(false)
  const [guestAiScores, setGuestAiScores] = useState<Record<string, number>>({})

  // Canonical-link dialog state (P2.4.d) — opens the shared dialog
  // that targets /api/admin/submissions/guests/:id/link-canonical.
  // Only shown inside the `status === 'accepted'` block (see §D below).
  const [linkCanonicalOpen, setLinkCanonicalOpen] = useState(false)

  // Guest Prep Form state
  const [prepForm, setPrepForm] = useState<GuestPrepForm | null>(null)
  const [prepFormLoading, setPrepFormLoading] = useState(false)
  const [prepFormCreating, setPrepFormCreating] = useState(false)
  const [prepFormAction, setPrepFormAction] = useState<string | null>(null)
  const [prepToken, setPrepToken] = useState<string | null>(null)
  const [prepLinkCopied, setPrepLinkCopied] = useState(false)

  // Email sending state (shared)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState<"guest" | "sponsor" | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  // Regenerate guest message when application, type, or tone changes
  useEffect(() => {
    if (selectedApplication) {
      const name = selectedApplication.name
      // If AI responses are loaded and user picks acceptance/rejection, use AI draft
      if (messageType === "acceptance" && guestAiResponses?.status === "ready") {
        setMessageText(messageTone === "formal" ? (guestAiResponses.acceptance_formal || generateAcceptanceMessage(name, "formal")) : (guestAiResponses.acceptance_warm || generateAcceptanceMessage(name, "warm")))
      } else if (messageType === "rejection" && guestAiResponses?.status === "ready") {
        setMessageText(messageTone === "formal" ? (guestAiResponses.rejection_formal || generateRejectionMessage(name, "formal")) : (guestAiResponses.rejection_warm || generateRejectionMessage(name, "warm")))
      } else if (messageType === "consider_later" && guestAiResponses?.status === "ready") {
        setMessageText(messageTone === "formal" ? (guestAiResponses.consider_later_formal || "") : (guestAiResponses.consider_later_warm || ""))
      } else if (messageType === "acceptance") {
        setMessageText(generateAcceptanceMessage(name, messageTone))
      } else if (messageType === "rejection") {
        setMessageText(generateRejectionMessage(name, messageTone))
      }
      setMessageCopied(null)
      setEmailSent(null)
      setEmailError(null)
    }
  }, [selectedApplication, messageType, messageTone, guestAiResponses])

  // Regenerate sponsor message when lead, type, or tone changes
  useEffect(() => {
    if (selectedLead) {
      const name = selectedLead.contact_name
      if (sponsorMessageType === "response") {
        setSponsorMessageText(generateSponsorResponseMessage(name, sponsorMessageTone))
      } else if (sponsorMessageType === "decline") {
        setSponsorMessageText(generateSponsorDeclineMessage(name, sponsorMessageTone))
      } else if (sponsorMessageType === "proposal" && aiProposal?.full_draft) {
        setSponsorMessageText(aiProposal.edited_draft || aiProposal.full_draft)
      }
      setEmailSent(null)
      setEmailError(null)
    }
  }, [selectedLead, sponsorMessageType, sponsorMessageTone, aiProposal])

  // Fetch AI analysis + proposal when a lead is selected
  useEffect(() => {
    if (!selectedLead) {
      setAiAnalysis(null)
      setAiProposal(null)
      return
    }
    fetch(`/api/admin/submissions/sponsors/${selectedLead.id}/analyze`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.exists) setAiAnalysis(d.analysis) })
      .catch(() => {})
    fetch(`/api/admin/submissions/sponsors/${selectedLead.id}/proposal`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.exists) setAiProposal(d.proposal) })
      .catch(() => {})
  }, [selectedLead])

  // Fetch guest AI data when application is selected
  useEffect(() => {
    if (!selectedApplication) {
      setGuestAiAnalysis(null)
      setGuestAiConcept(null)
      setGuestAiResponses(null)
      return
    }
    fetch(`/api/admin/submissions/guests/${selectedApplication.id}/analyze`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.exists) setGuestAiAnalysis(d.analysis) })
      .catch(() => {})
    fetch(`/api/admin/submissions/guests/${selectedApplication.id}/concept`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.exists) setGuestAiConcept(d.concept) })
      .catch(() => {})
    fetch(`/api/admin/submissions/guests/${selectedApplication.id}/responses`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.exists) setGuestAiResponses(d.responses) })
      .catch(() => {})
  }, [selectedApplication])

  // Fetch prep form when application is selected
  useEffect(() => {
    if (!selectedApplication) {
      setPrepForm(null)
      setPrepToken(null)
      return
    }
    setPrepFormLoading(true)
    fetch(`/api/admin/submissions/guests/${selectedApplication.id}/prep-form`)
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.form) setPrepForm(d.form) })
      .catch(() => {})
      .finally(() => setPrepFormLoading(false))
  }, [selectedApplication])

  // Prep form handlers
  async function handleCreatePrepForm() {
    if (!selectedApplication || prepFormCreating) return
    setPrepFormCreating(true)
    try {
      const res = await fetch(`/api/admin/submissions/guests/${selectedApplication.id}/prep-form`, { method: "POST" })
      const data = await res.json()
      if (data.form) {
        setPrepForm(data.form)
        if (data.token) setPrepToken(data.token)
      }
    } catch {}
    setPrepFormCreating(false)
  }

  async function handlePrepFormAction(action: string) {
    if (!selectedApplication || prepFormAction) return
    setPrepFormAction(action)
    try {
      const res = await fetch(`/api/admin/submissions/guests/${selectedApplication.id}/prep-form`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (data.form) {
        setPrepForm(data.form)
        if (data.token) setPrepToken(data.token)
      }
    } catch {}
    setPrepFormAction(null)
  }

  function copyPrepLink() {
    const t = prepToken
    if (!t) return
    const url = `${window.location.origin}/prepare/${t}`
    navigator.clipboard.writeText(url)
    setPrepLinkCopied(true)
    setTimeout(() => setPrepLinkCopied(false), 2500)
  }

  // Run AI analysis
  async function handleAnalyzeLead() {
    if (!selectedLead || analyzingLead) return
    setAnalyzingLead(true)
    try {
      const res = await fetch(`/api/admin/submissions/sponsors/${selectedLead.id}/analyze`, { method: "POST" })
      const data = await res.json()
      if (data.analysis) {
        setAiAnalysis(data.analysis)
        setAiScores((prev) => ({ ...prev, [selectedLead.id]: { score: data.analysis.fit_score, quality: data.analysis.quality } }))
        if (data.statusUpdated) {
          setSponsorshipLeads((prev) => prev.map((l) => l.id === selectedLead.id ? { ...l, status: "reviewing" as SponsorshipStatus } : l))
          setSelectedLead((prev) => prev ? { ...prev, status: "reviewing" as SponsorshipStatus } : prev)
        }
      }
    } catch {}
    setAnalyzingLead(false)
  }

  // Generate AI proposal
  async function handleGenerateProposal() {
    if (!selectedLead || generatingProposal) return
    setGeneratingProposal(true)
    try {
      const res = await fetch(`/api/admin/submissions/sponsors/${selectedLead.id}/proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tone: proposalTone }),
      })
      const data = await res.json()
      if (data.proposal) setAiProposal(data.proposal)
    } catch {}
    setGeneratingProposal(false)
  }

  // --- Guest AI Handlers ---

  async function handleAnalyzeGuest() {
    if (!selectedApplication || analyzingGuest) return
    setAnalyzingGuest(true)
    try {
      const res = await fetch(`/api/admin/submissions/guests/${selectedApplication.id}/analyze`, { method: "POST" })
      const data = await res.json()
      if (data.analysis) {
        setGuestAiAnalysis(data.analysis)
        if (data.analysis.fit_score != null) {
          setGuestAiScores((prev) => ({ ...prev, [selectedApplication.id]: data.analysis.fit_score }))
        }
        if (data.statusUpdated) {
          setGuestApplications((prev) => prev.map((a) => a.id === selectedApplication.id ? { ...a, status: "under_review" as GuestApplicationStatus } : a))
          setSelectedApplication((prev) => prev ? { ...prev, status: "under_review" as GuestApplicationStatus } : prev)
        }
      }
    } catch {}
    setAnalyzingGuest(false)
  }

  async function handleGenerateConcept() {
    if (!selectedApplication || generatingConcept) return
    setGeneratingConcept(true)
    try {
      const res = await fetch(`/api/admin/submissions/guests/${selectedApplication.id}/concept`, { method: "POST" })
      const data = await res.json()
      if (data.concept) setGuestAiConcept(data.concept)
    } catch {}
    setGeneratingConcept(false)
  }

  async function handleGenerateResponses() {
    if (!selectedApplication || generatingResponses) return
    setGeneratingResponses(true)
    try {
      const res = await fetch(`/api/admin/submissions/guests/${selectedApplication.id}/responses`, { method: "POST" })
      const data = await res.json()
      if (data.responses) setGuestAiResponses(data.responses)
    } catch {}
    setGeneratingResponses(false)
  }

  const copyForWhatsApp = async () => {
    await navigator.clipboard.writeText(messageText)
    setMessageCopied("whatsapp")
    setTimeout(() => setMessageCopied(null), 2500)

    if (selectedApplication?.phone) {
      const phone = selectedApplication.phone.replace(/[\s\-()+ ]/g, "")
      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(messageText)}`,
        "_blank"
      )
    }
  }

  const copyEmail = async (email: string) => {
    await navigator.clipboard.writeText(email)
    setCopiedEmail(email)
    setTimeout(() => setCopiedEmail(null), 2000)
  }

  const sendGuestEmail = async () => {
    if (!selectedApplication || sendingEmail) return
    setSendingEmail(true)
    setEmailSent(null)
    setEmailError(null)
    try {
      const subject = messageType === "acceptance"
        ? "بودكاست خط — دعوة ضيف"
        : "بودكاست خط — تحديث بخصوص طلبك"
      const response = await fetch(`/api/admin/submissions/guests/${selectedApplication.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body: messageText }),
      })
      if (response.ok) {
        setEmailSent("guest")
      } else {
        const data = await response.json().catch(() => ({}))
        setEmailError(data.error || "فشل إرسال البريد")
      }
    } catch {
      setEmailError("فشل الاتصال بالخادم")
    } finally {
      setSendingEmail(false)
    }
  }

  const sendSponsorEmail = async () => {
    if (!selectedLead || sendingEmail) return
    setSendingEmail(true)
    setEmailSent(null)
    setEmailError(null)
    try {
      const subject = sponsorMessageType === "proposal" && aiProposal?.subject
        ? aiProposal.subject
        : sponsorMessageType === "response"
          ? "بودكاست خط — طلب الشراكة"
          : "بودكاست خط — تحديث بخصوص طلبكم"
      const response = await fetch(`/api/admin/submissions/sponsors/${selectedLead.id}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body: sponsorMessageText }),
      })
      if (response.ok) {
        setEmailSent("sponsor")
        // Auto-update status to "proposal_sent" when sending a proposal email
        if (sponsorMessageType === "proposal" && selectedLead.status !== "proposal_sent" && selectedLead.status !== "confirmed") {
          handleSponsorStatusChange(selectedLead.id, "proposal_sent")
        }
      } else {
        const data = await response.json().catch(() => ({}))
        setEmailError(data.error || "فشل إرسال البريد")
      }
    } catch {
      setEmailError("فشل الاتصال بالخادم")
    } finally {
      setSendingEmail(false)
    }
  }

  const handleStatusChange = async (
    id: string,
    status: GuestApplicationStatus
  ) => {
    try {
      const response = await fetch(`/api/admin/submissions/guests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (response.ok) {
        setGuestApplications((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status } : a))
        )
        if (selectedApplication?.id === id) {
          setSelectedApplication((prev) =>
            prev ? { ...prev, status } : null
          )
        }
      }
    } catch (error) {
      console.error("Error updating status:", error)
    }
  }

  const handleDeleteGuestApp = async (id: string) => {
    if (!confirm("متأكد إنك تبي تحذف هذا الطلب؟ ما تقدر ترجعه.")) return
    setDeletingIds((prev) => new Set(prev).add(id))
    try {
      const response = await fetch(`/api/admin/submissions/guests/${id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        setGuestApplications((prev) => prev.filter((a) => a.id !== id))
        if (selectedApplication?.id === id) setSelectedApplication(null)
      }
    } catch (error) {
      console.error("Error deleting application:", error)
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleSponsorStatusChange = async (
    id: string,
    status: SponsorshipStatus
  ) => {
    try {
      const response = await fetch(`/api/admin/submissions/sponsors/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (response.ok) {
        setSponsorshipLeads((prev) =>
          prev.map((l) => (l.id === id ? { ...l, status } : l))
        )
        if (selectedLead?.id === id) {
          setSelectedLead((prev) =>
            prev ? { ...prev, status } : null
          )
        }
      }
    } catch (error) {
      console.error("Error updating sponsor status:", error)
    }
  }

  const handleDeleteSponsorLead = async (id: string) => {
    if (!confirm("متأكد إنك تبي تحذف هذا الطلب؟ ما تقدر ترجعه.")) return
    setDeletingIds((prev) => new Set(prev).add(id))
    try {
      const response = await fetch(`/api/admin/submissions/sponsors/${id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        setSponsorshipLeads((prev) => prev.filter((l) => l.id !== id))
        if (selectedLead?.id === id) setSelectedLead(null)
      }
    } catch (error) {
      console.error("Error deleting lead:", error)
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleDeleteSubscriber = async (id: string) => {
    if (!confirm("متأكد إنك تبي تحذف هذا المشترك؟")) return
    setDeletingIds((prev) => new Set(prev).add(id))
    try {
      const response = await fetch(`/api/admin/submissions/newsletter/${id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        setNewsletterSubscribers((prev) => prev.filter((s) => s.id !== id))
      }
    } catch (error) {
      console.error("Error deleting subscriber:", error)
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const handleThinkerStatusChange = async (
    id: string,
    status: ThinkerSuggestionStatus
  ) => {
    try {
      const response = await fetch(`/api/admin/submissions/thinkers/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (response.ok) {
        setThinkerSuggestions((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status } : t))
        )
      }
    } catch (error) {
      console.error("Error updating thinker status:", error)
    }
  }

  const handleDeleteThinker = async (id: string) => {
    if (!confirm("متأكد إنك تبي تحذف هذا الاقتراح؟")) return
    setDeletingIds((prev) => new Set(prev).add(id))
    try {
      const response = await fetch(`/api/admin/submissions/thinkers/${id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        setThinkerSuggestions((prev) => prev.filter((t) => t.id !== id))
      }
    } catch (error) {
      console.error("Error deleting thinker suggestion:", error)
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  const exportSubscribers = () => {
    const csv = [
      "Email,Date",
      ...newsletterSubscribers.map(
        (s) => `${s.email},${new Date(s.created_at).toISOString()}`
      ),
    ].join("\n")

    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `newsletter-subscribers-${new Date().toISOString().split("T")[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPDF = (app: GuestApplication) => {
    const travelLabel =
      app.can_travel_to_kuwait === "yes"
        ? "نعم"
        : app.can_travel_to_kuwait === "maybe"
          ? "ربما"
          : app.can_travel_to_kuwait === "no"
            ? "لا"
            : "—"

    const filmingLabel =
      app.filming_concern === "no"
        ? "لا"
        : app.filming_concern === "a_little"
          ? "قليلاً"
          : "نعم"

    const esc = (s: string | null | undefined) =>
      (s || "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

    const field = (label: string, value: string | null | undefined) =>
      `<div class="field"><div class="field-label">${label}</div><div class="field-value">${esc(value)}</div></div>`

    const longField = (label: string, value: string | null | undefined) =>
      `<div class="field"><div class="field-label">${label}</div><div class="field-value"><div class="long-text">${esc(value)}</div></div></div>`

    const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <title>طلب ضيف - ${esc(app.name)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'IBM Plex Sans Arabic', sans-serif; background: #fff; color: #1a1a1a; padding: 48px; line-height: 1.7; direction: rtl; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid #d4a853; }
    .brand { font-size: 28px; font-weight: 700; color: #d4a853; }
    .brand-sub { font-size: 12px; color: #888; margin-top: 4px; }
    .date-badge { background: #f8f4ec; color: #8b7355; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; }
    .applicant-name { font-size: 24px; font-weight: 700; margin-bottom: 8px; }
    .applicant-meta { font-size: 14px; color: #666; margin-bottom: 32px; }
    .section { margin-bottom: 32px; page-break-inside: avoid; }
    .section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 10px; border-bottom: 1px solid #eee; }
    .section-number { width: 28px; height: 28px; background: #d4a853; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex-shrink: 0; }
    .section-title { font-size: 16px; font-weight: 600; }
    .field { display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid #f5f5f5; }
    .field:last-child { border-bottom: none; }
    .field-label { min-width: 160px; font-size: 13px; font-weight: 500; color: #888; padding-top: 2px; }
    .field-value { font-size: 14px; flex: 1; white-space: pre-wrap; }
    .long-text { background: #fafaf8; padding: 14px 18px; border-radius: 10px; border: 1px solid #f0ede5; margin-top: 4px; }
    .footer { margin-top: 48px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-size: 11px; color: #bbb; }
    @media print { body { padding: 24px; } .section { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="header">
    <div><div class="brand">بودكاست خط</div><div class="brand-sub">طلب ظهور كضيف</div></div>
    <div class="date-badge">${formatDate(app.created_at)}</div>
  </div>
  <div class="applicant-name">${esc(app.name)}</div>
  <div class="applicant-meta">${esc(app.email)} · ${esc(app.phone)}${app.country ? ` · ${esc(app.country)}` : ""}</div>

  <div class="section">
    <div class="section-header"><div class="section-number">١</div><div class="section-title">المعلومات الأساسية</div></div>
    ${field("الاسم", app.name)}
    ${field("البريد الإلكتروني", app.email)}
    ${field("رقم الهاتف", app.phone)}
    ${field("الدولة", app.country)}
    ${app.can_travel_to_kuwait ? field("السفر إلى الكويت", travelLabel) : ""}
  </div>

  <div class="section">
    <div class="section-header"><div class="section-number">٢</div><div class="section-title">القصة والشخصية</div></div>
    ${longField("القصة أو الفكرة", app.story_idea)}
    ${longField("بعيدًا عن المسمى الوظيفي", app.beyond_job_title)}
    ${longField("لحظة غيّرتك", app.life_changing_moment)}
    ${longField("ما تتمنى أن يفهمه الناس", app.hope_people_understand)}
    ${longField("سؤال لم يُسأل من قبل", app.unasked_question)}
    ${longField("لماذا خط؟", app.why_khat)}
  </div>

  <div class="section">
    <div class="section-header"><div class="section-number">٣</div><div class="section-title">التسجيل والنشر</div></div>
    ${field("ظهور سابق في بودكاست", app.previous_podcast ? "نعم" : "لا")}
    ${app.previous_podcast_info ? field("تفاصيل البودكاست السابق", app.previous_podcast_info) : ""}
    ${longField("حوار أم سرد قصة؟", app.prefer_dialogue_or_story)}
    ${app.topics_to_avoid ? longField("مواضيع يفضل تجنبها", app.topics_to_avoid) : ""}
    ${field("قلق بخصوص التصوير", filmingLabel)}
    ${field("موافقة على النشر", app.agrees_to_publish ? "نعم" : "لا")}
    ${app.social_links ? field("روابط", app.social_links) : ""}
  </div>

  <div class="footer">بودكاست خط · khatpodcast.com · تم التصدير ${formatDate(new Date())}</div>
</body>
</html>`

    const printWindow = window.open("", "_blank")
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
      setTimeout(() => printWindow.print(), 500)
    }
  }

  // Filtered data
  const normalizedSearch = search.trim().toLowerCase()
  const filteredGuests = normalizedSearch
    ? guestApplications.filter(
        (a) =>
          a.name.toLowerCase().includes(normalizedSearch) ||
          a.email.toLowerCase().includes(normalizedSearch) ||
          a.story_idea.toLowerCase().includes(normalizedSearch)
      )
    : guestApplications

  const filteredSponsors = normalizedSearch
    ? sponsorshipLeads.filter(
        (l) =>
          l.company_name.toLowerCase().includes(normalizedSearch) ||
          l.contact_name.toLowerCase().includes(normalizedSearch) ||
          l.email.toLowerCase().includes(normalizedSearch) ||
          l.industry.toLowerCase().includes(normalizedSearch)
      )
    : sponsorshipLeads

  const filteredSubscribers = normalizedSearch
    ? newsletterSubscribers.filter((s) =>
        s.email.toLowerCase().includes(normalizedSearch)
      )
    : newsletterSubscribers

  const filteredThinkers = normalizedSearch
    ? thinkerSuggestions.filter(
        (t) =>
          t.thinker_name.toLowerCase().includes(normalizedSearch) ||
          t.research_field.toLowerCase().includes(normalizedSearch) ||
          t.reason.toLowerCase().includes(normalizedSearch)
      )
    : thinkerSuggestions

  const totalSubmissions =
    guestApplications.length +
    sponsorshipLeads.length +
    newsletterSubscribers.length +
    thinkerSuggestions.length

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div>
        <h1 className="text-xl font-bold">الطلبات والاشتراكات</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          مراجعة طلبات الضيوف والرعاية واقتراحات المفكرين ومشتركي النشرة البريدية
        </p>
      </div>

      {/* ─── Stats Grid ─── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <GlowCard color="primary">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                <Inbox className="h-5 w-5 text-primary" />
              </div>
              <span className="text-3xl font-bold">{totalSubmissions}</span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              إجمالي الطلبات
            </p>
          </div>
        </GlowCard>

        <GlowCard color="purple">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10">
                <UserPlus className="h-5 w-5 text-accent" />
              </div>
              <span className="text-3xl font-bold">
                {guestApplications.length}
              </span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              طلبات الضيوف
            </p>
          </div>
        </GlowCard>

        <GlowCard color="muted">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                <Handshake className="h-5 w-5 text-muted-foreground" />
              </div>
              <span className="text-3xl font-bold">
                {sponsorshipLeads.length}
              </span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              طلبات الرعاية
            </p>
          </div>
        </GlowCard>

        <GlowCard color="green">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10">
                <Mail className="h-5 w-5 text-emerald-700" />
              </div>
              <span className="text-3xl font-bold">
                {newsletterSubscribers.length}
              </span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              المشتركين
            </p>
          </div>
        </GlowCard>

        <GlowCard color="muted">
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/10">
                <Lightbulb className="h-5 w-5 text-amber-700" />
              </div>
              <span className="text-3xl font-bold">
                {thinkerSuggestions.length}
              </span>
            </div>
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              اقتراحات المفكرين
            </p>
          </div>
        </GlowCard>
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border/30 bg-card/50 p-1.5 backdrop-blur-sm">
        <TabButton active={activeTab === "guests"} icon={UserPlus} label="طلبات الضيوف" shortLabel="الضيوف" count={guestApplications.length} onClick={() => setActiveTab("guests")} color="purple" />
        <TabButton active={activeTab === "sponsors"} icon={Handshake} label="طلبات الرعاية" shortLabel="الرعاية" count={sponsorshipLeads.length} onClick={() => setActiveTab("sponsors")} color="primary" />
        <TabButton active={activeTab === "newsletter"} icon={Mail} label="المشتركين" shortLabel="النشرة" count={newsletterSubscribers.length} onClick={() => setActiveTab("newsletter")} color="green" />
        <TabButton active={activeTab === "thinkers"} icon={Lightbulb} label="اقتراحات المفكرين" shortLabel="المفكرين" count={thinkerSuggestions.length} onClick={() => setActiveTab("thinkers")} color="amber" />
      </div>

      {/* ─── Search Bar ─── */}
      <div className="relative">
        <Search className="pointer-events-none absolute start-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={
            activeTab === "guests"
              ? "ابحث بالاسم أو البريد أو القصة..."
              : activeTab === "sponsors"
                ? "ابحث بالاسم أو البريد أو الشركة..."
                : activeTab === "thinkers"
                  ? "ابحث بالاسم أو المجال أو السبب..."
                  : "ابحث بالبريد الإلكتروني..."
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 rounded-lg border-border/40 bg-card/60 ps-11 text-[13px] backdrop-blur-sm transition-all focus:border-primary/50 focus:bg-card"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute end-4 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ─── Guest Applications Tab ─── */}
      {activeTab === "guests" && (
        <>
          {filteredGuests.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title={search ? "لم يتم العثور على طلبات" : "لا توجد طلبات ضيوف جديدة"}
              description={search ? `لم يتم العثور على طلبات تطابق "${search}"` : "ستظهر هنا الطلبات الجديدة عند إرسالها"}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredGuests.map((app) => {
                const statusConfig = STATUS_CONFIG[app.status]
                return (
                  <div
                    key={app.id}
                    className="group relative overflow-hidden rounded-xl border border-border/30 bg-card/50 backdrop-blur-sm transition-all duration-200 hover:border-border/50 hover:bg-card/80"
                  >
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-accent/40 via-primary/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                    <div className="p-5">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 ring-1 ring-accent/20">
                            <UserPlus className="h-5 w-5 text-accent" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold">
                              {app.name}
                            </h3>
                            <button
                              onClick={() => copyEmail(app.email)}
                              className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {copiedEmail === app.email ? (
                                <Check className="h-3 w-3 text-emerald-700" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                              <span className="truncate">{app.email}</span>
                            </button>
                          </div>
                        </div>
                        <ActionMenu>
                          {(close) => (
                            <>
                              <MenuItem icon={Eye} label="عرض التفاصيل" onClick={() => { setSelectedApplication(app); close() }} />
                              <MenuItem icon={Mail} label="إرسال بريد" onClick={() => { window.location.href = `mailto:${app.email}?subject=بودكاست خط - طلب الظهور كضيف`; close() }} />
                              <MenuItem icon={Printer} label="طباعة / PDF" onClick={() => { handleExportPDF(app); close() }} />
                              <div className="my-1 border-t border-border/50" />
                              <MenuItem icon={Trash2} label="حذف" variant="danger" onClick={() => { handleDeleteGuestApp(app.id); close() }} />
                            </>
                          )}
                        </ActionMenu>
                      </div>

                      {/* Status + Country badges */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-medium ring-1 ${statusConfig.bg} ${statusConfig.color} ${statusConfig.ring}`}>
                          {statusConfig.label}
                        </span>
                        {app.country && (
                          <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1 ring-1 ring-border/30">
                            <MapPin className="h-3 w-3 text-muted-foreground" />
                            <span className="text-[10px] text-muted-foreground">{app.country}</span>
                          </div>
                        )}
                        {app.previous_podcast && (
                          <div className="flex items-center gap-1.5 rounded-lg bg-accent/[0.06] px-2.5 py-1 ring-1 ring-accent/15">
                            <Mic className="h-3 w-3 text-orange-700" />
                            <span className="text-[10px] font-medium text-orange-700">ضيف سابق</span>
                          </div>
                        )}
                        {guestAiScores[app.id] != null && (
                          <div className={`flex items-center gap-1 rounded-lg px-2.5 py-1 ring-1 ${
                            guestAiScores[app.id] >= 75
                              ? "bg-emerald-500/[0.08] text-emerald-700 ring-emerald-500/20"
                              : guestAiScores[app.id] >= 45
                                ? "bg-amber-500/[0.08] text-amber-700 ring-amber-500/20"
                                : "bg-red-500/[0.08] text-red-700 ring-red-500/20"
                          }`}>
                            <Brain className="h-3 w-3" />
                            <span className="text-[10px] font-bold">{guestAiScores[app.id]}</span>
                          </div>
                        )}
                      </div>

                      {/* Story preview */}
                      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {app.story_idea}
                      </p>

                      {/* Footer */}
                      <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {timeAgo(app.created_at)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ─── Sponsorship Leads Tab ─── */}
      {activeTab === "sponsors" && (
        <>
          {filteredSponsors.length === 0 ? (
            <EmptyState icon={Handshake} title={search ? "لم يتم العثور على طلبات" : "لا توجد طلبات شراكة جديدة"} description={search ? `لم يتم العثور على طلبات تطابق "${search}"` : "ستظهر هنا طلبات الشراكة عند إرسالها"} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredSponsors.map((lead) => {
                const statusConfig = SPONSOR_STATUS_CONFIG[lead.status]
                return (
                  <div key={lead.id} className="group relative overflow-hidden rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm transition-all hover:border-border/60 hover:bg-card/80">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-primary/40 via-accent/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
                            <Handshake className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold">{lead.company_name}</h3>
                            <p className="mt-0.5 text-xs text-muted-foreground truncate">{lead.contact_name}</p>
                            <button onClick={() => copyEmail(lead.email)} className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
                              {copiedEmail === lead.email ? <Check className="h-3 w-3 text-emerald-700" /> : <Copy className="h-3 w-3" />}
                              <span className="truncate">{lead.email}</span>
                            </button>
                          </div>
                        </div>
                        <ActionMenu>
                          {(close) => (
                            <>
                              <MenuItem icon={FileText} label="عرض التفاصيل" onClick={() => { setSelectedLead(lead); close() }} />
                              <MenuItem icon={Mail} label="إرسال بريد" onClick={() => { window.location.href = `mailto:${lead.email}?subject=بودكاست خط - طلب الشراكة`; close() }} />
                              <div className="my-1 border-t border-border/50" />
                              <MenuItem icon={Trash2} label="حذف" variant="danger" onClick={() => { handleDeleteSponsorLead(lead.id); close() }} />
                            </>
                          )}
                        </ActionMenu>
                      </div>

                      {/* Status + Industry + Budget badges */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-medium ring-1 ${statusConfig.bg} ${statusConfig.color} ${statusConfig.ring}`}>
                          {statusConfig.label}
                        </span>
                        <div className="flex items-center gap-1.5 rounded-lg bg-white/[0.03] px-2.5 py-1 ring-1 ring-border/30">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground">{lead.industry}</span>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/[0.06] px-2.5 py-1 ring-1 ring-emerald-500/15">
                          <span className="text-[10px] text-emerald-700/80">{BUDGET_LABELS[lead.budget_range] || lead.budget_range}</span>
                        </div>
                        {aiScores[lead.id] && (
                          <div className={`flex items-center gap-1 rounded-lg px-2.5 py-1 ring-1 ${
                            aiScores[lead.id].score >= 70
                              ? "bg-emerald-500/[0.08] text-emerald-700 ring-emerald-500/20"
                              : aiScores[lead.id].score >= 40
                                ? "bg-amber-500/[0.08] text-amber-700 ring-amber-500/20"
                                : "bg-red-500/[0.08] text-red-700 ring-red-500/20"
                          }`}>
                            <Brain className="h-3 w-3" />
                            <span className="text-[10px] font-bold">{aiScores[lead.id].score}</span>
                          </div>
                        )}
                      </div>

                      {/* Collaboration types */}
                      {lead.collaboration_types.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {lead.collaboration_types.slice(0, 3).map((ct) => (
                            <span key={ct} className="rounded-md bg-primary/[0.06] px-2 py-0.5 text-[9px] text-primary/70 ring-1 ring-primary/10">
                              {COLLABORATION_LABELS[ct] || ct}
                            </span>
                          ))}
                          {lead.collaboration_types.length > 3 && (
                            <span className="rounded-md bg-white/[0.03] px-2 py-0.5 text-[9px] text-muted-foreground ring-1 ring-border/20">
                              +{lead.collaboration_types.length - 3}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {timeAgo(lead.created_at)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ─── Newsletter Subscribers Tab ─── */}
      {activeTab === "newsletter" && (
        <>
          <div className="flex items-center justify-between rounded-2xl border border-border/30 bg-card/50 px-5 py-3 backdrop-blur-sm">
            <p className="text-sm text-muted-foreground">
              إجمالي المشتركين:{" "}
              <span className="font-semibold text-foreground">{newsletterSubscribers.length}</span>
            </p>
            {newsletterSubscribers.length > 0 && (
              <Button variant="ghost" size="sm" onClick={exportSubscribers} className="gap-2 rounded-xl text-xs">
                <Download className="h-3.5 w-3.5" />
                تصدير CSV
              </Button>
            )}
          </div>

          {filteredSubscribers.length === 0 ? (
            <EmptyState icon={Mail} title={search ? "لم يتم العثور على مشتركين" : "لا يوجد مشتركين بعد"} description={search ? `لم يتم العثور على مشتركين يطابقون "${search}"` : "ستظهر هنا اشتراكات النشرة البريدية"} />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm">
              {filteredSubscribers.map((subscriber, index) => (
                <div key={subscriber.id} className={`group flex items-center justify-between px-5 py-3.5 transition-all hover:bg-white/[0.02] ${index !== 0 ? "border-t border-border/20" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                      <Mail className="h-4 w-4 text-emerald-700" />
                    </div>
                    <div>
                      <button onClick={() => copyEmail(subscriber.email)} className="flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary">
                        {subscriber.email}
                        {copiedEmail === subscriber.email ? <Check className="h-3 w-3 text-emerald-700" /> : <Copy className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
                      </button>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo(subscriber.created_at)}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteSubscriber(subscriber.id)} disabled={deletingIds.has(subscriber.id)} className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── Thinker Suggestions Tab ─── */}
      {activeTab === "thinkers" && (
        <>
          {filteredThinkers.length === 0 ? (
            <EmptyState icon={Lightbulb} title={search ? "لم يتم العثور على اقتراحات" : "لا توجد اقتراحات مفكرين بعد"} description={search ? `لم يتم العثور على اقتراحات تطابق "${search}"` : "ستظهر هنا اقتراحات المفكرين عند إرسالها من الموقع"} />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredThinkers.map((suggestion) => {
                const statusConfig = THINKER_STATUS_CONFIG[suggestion.status]
                return (
                  <div key={suggestion.id} className="group relative overflow-hidden rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm transition-all hover:border-border/60 hover:bg-card/80">
                    <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-l from-primary/40 via-amber-500/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <div className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 ring-1 ring-amber-500/20">
                            <Lightbulb className="h-5 w-5 text-amber-700" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold">{suggestion.thinker_name}</h3>
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <BookOpen className="h-3 w-3" />
                              <span className="truncate">{suggestion.research_field}</span>
                            </div>
                          </div>
                        </div>
                        <ActionMenu>
                          {(close) => (
                            <>
                              {(Object.keys(THINKER_STATUS_CONFIG) as ThinkerSuggestionStatus[]).map((s) => (
                                <MenuItem
                                  key={s}
                                  icon={s === "approved" ? CircleCheck : s === "rejected" ? CircleX : Eye}
                                  label={THINKER_STATUS_CONFIG[s].label}
                                  onClick={() => { handleThinkerStatusChange(suggestion.id, s); close() }}
                                />
                              ))}
                              <div className="my-1 border-t border-border/50" />
                              <MenuItem icon={Trash2} label="حذف" variant="danger" onClick={() => { handleDeleteThinker(suggestion.id); close() }} />
                            </>
                          )}
                        </ActionMenu>
                      </div>

                      {/* Status badge */}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-medium ring-1 ${statusConfig.bg} ${statusConfig.color} ${statusConfig.ring}`}>
                          {statusConfig.label}
                        </span>
                      </div>

                      {/* Reason preview */}
                      <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {suggestion.reason}
                      </p>

                      {/* Social links / phone indicators */}
                      {(suggestion.social_links || suggestion.phone) && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {suggestion.social_links && (
                            <span className="flex items-center gap-1 rounded-md bg-white/[0.03] px-2 py-0.5 text-[9px] text-muted-foreground ring-1 ring-border/20">
                              <Link className="h-2.5 w-2.5" />
                              روابط
                            </span>
                          )}
                          {suggestion.phone && (
                            <span className="flex items-center gap-1 rounded-md bg-white/[0.03] px-2 py-0.5 text-[9px] text-muted-foreground ring-1 ring-border/20">
                              <Phone className="h-2.5 w-2.5" />
                              {suggestion.phone}
                            </span>
                          )}
                        </div>
                      )}

                      <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {timeAgo(suggestion.created_at)}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════
          Guest Application Detail Dialog
          ═══════════════════════════════════════════ */}
      <DetailDialog
        open={!!selectedApplication}
        onClose={() => setSelectedApplication(null)}
      >
        {selectedApplication && (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 rounded-t-3xl border-b border-border/30 bg-card/95 px-8 pb-4 pt-8 backdrop-blur-xl">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-accent/10">
                    <UserPlus className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{selectedApplication.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      تم الإرسال {timeAgo(selectedApplication.created_at)}
                    </p>
                  </div>
                </div>
                <StatusDropdown
                  current={selectedApplication.status}
                  onChange={(s) =>
                    handleStatusChange(selectedApplication.id, s)
                  }
                />
              </div>
            </div>

            {/* Body — Narrative-style profile */}
            <div ref={printRef} className="px-8 py-6 space-y-8">

              {/* ── Section 1: Basic Info ── */}
              <div>
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                    ١
                  </div>
                  <h4 className="text-sm font-semibold">المعلومات الأساسية</h4>
                </div>
                <div className="grid gap-x-6 gap-y-4 rounded-2xl bg-white/[0.02] p-5 ring-1 ring-border/20 sm:grid-cols-2">
                  <DetailField label="الاسم" value={selectedApplication.name} />
                  <DetailField
                    label="البريد الإلكتروني"
                    value={selectedApplication.email}
                    copyable
                    onCopy={() => copyEmail(selectedApplication.email)}
                    copied={copiedEmail === selectedApplication.email}
                  />
                  <DetailField
                    label="رقم الهاتف"
                    value={selectedApplication.phone}
                    copyable
                    onCopy={() => copyEmail(selectedApplication.phone)}
                    copied={copiedEmail === selectedApplication.phone}
                  />
                  <DetailField label="الدولة" value={selectedApplication.country} />
                  {selectedApplication.can_travel_to_kuwait && (
                    <DetailField
                      label="السفر إلى الكويت"
                      value={
                        selectedApplication.can_travel_to_kuwait === "yes"
                          ? "نعم"
                          : selectedApplication.can_travel_to_kuwait === "maybe"
                            ? "ربما"
                            : "لا"
                      }
                    />
                  )}
                </div>
              </div>

              {/* ── Section 2: Story & Personality ── */}
              <div>
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    ٢
                  </div>
                  <h4 className="text-sm font-semibold">القصة والشخصية</h4>
                </div>
                <div className="space-y-5 rounded-2xl bg-white/[0.02] p-5 ring-1 ring-border/20">
                  <NarrativeBlock
                    label="ما القصة أو الفكرة التي يود مشاركتها؟"
                    value={selectedApplication.story_idea}
                  />
                  <NarrativeBlock
                    label="من هو بعيدًا عن المسمى الوظيفي؟"
                    value={selectedApplication.beyond_job_title}
                  />
                  <NarrativeBlock
                    label="لحظة في حياته غيّرته"
                    value={selectedApplication.life_changing_moment}
                  />
                  <NarrativeBlock
                    label="ما يتمنى أن يفهمه الناس عنه بعد الحلقة"
                    value={selectedApplication.hope_people_understand}
                  />
                  <NarrativeBlock
                    label="سؤال يتمنى أن يُسأل ولم يسأله أحد من قبل"
                    value={selectedApplication.unasked_question}
                  />
                  <NarrativeBlock
                    label="لماذا اختار بودكاست خط؟"
                    value={selectedApplication.why_khat}
                  />
                </div>
              </div>

              {/* ── Section 3: Recording & Publishing ── */}
              <div>
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-700">
                    ٣
                  </div>
                  <h4 className="text-sm font-semibold">التسجيل والنشر</h4>
                </div>
                <div className="space-y-4 rounded-2xl bg-white/[0.02] p-5 ring-1 ring-border/20">
                  <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <DetailField
                      label="ظهور سابق في بودكاست"
                      value={selectedApplication.previous_podcast ? "نعم" : "لا"}
                    />
                    {selectedApplication.previous_podcast_info && (
                      <DetailField
                        label="تفاصيل البودكاست السابق"
                        value={selectedApplication.previous_podcast_info}
                      />
                    )}
                  </div>
                  <NarrativeBlock
                    label="يفضل الحوار أم سرد القصة؟ لماذا؟"
                    value={selectedApplication.prefer_dialogue_or_story}
                  />
                  {selectedApplication.topics_to_avoid && (
                    <NarrativeBlock
                      label="مواضيع يفضل عدم التطرق لها"
                      value={selectedApplication.topics_to_avoid}
                    />
                  )}
                  <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <DetailField
                      label="قلق بخصوص التصوير"
                      value={
                        selectedApplication.filming_concern === "no"
                          ? "لا"
                          : selectedApplication.filming_concern === "a_little"
                            ? "قليلاً"
                            : "نعم"
                      }
                    />
                    <DetailField
                      label="موافقة على النشر"
                      value={selectedApplication.agrees_to_publish ? "نعم" : "لا"}
                    />
                  </div>
                  {selectedApplication.social_links && (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">روابط</p>
                      <div className="space-y-1.5">
                        {selectedApplication.social_links.split(",").map((link, i) => (
                          <a
                            key={i}
                            href={link.trim()}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 rounded-xl bg-white/[0.02] px-3 py-2 text-xs text-primary ring-1 ring-border/30 transition-all hover:bg-white/[0.04] hover:ring-primary/30"
                          >
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            <span className="truncate">{link.trim()}</span>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section A: AI Analysis ── */}
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-700">
                      <Brain className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-sm font-semibold">تحليل الذكاء الاصطناعي</h4>
                  </div>
                  <button
                    onClick={handleAnalyzeGuest}
                    disabled={analyzingGuest}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-500/20 transition-all hover:bg-violet-500/20 disabled:opacity-50"
                  >
                    {analyzingGuest ? (
                      <><Loader2 className="h-3 w-3 animate-spin" />{guestAiAnalysis ? "إعادة التحليل..." : "جارٍ التحليل..."}</>
                    ) : (
                      <>{guestAiAnalysis ? <RefreshCw className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}{guestAiAnalysis ? "إعادة التحليل" : "تحليل AI"}</>
                    )}
                  </button>
                </div>

                {guestAiAnalysis && guestAiAnalysis.status === "ready" && (
                  <div className="space-y-4 rounded-2xl bg-violet-500/[0.03] p-5 ring-1 ring-violet-500/15">
                    {/* Score + Recommendation + Risk */}
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className={`text-3xl font-black tabular-nums ${
                          (guestAiAnalysis.fit_score ?? 0) >= 75 ? "text-emerald-700" : (guestAiAnalysis.fit_score ?? 0) >= 45 ? "text-amber-700" : "text-red-700"
                        }`}>
                          {guestAiAnalysis.fit_score}
                        </div>
                        <p className="text-[10px] text-muted-foreground">درجة التوافق</p>
                      </div>
                      <div className="h-10 w-px bg-border/30" />
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-lg px-2.5 py-1 text-[10px] font-medium ring-1 ${
                          guestAiAnalysis.recommendation === "strong_accept" ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
                            : guestAiAnalysis.recommendation === "accept" ? "bg-green-500/10 text-green-700 ring-green-500/20"
                              : guestAiAnalysis.recommendation === "consider_later" ? "bg-amber-500/10 text-amber-700 ring-amber-500/20"
                                : "bg-red-500/10 text-red-700 ring-red-500/20"
                        }`}>
                          {guestAiAnalysis.recommendation === "strong_accept" ? "قبول قوي" : guestAiAnalysis.recommendation === "accept" ? "قبول" : guestAiAnalysis.recommendation === "consider_later" ? "للاحتفاظ" : "رفض"}
                        </span>
                        <span className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium ring-1 ${
                          guestAiAnalysis.risk_level === "low" ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
                            : guestAiAnalysis.risk_level === "medium" ? "bg-amber-500/10 text-amber-700 ring-amber-500/20"
                              : "bg-red-500/10 text-red-700 ring-red-500/20"
                        }`}>
                          <Shield className="h-3 w-3" />
                          {guestAiAnalysis.risk_level === "low" ? "مخاطر منخفضة" : guestAiAnalysis.risk_level === "medium" ? "مخاطر متوسطة" : "مخاطر عالية"}
                        </span>
                      </div>
                    </div>

                    {/* Sub-scores */}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {[
                        { label: "عمق عاطفي", value: guestAiAnalysis.emotional_depth_score },
                        { label: "وضوح القصة", value: guestAiAnalysis.story_clarity_score },
                        { label: "أصالة", value: guestAiAnalysis.originality_score },
                        { label: "جاهزية", value: guestAiAnalysis.readiness_score },
                      ].map((s) => (
                        <div key={s.label} className="rounded-xl bg-white/[0.03] p-2.5 text-center ring-1 ring-border/15">
                          <div className={`text-lg font-bold tabular-nums ${(s.value ?? 0) >= 70 ? "text-emerald-700" : (s.value ?? 0) >= 40 ? "text-amber-700" : "text-red-700"}`}>
                            {s.value ?? "—"}
                          </div>
                          <p className="text-[9px] text-muted-foreground">{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Fit Summary */}
                    {guestAiAnalysis.fit_summary && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">ملخص التقييم</p>
                        <p className="text-sm leading-relaxed">{guestAiAnalysis.fit_summary}</p>
                      </div>
                    )}

                    {/* Strongest Angle */}
                    {guestAiAnalysis.strongest_angle && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">أقوى زاوية تحريرية</p>
                        <p className="text-sm leading-relaxed text-primary/80">{guestAiAnalysis.strongest_angle}</p>
                      </div>
                    )}

                    {/* Why Now + Audience Value */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {guestAiAnalysis.why_now && (
                        <div>
                          <p className="mb-1 text-[11px] font-medium text-muted-foreground">لماذا الآن؟</p>
                          <p className="text-[13px] leading-relaxed">{guestAiAnalysis.why_now}</p>
                        </div>
                      )}
                      {guestAiAnalysis.audience_value && (
                        <div>
                          <p className="mb-1 text-[11px] font-medium text-muted-foreground">القيمة للجمهور</p>
                          <p className="text-[13px] leading-relaxed">{guestAiAnalysis.audience_value}</p>
                        </div>
                      )}
                    </div>

                    {/* Strengths + Concerns */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {guestAiAnalysis.strengths.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[11px] font-medium text-emerald-700">نقاط القوة</p>
                          <div className="flex flex-wrap gap-1.5">
                            {guestAiAnalysis.strengths.map((s, i) => (
                              <span key={i} className="rounded-md bg-emerald-500/[0.08] px-2 py-1 text-[10px] text-emerald-700 ring-1 ring-emerald-500/15">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {guestAiAnalysis.concerns.length > 0 && (
                        <div>
                          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-red-700">
                            <AlertTriangle className="h-3 w-3" />مخاوف
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {guestAiAnalysis.concerns.map((c, i) => (
                              <span key={i} className="rounded-md bg-red-500/[0.08] px-2 py-1 text-[10px] text-red-700 ring-1 ring-red-500/15">{c}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Suggested Direction */}
                    {guestAiAnalysis.suggested_direction && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">الاتجاه التحريري المقترح</p>
                        <p className="text-sm leading-relaxed text-muted-foreground">{guestAiAnalysis.suggested_direction}</p>
                      </div>
                    )}
                  </div>
                )}

                {guestAiAnalysis && guestAiAnalysis.status === "error" && (
                  <div className="rounded-2xl bg-red-500/[0.05] p-4 ring-1 ring-red-500/15">
                    <p className="text-xs text-red-700">{guestAiAnalysis.error_message || "حدث خطأ أثناء التحليل"}</p>
                  </div>
                )}
              </div>

              {/* ── Section B: Episode Concept ── */}
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/10 text-xs font-bold text-cyan-700">
                      <BookOpen className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-sm font-semibold">تصور الحلقة</h4>
                  </div>
                  <button
                    onClick={handleGenerateConcept}
                    disabled={generatingConcept}
                    className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-700 ring-1 ring-cyan-500/20 transition-all hover:bg-cyan-500/20 disabled:opacity-50"
                  >
                    {generatingConcept ? (
                      <><Loader2 className="h-3 w-3 animate-spin" />جارٍ الإنشاء...</>
                    ) : (
                      <><Sparkles className="h-3 w-3" />{guestAiConcept ? "إعادة الإنشاء" : "إنشاء تصور"}</>
                    )}
                  </button>
                </div>

                {guestAiConcept && guestAiConcept.status === "ready" && (
                  <div className="space-y-4 rounded-2xl bg-cyan-500/[0.03] p-5 ring-1 ring-cyan-500/15">
                    {/* Title */}
                    <div>
                      <p className="mb-1 text-[11px] font-medium text-muted-foreground">عنوان الحلقة المقترح</p>
                      <p className="text-lg font-bold text-foreground">{guestAiConcept.proposed_episode_title}</p>
                      {guestAiConcept.title_alternatives.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {guestAiConcept.title_alternatives.map((t, i) => (
                            <span key={i} className="rounded-lg bg-white/[0.03] px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-border/20">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Hook + Logline */}
                    {guestAiConcept.episode_hook && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">الافتتاحية</p>
                        <p className="text-sm italic leading-relaxed text-primary/80">&ldquo;{guestAiConcept.episode_hook}&rdquo;</p>
                      </div>
                    )}
                    {guestAiConcept.episode_logline && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">ملخص الحلقة</p>
                        <p className="text-sm leading-relaxed">{guestAiConcept.episode_logline}</p>
                      </div>
                    )}
                    {guestAiConcept.why_this_episode_matters && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">لماذا تهم هذه الحلقة</p>
                        <p className="text-sm leading-relaxed">{guestAiConcept.why_this_episode_matters}</p>
                      </div>
                    )}

                    {/* Conversation Style */}
                    {guestAiConcept.conversation_style && (
                      <div className="flex items-center gap-2">
                        <p className="text-[11px] font-medium text-muted-foreground">أسلوب المحادثة:</p>
                        <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 text-[11px] font-medium text-foreground ring-1 ring-border/20">
                          {guestAiConcept.conversation_style === "story" ? "سرد قصصي" : guestAiConcept.conversation_style === "dialogue" ? "حوار فكري" : "مزيج"}
                        </span>
                      </div>
                    )}

                    {/* Opening Question */}
                    {guestAiConcept.suggested_opening_question && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">السؤال الافتتاحي</p>
                        <p className="rounded-xl bg-primary/[0.05] px-4 py-3 text-sm leading-relaxed text-foreground ring-1 ring-primary/10">{guestAiConcept.suggested_opening_question}</p>
                      </div>
                    )}

                    {/* Core Questions */}
                    {guestAiConcept.suggested_core_questions.length > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-medium text-muted-foreground">الأسئلة الأساسية ({guestAiConcept.suggested_core_questions.length})</p>
                        <ol className="space-y-1.5">
                          {guestAiConcept.suggested_core_questions.map((q, i) => (
                            <li key={i} className="flex gap-2 rounded-lg bg-white/[0.02] px-3 py-2 text-[13px] leading-relaxed ring-1 ring-border/10">
                              <span className="shrink-0 text-[11px] font-bold text-muted-foreground">{i + 1}.</span>
                              {q}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {/* Sensitive Areas + Topics to Avoid */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {guestAiConcept.suggested_sensitive_areas.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[11px] font-medium text-amber-700">مناطق حساسة</p>
                          <div className="flex flex-wrap gap-1.5">
                            {guestAiConcept.suggested_sensitive_areas.map((s, i) => (
                              <span key={i} className="rounded-md bg-amber-500/[0.08] px-2 py-1 text-[10px] text-amber-700 ring-1 ring-amber-500/15">{s}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {guestAiConcept.suggested_topics_to_avoid.length > 0 && (
                        <div>
                          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-red-700">
                            <AlertTriangle className="h-3 w-3" />مواضيع يُفضل تجنبها
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {guestAiConcept.suggested_topics_to_avoid.map((t, i) => (
                              <span key={i} className="rounded-md bg-red-500/[0.08] px-2 py-1 text-[10px] text-red-700 ring-1 ring-red-500/15">{t}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Host Preparation Notes */}
                    {guestAiConcept.host_preparation_notes && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">ملاحظات تحضيرية لخالد</p>
                        <p className="whitespace-pre-wrap rounded-xl bg-white/[0.03] px-4 py-3 text-[13px] leading-relaxed text-muted-foreground ring-1 ring-border/15">{guestAiConcept.host_preparation_notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {guestAiConcept && guestAiConcept.status === "error" && (
                  <div className="rounded-2xl bg-red-500/[0.05] p-4 ring-1 ring-red-500/15">
                    <p className="text-xs text-red-700">{guestAiConcept.error_message || "حدث خطأ أثناء إنشاء التصور"}</p>
                  </div>
                )}
              </div>

              {/* ── Section C: AI Response Drafts ── */}
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-700">
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-sm font-semibold">مسودات الردود</h4>
                  </div>
                  <button
                    onClick={handleGenerateResponses}
                    disabled={generatingResponses}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-500/20 transition-all hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    {generatingResponses ? (
                      <><Loader2 className="h-3 w-3 animate-spin" />جارٍ الإنشاء...</>
                    ) : (
                      <><Sparkles className="h-3 w-3" />{guestAiResponses ? "إعادة الإنشاء" : "إنشاء ردود AI"}</>
                    )}
                  </button>
                </div>

                {guestAiResponses && guestAiResponses.status === "ready" && (
                  <p className="text-[11px] text-muted-foreground mb-2">تم إنشاء 6 مسودات ردود (قبول / اعتذار / للاحتفاظ × رسمي / ودّي). اختر نوع الرد أدناه لاستخدامها.</p>
                )}

                {guestAiResponses && guestAiResponses.status === "error" && (
                  <div className="rounded-2xl bg-red-500/[0.05] p-4 ring-1 ring-red-500/15">
                    <p className="text-xs text-red-700">{guestAiResponses.error_message || "حدث خطأ أثناء إنشاء الردود"}</p>
                  </div>
                )}
              </div>

              {/* ── Section D.1: Canonical Identity Link (P2.4.d) ──
                  Lives inside the accepted-only block per operator
                  decision §3 — link-canonical is meaningful only after
                  the operator has accepted the applicant. The dialog
                  itself is the shared LinkCanonicalDialog used by the
                  guest-candidates detail page. */}
              {selectedApplication.status === "accepted" && (
                <div className="border-t border-border/30 pt-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-500/10 text-xs font-bold text-indigo-700">
                        <LinkIcon className="h-3.5 w-3.5" />
                      </div>
                      <h4 className="text-sm font-semibold">الهوية القانونية</h4>
                    </div>
                    <button
                      onClick={() => setLinkCanonicalOpen(true)}
                      className="flex items-center gap-1.5 rounded-lg bg-indigo-500/10 px-3 py-1.5 text-[11px] font-medium text-indigo-700 ring-1 ring-indigo-500/20 transition-all hover:bg-indigo-500/20"
                    >
                      <LinkIcon className="h-3 w-3" />
                      ربط بضيف قانوني
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    يربط هذا الطلب بصفّ ضيف قانوني في قاعدة الضيوف لتوحيد كل
                    البيانات تحت هوية واحدة. المعاينة فقط — لا يحدث الكتابة
                    إلا بعد التأكيد.
                  </p>
                </div>
              )}

              {/* ── Section D: Prep Form ── */}
              {selectedApplication.status === "accepted" && (
                <div className="border-t border-border/30 pt-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-500/10 text-xs font-bold text-teal-700">
                        <ClipboardCheck className="h-3.5 w-3.5" />
                      </div>
                      <h4 className="text-sm font-semibold">استبيان التحضير</h4>
                    </div>
                    {!prepForm && !prepFormLoading && (
                      <button
                        onClick={handleCreatePrepForm}
                        disabled={prepFormCreating}
                        className="flex items-center gap-1.5 rounded-lg bg-teal-500/10 px-3 py-1.5 text-[11px] font-medium text-teal-700 ring-1 ring-teal-500/20 transition-all hover:bg-teal-500/20 disabled:opacity-50"
                      >
                        {prepFormCreating ? (
                          <><Loader2 className="h-3 w-3 animate-spin" />جارٍ الإنشاء...</>
                        ) : (
                          <><LinkIcon className="h-3 w-3" />إنشاء رابط الاستبيان</>
                        )}
                      </button>
                    )}
                  </div>

                  {prepFormLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      جارٍ التحميل...
                    </div>
                  )}

                  {prepForm && (
                    <div className="space-y-4">
                      {/* Status + Actions */}
                      <div className="flex flex-wrap items-center gap-2">
                        <PrepFormStatusBadge status={prepForm.status as GuestPrepFormStatus} />
                        {prepForm.submitted_at && (
                          <span className="text-[11px] text-muted-foreground">
                            تم الإرسال {formatDate(prepForm.submitted_at)}
                          </span>
                        )}
                      </div>

                      {/* Link + Copy */}
                      {prepToken && prepForm.status !== "revoked" && (
                        <div className="flex items-center gap-2">
                          <code className="flex-1 truncate rounded-lg bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground" dir="ltr">
                            {window.location.origin}/prepare/{prepToken}
                          </code>
                          <button
                            onClick={copyPrepLink}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                          >
                            {prepLinkCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                            {prepLinkCopied ? "تم النسخ" : "نسخ"}
                          </button>
                        </div>
                      )}

                      {/* Admin actions */}
                      <div className="flex flex-wrap gap-2">
                        {(prepForm.status === "pending" || prepForm.status === "submitted") && (
                          <button
                            onClick={() => handlePrepFormAction("lock")}
                            disabled={!!prepFormAction}
                            className="flex items-center gap-1 rounded-lg bg-amber-500/10 px-2.5 py-1 text-[11px] text-amber-700 ring-1 ring-amber-500/20 transition-all hover:bg-amber-500/20 disabled:opacity-50"
                          >
                            <Lock className="h-3 w-3" />قفل
                          </button>
                        )}
                        {prepForm.status === "locked" && (
                          <button
                            onClick={() => handlePrepFormAction("unlock")}
                            disabled={!!prepFormAction}
                            className="flex items-center gap-1 rounded-lg bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-700 ring-1 ring-blue-500/20 transition-all hover:bg-blue-500/20 disabled:opacity-50"
                          >
                            <Unlock className="h-3 w-3" />فتح
                          </button>
                        )}
                        {prepForm.status !== "revoked" && (
                          <>
                            <button
                              onClick={() => handlePrepFormAction("regenerate")}
                              disabled={!!prepFormAction}
                              className="flex items-center gap-1 rounded-lg bg-muted/20 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-border/20 transition-all hover:text-foreground disabled:opacity-50"
                            >
                              <RefreshCw className="h-3 w-3" />رابط جديد
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("متأكد من إلغاء رابط الاستبيان؟")) handlePrepFormAction("revoke")
                              }}
                              disabled={!!prepFormAction}
                              className="flex items-center gap-1 rounded-lg bg-red-500/10 px-2.5 py-1 text-[11px] text-red-700 ring-1 ring-red-500/20 transition-all hover:bg-red-500/20 disabled:opacity-50"
                            >
                              <X className="h-3 w-3" />إلغاء
                            </button>
                          </>
                        )}
                      </div>

                      {/* Display submitted response */}
                      {prepForm.response && (prepForm.status === "submitted" || prepForm.status === "locked") && (
                        <PrepResponseDisplay response={prepForm.response as unknown as GuestPrepResponse} />
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Response Message Section ── */}
              <div className="border-t border-border/30 pt-6">
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                    <Send className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <h4 className="text-sm font-semibold">رسالة الرد</h4>
                </div>

                {/* Message Type Toggle */}
                <div className="mb-3 flex gap-1.5 rounded-2xl bg-white/[0.02] p-1.5 ring-1 ring-border/20">
                  <button
                    onClick={() => setMessageType("acceptance")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                      messageType === "acceptance"
                        ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20"
                        : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                    }`}
                  >
                    <CircleCheck className="h-3.5 w-3.5" />
                    قبول
                  </button>
                  {guestAiResponses?.status === "ready" && (
                    <button
                      onClick={() => setMessageType("consider_later")}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                        messageType === "consider_later"
                          ? "bg-purple-500/10 text-purple-700 ring-1 ring-purple-500/20"
                          : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      للاحتفاظ
                    </button>
                  )}
                  <button
                    onClick={() => setMessageType("rejection")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                      messageType === "rejection"
                        ? "bg-red-500/10 text-red-700 ring-1 ring-red-500/20"
                        : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                    }`}
                  >
                    <CircleX className="h-3.5 w-3.5" />
                    اعتذار
                  </button>
                </div>

                {/* Tone Toggle */}
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">نبرة الرسالة</p>
                  <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-border/30">
                    <button
                      onClick={() => setMessageTone("formal")}
                      className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
                        messageTone === "formal" ? "bg-white/[0.08] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      رسمي
                    </button>
                    <button
                      onClick={() => setMessageTone("warm")}
                      className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
                        messageTone === "warm" ? "bg-white/[0.08] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      ودّي
                    </button>
                  </div>
                </div>

                {/* Editable Message */}
                <textarea
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  dir="rtl"
                  className="w-full resize-none rounded-2xl border border-border/30 bg-white/[0.02] p-4 text-sm leading-relaxed text-foreground/90 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  rows={10}
                />
                <p className="mt-1.5 text-[10px] text-muted-foreground">يمكنك تعديل الرسالة قبل الإرسال</p>

                {/* Send / Copy Buttons */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={copyForWhatsApp}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all ${
                      messageCopied === "whatsapp"
                        ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20"
                        : "bg-white/[0.03] text-muted-foreground ring-1 ring-border/30 hover:bg-white/[0.06] hover:text-foreground"
                    }`}
                  >
                    {messageCopied === "whatsapp" ? (
                      <><Check className="h-3.5 w-3.5" />تم النسخ</>
                    ) : (
                      <><Phone className="h-3.5 w-3.5" />نسخ لواتساب</>
                    )}
                  </button>
                  <button
                    onClick={sendGuestEmail}
                    disabled={sendingEmail || emailSent === "guest"}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all ${
                      emailSent === "guest"
                        ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20"
                        : "bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/20 disabled:opacity-50"
                    }`}
                  >
                    {sendingEmail ? (
                      <><Send className="h-3.5 w-3.5 animate-pulse" />جارٍ الإرسال...</>
                    ) : emailSent === "guest" ? (
                      <><Check className="h-3.5 w-3.5" />تم الإرسال</>
                    ) : (
                      <><Send className="h-3.5 w-3.5" />أرسل البريد</>
                    )}
                  </button>
                </div>
                {emailError && emailSent !== "guest" && (
                  <p className="mt-2 text-xs text-red-700">{emailError}</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 flex gap-3 rounded-b-3xl border-t border-border/30 bg-card/95 px-8 py-4 backdrop-blur-xl">
              <Button
                variant="ghost"
                className="gap-2 rounded-xl"
                onClick={() => handleExportPDF(selectedApplication)}
              >
                <Printer className="h-4 w-4" />
                طباعة / PDF
              </Button>
              <Button
                variant="ghost"
                className="gap-2 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleDeleteGuestApp(selectedApplication.id)}
              >
                <Trash2 className="h-4 w-4" />
                حذف
              </Button>
            </div>
          </>
        )}
      </DetailDialog>

      {/* ─── Sponsor Lead Detail Dialog ─── */}
      <DetailDialog
        open={!!selectedLead}
        onClose={() => setSelectedLead(null)}
      >
        {selectedLead && (
          <>
            {/* Header */}
            <div className="sticky top-0 z-10 rounded-t-3xl border-b border-border/30 bg-card/95 px-8 pb-4 pt-8 backdrop-blur-xl">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                    <Handshake className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">{selectedLead.company_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      تم الإرسال {timeAgo(selectedLead.created_at)}
                    </p>
                  </div>
                </div>
                <SponsorStatusDropdown
                  current={selectedLead.status}
                  onChange={(s) =>
                    handleSponsorStatusChange(selectedLead.id, s)
                  }
                />
              </div>
            </div>

            {/* Body */}
            <div className="px-8 py-6 space-y-8">
              {/* Section 1: Company Info */}
              <div>
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    ١
                  </div>
                  <h4 className="text-sm font-semibold">معلومات الشركة</h4>
                </div>
                <div className="grid gap-x-6 gap-y-4 rounded-2xl bg-white/[0.02] p-5 ring-1 ring-border/20 sm:grid-cols-2">
                  <DetailField label="اسم الشركة" value={selectedLead.company_name} />
                  <DetailField label="المجال" value={selectedLead.industry} />
                  <DetailField label="اسم المسؤول" value={selectedLead.contact_name} />
                  <DetailField label="المسمى الوظيفي" value={selectedLead.job_title} />
                  <DetailField
                    label="البريد الإلكتروني"
                    value={selectedLead.email}
                    copyable
                    onCopy={() => copyEmail(selectedLead.email)}
                    copied={copiedEmail === selectedLead.email}
                  />
                  <DetailField
                    label="رقم الهاتف"
                    value={selectedLead.phone}
                    copyable
                    onCopy={() => copyEmail(selectedLead.phone)}
                    copied={copiedEmail === selectedLead.phone}
                  />
                </div>
              </div>

              {/* Section 2: Campaign Details */}
              <div>
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-xs font-bold text-accent">
                    ٢
                  </div>
                  <h4 className="text-sm font-semibold">تفاصيل التعاون</h4>
                </div>
                <div className="rounded-2xl bg-white/[0.02] p-5 ring-1 ring-border/20">
                  <p className="text-xs font-medium text-muted-foreground mb-2">أنواع التعاون</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedLead.collaboration_types.map((ct) => (
                      <span key={ct} className="rounded-lg bg-primary/[0.08] px-3 py-1.5 text-xs font-medium text-primary/80 ring-1 ring-primary/15">
                        {COLLABORATION_LABELS[ct] || ct}
                      </span>
                    ))}
                  </div>
                  {selectedLead.collaboration_other && (
                    <div className="mt-4">
                      <DetailField label="تفاصيل إضافية" value={selectedLead.collaboration_other} />
                    </div>
                  )}
                </div>
              </div>

              {/* Section 3: Objectives */}
              <div>
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-700">
                    ٣
                  </div>
                  <h4 className="text-sm font-semibold">الأهداف</h4>
                </div>
                <div className="space-y-4 rounded-2xl bg-white/[0.02] p-5 ring-1 ring-border/20">
                  <DetailField label="الهدف الرئيسي" value={GOAL_LABELS[selectedLead.main_goal] || selectedLead.main_goal} />
                  <DetailField label="الجمهور المستهدف" value={selectedLead.target_audience} />
                  {selectedLead.preferred_timeline && (
                    <DetailField label="الجدول الزمني المفضل" value={selectedLead.preferred_timeline} />
                  )}
                </div>
              </div>

              {/* Section 4: Budget */}
              <div>
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/10 text-xs font-bold text-amber-700">
                    ٤
                  </div>
                  <h4 className="text-sm font-semibold">الميزانية</h4>
                </div>
                <div className="rounded-2xl bg-amber-500/[0.04] p-5 ring-1 ring-amber-500/15">
                  <p className="text-xs font-medium text-muted-foreground mb-1">نطاق الميزانية</p>
                  <p className="text-lg font-bold text-amber-700">
                    {BUDGET_LABELS[selectedLead.budget_range] || selectedLead.budget_range}
                  </p>
                </div>
              </div>

              {/* Section 5: Additional Info */}
              {selectedLead.additional_info && (
                <div>
                  <div className="mb-4 flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/10 text-xs font-bold text-purple-700">
                      ٥
                    </div>
                    <h4 className="text-sm font-semibold">معلومات إضافية</h4>
                  </div>
                  <div className="rounded-2xl bg-white/[0.02] p-5 ring-1 ring-border/20">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{selectedLead.additional_info}</p>
                  </div>
                </div>
              )}

              {/* Section 6: AI Analysis */}
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/10 text-xs font-bold text-violet-700">
                      <Brain className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-sm font-semibold">تحليل الذكاء الاصطناعي</h4>
                  </div>
                  <button
                    onClick={handleAnalyzeLead}
                    disabled={analyzingLead}
                    className="flex items-center gap-1.5 rounded-lg bg-violet-500/10 px-3 py-1.5 text-[11px] font-medium text-violet-700 ring-1 ring-violet-500/20 transition-all hover:bg-violet-500/20 disabled:opacity-50"
                  >
                    {analyzingLead ? (
                      <><Loader2 className="h-3 w-3 animate-spin" />{aiAnalysis ? "إعادة التحليل..." : "جارٍ التحليل..."}</>
                    ) : (
                      <>{aiAnalysis ? <RefreshCw className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}{aiAnalysis ? "إعادة التحليل" : "تحليل"}</>
                    )}
                  </button>
                </div>

                {aiAnalysis && aiAnalysis.status === "ready" && (
                  <div className="space-y-4 rounded-2xl bg-violet-500/[0.03] p-5 ring-1 ring-violet-500/15">
                    {/* Score + Quality + Risk */}
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className={`text-3xl font-black tabular-nums ${
                          (aiAnalysis.fit_score ?? 0) >= 70 ? "text-emerald-700" : (aiAnalysis.fit_score ?? 0) >= 40 ? "text-amber-700" : "text-red-700"
                        }`}>
                          {aiAnalysis.fit_score}
                        </div>
                        <p className="text-[10px] text-muted-foreground">درجة التوافق</p>
                      </div>
                      <div className="h-10 w-px bg-border/30" />
                      <div className="flex flex-wrap gap-2">
                        <span className={`rounded-lg px-2.5 py-1 text-[10px] font-medium ring-1 ${
                          aiAnalysis.quality === "high" ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
                            : aiAnalysis.quality === "medium" ? "bg-amber-500/10 text-amber-700 ring-amber-500/20"
                              : "bg-red-500/10 text-red-700 ring-red-500/20"
                        }`}>
                          {aiAnalysis.quality === "high" ? "جودة عالية" : aiAnalysis.quality === "medium" ? "جودة متوسطة" : "جودة منخفضة"}
                        </span>
                        <span className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-medium ring-1 ${
                          aiAnalysis.risk_level === "low" ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
                            : aiAnalysis.risk_level === "medium" ? "bg-amber-500/10 text-amber-700 ring-amber-500/20"
                              : "bg-red-500/10 text-red-700 ring-red-500/20"
                        }`}>
                          <Shield className="h-3 w-3" />
                          {aiAnalysis.risk_level === "low" ? "مخاطر منخفضة" : aiAnalysis.risk_level === "medium" ? "مخاطر متوسطة" : "مخاطر عالية"}
                        </span>
                        <span className={`rounded-lg px-2.5 py-1 text-[10px] font-medium ring-1 ${
                          aiAnalysis.budget_fit === "good" ? "bg-emerald-500/10 text-emerald-700 ring-emerald-500/20"
                            : aiAnalysis.budget_fit === "weak" ? "bg-red-500/10 text-red-700 ring-red-500/20"
                              : "bg-zinc-500/10 text-zinc-700 ring-zinc-500/20"
                        }`}>
                          الميزانية: {aiAnalysis.budget_fit === "good" ? "مناسبة" : aiAnalysis.budget_fit === "weak" ? "ضعيفة" : "غير واضحة"}
                        </span>
                      </div>
                    </div>

                    {/* Intent Summary */}
                    {aiAnalysis.intent_summary && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">ملخص النية</p>
                        <p className="text-sm leading-relaxed">{aiAnalysis.intent_summary}</p>
                      </div>
                    )}

                    {/* Recommended Package */}
                    {aiAnalysis.recommended_package && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">الباقة المقترحة</p>
                        <p className="text-sm leading-relaxed text-primary/80">{aiAnalysis.recommended_package}</p>
                      </div>
                    )}

                    {/* Reasoning */}
                    {aiAnalysis.reasoning && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">التبرير</p>
                        <p className="text-sm leading-relaxed text-muted-foreground">{aiAnalysis.reasoning}</p>
                      </div>
                    )}

                    {/* Opportunity + Risk flags */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {aiAnalysis.opportunity_highlights.length > 0 && (
                        <div>
                          <p className="mb-1.5 text-[11px] font-medium text-emerald-700">نقاط القوة</p>
                          <div className="flex flex-wrap gap-1.5">
                            {aiAnalysis.opportunity_highlights.map((h, i) => (
                              <span key={i} className="rounded-md bg-emerald-500/[0.08] px-2 py-1 text-[10px] text-emerald-700 ring-1 ring-emerald-500/15">{h}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {aiAnalysis.risk_flags.length > 0 && (
                        <div>
                          <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-red-700">
                            <AlertTriangle className="h-3 w-3" />ملاحظات
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {aiAnalysis.risk_flags.map((f, i) => (
                              <span key={i} className="rounded-md bg-red-500/[0.08] px-2 py-1 text-[10px] text-red-700 ring-1 ring-red-500/15">{f}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {aiAnalysis && aiAnalysis.status === "error" && (
                  <div className="rounded-2xl bg-red-500/[0.05] p-4 ring-1 ring-red-500/15">
                    <p className="text-xs text-red-700">{aiAnalysis.error_message || "حدث خطأ أثناء التحليل"}</p>
                  </div>
                )}
              </div>

              {/* Section 7: AI Proposal */}
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/10 text-xs font-bold text-cyan-700">
                      <Sparkles className="h-3.5 w-3.5" />
                    </div>
                    <h4 className="text-sm font-semibold">عرض الشراكة</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Tone toggle */}
                    <div className="flex gap-1 rounded-xl bg-white/[0.03] p-0.5 ring-1 ring-border/30">
                      <button
                        onClick={() => setProposalTone("formal")}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-medium transition-all ${
                          proposalTone === "formal" ? "bg-white/[0.08] text-foreground shadow-sm" : "text-muted-foreground"
                        }`}
                      >رسمي</button>
                      <button
                        onClick={() => setProposalTone("warm")}
                        className={`rounded-lg px-2.5 py-1 text-[10px] font-medium transition-all ${
                          proposalTone === "warm" ? "bg-white/[0.08] text-foreground shadow-sm" : "text-muted-foreground"
                        }`}
                      >ودّي</button>
                    </div>
                    <button
                      onClick={handleGenerateProposal}
                      disabled={generatingProposal}
                      className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-700 ring-1 ring-cyan-500/20 transition-all hover:bg-cyan-500/20 disabled:opacity-50"
                    >
                      {generatingProposal ? (
                        <><Loader2 className="h-3 w-3 animate-spin" />جارٍ الإنشاء...</>
                      ) : (
                        <><Sparkles className="h-3 w-3" />{aiProposal ? "إعادة الإنشاء" : "إنشاء عرض"}</>
                      )}
                    </button>
                  </div>
                </div>

                {aiProposal && aiProposal.status === "ready" && (
                  <div className="space-y-4 rounded-2xl bg-cyan-500/[0.03] p-5 ring-1 ring-cyan-500/15">
                    {/* Subject */}
                    {aiProposal.subject && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-muted-foreground">عنوان البريد</p>
                        <p className="text-sm font-semibold">{aiProposal.subject}</p>
                      </div>
                    )}

                    {/* Proposed Packages */}
                    {aiProposal.proposed_packages.length > 0 && (
                      <div>
                        <p className="mb-2 text-[11px] font-medium text-muted-foreground">الباقات المقترحة</p>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {aiProposal.proposed_packages.map((pkg, i) => (
                            <div key={i} className="rounded-xl bg-white/[0.03] p-3 ring-1 ring-border/20">
                              <p className="text-xs font-bold text-cyan-700">{pkg.name}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">{pkg.description}</p>
                              <p className="mt-1.5 text-xs font-semibold text-amber-700">{pkg.price_range}</p>
                              {pkg.deliverables.length > 0 && (
                                <ul className="mt-2 space-y-0.5">
                                  {pkg.deliverables.map((d, j) => (
                                    <li key={j} className="text-[10px] text-muted-foreground/80">• {d}</li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Full Draft */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-[11px] font-medium text-muted-foreground">النص الكامل</p>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(aiProposal.edited_draft || aiProposal.full_draft || "")
                            }}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-muted-foreground transition-all hover:bg-white/[0.05] hover:text-foreground"
                          >
                            <ClipboardCopy className="h-3 w-3" />نسخ
                          </button>
                          <button
                            onClick={() => {
                              setSponsorMessageType("proposal")
                              setSponsorMessageText(aiProposal.edited_draft || aiProposal.full_draft || "")
                            }}
                            className="flex items-center gap-1 rounded-lg bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary ring-1 ring-primary/20 transition-all hover:bg-primary/20"
                          >
                            <Send className="h-3 w-3" />استخدام للإرسال
                          </button>
                        </div>
                      </div>
                      <div className="max-h-64 overflow-y-auto rounded-xl bg-white/[0.02] p-4 ring-1 ring-border/20">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
                          {aiProposal.edited_draft || aiProposal.full_draft}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {aiProposal && aiProposal.status === "error" && (
                  <div className="rounded-2xl bg-red-500/[0.05] p-4 ring-1 ring-red-500/15">
                    <p className="text-xs text-red-700">{aiProposal.error_message || "حدث خطأ أثناء إنشاء العرض"}</p>
                  </div>
                )}
              </div>

              {/* Section 8: Response Message */}
              <div>
                <div className="mb-4 flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-500/10 text-xs font-bold text-blue-700">
                    <Send className="h-3.5 w-3.5" />
                  </div>
                  <h4 className="text-sm font-semibold">رسالة الرد</h4>
                </div>

                {/* Type Toggle */}
                <div className="mb-3 flex gap-2">
                  <button
                    onClick={() => setSponsorMessageType("response")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                      sponsorMessageType === "response"
                        ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20"
                        : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                    }`}
                  >
                    <CircleCheck className="h-3.5 w-3.5" />
                    ترحيب
                  </button>
                  {aiProposal?.full_draft && (
                    <button
                      onClick={() => {
                        setSponsorMessageType("proposal")
                        setSponsorMessageText(aiProposal.edited_draft || aiProposal.full_draft || "")
                      }}
                      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                        sponsorMessageType === "proposal"
                          ? "bg-cyan-500/10 text-cyan-700 ring-1 ring-cyan-500/20"
                          : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                      }`}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      عرض AI
                    </button>
                  )}
                  <button
                    onClick={() => setSponsorMessageType("decline")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                      sponsorMessageType === "decline"
                        ? "bg-red-500/10 text-red-700 ring-1 ring-red-500/20"
                        : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                    }`}
                  >
                    <CircleX className="h-3.5 w-3.5" />
                    اعتذار
                  </button>
                </div>

                {/* Tone Toggle */}
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground">نبرة الرسالة</p>
                  <div className="flex gap-1 rounded-xl bg-white/[0.03] p-1 ring-1 ring-border/30">
                    <button
                      onClick={() => setSponsorMessageTone("formal")}
                      className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
                        sponsorMessageTone === "formal" ? "bg-white/[0.08] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      رسمي
                    </button>
                    <button
                      onClick={() => setSponsorMessageTone("warm")}
                      className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all ${
                        sponsorMessageTone === "warm" ? "bg-white/[0.08] text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      ودّي
                    </button>
                  </div>
                </div>

                {/* Editable Message */}
                <textarea
                  value={sponsorMessageText}
                  onChange={(e) => setSponsorMessageText(e.target.value)}
                  dir="rtl"
                  className="w-full resize-none rounded-2xl border border-border/30 bg-white/[0.02] p-4 text-sm leading-relaxed text-foreground/90 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                  rows={10}
                />
                <p className="mt-1.5 text-[10px] text-muted-foreground">يمكنك تعديل الرسالة قبل الإرسال</p>

                {/* Send Button */}
                <div className="mt-3">
                  <button
                    onClick={sendSponsorEmail}
                    disabled={sendingEmail || emailSent === "sponsor"}
                    className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all ${
                      emailSent === "sponsor"
                        ? "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20"
                        : "bg-primary/10 text-primary ring-1 ring-primary/20 hover:bg-primary/20 disabled:opacity-50"
                    }`}
                  >
                    {sendingEmail ? (
                      <><Send className="h-3.5 w-3.5 animate-pulse" />جارٍ الإرسال...</>
                    ) : emailSent === "sponsor" ? (
                      <><Check className="h-3.5 w-3.5" />تم الإرسال</>
                    ) : (
                      <><Send className="h-3.5 w-3.5" />أرسل البريد</>
                    )}
                  </button>
                  {emailError && emailSent !== "sponsor" && (
                    <p className="mt-2 text-xs text-red-700">{emailError}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 flex gap-3 rounded-b-3xl border-t border-border/30 bg-card/95 px-8 py-4 backdrop-blur-xl">
              <Button
                variant="outline"
                className="gap-2 rounded-xl"
                onClick={async () => {
                  try {
                    const [mkRes, anRes] = await Promise.all([
                      fetch("/api/admin/media-kit"),
                      fetch("/api/admin/analytics"),
                    ])
                    void (await mkRes.json())
                    void (await anRes.json())
                    // Open media-kit page with pre-filled company
                    const params = new URLSearchParams({
                      company: selectedLead.company_name,
                      contact: selectedLead.contact_name,
                    })
                    window.open(`/admin/media-kit?${params.toString()}`, "_blank")
                  } catch (error) {
                    console.error("Error opening media kit:", error)
                  }
                }}
              >
                <FileText className="h-4 w-4" />
                إنشاء عرض
              </Button>
              <Button
                variant="ghost"
                className="gap-2 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => handleDeleteSponsorLead(selectedLead.id)}
              >
                <Trash2 className="h-4 w-4" />
                حذف
              </Button>
            </div>
          </>
        )}
      </DetailDialog>

      {/* P2.4.d — shared canonical-link dialog. Mounted at the root of
          SubmissionsTabs so it can sit above the detail dialog without
          modal-stacking issues. `selectedApplication` may be null when
          the dialog is closed; we render conditionally to avoid mounting
          the preview fetch on a stale or missing id. */}
      {selectedApplication && (
        <LinkCanonicalDialog
          kind="application"
          sourceId={selectedApplication.id}
          sourceName={selectedApplication.name}
          open={linkCanonicalOpen}
          onOpenChange={setLinkCanonicalOpen}
        />
      )}
    </div>
  )
}

/* ─── Shared Sub-Components ─── */

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description: string
}) {
  return (
    <div className="admin-card flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/30">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-[13px] font-semibold text-muted-foreground">{title}</p>
      <p className="mt-1.5 max-w-xs text-[12px] text-muted-foreground">
        {description}
      </p>
    </div>
  )
}

function DetailField({
  label,
  value,
  copyable,
  onCopy,
  copied,
}: {
  label: string
  value: string
  copyable?: boolean
  onCopy?: () => void
  copied?: boolean
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {copyable ? (
        <button
          onClick={onCopy}
          className="flex items-center gap-2 text-sm transition-colors hover:text-primary"
        >
          {value}
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-700" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{value}</p>
      )}
    </div>
  )
}

const PREP_STATUS_CONFIG: Record<GuestPrepFormStatus, { label: string; color: string; bg: string }> = {
  pending: { label: "بانتظار الرد", color: "text-blue-700", bg: "bg-blue-500/10" },
  submitted: { label: "تم الإرسال", color: "text-emerald-700", bg: "bg-emerald-500/10" },
  locked: { label: "مقفل", color: "text-amber-700", bg: "bg-amber-500/10" },
  revoked: { label: "ملغي", color: "text-red-700", bg: "bg-red-500/10" },
}

function PrepFormStatusBadge({ status }: { status: GuestPrepFormStatus }) {
  const cfg = PREP_STATUS_CONFIG[status]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${cfg.color} ${cfg.bg}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "pending" ? "animate-pulse bg-blue-400" : status === "submitted" ? "bg-emerald-400" : status === "locked" ? "bg-amber-400" : "bg-red-400"}`} />
      {cfg.label}
    </span>
  )
}

const DAY_LABELS: Record<string, string> = {
  sunday: "الأحد", monday: "الاثنين", tuesday: "الثلاثاء",
  wednesday: "الأربعاء", thursday: "الخميس", saturday: "السبت",
}
const TIME_LABELS: Record<string, string> = {
  morning: "صباحاً (٩–١٢)", afternoon: "ظهراً (١٢–٤)", evening: "مساءً (٤–٨)",
}

function PrepResponseDisplay({ response }: { response: GuestPrepResponse }) {
  return (
    <div className="rounded-2xl bg-white/[0.02] p-5 ring-1 ring-border/20 space-y-4">
      <h5 className="text-xs font-semibold text-muted-foreground">الإجابات المقدمة</h5>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        <PrepField label="الاسم المفضل" value={response.preferred_name} />
        {response.pronunciation_notes && <PrepField label="ملاحظات النطق" value={response.pronunciation_notes} />}
        <PrepField label="الهاتف / واتساب" value={response.phone_whatsapp} />
        <PrepField label="المشروب المفضل" value={response.preferred_drink} />
        <PrepField label="أيام التصوير" value={response.preferred_filming_days.map((d) => DAY_LABELS[d] || d).join("، ")} />
        <PrepField label="وقت التصوير" value={TIME_LABELS[response.preferred_filming_time] || response.preferred_filming_time} />
      </div>
      {response.scheduling_restrictions && <PrepField label="قيود المواعيد" value={response.scheduling_restrictions} />}
      {response.technical_needs && <PrepField label="احتياجات تقنية" value={response.technical_needs} />}
      <PrepField label="مواضيع يتحمس لها" value={response.topics_excited_about} />
      {response.sensitivities_to_avoid && <PrepField label="مواضيع يفضّل تجنبها" value={response.sensitivities_to_avoid} />}
      {response.team_notes && <PrepField label="ملاحظات للفريق" value={response.team_notes} />}
      {/* Social accounts */}
      {response.social_accounts && Object.entries(response.social_accounts).some(([, v]) => v) && (
        <div>
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">حسابات التواصل</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(response.social_accounts).map(([platform, handle]) =>
              handle ? (
                <span key={platform} className="rounded-md bg-muted/20 px-2 py-0.5 text-[11px] text-muted-foreground" dir="ltr">
                  {platform}: {handle}
                </span>
              ) : null
            )}
          </div>
        </div>
      )}
      <div className="flex gap-4 text-[11px]">
        <span className={response.arrival_confirmation ? "text-emerald-700" : "text-red-700"}>
          {response.arrival_confirmation ? "✓" : "✗"} الحضور المبكر
        </span>
        <span className={response.clothing_acknowledgment ? "text-emerald-700" : "text-muted-foreground"}>
          {response.clothing_acknowledgment ? "✓" : "–"} إرشادات الملابس
        </span>
        <span className={response.location_confirmation ? "text-emerald-700" : "text-red-700"}>
          {response.location_confirmation ? "✓" : "✗"} تأكيد الموقع
        </span>
      </div>
    </div>
  )
}

function PrepField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed">{value}</p>
    </div>
  )
}
