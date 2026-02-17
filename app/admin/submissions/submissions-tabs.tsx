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
} from "lucide-react"
import type {
  GuestApplication,
  GuestApplicationStatus,
  SponsorshipLead,
  SponsorshipStatus,
  NewsletterSubscriber,
} from "@/types/database"
import type { MediaKitConfig, AnalyticsConfig } from "@/types/media-kit"

/* ─── Status Helpers ─── */

const STATUS_CONFIG: Record<
  GuestApplicationStatus,
  { label: string; color: string; bg: string; ring: string }
> = {
  new: {
    label: "جديد",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    ring: "ring-blue-500/20",
  },
  under_review: {
    label: "قيد المراجعة",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/20",
  },
  accepted: {
    label: "مقبول",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/20",
  },
  rejected: {
    label: "معتذر",
    color: "text-red-400",
    bg: "bg-red-500/10",
    ring: "ring-red-500/20",
  },
  consider_later: {
    label: "للاحتفاظ",
    color: "text-purple-400",
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
    color: "text-blue-400",
    bg: "bg-blue-500/10",
    ring: "ring-blue-500/20",
  },
  reviewing: {
    label: "قيد المراجعة",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/20",
  },
  proposal_sent: {
    label: "تم إرسال العرض",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    ring: "ring-cyan-500/20",
  },
  negotiation: {
    label: "تفاوض",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    ring: "ring-orange-500/20",
  },
  confirmed: {
    label: "مؤكد",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/20",
  },
  declined: {
    label: "معتذر",
    color: "text-red-400",
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
        className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute end-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-2xl shadow-black/20 backdrop-blur-xl"
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
      className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-all ${
        variant === "danger"
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground hover:bg-white/5"
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
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-border/50 bg-card/95 shadow-2xl shadow-black/30 backdrop-blur-xl"
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
        className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium ring-1 transition-all ${config.bg} ${config.color} ${config.ring}`}
      >
        {config.label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-2xl shadow-black/20 backdrop-blur-xl">
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
                  className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-all hover:bg-white/5 ${
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
        className={`flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-medium ring-1 transition-all ${config.bg} ${config.color} ${config.ring}`}
      >
        {config.label}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute end-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-2xl border border-border/50 bg-card/95 shadow-2xl shadow-black/20 backdrop-blur-xl">
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
                  className={`flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-all hover:bg-white/5 ${
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

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

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
    green: "text-emerald-500 bg-emerald-500/10",
  }

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-medium transition-all ${
        active
          ? "bg-white/[0.06] text-foreground ring-1 ring-border/50"
          : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
      }`}
    >
      <div
        className={`flex h-8 w-8 items-center justify-center rounded-xl ${
          active ? colorMap[color] : "bg-white/[0.03]"
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">{shortLabel}</span>
      {count > 0 && (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${
            active
              ? "bg-primary/10 text-primary"
              : "bg-white/[0.04] text-muted-foreground"
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
      <p className="whitespace-pre-wrap rounded-xl bg-white/[0.02] px-4 py-3 text-sm leading-[1.8] ring-1 ring-border/15">
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
}

export function SubmissionsTabs({
  guestApplications: initialGuestApps,
  sponsorshipLeads: initialSponsors,
  newsletterSubscribers: initialSubscribers,
}: SubmissionsTabsProps) {
  const searchParams = useSearchParams()
  const defaultTab = searchParams.get("tab") || "guests"

  const [activeTab, setActiveTab] = useState(defaultTab)
  const [search, setSearch] = useState("")

  const [guestApplications, setGuestApplications] = useState(initialGuestApps)
  const [sponsorshipLeads, setSponsorshipLeads] = useState(initialSponsors)
  const [newsletterSubscribers, setNewsletterSubscribers] =
    useState(initialSubscribers)

  const [selectedApplication, setSelectedApplication] =
    useState<GuestApplication | null>(null)
  const [selectedLead, setSelectedLead] = useState<SponsorshipLead | null>(null)
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const printRef = useRef<HTMLDivElement>(null)

  // Response message state
  const [messageType, setMessageType] = useState<"acceptance" | "rejection">(
    "acceptance"
  )
  const [messageTone, setMessageTone] = useState<"formal" | "warm">("formal")
  const [messageText, setMessageText] = useState("")
  const [messageCopied, setMessageCopied] = useState<
    "whatsapp" | "email" | null
  >(null)

  // Regenerate message when application, type, or tone changes
  useEffect(() => {
    if (selectedApplication) {
      const name = selectedApplication.name
      if (messageType === "acceptance") {
        setMessageText(generateAcceptanceMessage(name, messageTone))
      } else {
        setMessageText(generateRejectionMessage(name, messageTone))
      }
      setMessageCopied(null)
    }
  }, [selectedApplication, messageType, messageTone])

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

  const copyForEmail = async () => {
    await navigator.clipboard.writeText(messageText)
    setMessageCopied("email")
    setTimeout(() => setMessageCopied(null), 2500)

    if (selectedApplication) {
      const subject = encodeURIComponent(
        messageType === "acceptance"
          ? "بودكاست خط — دعوة ضيف"
          : "بودكاست خط — تحديث بخصوص طلبك"
      )
      const body = encodeURIComponent(messageText)
      const a = document.createElement("a")
      a.href = `mailto:${selectedApplication.email}?subject=${subject}&body=${body}`
      a.click()
    }
  }

  const copyEmail = async (email: string) => {
    await navigator.clipboard.writeText(email)
    setCopiedEmail(email)
    setTimeout(() => setCopiedEmail(null), 2000)
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

  <div class="footer">بودكاست خط · khatpodcast.com · تم التصدير ${new Date().toLocaleDateString("ar-u-ca-gregory")}</div>
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

  const totalSubmissions =
    guestApplications.length +
    sponsorshipLeads.length +
    newsletterSubscribers.length

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div>
        <h1 className="text-xl font-bold">الطلبات والاشتراكات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مراجعة طلبات الضيوف والرعاية ومشتركي النشرة البريدية
        </p>
      </div>

      {/* ─── Stats Grid ─── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
                <Mail className="h-5 w-5 text-emerald-500" />
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
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-border/30 bg-card/50 p-2 backdrop-blur-sm">
        <TabButton active={activeTab === "guests"} icon={UserPlus} label="طلبات الضيوف" shortLabel="الضيوف" count={guestApplications.length} onClick={() => setActiveTab("guests")} color="purple" />
        <TabButton active={activeTab === "sponsors"} icon={Handshake} label="طلبات الرعاية" shortLabel="الرعاية" count={sponsorshipLeads.length} onClick={() => setActiveTab("sponsors")} color="primary" />
        <TabButton active={activeTab === "newsletter"} icon={Mail} label="المشتركين" shortLabel="النشرة" count={newsletterSubscribers.length} onClick={() => setActiveTab("newsletter")} color="green" />
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
                : "ابحث بالبريد الإلكتروني..."
          }
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-12 rounded-2xl border-border/50 bg-card/80 ps-11 text-sm backdrop-blur-sm transition-all focus:border-primary/50 focus:bg-card"
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
                    className="group relative overflow-hidden rounded-2xl border border-border/30 bg-card/50 backdrop-blur-sm transition-all hover:border-border/60 hover:bg-card/80"
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
                                <Check className="h-3 w-3 text-emerald-500" />
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
                            <MapPin className="h-3 w-3 text-muted-foreground/50" />
                            <span className="text-[10px] text-muted-foreground">{app.country}</span>
                          </div>
                        )}
                        {app.previous_podcast && (
                          <div className="flex items-center gap-1.5 rounded-lg bg-accent/[0.06] px-2.5 py-1 ring-1 ring-accent/15">
                            <Mic className="h-3 w-3 text-accent/60" />
                            <span className="text-[10px] text-accent/80">ضيف سابق</span>
                          </div>
                        )}
                      </div>

                      {/* Story preview */}
                      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground/70">
                        {app.story_idea}
                      </p>

                      {/* Footer */}
                      <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
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
                              {copiedEmail === lead.email ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
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
                          <Building2 className="h-3 w-3 text-muted-foreground/50" />
                          <span className="text-[10px] text-muted-foreground">{lead.industry}</span>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/[0.06] px-2.5 py-1 ring-1 ring-emerald-500/15">
                          <span className="text-[10px] text-emerald-500/80">{BUDGET_LABELS[lead.budget_range] || lead.budget_range}</span>
                        </div>
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

                      <div className="mt-4 flex items-center gap-1.5 text-[10px] text-muted-foreground/50">
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
                      <Mail className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div>
                      <button onClick={() => copyEmail(subscriber.email)} className="flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary">
                        {subscriber.email}
                        {copiedEmail === subscriber.email ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />}
                      </button>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/50">{timeAgo(subscriber.created_at)}</p>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteSubscriber(subscriber.id)} disabled={deletingIds.has(subscriber.id)} className="flex h-8 w-8 items-center justify-center rounded-xl text-muted-foreground/40 opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
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
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-500">
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
                        ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                        : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                    }`}
                  >
                    <CircleCheck className="h-3.5 w-3.5" />
                    قبول
                  </button>
                  <button
                    onClick={() => setMessageType("rejection")}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition-all ${
                      messageType === "rejection"
                        ? "bg-red-500/10 text-red-400 ring-1 ring-red-500/20"
                        : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                    }`}
                  >
                    <CircleX className="h-3.5 w-3.5" />
                    اعتذار
                  </button>
                </div>

                {/* Tone Toggle */}
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] text-muted-foreground/60">نبرة الرسالة</p>
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
                <p className="mt-1.5 text-[10px] text-muted-foreground/40">يمكنك تعديل الرسالة قبل النسخ</p>

                {/* Copy Buttons */}
                <div className="mt-3 flex gap-2">
                  <button
                    onClick={copyForWhatsApp}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all ${
                      messageCopied === "whatsapp"
                        ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
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
                    onClick={copyForEmail}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-medium transition-all ${
                      messageCopied === "email"
                        ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20"
                        : "bg-white/[0.03] text-muted-foreground ring-1 ring-border/30 hover:bg-white/[0.06] hover:text-foreground"
                    }`}
                  >
                    {messageCopied === "email" ? (
                      <><Check className="h-3.5 w-3.5" />تم النسخ</>
                    ) : (
                      <><Mail className="h-3.5 w-3.5" />نسخ للبريد</>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 flex gap-3 rounded-b-3xl border-t border-border/30 bg-card/95 px-8 py-4 backdrop-blur-xl">
              <Button
                variant="ghost"
                className="flex-1 gap-2 rounded-xl"
                onClick={() => {
                  window.location.href = `mailto:${selectedApplication.email}?subject=بودكاست خط - طلب الظهور كضيف`
                }}
              >
                <Mail className="h-4 w-4" />
                إرسال بريد
              </Button>
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
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 text-xs font-bold text-emerald-500">
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
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500/10 text-xs font-bold text-amber-500">
                    ٤
                  </div>
                  <h4 className="text-sm font-semibold">الميزانية</h4>
                </div>
                <div className="rounded-2xl bg-amber-500/[0.04] p-5 ring-1 ring-amber-500/15">
                  <p className="text-xs font-medium text-muted-foreground mb-1">نطاق الميزانية</p>
                  <p className="text-lg font-bold text-amber-500">
                    {BUDGET_LABELS[selectedLead.budget_range] || selectedLead.budget_range}
                  </p>
                </div>
              </div>

              {/* Section 5: Additional Info */}
              {selectedLead.additional_info && (
                <div>
                  <div className="mb-4 flex items-center gap-2.5">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/10 text-xs font-bold text-purple-500">
                      ٥
                    </div>
                    <h4 className="text-sm font-semibold">معلومات إضافية</h4>
                  </div>
                  <div className="rounded-2xl bg-white/[0.02] p-5 ring-1 ring-border/20">
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{selectedLead.additional_info}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 flex gap-3 rounded-b-3xl border-t border-border/30 bg-card/95 px-8 py-4 backdrop-blur-xl">
              <Button
                variant="ghost"
                className="flex-1 gap-2 rounded-xl"
                onClick={() => {
                  window.location.href = `mailto:${selectedLead.email}?subject=بودكاست خط - طلب الشراكة`
                }}
              >
                <Mail className="h-4 w-4" />
                إرسال بريد
              </Button>
              <Button
                variant="outline"
                className="gap-2 rounded-xl"
                onClick={async () => {
                  try {
                    const [mkRes, anRes] = await Promise.all([
                      fetch("/api/admin/media-kit"),
                      fetch("/api/admin/analytics"),
                    ])
                    const mediaKit = (await mkRes.json()) as MediaKitConfig
                    const analytics = (await anRes.json()) as AnalyticsConfig
                    const date = new Date().toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
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
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/[0.03] ring-1 ring-border/50">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-base font-semibold text-muted-foreground">{title}</p>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground/60">
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
            <Check className="h-3.5 w-3.5 text-emerald-500" />
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
