/**
 * Guest Candidates — Prep form templates + token-based public links.
 *
 * Admin builds reusable form templates (sections + fields). For each candidate,
 * admin issues a unique unguessable token-based link. The candidate accesses the
 * form via a public route (no admin auth) and submits a response. The response
 * is captured into `prep_form_responses`. Admin then sees it in their inbox.
 *
 * Independence: this module references only the candidates schema. No FK to
 * `guests`, `episodes`, or `studio_*`.
 */

import crypto from "crypto"
import { db } from "@/lib/db"
import {
  prepFormTemplates,
  prepFormLinks,
  prepFormResponses,
  guestCandidates,
} from "@/lib/db/schema/guest-candidates"
import { and, desc, eq, ne } from "drizzle-orm"
import type {
  PrepFormTemplate,
  PrepFormLink,
  PrepFormResponse,
  PrepFormSchema,
  PrepFormLinkStatus,
} from "@/types/database"
import { notifyPrepSubmitted, notifyPrepOpened } from "./notifications"

function requireDb() {
  if (!db) throw new Error("Database not configured")
  return db
}

// ---------------------------------------------------------------------------
// Token helper
// ---------------------------------------------------------------------------

/** 32-byte URL-safe base64 token (≈ 43 chars). Stored in plaintext on the link
 * row because it IS the public URL component. Treat like a password. */
export function generatePrepLinkToken(): string {
  return crypto.randomBytes(32).toString("base64url")
}

/** Default expiry: 30 days from issue. */
export const DEFAULT_PREP_LINK_EXPIRY_DAYS = 30

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export async function listTemplates(opts: { activeOnly?: boolean } = {}): Promise<PrepFormTemplate[]> {
  const d = requireDb()
  const conditions = []
  if (opts.activeOnly) conditions.push(eq(prepFormTemplates.is_active, true))
  const rows = await d
    .select()
    .from(prepFormTemplates)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(prepFormTemplates.is_default), desc(prepFormTemplates.updated_at))
  return rows as unknown as PrepFormTemplate[]
}

export async function getTemplate(id: string): Promise<PrepFormTemplate | null> {
  const d = requireDb()
  const [row] = await d.select().from(prepFormTemplates).where(eq(prepFormTemplates.id, id)).limit(1)
  return (row as unknown as PrepFormTemplate) ?? null
}

export async function getDefaultTemplate(): Promise<PrepFormTemplate | null> {
  const d = requireDb()
  const [row] = await d
    .select()
    .from(prepFormTemplates)
    .where(and(eq(prepFormTemplates.is_default, true), eq(prepFormTemplates.is_active, true)))
    .limit(1)
  return (row as unknown as PrepFormTemplate) ?? null
}

export interface CreateTemplateInput {
  name: string
  description?: string | null
  schema_json: PrepFormSchema
  is_default?: boolean
  is_active?: boolean
}

export async function createTemplate(input: CreateTemplateInput): Promise<PrepFormTemplate> {
  const d = requireDb()
  // If marked as default, unset any existing default first.
  if (input.is_default) {
    await d.update(prepFormTemplates).set({ is_default: false }).where(eq(prepFormTemplates.is_default, true))
  }
  const [row] = await d
    .insert(prepFormTemplates)
    .values({
      name: input.name,
      description: input.description ?? null,
      schema_json: input.schema_json,
      is_default: input.is_default ?? false,
      is_active: input.is_active ?? true,
    })
    .returning()
  return row as unknown as PrepFormTemplate
}

export interface UpdateTemplateInput {
  name?: string
  description?: string | null
  schema_json?: PrepFormSchema
  is_default?: boolean
  is_active?: boolean
}

export async function updateTemplate(id: string, input: UpdateTemplateInput): Promise<PrepFormTemplate | null> {
  const d = requireDb()
  // If marking as default, unset previous default (excluding this row).
  if (input.is_default) {
    await d
      .update(prepFormTemplates)
      .set({ is_default: false })
      .where(and(eq(prepFormTemplates.is_default, true), ne(prepFormTemplates.id, id)))
  }
  const [row] = await d
    .update(prepFormTemplates)
    .set({ ...input, updated_at: new Date() })
    .where(eq(prepFormTemplates.id, id))
    .returning()
  return (row as unknown as PrepFormTemplate) ?? null
}

export async function deleteTemplate(id: string): Promise<{ ok: boolean; error?: string }> {
  const d = requireDb()
  // Refuse if any prep links reference this template
  const [link] = await d
    .select({ id: prepFormLinks.id })
    .from(prepFormLinks)
    .where(eq(prepFormLinks.template_id, id))
    .limit(1)
  if (link) {
    return { ok: false, error: "لا يمكن حذف القالب لأنه مستخدم في روابط موجودة" }
  }
  await d.delete(prepFormTemplates).where(eq(prepFormTemplates.id, id))
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Default seed template
// ---------------------------------------------------------------------------

export const DEFAULT_TEMPLATE_SCHEMA: PrepFormSchema = {
  sections: [
    {
      id: "personal",
      title: "معلومات شخصية",
      description: "نحتاج بعض الأساسيات لنرتب التفاصيل ونتواصل معك بسلاسة.",
      fields: [
        {
          id: "preferred_name",
          type: "short_text",
          label: "الاسم المفضل أن تُنادى به",
          required: true,
          placeholder: "مثال: أبو محمد، د. سارة...",
        },
        {
          id: "pronunciation_notes",
          type: "short_text",
          label: "ملاحظات على نطق اسمك (اختياري)",
          placeholder: "إذا كان اسمك يُنطق بطريقة معينة",
        },
        {
          id: "phone_whatsapp",
          type: "contact_preference",
          label: "رقم واتساب للتواصل",
          required: true,
          placeholder: "+9665xxxxxxxx",
        },
      ],
    },
    {
      id: "logistics",
      title: "تفاصيل التصوير",
      description: "نريد أن نضمن لك تجربة مريحة ومخصصة.",
      fields: [
        {
          id: "preferred_filming_days",
          type: "multi_select",
          label: "أيام مناسبة للتصوير",
          options: ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"],
        },
        {
          id: "preferred_filming_time",
          type: "single_select",
          label: "الوقت المفضل",
          options: ["صباحاً", "ظهراً", "بعد الظهر", "مساءً"],
        },
        {
          id: "scheduling_restrictions",
          type: "long_text",
          label: "أي قيود في الجدول؟",
          placeholder: "مثال: غير متاح في رمضان، أو فقط في عطلة نهاية الأسبوع",
        },
        {
          id: "preferred_drink",
          type: "short_text",
          label: "ماذا تحب أن نقدّم لك خلال التصوير؟",
          placeholder: "قهوة، شاي، ماء...",
        },
      ],
    },
    {
      id: "content",
      title: "المحتوى والحوار",
      description: "خط بودكاست يحب الحوارات الصادقة والعميقة. ساعدنا نختار أفضل الزوايا معك.",
      fields: [
        {
          id: "topics_excited_about",
          type: "long_text",
          label: "ما هي المواضيع التي تشعر بشغف للحديث عنها؟",
          required: true,
          placeholder: "اكتب بحرية عن المواضيع التي تتمنى أن نناقشها",
        },
        {
          id: "sensitivities_to_avoid",
          type: "long_text",
          label: "هل هناك مواضيع تفضل تجنبها؟",
          placeholder: "نحترم خصوصيتك تماماً",
        },
        {
          id: "key_messages",
          type: "long_text",
          label: "ما الرسالة التي تتمنى أن يخرج بها المستمع؟",
          placeholder: "ثلاث جمل تعبّر عن جوهر ما تريد إيصاله",
        },
      ],
    },
    {
      id: "extras",
      title: "ملاحظات نهائية",
      fields: [
        {
          id: "team_notes",
          type: "long_text",
          label: "أي شيء آخر تود مشاركته معنا؟",
          placeholder: "اقتراحات، أسئلة، طلبات خاصة...",
        },
      ],
    },
  ],
}

export async function ensureDefaultTemplate(): Promise<PrepFormTemplate> {
  const existing = await getDefaultTemplate()
  if (existing) return existing
  return createTemplate({
    name: "نموذج التحضير الافتراضي",
    description: "نموذج التحضير الأساسي لجميع المرشحين الجدد",
    schema_json: DEFAULT_TEMPLATE_SCHEMA,
    is_default: true,
    is_active: true,
  })
}

// ---------------------------------------------------------------------------
// Prep links
// ---------------------------------------------------------------------------

export interface CreatePrepLinkInput {
  candidateId: string
  templateId?: string // defaults to default template
  expiresInDays?: number
  sentVia?: "whatsapp" | "email" | "manual_copy"
  locationNote?: string
  meetingNote?: string
  adminMessage?: string
}

export async function createPrepLink(input: CreatePrepLinkInput): Promise<PrepFormLink> {
  const d = requireDb()

  // Resolve template
  const template = input.templateId
    ? await getTemplate(input.templateId)
    : await ensureDefaultTemplate()
  if (!template) throw new Error("القالب غير موجود")

  const token = generatePrepLinkToken()
  const expiresInDays = input.expiresInDays ?? DEFAULT_PREP_LINK_EXPIRY_DAYS
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)

  const [row] = await d
    .insert(prepFormLinks)
    .values({
      candidate_id: input.candidateId,
      template_id: template.id,
      token,
      status: "draft",
      expires_at: expiresAt,
      sent_via: input.sentVia ?? null,
      location_note: input.locationNote ?? null,
      meeting_note: input.meetingNote ?? null,
      admin_message: input.adminMessage ?? null,
    })
    .returning()

  return row as unknown as PrepFormLink
}

export async function listPrepLinks(candidateId: string): Promise<PrepFormLink[]> {
  const d = requireDb()
  const rows = await d
    .select()
    .from(prepFormLinks)
    .where(eq(prepFormLinks.candidate_id, candidateId))
    .orderBy(desc(prepFormLinks.created_at))
  return rows as unknown as PrepFormLink[]
}

export async function getPrepLink(id: string): Promise<PrepFormLink | null> {
  const d = requireDb()
  const [row] = await d.select().from(prepFormLinks).where(eq(prepFormLinks.id, id)).limit(1)
  return (row as unknown as PrepFormLink) ?? null
}

export async function getPrepLinkByToken(token: string): Promise<PrepFormLink | null> {
  const d = requireDb()
  const [row] = await d.select().from(prepFormLinks).where(eq(prepFormLinks.token, token)).limit(1)
  return (row as unknown as PrepFormLink) ?? null
}

export async function updatePrepLinkStatus(id: string, status: PrepFormLinkStatus): Promise<void> {
  const d = requireDb()
  await d
    .update(prepFormLinks)
    .set({ status, updated_at: new Date() })
    .where(eq(prepFormLinks.id, id))
}

export async function markPrepLinkSent(id: string, sentVia: "whatsapp" | "email" | "manual_copy"): Promise<void> {
  const d = requireDb()
  await d
    .update(prepFormLinks)
    .set({ status: "sent", sent_via: sentVia, updated_at: new Date() })
    .where(eq(prepFormLinks.id, id))

  // Reflect on candidate aggregate timestamp
  const link = await getPrepLink(id)
  if (link) {
    await d
      .update(guestCandidates)
      .set({ prep_link_last_sent_at: new Date(), updated_at: new Date() })
      .where(eq(guestCandidates.id, link.candidate_id))
  }
}

export async function cancelPrepLink(id: string): Promise<void> {
  const d = requireDb()
  await d
    .update(prepFormLinks)
    .set({ status: "cancelled", updated_at: new Date() })
    .where(eq(prepFormLinks.id, id))
}

/** Called from public route on first/subsequent open. */
export async function recordPrepLinkOpen(id: string): Promise<void> {
  const d = requireDb()
  const [current] = await d.select().from(prepFormLinks).where(eq(prepFormLinks.id, id)).limit(1)
  if (!current) return
  const now = new Date()
  const isFirstOpen = !current.first_opened_at
  await d
    .update(prepFormLinks)
    .set({
      first_opened_at: current.first_opened_at ?? now,
      last_opened_at: now,
      // bump status to "opened" only if it was "sent" or "draft"
      status: current.status === "sent" || current.status === "draft" ? "opened" : current.status,
      updated_at: now,
    })
    .where(eq(prepFormLinks.id, id))

  if (isFirstOpen) {
    try {
      await notifyPrepOpened({ candidateId: current.candidate_id, prepLinkId: id })
    } catch {
      // Non-blocking: notification failure must not break the public route
    }
  }
}

// ---------------------------------------------------------------------------
// Validation of public token (status, expiry)
// ---------------------------------------------------------------------------

export interface ValidatedPrepLink {
  link: PrepFormLink
  template: PrepFormTemplate
  candidate: { id: string; full_name: string; display_name: string | null }
  existingResponse: PrepFormResponse | null
}

export type ValidatePrepLinkResult =
  | { ok: true; data: ValidatedPrepLink }
  | { ok: false; reason: "not_found" | "expired" | "cancelled" | "completed" }

export async function validatePrepLinkByToken(token: string): Promise<ValidatePrepLinkResult> {
  const d = requireDb()
  const link = await getPrepLinkByToken(token)
  if (!link) return { ok: false, reason: "not_found" }
  if (link.status === "cancelled") return { ok: false, reason: "cancelled" }
  if (link.status === "completed") {
    // Allow showing the read-only response
    const template = await getTemplate(link.template_id)
    const [cand] = await d
      .select({ id: guestCandidates.id, full_name: guestCandidates.full_name, display_name: guestCandidates.display_name })
      .from(guestCandidates)
      .where(eq(guestCandidates.id, link.candidate_id))
      .limit(1)
    const [resp] = await d
      .select()
      .from(prepFormResponses)
      .where(eq(prepFormResponses.prep_link_id, link.id))
      .orderBy(desc(prepFormResponses.created_at))
      .limit(1)
    if (!template || !cand) return { ok: false, reason: "not_found" }
    return {
      ok: true,
      data: {
        link,
        template,
        candidate: cand,
        existingResponse: (resp as unknown as PrepFormResponse) ?? null,
      },
    }
  }
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: "expired" }
  }

  const template = await getTemplate(link.template_id)
  if (!template) return { ok: false, reason: "not_found" }

  const [cand] = await d
    .select({ id: guestCandidates.id, full_name: guestCandidates.full_name, display_name: guestCandidates.display_name })
    .from(guestCandidates)
    .where(eq(guestCandidates.id, link.candidate_id))
    .limit(1)
  if (!cand) return { ok: false, reason: "not_found" }

  // Latest response, if any (in_progress draft)
  const [resp] = await d
    .select()
    .from(prepFormResponses)
    .where(eq(prepFormResponses.prep_link_id, link.id))
    .orderBy(desc(prepFormResponses.created_at))
    .limit(1)

  return {
    ok: true,
    data: {
      link,
      template,
      candidate: cand,
      existingResponse: (resp as unknown as PrepFormResponse) ?? null,
    },
  }
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

export interface SubmitPrepResponseInput {
  prepLinkId: string
  candidateId: string
  responseJson: Record<string, unknown>
  /** false → save as in-progress draft; true → final submission */
  isFinal: boolean
}

function computeCompletionPercent(schema: PrepFormSchema, response: Record<string, unknown>): number {
  let total = 0
  let answered = 0
  for (const section of schema.sections) {
    for (const field of section.fields) {
      if (field.type === "instructions") continue
      total += 1
      const v = response[field.id]
      if (v === undefined || v === null) continue
      if (typeof v === "string" && v.trim() === "") continue
      if (Array.isArray(v) && v.length === 0) continue
      answered += 1
    }
  }
  if (total === 0) return 0
  return Math.round((answered / total) * 100)
}

export async function submitPrepResponse(input: SubmitPrepResponseInput): Promise<{
  response: PrepFormResponse
  link: PrepFormLink
}> {
  const d = requireDb()

  const link = await getPrepLink(input.prepLinkId)
  if (!link) throw new Error("الرابط غير موجود")
  const template = await getTemplate(link.template_id)
  if (!template) throw new Error("القالب غير موجود")

  const completion = computeCompletionPercent(template.schema_json, input.responseJson)

  // Upsert latest in-progress response, or insert new on final submission
  const [existing] = await d
    .select()
    .from(prepFormResponses)
    .where(eq(prepFormResponses.prep_link_id, input.prepLinkId))
    .orderBy(desc(prepFormResponses.created_at))
    .limit(1)

  let responseRow: typeof prepFormResponses.$inferSelect
  if (existing && !existing.submitted_at) {
    // Update the existing draft
    const [updated] = await d
      .update(prepFormResponses)
      .set({
        response_json: input.responseJson,
        completion_percent: completion,
        submitted_at: input.isFinal ? new Date() : null,
        updated_at: new Date(),
      })
      .where(eq(prepFormResponses.id, existing.id))
      .returning()
    responseRow = updated
  } else {
    const [created] = await d
      .insert(prepFormResponses)
      .values({
        prep_link_id: input.prepLinkId,
        candidate_id: input.candidateId,
        response_json: input.responseJson,
        completion_percent: completion,
        submitted_at: input.isFinal ? new Date() : null,
      })
      .returning()
    responseRow = created
  }

  // Update link + candidate status
  const now = new Date()
  if (input.isFinal) {
    await d
      .update(prepFormLinks)
      .set({ status: "completed", submitted_at: now, updated_at: now })
      .where(eq(prepFormLinks.id, input.prepLinkId))
    await d
      .update(guestCandidates)
      .set({ status: "prep_completed", updated_at: now })
      .where(eq(guestCandidates.id, input.candidateId))
  } else {
    const firstOpened = link.first_opened_at ? new Date(link.first_opened_at) : now
    await d
      .update(prepFormLinks)
      .set({
        status: "in_progress",
        first_opened_at: firstOpened,
        last_opened_at: now,
        updated_at: now,
      })
      .where(eq(prepFormLinks.id, input.prepLinkId))
    // Only auto-bump candidate to in_progress if currently sent/opened/prep_sent
    const [cand] = await d
      .select({ status: guestCandidates.status })
      .from(guestCandidates)
      .where(eq(guestCandidates.id, input.candidateId))
      .limit(1)
    if (cand && (cand.status === "prep_sent" || cand.status === "accepted")) {
      await d
        .update(guestCandidates)
        .set({ status: "prep_in_progress", updated_at: now })
        .where(eq(guestCandidates.id, input.candidateId))
    }
  }

  const refreshed = await getPrepLink(input.prepLinkId)

  // Fire notification (non-blocking — failures are logged to the notifications
  // table but must not bubble up and break the public submission endpoint).
  try {
    await notifyPrepSubmitted({
      candidateId: input.candidateId,
      prepLinkId: input.prepLinkId,
      completionPercent: completion,
      isFinal: input.isFinal,
    })
  } catch {
    // swallow
  }

  return {
    response: responseRow as unknown as PrepFormResponse,
    link: (refreshed ?? link) as PrepFormLink,
  }
}

export async function listResponses(candidateId: string): Promise<PrepFormResponse[]> {
  const d = requireDb()
  const rows = await d
    .select()
    .from(prepFormResponses)
    .where(eq(prepFormResponses.candidate_id, candidateId))
    .orderBy(desc(prepFormResponses.created_at))
  return rows as unknown as PrepFormResponse[]
}

// ---------------------------------------------------------------------------
// Archive — all responses across all candidates (admin)
// ---------------------------------------------------------------------------

export interface PrepResponseArchiveRow {
  response: PrepFormResponse
  link: Pick<PrepFormLink, "id" | "token" | "template_id" | "status" | "sent_via" | "admin_message">
  candidate: {
    id: string
    full_name: string
    display_name: string | null
    category: string | null
    status: string
    avatar_url?: string | null
  }
}

export async function listAllPrepResponses(opts: {
  limit?: number
  finalOnly?: boolean
} = {}): Promise<PrepResponseArchiveRow[]> {
  const d = requireDb()
  const limit = opts.limit ?? 200

  const rows = await d
    .select({
      // response fields
      r_id: prepFormResponses.id,
      r_prep_link_id: prepFormResponses.prep_link_id,
      r_candidate_id: prepFormResponses.candidate_id,
      r_response_json: prepFormResponses.response_json,
      r_completion_percent: prepFormResponses.completion_percent,
      r_submitted_at: prepFormResponses.submitted_at,
      r_created_at: prepFormResponses.created_at,
      r_updated_at: prepFormResponses.updated_at,
      // link fields
      l_id: prepFormLinks.id,
      l_token: prepFormLinks.token,
      l_template_id: prepFormLinks.template_id,
      l_status: prepFormLinks.status,
      l_sent_via: prepFormLinks.sent_via,
      l_admin_message: prepFormLinks.admin_message,
      // candidate fields
      c_id: guestCandidates.id,
      c_full_name: guestCandidates.full_name,
      c_display_name: guestCandidates.display_name,
      c_category: guestCandidates.category,
      c_status: guestCandidates.status,
    })
    .from(prepFormResponses)
    .innerJoin(prepFormLinks, eq(prepFormResponses.prep_link_id, prepFormLinks.id))
    .innerJoin(guestCandidates, eq(prepFormResponses.candidate_id, guestCandidates.id))
    .orderBy(desc(prepFormResponses.updated_at))
    .limit(limit)

  const filtered = opts.finalOnly ? rows.filter((r) => r.r_submitted_at !== null) : rows

  return filtered.map((r) => ({
    response: {
      id: r.r_id,
      prep_link_id: r.r_prep_link_id,
      candidate_id: r.r_candidate_id,
      response_json: r.r_response_json,
      completion_percent: r.r_completion_percent,
      submitted_at: r.r_submitted_at,
      created_at: r.r_created_at,
      updated_at: r.r_updated_at,
    } as unknown as PrepFormResponse,
    link: {
      id: r.l_id,
      token: r.l_token,
      template_id: r.l_template_id,
      status: r.l_status as PrepFormLink["status"],
      sent_via: r.l_sent_via,
      admin_message: r.l_admin_message,
    },
    candidate: {
      id: r.c_id,
      full_name: r.c_full_name,
      display_name: r.c_display_name,
      category: r.c_category,
      status: r.c_status,
    },
  }))
}

export async function getResponse(id: string): Promise<PrepFormResponse | null> {
  const d = requireDb()
  const [row] = await d.select().from(prepFormResponses).where(eq(prepFormResponses.id, id)).limit(1)
  return (row as unknown as PrepFormResponse) ?? null
}
