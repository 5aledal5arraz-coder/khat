"use client"

/**
 * Client-side fetcher for guest-candidate API routes.
 * Always sends `x-requested-with: khat` for the CSRF check.
 */
async function call<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-requested-with": "khat",
      ...init.headers,
    },
  })
  let data: { error?: string } & Record<string, unknown> = {}
  try {
    data = await res.json()
  } catch {
    // ignore parse errors
  }
  if (!res.ok) {
    throw new Error(data.error || "حدث خطأ غير متوقع")
  }
  return data as T
}

export const candidatesApi = {
  list: (qs?: string) =>
    call<{ candidates: unknown[] }>(`/api/admin/guest-candidates${qs ? `?${qs}` : ""}`),
  get: (id: string) =>
    call<{ candidate: unknown }>(`/api/admin/guest-candidates/${id}`),
  create: (body: Record<string, unknown>) =>
    call<{ candidate: unknown }>(`/api/admin/guest-candidates`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string, body: Record<string, unknown>) =>
    call<{ candidate: unknown }>(`/api/admin/guest-candidates/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (id: string) =>
    call<{ ok: true }>(`/api/admin/guest-candidates/${id}`, { method: "DELETE" }),
  archive: (id: string) =>
    call<{ ok: true }>(`/api/admin/guest-candidates/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "archive" }),
    }),
  unarchive: (id: string) =>
    call<{ ok: true }>(`/api/admin/guest-candidates/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "unarchive" }),
    }),
  changeStatus: (id: string, status: string, note?: string) =>
    call<{ candidate: unknown }>(`/api/admin/guest-candidates/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ status, note }),
    }),
  addSocialLink: (id: string, link: { platform: string; url: string; label?: string; is_primary?: boolean }) =>
    call<{ link: unknown }>(`/api/admin/guest-candidates/${id}/social-links`, {
      method: "POST",
      body: JSON.stringify(link),
    }),
  deleteSocialLink: (id: string, linkId: string) =>
    call<{ ok: true }>(`/api/admin/guest-candidates/${id}/social-links/${linkId}`, {
      method: "DELETE",
    }),
  analyze: (id: string) =>
    call<{ result: unknown; runId: string }>(`/api/admin/guest-candidates/${id}/analyze`, {
      method: "POST",
    }),
  listOutreach: (id: string) =>
    call<{ messages: unknown[] }>(`/api/admin/guest-candidates/${id}/outreach`),
  generateOutreach: (id: string, body: {
    channel: string
    tone: string
    length?: string
    customNote?: string
  }) =>
    call<{ draft: { subject_line: string | null; message_body: string }; runId: string }>(
      `/api/admin/guest-candidates/${id}/outreach`,
      {
        method: "POST",
        body: JSON.stringify({ action: "generate", ...body }),
      },
    ),
  saveOutreach: (id: string, body: {
    channel: string
    tone: string
    subject_line?: string | null
    message_body: string
    generated_by_ai?: boolean
    edited_by_admin?: boolean
  }) =>
    call<{ message: unknown }>(`/api/admin/guest-candidates/${id}/outreach`, {
      method: "POST",
      body: JSON.stringify({ action: "save", ...body }),
    }),
  deleteOutreach: (id: string, messageId: string) =>
    call<{ ok: true }>(`/api/admin/guest-candidates/${id}/outreach/${messageId}`, {
      method: "DELETE",
    }),

  // Prep form templates
  listPrepTemplates: (activeOnly = false) =>
    call<{ templates: import("@/types/database").PrepFormTemplate[] }>(
      `/api/admin/guest-candidates/prep-templates${activeOnly ? "?active=1" : ""}`,
    ),
  getPrepTemplate: (id: string) =>
    call<{ template: import("@/types/database").PrepFormTemplate }>(
      `/api/admin/guest-candidates/prep-templates/${id}`,
    ),
  createPrepTemplate: (body: {
    name: string
    description?: string | null
    schema_json: import("@/types/database").PrepFormSchema
    is_default?: boolean
    is_active?: boolean
  }) =>
    call<{ template: import("@/types/database").PrepFormTemplate }>(
      `/api/admin/guest-candidates/prep-templates`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updatePrepTemplate: (id: string, body: Record<string, unknown>) =>
    call<{ template: import("@/types/database").PrepFormTemplate }>(
      `/api/admin/guest-candidates/prep-templates/${id}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deletePrepTemplate: (id: string) =>
    call<{ ok: true }>(`/api/admin/guest-candidates/prep-templates/${id}`, {
      method: "DELETE",
    }),

  // Prep links (per candidate)
  listPrepLinks: (candidateId: string) =>
    call<{ links: import("@/types/database").PrepFormLink[] }>(
      `/api/admin/guest-candidates/${candidateId}/prep-links`,
    ),
  createPrepLink: (
    candidateId: string,
    body: {
      template_id?: string
      expires_in_days?: number
      sent_via?: "whatsapp" | "email" | "manual_copy"
      location_note?: string
      meeting_note?: string
      admin_message?: string
    },
  ) =>
    call<{ link: import("@/types/database").PrepFormLink }>(
      `/api/admin/guest-candidates/${candidateId}/prep-links`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  markPrepLinkSent: (
    candidateId: string,
    linkId: string,
    sentVia: "whatsapp" | "email" | "manual_copy",
  ) =>
    call<{ ok: true }>(`/api/admin/guest-candidates/${candidateId}/prep-links/${linkId}`, {
      method: "PATCH",
      body: JSON.stringify({ action: "mark_sent", sent_via: sentVia }),
    }),
  cancelPrepLink: (candidateId: string, linkId: string) =>
    call<{ ok: true }>(`/api/admin/guest-candidates/${candidateId}/prep-links/${linkId}`, {
      method: "DELETE",
    }),

  // Prep meetings (per candidate)
  listPrepMeetings: (candidateId: string) =>
    call<{ meetings: import("@/types/database").GuestPrepMeeting[] }>(
      `/api/admin/guest-candidates/${candidateId}/prep-meetings`,
    ),
  createPrepMeeting: (
    candidateId: string,
    body: {
      title: string
      type?: string
      scheduled_at?: string | null
      duration_minutes?: number | null
      notes?: string | null
      status?: string
    },
  ) =>
    call<{ meeting: import("@/types/database").GuestPrepMeeting }>(
      `/api/admin/guest-candidates/${candidateId}/prep-meetings`,
      { method: "POST", body: JSON.stringify(body) },
    ),
  updatePrepMeeting: (
    candidateId: string,
    meetingId: string,
    body: Partial<{
      title: string
      type: string
      scheduled_at: string | null
      duration_minutes: number | null
      notes: string | null
      outcome: string | null
      status: string
    }>,
  ) =>
    call<{ meeting: import("@/types/database").GuestPrepMeeting }>(
      `/api/admin/guest-candidates/${candidateId}/prep-meetings/${meetingId}`,
      { method: "PATCH", body: JSON.stringify(body) },
    ),
  deletePrepMeeting: (candidateId: string, meetingId: string) =>
    call<{ ok: true }>(
      `/api/admin/guest-candidates/${candidateId}/prep-meetings/${meetingId}`,
      { method: "DELETE" },
    ),

  // Production bridge — explicit "نقل للإنتاج" (creates a linked EIR)
  promoteToProduction: (candidateId: string) =>
    call<{
      status: "promoted" | "already_in_production"
      eir_id: string
      working_title: string | null
      phase: string
      created: boolean
    }>(`/api/admin/guest-candidates/${candidateId}/promote-to-production`, {
      method: "POST",
    }),

  // Recording schedule — sets the filming date on the candidate's linked EIR
  setRecordingSchedule: (candidateId: string, recording_scheduled_at: string | null) =>
    call<{ eir_id: string; recording_scheduled_at: string | null }>(
      `/api/admin/guest-candidates/${candidateId}/recording-schedule`,
      { method: "POST", body: JSON.stringify({ recording_scheduled_at }) },
    ),
}
