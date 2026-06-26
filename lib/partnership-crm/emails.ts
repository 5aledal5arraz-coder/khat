/** Email history — every message sent to a partner is logged here. */

import { desc, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { partnerEmails } from "@/lib/db/schema/partnership-crm"
import type { PartnerEmail } from "@/types/database"
import { logActivity } from "./activities"

export interface LogEmailInput {
  direction?: "outbound" | "inbound"
  to_email?: string | null
  from_email?: string | null
  subject?: string | null
  body?: string | null
  status?: "sent" | "failed" | "logged"
  provider_message_id?: string | null
  created_by?: string | null
}

export async function getEmails(leadId: string): Promise<PartnerEmail[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(partnerEmails)
    .where(eq(partnerEmails.lead_id, leadId))
    .orderBy(desc(partnerEmails.sent_at))
  return rows.map(rowToEmail)
}

export async function logEmail(leadId: string, input: LogEmailInput): Promise<PartnerEmail | null> {
  if (!db) return null
  const [row] = await db
    .insert(partnerEmails)
    .values({
      lead_id: leadId,
      direction: input.direction ?? "outbound",
      to_email: input.to_email ?? null,
      from_email: input.from_email ?? null,
      subject: input.subject ?? null,
      body: input.body ?? null,
      status: input.status ?? "sent",
      provider_message_id: input.provider_message_id ?? null,
      created_by: input.created_by ?? null,
    })
    .returning()
  if ((input.status ?? "sent") === "sent") {
    await logActivity(leadId, {
      type: "email_sent",
      summary: `أُرسل بريد: ${input.subject ?? "(بدون عنوان)"}`,
      actor: input.created_by ?? null,
      metadata: { email_id: row.id, to: input.to_email },
    })
  }
  return rowToEmail(row)
}

function rowToEmail(r: typeof partnerEmails.$inferSelect): PartnerEmail {
  return {
    id: r.id,
    lead_id: r.lead_id,
    direction: r.direction as "outbound" | "inbound",
    to_email: r.to_email ?? null,
    from_email: r.from_email ?? null,
    subject: r.subject ?? null,
    body: r.body ?? null,
    status: r.status as "sent" | "failed" | "logged",
    provider_message_id: r.provider_message_id ?? null,
    created_by: r.created_by ?? null,
    sent_at: r.sent_at ? r.sent_at.toISOString() : null,
    created_at: (r.created_at ?? new Date()).toISOString(),
  }
}
