/**
 * `contact_messages` — the store behind the public «تواصل معنا» form.
 *
 * The message is written FIRST and the team notification is queued after, so
 * the inbox never depends on Resend. `email_status` records whether the
 * notification went out; see lib/db/schema/contact.ts.
 */
import { count, desc, eq, gte } from "drizzle-orm"
import { db } from "@/lib/db"
import { contactMessages } from "@/lib/db/schema"
import type { ContactEmailStatus, ContactMessage } from "@/types/database"
import type { ContactInput } from "@/lib/validation/contact"

type Row = typeof contactMessages.$inferSelect

function toMessage(r: Row): ContactMessage {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    message: r.message,
    email_status: r.email_status as ContactEmailStatus,
    email_error: r.email_error ?? null,
    emailed_at: r.emailed_at ? r.emailed_at.toISOString() : null,
    read_at: r.read_at ? r.read_at.toISOString() : null,
    created_at: r.created_at.toISOString(),
  }
}

export async function createContactMessage(input: ContactInput): Promise<string> {
  if (!db) throw new Error("no database connection")
  const [row] = await db
    .insert(contactMessages)
    .values({ name: input.name, email: input.email, message: input.message })
    .returning({ id: contactMessages.id })
  return row.id
}

export async function getContactMessage(id: string): Promise<ContactMessage | null> {
  if (!db) return null
  const [row] = await db.select().from(contactMessages).where(eq(contactMessages.id, id)).limit(1)
  return row ? toMessage(row) : null
}

/** Newest first. Bounded: this is an inbox, not an archive export. */
export async function listContactMessages(limit = 300): Promise<ContactMessage[]> {
  if (!db) return []
  const rows = await db
    .select()
    .from(contactMessages)
    .orderBy(desc(contactMessages.created_at))
    .limit(limit)
  return rows.map(toMessage)
}

/** Messages stored since `since` — the global hourly email cap counts these. */
export async function countContactMessagesSince(since: Date): Promise<number> {
  if (!db) return 0
  const [r] = await db
    .select({ n: count() })
    .from(contactMessages)
    .where(gte(contactMessages.created_at, since))
  // pg returns count() as a string — coerce.
  return Number(r?.n ?? 0)
}

export async function setContactMessageRead(id: string, read: boolean): Promise<boolean> {
  if (!db) return false
  const rows = await db
    .update(contactMessages)
    .set({ read_at: read ? new Date() : null })
    .where(eq(contactMessages.id, id))
    .returning({ id: contactMessages.id })
  return rows.length > 0
}

/** Record the outcome of the team notification on the message row. */
export async function setContactEmailStatus(
  id: string,
  status: ContactEmailStatus,
  error: string | null = null,
): Promise<void> {
  if (!db) return
  await db
    .update(contactMessages)
    .set({
      email_status: status,
      email_error: error ? error.slice(0, 500) : null,
      ...(status === "sent" ? { emailed_at: new Date() } : {}),
    })
    .where(eq(contactMessages.id, id))
}
