"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowRight,
  Pencil,
  Archive,
  Trash2,
  Sparkles,
  Plus,
  Link as LinkIcon,
  X,
  ExternalLink,
  Clock,
  MapPin,
  Loader2,
  Globe,
  Instagram,
  Youtube,
  Linkedin,
  Mail,
  ClipboardList,
  FileText,
} from "lucide-react"
import { useToast } from "@/lib/use-toast"
import { formatDate, formatDateTime } from "@/lib/shared/formatters"
import { CandidateFormDialog } from "../components/candidate-form-dialog"
import { LinkCanonicalDialog } from "../components/link-canonical-dialog"
import { OutreachPanel } from "../components/outreach-panel"
import { PrepLinkPanel } from "../components/prep-link-panel"
import { ResponseViewer } from "../components/response-viewer"
import { STATUS_META, STATUS_OPTIONS, PRIORITY_META, CATEGORY_OPTIONS } from "../lib/status"
import { candidatesApi } from "../lib/api"
import type {
  GuestCandidateView,
  GuestCandidateStatus,
  GuestCandidateOutreachMessage,
  PrepFormLink,
  PrepFormResponse,
  PrepFormTemplate,
} from "@/types/database"
import { XIcon } from "@/components/icons/x-icon"
import { TikTokIcon } from "@/components/icons/tiktok-icon"

interface StatusHistoryEntry {
  id: string
  candidate_id: string
  old_status: string | null
  new_status: string
  changed_by: string | null
  change_note: string | null
  created_at: string
}

interface Props {
  candidate: GuestCandidateView
  statusHistory: StatusHistoryEntry[]
  outreachMessages: GuestCandidateOutreachMessage[]
  prepLinks: PrepFormLink[]
  prepResponses: PrepFormResponse[]
  templates: PrepFormTemplate[]
}

const SOCIAL_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "x", label: "X / Twitter" },
  { value: "youtube", label: "YouTube" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "tiktok", label: "TikTok" },
  { value: "website", label: "موقع شخصي" },
  { value: "other", label: "أخرى" },
]

function platformIcon(platform: string) {
  switch (platform) {
    case "instagram": return <Instagram className="h-4 w-4" />
    case "x": case "twitter": return <XIcon className="h-4 w-4" />
    case "youtube": return <Youtube className="h-4 w-4" />
    case "linkedin": return <Linkedin className="h-4 w-4" />
    case "tiktok": return <TikTokIcon className="h-4 w-4" />
    case "website": return <Globe className="h-4 w-4" />
    default: return <LinkIcon className="h-4 w-4" />
  }
}

export function CandidateDetailClient({ candidate, statusHistory, outreachMessages, prepLinks, prepResponses, templates }: Props) {
  const router = useRouter()
  const { toast } = useToast()

  const [editOpen, setEditOpen] = useState(false)
  const [linkCanonicalOpen, setLinkCanonicalOpen] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [archiveBusy, setArchiveBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const [showLinkForm, setShowLinkForm] = useState(false)
  const [newLinkPlatform, setNewLinkPlatform] = useState("instagram")
  const [newLinkUrl, setNewLinkUrl] = useState("")
  const [newLinkLabel, setNewLinkLabel] = useState("")
  const [linkBusy, setLinkBusy] = useState(false)

  const [analyzeBusy, setAnalyzeBusy] = useState(false)

  const status = STATUS_META[candidate.status]
  const priority = candidate.priority_level ? PRIORITY_META[candidate.priority_level] : null
  const isArchived = !!candidate.archived_at

  async function handleStatusChange(newStatus: GuestCandidateStatus) {
    if (newStatus === candidate.status) return
    setStatusBusy(true)
    try {
      await candidatesApi.changeStatus(candidate.id, newStatus)
      toast({ title: "تم تغيير الحالة", description: STATUS_META[newStatus].label })
      router.refresh()
    } catch (err) {
      toast({ variant: "destructive", title: "فشل التغيير", description: err instanceof Error ? err.message : "خطأ غير متوقع" })
    } finally {
      setStatusBusy(false)
    }
  }

  async function handleArchive() {
    if (!confirm(isArchived ? "إعادة المرشح من الأرشيف؟" : "أرشفة المرشح؟ يمكن استعادته لاحقاً.")) return
    setArchiveBusy(true)
    try {
      if (isArchived) await candidatesApi.unarchive(candidate.id)
      else await candidatesApi.archive(candidate.id)
      toast({ title: isArchived ? "تم الاستعادة" : "تم الأرشفة" })
      router.push("/admin/guest-candidates")
      router.refresh()
    } catch (err) {
      toast({ variant: "destructive", title: "فشلت العملية", description: err instanceof Error ? err.message : "خطأ" })
    } finally {
      setArchiveBusy(false)
    }
  }

  async function handleDelete() {
    if (!confirm("حذف المرشح نهائياً؟ هذا الإجراء لا يمكن التراجع عنه.")) return
    setDeleteBusy(true)
    try {
      await candidatesApi.remove(candidate.id)
      toast({ title: "تم الحذف" })
      router.push("/admin/guest-candidates")
      router.refresh()
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الحذف", description: err instanceof Error ? err.message : "خطأ" })
    } finally {
      setDeleteBusy(false)
    }
  }

  async function handleAddLink() {
    if (!newLinkUrl.trim()) return
    try { new URL(newLinkUrl) } catch {
      toast({ variant: "destructive", title: "رابط غير صالح" })
      return
    }
    setLinkBusy(true)
    try {
      await candidatesApi.addSocialLink(candidate.id, {
        platform: newLinkPlatform,
        url: newLinkUrl.trim(),
        label: newLinkLabel.trim() || undefined,
      })
      toast({ title: "تمت إضافة الرابط" })
      setNewLinkUrl("")
      setNewLinkLabel("")
      setShowLinkForm(false)
      router.refresh()
    } catch (err) {
      toast({ variant: "destructive", title: "فشلت الإضافة", description: err instanceof Error ? err.message : "خطأ" })
    } finally {
      setLinkBusy(false)
    }
  }

  async function handleDeleteLink(linkId: string) {
    if (!confirm("حذف هذا الرابط؟")) return
    try {
      await candidatesApi.deleteSocialLink(candidate.id, linkId)
      toast({ title: "تم الحذف" })
      router.refresh()
    } catch (err) {
      toast({ variant: "destructive", title: "فشل الحذف", description: err instanceof Error ? err.message : "خطأ" })
    }
  }

  async function handleAnalyze() {
    setAnalyzeBusy(true)
    try {
      await candidatesApi.analyze(candidate.id)
      toast({ title: "تم التحليل", description: "تم توليد تحليل ذكي جديد للمرشح" })
      router.refresh()
    } catch (err) {
      toast({ variant: "destructive", title: "فشل التحليل", description: err instanceof Error ? err.message : "خطأ" })
    } finally {
      setAnalyzeBusy(false)
    }
  }

  const initials = candidate.full_name.trim().slice(0, 2)
  const categoryLabel = CATEGORY_OPTIONS.find((c) => c.value === candidate.category)?.label || candidate.category

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <Link
          href="/admin/guest-candidates"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-3.5 w-3.5 rtl:rotate-180" />
          العودة إلى المرشحين
        </Link>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLinkCanonicalOpen(true)}>
            <LinkIcon className="ms-1 h-3.5 w-3.5" /> ربط بضيف قانوني
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="ms-1 h-3.5 w-3.5" /> تعديل
          </Button>
          <Button variant="ghost" size="sm" onClick={handleArchive} disabled={archiveBusy}>
            {archiveBusy ? <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" /> : <Archive className="ms-1 h-3.5 w-3.5" />}
            {isArchived ? "إعادة من الأرشيف" : "أرشفة"}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleteBusy} className="text-rose-500 hover:text-rose-600 hover:bg-rose-500/10">
            {deleteBusy ? <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="ms-1 h-3.5 w-3.5" />}
            حذف
          </Button>
        </div>
      </div>

      {/* Header card */}
      <div className="rounded-2xl border border-border/40 bg-card/40 p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-lg font-bold text-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{candidate.display_name || candidate.full_name}</h1>
              <span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${status.badgeClass}`}>
                {status.label}
              </span>
              {priority && (
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${priority.badgeClass}`}>
                  {priority.label}
                </span>
              )}
              {isArchived && (
                <span className="rounded bg-stone-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-stone-600 dark:text-stone-400">
                  مؤرشف
                </span>
              )}
            </div>
            {candidate.display_name && candidate.display_name !== candidate.full_name && (
              <p className="mt-0.5 text-xs text-muted-foreground">{candidate.full_name}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground/70">
              {(candidate.city || candidate.country) && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {[candidate.city, candidate.country].filter(Boolean).join("، ")}
                </span>
              )}
              {categoryLabel && <span>{categoryLabel}</span>}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                أُضيف {formatDate(candidate.created_at)}
              </span>
            </div>
            {candidate.bio && (
              <p className="mt-3 text-sm leading-relaxed text-foreground/80">{candidate.bio}</p>
            )}
          </div>
        </div>

        {/* Status changer */}
        <div className="mt-5 border-t border-border/30 pt-4">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
            <span>تغيير الحالة:</span>
            {statusBusy && <Loader2 className="h-3 w-3 animate-spin" />}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleStatusChange(s)}
                disabled={statusBusy || s === candidate.status}
                className={`rounded px-2 py-1 text-[10px] font-medium transition-all ${
                  s === candidate.status
                    ? `${STATUS_META[s].badgeClass} ring-1 ring-current/30 cursor-default`
                    : "border border-border/40 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {STATUS_META[s].label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Left column: details + social */}
        <div className="space-y-4 lg:col-span-2">
          {/* Social links */}
          <Section title="الروابط الاجتماعية" icon={<LinkIcon className="h-4 w-4" />}>
            {candidate.social_links.length === 0 && !showLinkForm ? (
              <div className="rounded-lg border border-dashed border-border/40 p-6 text-center">
                <p className="mb-3 text-xs text-muted-foreground">لا توجد روابط مضافة</p>
                <Button size="sm" variant="ghost" onClick={() => setShowLinkForm(true)}>
                  <Plus className="ms-1 h-3.5 w-3.5" /> إضافة رابط
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {candidate.social_links.map((link) => (
                  <div key={link.id} className="flex items-center gap-3 rounded-lg border border-border/30 bg-background/30 p-2.5">
                    <span className="text-muted-foreground/70">{platformIcon(link.platform)}</span>
                    <a
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-xs hover:text-primary"
                    >
                      {link.label || link.url}
                    </a>
                    <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground/50 hover:text-foreground">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      onClick={() => handleDeleteLink(link.id)}
                      className="text-muted-foreground/50 hover:text-rose-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {showLinkForm && (
                  <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-2">
                    <div className="flex gap-2">
                      <select
                        value={newLinkPlatform}
                        onChange={(e) => setNewLinkPlatform(e.target.value)}
                        className="h-8 w-32 rounded-md border border-input bg-transparent px-2 text-xs"
                      >
                        {SOCIAL_PLATFORMS.map((p) => (
                          <option key={p.value} value={p.value}>{p.label}</option>
                        ))}
                      </select>
                      <Input
                        value={newLinkUrl}
                        onChange={(e) => setNewLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="h-8 flex-1 text-xs"
                      />
                    </div>
                    <Input
                      value={newLinkLabel}
                      onChange={(e) => setNewLinkLabel(e.target.value)}
                      placeholder="تسمية اختيارية"
                      className="h-8 text-xs"
                    />
                    <div className="flex justify-end gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setShowLinkForm(false); setNewLinkUrl(""); setNewLinkLabel("") }}>
                        إلغاء
                      </Button>
                      <Button size="sm" onClick={handleAddLink} disabled={linkBusy || !newLinkUrl.trim()}>
                        {linkBusy && <Loader2 className="ms-1 h-3 w-3 animate-spin" />}
                        إضافة
                      </Button>
                    </div>
                  </div>
                )}
                {!showLinkForm && (
                  <Button size="sm" variant="ghost" onClick={() => setShowLinkForm(true)} className="w-full text-xs">
                    <Plus className="ms-1 h-3 w-3" /> إضافة رابط
                  </Button>
                )}
              </div>
            )}
          </Section>

          {/* AI analysis */}
          <Section
            title="التحليل بالذكاء الاصطناعي"
            icon={<Sparkles className="h-4 w-4 text-violet-500" />}
            badge={candidate.ai_generated_at ? formatDate(candidate.ai_generated_at) : undefined}
            action={
              <Button size="sm" variant="ghost" onClick={handleAnalyze} disabled={analyzeBusy} className="h-7 text-xs">
                {analyzeBusy ? <Loader2 className="ms-1 h-3 w-3 animate-spin" /> : <Sparkles className="ms-1 h-3 w-3" />}
                {candidate.ai_summary ? "إعادة التحليل" : "تحليل الآن"}
              </Button>
            }
          >
            {candidate.ai_summary ? (
              <div className="space-y-4">
                {/* Scores grid */}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <ScorePill label="عام" value={candidate.ai_score_overall} accent="violet" highlight />
                  <ScorePill label="ملاءمة" value={candidate.ai_fit_score} accent="emerald" />
                  <ScorePill label="عمق" value={candidate.ai_depth_score} accent="blue" />
                  <ScorePill label="انتشار" value={candidate.ai_reach_score} accent="amber" />
                  <ScorePill label="مخاطر" value={candidate.ai_risk_score} accent="rose" inverted />
                </div>

                {/* Summary */}
                <div className="rounded-lg bg-violet-500/5 p-3">
                  <p className="text-sm leading-relaxed text-foreground/85">{candidate.ai_summary}</p>
                  {candidate.ai_reason_to_invite && (
                    <p className="mt-2 border-t border-violet-500/20 pt-2 text-xs italic text-violet-700 dark:text-violet-300">
                      <strong>سبب الدعوة:</strong> {candidate.ai_reason_to_invite}
                    </p>
                  )}
                </div>

                {/* Strengths + Weaknesses side-by-side */}
                <div className="grid gap-3 sm:grid-cols-2">
                  {(candidate.ai_strengths?.length ?? 0) > 0 && (
                    <div>
                      <h4 className="mb-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">نقاط القوة</h4>
                      <ul className="space-y-1 text-xs text-foreground/80">
                        {candidate.ai_strengths!.map((s, i) => <li key={i}>• {s}</li>)}
                      </ul>
                    </div>
                  )}
                  {(candidate.ai_weaknesses?.length ?? 0) > 0 && (
                    <div>
                      <h4 className="mb-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">نقاط الضعف</h4>
                      <ul className="space-y-1 text-xs text-foreground/80">
                        {candidate.ai_weaknesses!.map((s, i) => <li key={i}>• {s}</li>)}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Risk notes */}
                {candidate.ai_risk_notes && (
                  <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                    <h4 className="mb-1 text-[11px] font-semibold text-rose-700 dark:text-rose-400">مخاطر محتملة</h4>
                    <p className="text-xs text-foreground/80">{candidate.ai_risk_notes}</p>
                  </div>
                )}

                {/* Topics */}
                {(candidate.ai_topics_json?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-[11px] font-semibold text-muted-foreground">المواضيع المقترحة</h4>
                    <div className="flex flex-wrap gap-1.5">
                      {candidate.ai_topics_json!.map((topic, i) => (
                        <span key={i} className="rounded-md bg-muted/60 px-2 py-0.5 text-[10px] text-foreground/80">
                          {topic}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conversation angles */}
                {(candidate.ai_conversation_angles_json?.length ?? 0) > 0 && (
                  <div>
                    <h4 className="mb-1.5 text-[11px] font-semibold text-muted-foreground">زوايا الحوار</h4>
                    <ul className="space-y-1 text-xs text-foreground/80">
                      {candidate.ai_conversation_angles_json!.map((a, i) => <li key={i}>• {a}</li>)}
                    </ul>
                  </div>
                )}

                {/* Suggested questions */}
                {candidate.ai_suggested_questions_json && (
                  <details className="rounded-lg border border-border/30 bg-background/30 p-3">
                    <summary className="cursor-pointer text-[11px] font-semibold text-muted-foreground hover:text-foreground">
                      الأسئلة المقترحة
                    </summary>
                    <div className="mt-3 space-y-3">
                      <QuestionGroup label="افتتاحية" questions={candidate.ai_suggested_questions_json.opening} />
                      <QuestionGroup label="عميقة" questions={candidate.ai_suggested_questions_json.deep} />
                      <QuestionGroup label="صعبة / مواجهة" questions={candidate.ai_suggested_questions_json.hard} />
                      <QuestionGroup label="عاطفية" questions={candidate.ai_suggested_questions_json.emotional} />
                    </div>
                  </details>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-violet-500/20 bg-violet-500/5 p-6 text-center">
                <Sparkles className="mx-auto mb-2 h-6 w-6 text-violet-500/70" />
                <p className="mb-3 text-xs text-muted-foreground">
                  لم يتم توليد تحليل بعد. اضغط "تحليل الآن" لتقييم المرشح بناءً على ملفه وروابطه.
                </p>
                <Button size="sm" onClick={handleAnalyze} disabled={analyzeBusy}>
                  {analyzeBusy && <Loader2 className="ms-1 h-3.5 w-3.5 animate-spin" />}
                  <Sparkles className="ms-1 h-3.5 w-3.5" />
                  تحليل بالذكاء الاصطناعي
                </Button>
              </div>
            )}
          </Section>

          {/* Outreach */}
          <Section title="رسائل التواصل" icon={<Mail className="h-4 w-4 text-sky-500" />}>
            <OutreachPanel
              candidateId={candidate.id}
              initialMessages={outreachMessages}
              onChange={() => router.refresh()}
            />
          </Section>

          {/* Prep links */}
          <Section title="نموذج التحضير" icon={<ClipboardList className="h-4 w-4 text-violet-500" />}>
            <PrepLinkPanel
              candidateId={candidate.id}
              initialLinks={prepLinks}
              onChange={() => router.refresh()}
            />
          </Section>

          {/* Prep responses */}
          {prepResponses.length > 0 && (
            <Section
              title="إجابات الضيف"
              icon={<FileText className="h-4 w-4 text-emerald-500" />}
              badge={`${prepResponses.length}`}
            >
              <ResponseViewer responses={prepResponses} prepLinks={prepLinks} templates={templates} />
            </Section>
          )}

          {candidate.notes_internal && (
            <Section title="ملاحظات داخلية" icon={<Pencil className="h-4 w-4" />}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">{candidate.notes_internal}</p>
            </Section>
          )}
        </div>

        {/* Right column: meta + history */}
        <div className="space-y-4">
          <Section title="المعلومات">
            <dl className="space-y-2 text-xs">
              <DetailRow label="المصدر" value={candidate.source_type === "manual" ? "إضافة يدوية" : candidate.source_type || "—"} />
              {candidate.source_note && <DetailRow label="ملاحظة المصدر" value={candidate.source_note} />}
              <DetailRow label="اللغة" value={candidate.primary_language === "ar" ? "العربية" : candidate.primary_language || "—"} />
              <DetailRow label="آخر تحديث" value={formatDateTime(candidate.updated_at)} />
              {candidate.last_contacted_at && (
                <DetailRow label="آخر تواصل" value={formatDateTime(candidate.last_contacted_at)} />
              )}
            </dl>
          </Section>

          <Section title="سجل الحالات">
            {statusHistory.length === 0 ? (
              <p className="text-xs text-muted-foreground">لا يوجد سجل بعد</p>
            ) : (
              <ol className="space-y-2.5">
                {statusHistory.map((h) => {
                  const fromMeta = h.old_status ? STATUS_META[h.old_status as GuestCandidateStatus] : null
                  const toMeta = STATUS_META[h.new_status as GuestCandidateStatus]
                  return (
                    <li key={h.id} className="border-r-2 border-primary/20 ps-3 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        {fromMeta && (
                          <>
                            <span className="text-muted-foreground/60">{fromMeta.label}</span>
                            <span className="text-muted-foreground/40">←</span>
                          </>
                        )}
                        <span className="font-semibold">{toMeta?.label || h.new_status}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground/60">
                        {formatDateTime(h.created_at)}
                      </div>
                      {h.change_note && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground/80">{h.change_note}</div>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </Section>
        </div>
      </div>

      <CandidateFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        candidate={candidate}
        onSuccess={() => router.refresh()}
      />

      <LinkCanonicalDialog
        kind="candidate"
        sourceId={candidate.id}
        sourceName={candidate.display_name || candidate.full_name}
        open={linkCanonicalOpen}
        onOpenChange={setLinkCanonicalOpen}
      />
    </div>
  )
}

function Section({ title, icon, badge, action, children }: { title: string; icon?: React.ReactNode; badge?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/40 bg-card/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-xs font-semibold">{title}</h3>
          {badge && (
            <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  )
}

function ScorePill({
  label,
  value,
  accent,
  highlight,
  inverted,
}: {
  label: string
  value: number | null
  accent: "violet" | "emerald" | "blue" | "amber" | "rose"
  highlight?: boolean
  inverted?: boolean
}) {
  const accentClasses = {
    violet: "bg-violet-500/10 text-violet-700 dark:text-violet-300 ring-violet-500/20",
    emerald: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-700 dark:text-blue-300 ring-blue-500/20",
    amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 ring-amber-500/20",
    rose: "bg-rose-500/10 text-rose-700 dark:text-rose-300 ring-rose-500/20",
  }
  const display = value === null || value === undefined ? "—" : value.toFixed(1)
  return (
    <div className={`rounded-lg ${accentClasses[accent]} ${highlight ? "ring-1" : ""} p-2 text-center`}>
      <div className="text-[9px] font-medium opacity-80">{label}</div>
      <div className="text-lg font-bold leading-tight">{display}</div>
      {inverted && <div className="text-[8px] opacity-60">(أقل = أفضل)</div>}
    </div>
  )
}

function QuestionGroup({ label, questions }: { label: string; questions?: string[] }) {
  if (!questions || questions.length === 0) return null
  return (
    <div>
      <h5 className="mb-1 text-[10px] font-semibold text-muted-foreground/80">{label}</h5>
      <ul className="space-y-1 text-[11px] text-foreground/80">
        {questions.map((q, i) => (
          <li key={i} className="border-r-2 border-violet-500/30 ps-2">{q}</li>
        ))}
      </ul>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border/20 pb-1.5 last:border-0 last:pb-0">
      <dt className="shrink-0 text-muted-foreground/70">{label}</dt>
      <dd className="truncate text-end text-foreground/85">{value}</dd>
    </div>
  )
}
